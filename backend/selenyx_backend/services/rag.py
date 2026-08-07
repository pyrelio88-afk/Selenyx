"""Extractive RAG over local SQLite chunks (paper-qa / HydraLab style locators)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, select

from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services.embeddings import cosine, embed_texts, hash_embed, lexical_score
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


def chunk_text(text: str, *, max_chars: int = 900, overlap: int = 120) -> list[tuple[int, int, str]]:
    """Return list of (char_start, char_end, chunk_text)."""
    clean = (text or "").strip()
    if not clean:
        return []
    if len(clean) <= max_chars:
        return [(0, len(clean), clean)]

    sentences = [s for s in _SENTENCE_SPLIT.split(clean) if s.strip()]
    if not sentences:
        sentences = [clean[i : i + max_chars] for i in range(0, len(clean), max_chars - overlap)]

    chunks: list[tuple[int, int, str]] = []
    buf = ""
    buf_start = 0
    cursor = 0
    for sentence in sentences:
        # locate sentence in original if possible
        idx = clean.find(sentence, cursor)
        if idx < 0:
            idx = cursor
        if buf and len(buf) + 1 + len(sentence) > max_chars:
            chunks.append((buf_start, buf_start + len(buf), buf))
            # overlap tail
            tail = buf[-overlap:] if overlap and len(buf) > overlap else ""
            buf = (tail + " " + sentence).strip() if tail else sentence
            buf_start = max(0, buf_start + len(chunks[-1][2]) - len(tail))
            if not tail:
                buf_start = idx
        else:
            if not buf:
                buf_start = idx
            buf = f"{buf} {sentence}".strip() if buf else sentence
        cursor = idx + len(sentence)
    if buf:
        chunks.append((buf_start, buf_start + len(buf), buf))
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
    if replace_source:
        existing = session.exec(
            select(DocumentChunk).where(
                DocumentChunk.reference_id == reference_id,
                DocumentChunk.source == source,
            )
        ).all()
        for row in existing:
            session.delete(row)
        session.commit()

    pieces = chunk_text(text)
    if not pieces:
        return 0

    vectors, backend = await embed_texts([p[2] for p in pieces], settings)
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

    statement = select(DocumentChunk)
    chunks = list(session.exec(statement).all())
    if not chunks:
        # Fallback: search reference titles/abstracts directly and auto-index lightly
        refs = list(session.exec(select(Reference)).all())
        for ref in refs:
            await index_reference_record(session, ref, settings=settings)
        chunks = list(session.exec(select(DocumentChunk)).all())
        if not chunks:
            return []

    # Optional project filter via reference_ids_json on projects is applied later if needed.
    allowed_ref_ids: set[str] | None = None
    if project_id:
        from selenyx_backend.models import ResearchProject

        project = session.get(ResearchProject, project_id)
        if project and project.reference_ids_json:
            try:
                ids = json.loads(project.reference_ids_json)
                if isinstance(ids, list) and ids:
                    allowed_ref_ids = {str(x) for x in ids}
            except json.JSONDecodeError:
                allowed_ref_ids = None

    q_vecs, _backend = await embed_texts([q], settings)
    q_vec = q_vecs[0]

    scored: list[tuple[float, DocumentChunk]] = []
    for chunk in chunks:
        if allowed_ref_ids is not None and chunk.reference_id not in allowed_ref_ids:
            continue
        emb = _load_embedding(chunk.embedding_json)
        if not emb:
            emb = hash_embed(chunk.text)
        dense = cosine(q_vec, emb)
        lex = lexical_score(q, chunk.text)
        # Hybrid: dense primary, lexical rescue for rare terms / Chinese tokens
        score = 0.72 * dense + 0.28 * min(lex / 8.0, 1.0)
        if score > 0.02:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    hits: list[ChunkHit] = []
    for score, chunk in scored[: max(1, min(top_k, 50))]:
        ref = session.get(Reference, chunk.reference_id)
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
                    embedding_backend="hash",
                    created_at=now,
                )
            )
            total += 1
    session.commit()
    return total
