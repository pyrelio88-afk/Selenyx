"""Persistent, lossless local reference-library routes."""

from datetime import datetime
import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, col, func, select

from selenyx_backend.database import get_session
from selenyx_backend.models import Reference

router = APIRouter()

_SAFE_LOCAL_ID = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")

_CAMEL_TO_MODEL = {
    "citeKey": "cite_key",
    "shortTitle": "short_title",
    "arxivId": "arxiv_id",
    "impactFactor": "impact_factor",
    "jcrQuartile": "jcr_quartile",
    "openAccess": "open_access",
    "pipelineStage": "pipeline_stage",
    "readStatus": "read_status",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
}

_JSON_FIELDS = {
    "creators": "creators_json",
    "collections": "collections_json",
    "tags": "tags_json",
}


class BulkReferenceBody(BaseModel):
    references: list[dict[str, Any]] = Field(max_length=10_000)


class ImportReferencesBody(BaseModel):
    format: str = Field(min_length=1, max_length=20)
    data: str = Field(min_length=1, max_length=20_000_000)


class ExportReferencesBody(BaseModel):
    ids: list[str] = Field(max_length=10_000)
    format: str = Field(min_length=1, max_length=20)


def _json_object(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _json_list(raw: str) -> list[Any]:
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def _serialize(reference: Reference) -> dict[str, Any]:
    """Return the full frontend payload plus stable backend field aliases."""
    model = reference.model_dump()
    payload = _json_object(reference.payload_json)
    payload.update(
        {
            "id": reference.id,
            "citeKey": reference.cite_key,
            "type": reference.type,
            "title": reference.title,
            "shortTitle": reference.short_title,
            "abstract": reference.abstract,
            "creators": _json_list(reference.creators_json),
            "publication": reference.publication,
            "volume": reference.volume,
            "issue": reference.issue,
            "pages": reference.pages,
            "publisher": reference.publisher,
            "place": reference.place,
            "notes": reference.notes,
            "doi": reference.doi,
            "isbn": reference.isbn,
            "issn": reference.issn,
            "pmid": reference.pmid,
            "arxivId": reference.arxiv_id,
            "url": reference.url,
            "year": reference.year,
            "date": reference.date,
            "collections": _json_list(reference.collections_json),
            "tags": _json_list(reference.tags_json),
            "language": reference.language,
            "impactFactor": reference.impact_factor,
            "jcrQuartile": reference.jcr_quartile,
            "openAccess": reference.open_access,
            "pipelineStage": reference.pipeline_stage,
            "readStatus": reference.read_status,
            "importance": reference.importance,
            "source": reference.source,
            "updatedAt": reference.updated_at,
            "createdAt": reference.created_at,
        }
    )
    # Keeping snake_case aliases avoids breaking older local scripts while the
    # browser consumes the camelCase payload.
    return {**model, **payload}


def _apply_payload(reference: Reference, payload: dict[str, Any], *, creating: bool) -> None:
    current = _json_object(reference.payload_json)
    merged = {**current, **payload}
    for source, target in _CAMEL_TO_MODEL.items():
        if source in merged and target not in {"created_at"}:
            setattr(reference, target, merged[source])
        # Older local scripts used SQLModel's snake_case field names. A value
        # supplied in this request must override a stale camelCase value kept
        # in payload_json.
        if target in payload and target not in {"created_at"}:
            setattr(reference, target, payload[target])
    for source, target in _JSON_FIELDS.items():
        if source in merged:
            value = merged[source]
            setattr(reference, target, json.dumps(value if isinstance(value, list) else [], ensure_ascii=False))
    for field in (
        "type",
        "title",
        "abstract",
        "publication",
        "volume",
        "issue",
        "pages",
        "publisher",
        "place",
        "year",
        "date",
        "doi",
        "isbn",
        "issn",
        "pmid",
        "url",
        "language",
        "notes",
        "importance",
        "source",
    ):
        if field in merged:
            setattr(reference, field, merged[field])
    if creating and isinstance(merged.get("createdAt"), str) and merged["createdAt"].strip():
        reference.created_at = merged["createdAt"]
    elif creating and isinstance(payload.get("created_at"), str) and payload["created_at"].strip():
        reference.created_at = payload["created_at"]
    reference.updated_at = (
        payload.get("updated_at")
        if isinstance(payload.get("updated_at"), str) and payload["updated_at"].strip()
        else payload.get("updatedAt")
        if isinstance(payload.get("updatedAt"), str) and payload["updatedAt"].strip()
        else datetime.now().isoformat()
    )
    merged.update(
        {
            "id": reference.id,
            "citeKey": reference.cite_key,
            "createdAt": reference.created_at,
            "updatedAt": reference.updated_at,
        }
    )
    reference.payload_json = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    reference.payload_version = 1


def _create_or_update(session: Session, payload: dict[str, Any]) -> tuple[Reference, bool]:
    requested_id = payload.get("id")
    if requested_id is not None and (
        not isinstance(requested_id, str) or not _SAFE_LOCAL_ID.fullmatch(requested_id)
    ):
        raise HTTPException(422, "Reference id must be a short local identifier")
    reference = session.get(Reference, requested_id) if requested_id else None
    created = reference is None
    if reference is None:
        reference = Reference(id=requested_id) if requested_id else Reference()
        requested_cite_key = payload.get("citeKey")
        reference.cite_key = (
            requested_cite_key.strip()
            if isinstance(requested_cite_key, str) and requested_cite_key.strip()
            else _next_cite_key(session)
        )
    _apply_payload(reference, payload, creating=created)
    session.add(reference)
    return reference, created


def _next_cite_key(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(Reference)).one()
    return f"Selenyx-{count + 1:04d}"


def _replace_project_reference(session: Session, old_id: str, replacement_id: str | None) -> None:
    """Remove or retarget a reference id in every persisted project payload."""
    from selenyx_backend.models import ResearchProject

    for project in session.exec(select(ResearchProject)).all():
        try:
            reference_ids = json.loads(project.reference_ids_json or "[]")
        except (TypeError, ValueError):
            reference_ids = []
        if not isinstance(reference_ids, list) or old_id not in reference_ids:
            continue
        changed: list[str] = []
        for reference_id in reference_ids:
            candidate = replacement_id if reference_id == old_id else reference_id
            if candidate and candidate not in changed:
                changed.append(candidate)
        project.reference_ids_json = json.dumps(changed, ensure_ascii=False)
        project_payload = _json_object(project.payload_json)
        project_payload["referenceIds"] = changed
        project_payload["updatedAt"] = datetime.now().isoformat()
        project.payload_json = json.dumps(project_payload, ensure_ascii=False, separators=(",", ":"))
        project.updated_at = project_payload["updatedAt"]
        session.add(project)


def _repair_evidence_domain_after_source_delete(session: Session, removed_evidence_ids: set[str]) -> None:
    """Prune deleted evidence IDs from claims/cases without inventing support.

    Claims are user-authored research objects, so deleting one source does not
    delete the claim text.  It does, however, return an active claim to draft
    and reopen a contradiction case whenever its evidence graph changed.
    """
    if not removed_evidence_ids:
        return
    from selenyx_backend.models import ContradictionCase, ResearchClaim

    now = datetime.now().isoformat()
    for claim in session.exec(select(ResearchClaim)).all():
        evidence_ids = _json_list(claim.evidence_ids_json)
        retained = [item_id for item_id in evidence_ids if item_id not in removed_evidence_ids]
        if retained == evidence_ids:
            continue
        claim.evidence_ids_json = json.dumps(retained, ensure_ascii=False, separators=(",", ":"))
        if claim.status == "active":
            claim.status = "draft"
        claim.updated_at = now
        session.add(claim)

    for case in session.exec(select(ContradictionCase)).all():
        evidence_ids = _json_list(case.evidence_ids_json)
        retained = [item_id for item_id in evidence_ids if item_id not in removed_evidence_ids]
        if retained == evidence_ids:
            continue
        case.evidence_ids_json = json.dumps(retained, ensure_ascii=False, separators=(",", ":"))
        # A resolved conflict cannot remain resolved after one of the inputs
        # vanished.  Do not synthesize a replacement or silently keep a claim.
        case.status = "open"
        marker = "[A linked source was removed; review the remaining evidence.]"
        if marker not in case.resolution:
            case.resolution = f"{marker}\n{case.resolution}".strip()
        case.updated_at = now
        session.add(case)


def _delete_reference_graph(session: Session, reference: Reference, *, replacement_id: str | None = None) -> None:
    """Delete or merge a source without leaving locators or evidence edges dangling."""
    from selenyx_backend.models import DocumentChunk, EvidenceItem, ProvenanceAnchor

    _replace_project_reference(session, reference.id, replacement_id)
    for chunk in session.exec(select(DocumentChunk).where(DocumentChunk.reference_id == reference.id)).all():
        session.delete(chunk)
    for anchor in session.exec(select(ProvenanceAnchor).where(ProvenanceAnchor.reference_id == reference.id)).all():
        session.delete(anchor)
    evidence_items = session.exec(select(EvidenceItem).where(EvidenceItem.reference_id == reference.id)).all()
    removed_evidence_ids = {item.id for item in evidence_items}
    for item in evidence_items:
        if replacement_id:
            item.reference_id = replacement_id
            # The old attachment has been deleted. Retaining either locator
            # would falsely claim that the equivalent position exists in the
            # replacement source.
            item.chunk_id = None
            item.anchor_id = None
            item.updated_at = datetime.now().isoformat()
            session.add(item)
        else:
            session.delete(item)
    if not replacement_id:
        _repair_evidence_domain_after_source_delete(session, removed_evidence_ids)
    session.delete(reference)


@router.get("")
def list_references(
    q: str | None = None,
    collection: str | None = None,
    tag: str | None = None,
    stage: str | None = None,
    session: Session = Depends(get_session),
):
    statement = select(Reference)
    if q:
        pattern = f"%{q.lower()}%"
        statement = statement.where(
            func.lower(col(Reference.title)).like(pattern)
            | func.lower(col(Reference.doi)).like(pattern)
            | func.lower(col(Reference.publication)).like(pattern)
        )
    if stage:
        statement = statement.where(Reference.pipeline_stage == stage)
    if collection:
        statement = statement.where(Reference.collections_json.contains(collection))
    if tag:
        statement = statement.where(Reference.tags_json.contains(tag))
    return [_serialize(row) for row in session.exec(statement.order_by(Reference.updated_at.desc())).all()]


@router.get("/snapshot")
def reference_snapshot(session: Session = Depends(get_session)):
    rows = session.exec(select(Reference).order_by(Reference.updated_at.desc())).all()
    return {"references": [_serialize(row) for row in rows], "count": len(rows), "payloadVersion": 1}


@router.post("/bulk-upsert")
async def bulk_upsert_references(body: BulkReferenceBody, session: Session = Depends(get_session)):
    stored: list[Reference] = []
    created = 0
    try:
        for payload in body.references:
            reference, was_created = _create_or_update(session, payload)
            stored.append(reference)
            created += int(was_created)
        session.commit()
    except Exception:
        session.rollback()
        raise
    # Index metadata after the data transaction is durable.  A local embedding
    # failure must not roll back the user's reference library.
    from selenyx_backend.services.rag import index_reference_record

    indexed = 0
    for reference in stored:
        try:
            indexed += await index_reference_record(session, reference)
        except Exception:
            continue
    return {
        "stored": len(stored),
        "created": created,
        "updated": len(stored) - created,
        "indexedChunks": indexed,
    }


@router.get("/{ref_id}")
def get_reference(ref_id: str, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
    return _serialize(reference)


@router.post("")
async def create_reference(payload: dict, session: Session = Depends(get_session)):
    reference, _ = _create_or_update(session, payload)
    session.commit()
    session.refresh(reference)
    # Snapshot before optional RAG work — session expiry must not empty the HTTP body.
    data = _serialize(reference)
    try:
        from selenyx_backend.services.rag import index_reference_record

        await index_reference_record(session, reference)
    except Exception:
        pass
    return data


@router.patch("/{ref_id}")
async def update_reference(ref_id: str, patch: dict, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
    patch.pop("id", None)
    _apply_payload(reference, patch, creating=False)
    session.add(reference)
    session.commit()
    session.refresh(reference)
    data = _serialize(reference)
    if any(key in patch for key in ("title", "abstract", "notes", "updatedAt")):
        try:
            from selenyx_backend.services.rag import index_reference_record

            await index_reference_record(session, reference)
        except Exception:
            pass
    return data


@router.delete("/{ref_id}")
def delete_reference(ref_id: str, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
    _delete_reference_graph(session, reference)
    session.commit()
    return {"deleted": ref_id}


@router.post("/import")
async def import_references(body: ImportReferencesBody, session: Session = Depends(get_session)):
    from selenyx_backend.services.reference_exchange import ReferenceExchangeError, normalize_format, parse_exchange

    try:
        format_name = normalize_format(body.format)
        payloads = parse_exchange(format_name, body.data)
    except ReferenceExchangeError as exc:
        raise HTTPException(422, str(exc)) from exc

    stored: list[Reference] = []
    created = 0
    try:
        for payload in payloads:
            reference, was_created = _create_or_update(session, payload)
            stored.append(reference)
            created += int(was_created)
        session.commit()
    except Exception:
        session.rollback()
        raise

    from selenyx_backend.services.rag import index_reference_record

    indexed = 0
    for reference in stored:
        try:
            indexed += await index_reference_record(session, reference)
        except Exception:
            continue
    return {
        "imported": len(stored),
        "created": created,
        "updated": len(stored) - created,
        "indexedChunks": indexed,
        "format": format_name,
    }


@router.post("/export")
def export_references(body: ExportReferencesBody, session: Session = Depends(get_session)):
    from selenyx_backend.services.reference_exchange import ReferenceExchangeError, normalize_format, render_exchange

    try:
        format_name = normalize_format(body.format)
    except ReferenceExchangeError as exc:
        raise HTTPException(422, str(exc)) from exc

    if body.ids:
        # Loading the local id map avoids SQLite's host-parameter ceiling when
        # users export large selections (the request contract allows 10,000).
        rows_by_id = {row.id: row for row in session.exec(select(Reference)).all()}
        rows = [rows_by_id[ref_id] for ref_id in body.ids if ref_id in rows_by_id]
        missing = [ref_id for ref_id in body.ids if ref_id not in rows_by_id]
    else:
        rows = session.exec(select(Reference).order_by(Reference.updated_at.desc())).all()
        missing = []
    data = render_exchange(format_name, [_serialize(row) for row in rows])
    return {
        "data": data,
        "format": format_name,
        "count": len(rows),
        "missing": missing,
        "mimeType": {
            "json": "application/json",
            "bibtex": "application/x-bibtex",
            "ris": "application/x-research-info-systems",
        }[format_name],
        "fileExtension": {"json": "json", "bibtex": "bib", "ris": "ris"}[format_name],
    }


@router.post("/deduplicate")
def deduplicate_references(session: Session = Depends(get_session)):
    references = session.exec(select(Reference)).all()
    seen: dict[tuple[str, str], Reference] = {}
    duplicate_pairs: list[tuple[Reference, Reference]] = []
    for reference in references:
        normalized_title = "".join(char for char in reference.title.lower() if char.isalnum())
        key = (reference.doi.lower() or reference.pmid.lower() or normalized_title, reference.year)
        if key in seen and key[0]:
            duplicate_pairs.append((reference, seen[key]))
        else:
            seen[key] = reference
    for duplicate, keeper in duplicate_pairs:
        _delete_reference_graph(session, duplicate, replacement_id=keeper.id)
    session.commit()
    return {"merged": len(duplicate_pairs), "remaining": len(references) - len(duplicate_pairs)}


@router.get("/lookup/doi/{doi:path}")
async def lookup_doi(doi: str):
    from selenyx_backend.services.scholarly import lookup_doi as scholarly_lookup_doi

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        work, meta = await scholarly_lookup_doi(client, doi)
    if not work:
        raise HTTPException(404, f"Crossref could not find DOI: {doi}")
    return {**work, "diagnostics": meta}


@router.get("/lookup/pmid/{pmid}")
async def lookup_pmid(pmid: str):
    from selenyx_backend.services.scholarly import search_pubmed

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        items, meta = await search_pubmed(client, f"{pmid}[uid]", retmax=1)
    if not items:
        raise HTTPException(404, f"PubMed could not find PMID: {pmid}")
    return {**items[0], "diagnostics": meta}
