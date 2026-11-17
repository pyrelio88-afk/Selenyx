"""Extractive RAG over local SQLite chunks (paper-qa / HydraLab style locators)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, select

from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services.embeddings import HASH_BACKEND, cosine, embed_texts, hash_embed, lexical_score
from selenyx_backend.settings import Settings, get_settings

_SENTENCE_SPLIT = re.compile(r"(?<=[。！？.!?；;])\s+|\n+")


@dataclass
class ChunkHit:
    chunk_id: str
    reference_id: str
    title: str
    excerpt: str
    page: int | None
    section: str | None
    char_start: int
    char_end: int
    score: float
    source: str


def _trimmed_span(text: str, start: int, end: int) -> tuple[int, int] | None:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return (start, end) if start < end else None


def _split_oversized_span(
    text: str, start: int, end: int, *, max_chars: int, overlap: int
) -> list[tuple[int, int]]:
    step = max(1, max_chars - overlap)
    spans: list[tuple[int, int]] = []
    pos = start
    while pos < end:
        sub_end = min(end, pos + max_chars)
        trimmed = _trimmed_span(text, pos, sub_end)
        if trimmed is not None:
            spans.append(trimmed)
        if sub_end >= end:
            break
        pos += step
    return spans


def chunk_text(text: str, *, max_chars: int = 900, overlap: int = 120) -> list[tuple[int, int, str]]:
    """Return list of (char_start, char_end, chunk_text) with exact offsets into ``text``."""
    if not text:
        return []
    max_chars = max(1, max_chars)
    overlap = max(0, min(overlap, max_chars - 1)) if max_chars > 1 else 0
    full_span = _trimmed_span(text, 0, len(text))
    if full_span is None:
        return []
    first_start, last_end = full_span
    if last_end - first_start <= max_chars:
        return [(first_start, last_end, text[first_start:last_end])]

    raw_spans: list[tuple[int, int]] = []
    cursor = first_start
    for match in _SENTENCE_SPLIT.finditer(text, first_start, last_end):
        trimmed = _trimmed_span(text, cursor, match.start())
        if trimmed is not None:
            raw_spans.append(trimmed)
        cursor = match.end()
    tail_trimmed = _trimmed_span(text, cursor, last_end)
    if tail_trimmed is not None:
        raw_spans.append(tail_trimmed)

    spans: list[tuple[int, int]] = []
    for s_start, s_end in raw_spans:
        if s_end - s_start > max_chars:
            spans.extend(_split_oversized_span(text, s_start, s_end, max_chars=max_chars, overlap=overlap))
        else:
            spans.append((s_start, s_end))

    chunks: list[tuple[int, int, str]] = []
    window: list[tuple[int, int]] = []
    for span in spans:
        s_start, s_end = span
        if window and s_end - window[0][0] > max_chars:
            c_start, c_end = window[0][0], window[-1][1]
            chunks.append((c_start, c_end, text[c_start:c_end]))
            if overlap > 0:
                kept: list[tuple[int, int]] = []
                for prev in reversed(window):
                    if c_end - prev[0] <= overlap and s_end - prev[0] <= max_chars:
                        kept.append(prev)
                    else:
                        break
                window = list(reversed(kept))
            else:
                window = []
        window.append(span)
    if window:
        c_start, c_end = window[0][0], window[-1][1]
        chunks.append((c_start, c_end, text[c_start:c_end]))
    return chunks


def _dump_embedding(vec: list[float]) -> str:
    return json.dumps(vec, separators=(",", ":"))


def _load_embedding(raw: str) -> list[float]:
    try:
        data = json.loads(raw or "[]")
        if isinstance(data, list):
            return [float(x) for x in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return []


async def index_reference_text(
    session: Session,
    *,
    reference_id: str,
    text: str,
    source: str = "abstract",
    page: int | None = None,
    section: str | None = None,
    replace_source: bool = True,
    settings: Settings | None = None,
) -> int:
    """Chunk + embed text and store DocumentChunk rows. Returns chunk count."""
    settings = settings or get_settings()
    pieces = chunk_text(text)
    if not pieces:
        return 0

    # Build vectors before touching the durable index. If a local model is
    # unavailable or returns an invalid response, the last known-good chunks
    # must remain searchable instead of being deleted first.
    vectors, backend = await embed_texts([p[2] for p in pieces], settings, role="document")
    try:
        if replace_source:
            existing = session.exec(
                select(DocumentChunk).where(
                    DocumentChunk.reference_id == reference_id,
                    DocumentChunk.source == source,
                )
            ).all()
            for row in existing:
                session.delete(row)

        now = datetime.now().isoformat()
        for (start, end, body), vector in zip(pieces, vectors):
            session.add(
                DocumentChunk(
                    reference_id=reference_id,
                    source=source,
                    page=page,
                    section=section or source,
                    char_start=start,
                    char_end=end,
                    text=body,
                    embedding_json=_dump_embedding(vector),
                    embedding_backend=backend,
                    created_at=now,
                )
            )
        session.commit()
    except Exception:
        session.rollback()
        raise
    return len(pieces)


async def index_reference_record(session: Session, reference: Reference, settings: Settings | None = None) -> int:
    """Index title + abstract (+ notes) for a library item."""
    settings = settings or get_settings()
    parts = [reference.title or "", reference.abstract or "", reference.notes or ""]
    blob = "\n\n".join(p for p in parts if p.strip())
    if not blob.strip():
        return 0
    return await index_reference_text(
        session,
        reference_id=reference.id,
        text=blob,
        source="metadata",
        section="title+abstract",
        replace_source=True,
        settings=settings,
    )


async def semantic_search(
    session: Session,
    query: str,
    *,
    project_id: str | None = None,
    top_k: int = 8,
    settings: Settings | None = None,
) -> list[ChunkHit]:
    settings = settings or get_settings()
    q = (query or "").strip()
    if not q:
        return []

    allowed_ref_ids: set[str] | None = None
    if project_id:
        from selenyx_backend.models import ResearchProject

        project = session.get(ResearchProject, project_id)
        # Resolve scope before indexing or loading chunks: a project-scoped
        # query must never touch unrelated references, even during fallback.
        allowed_ref_ids = set()
        if project and project.reference_ids_json:
            try:
                ids = json.loads(project.reference_ids_json)
                if isinstance(ids, list):
                    allowed_ref_ids = {str(x) for x in ids}
            except json.JSONDecodeError:
                allowed_ref_ids = set()
        if not allowed_ref_ids:
            return []

    statement = select(DocumentChunk)
    if allowed_ref_ids is not None:
        statement = statement.where(col(DocumentChunk.reference_id).in_(allowed_ref_ids))
    chunks = list(session.exec(statement).all())
    if not chunks:
        # Preserve the legacy fallback only when the library index is empty.
        # In a scoped search, index only linked references and only after
        # confirming that no other project's chunks already exist.
        index_is_empty = (
            allowed_ref_ids is None
            or session.exec(select(DocumentChunk.id).limit(1)).first() is None
        )
        if index_is_empty:
            refs_statement = select(Reference)
            if allowed_ref_ids is not None:
                refs_statement = refs_statement.where(col(Reference.id).in_(allowed_ref_ids))
            refs = list(session.exec(refs_statement).all())
            for ref in refs:
                await index_reference_record(session, ref, settings=settings)
            chunks = list(session.exec(statement).all())
        if not chunks:
            return []

    q_vecs, query_backend = await embed_texts([q], settings, role="query")
    q_vec = q_vecs[0]
    q_hash = hash_embed(q)

    scored: list[tuple[float, DocumentChunk]] = []
    for chunk in chunks:
        if allowed_ref_ids is not None and chunk.reference_id not in allowed_ref_ids:
            continue
        emb = _load_embedding(chunk.embedding_json)
        if chunk.embedding_backend == query_backend and emb and len(emb) == len(q_vec):
            semantic = cosine(q_vec, emb)
        else:
            # Dense vectors from another model (or a legacy hash tokenizer)
            # are not comparable. Recompute the cheap hash representation so
            # retrieval remains useful after config changes or endpoint failure.
            semantic = cosine(q_hash, hash_embed(chunk.text))
        lex = lexical_score(q, chunk.text)
        # Hybrid: dense primary, lexical rescue for rare terms / Chinese tokens
        score = 0.72 * semantic + 0.28 * min(lex / 8.0, 1.0)
        if score > 0.02:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    top_scored = scored[: max(1, min(top_k, 50))]
    ref_ids = {chunk.reference_id for _, chunk in top_scored if chunk.reference_id}
    refs_by_id = (
        {
            ref.id: ref
            for ref in session.exec(select(Reference).where(col(Reference.id).in_(ref_ids))).all()
        }
        if ref_ids
        else {}
    )
    hits: list[ChunkHit] = []
    for score, chunk in top_scored:
        ref = refs_by_id.get(chunk.reference_id)
        hits.append(
            ChunkHit(
                chunk_id=chunk.id,
                reference_id=chunk.reference_id,
                title=(ref.title if ref else "") or "",
                excerpt=chunk.text[:600],
                page=chunk.page,
                section=chunk.section,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
                score=round(float(score), 4),
                source=chunk.source,
            )
        )
    return hits


def reindex_all_sync_hash(session: Session) -> int:
    """Synchronous hash-only reindex for tests / offline bulk."""
    refs = list(session.exec(select(Reference)).all())
    total = 0
    for ref in refs:
        parts = [ref.title or "", ref.abstract or "", ref.notes or ""]
        blob = "\n\n".join(p for p in parts if p.strip())
        pieces = chunk_text(blob)
        existing = session.exec(select(DocumentChunk).where(DocumentChunk.reference_id == ref.id)).all()
        for row in existing:
            session.delete(row)
        now = datetime.now().isoformat()
        for start, end, body in pieces:
            session.add(
                DocumentChunk(
                    reference_id=ref.id,
                    source="metadata",
                    section="title+abstract",
                    char_start=start,
                    char_end=end,
                    text=body,
                    embedding_json=_dump_embedding(hash_embed(body)),
                    embedding_backend=HASH_BACKEND,
                    created_at=now,
                )
            )
            total += 1
    session.commit()
    return total
