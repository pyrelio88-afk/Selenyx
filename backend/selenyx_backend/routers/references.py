"""Persistent local reference library routes."""

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, func, select

from selenyx_backend.database import get_session
from selenyx_backend.models import Reference

router = APIRouter()


def _next_cite_key(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(Reference)).one()
    return f"Selenyx-{count + 1:04d}"


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
    return [row.model_dump() for row in session.exec(statement.order_by(Reference.updated_at.desc())).all()]


@router.get("/{ref_id}")
def get_reference(ref_id: str, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
    return reference.model_dump()


@router.post("")
async def create_reference(payload: dict, session: Session = Depends(get_session)):
    fields = {key: value for key, value in payload.items() if key in Reference.model_fields and key != "id"}
    reference = Reference(**fields)
    reference.cite_key = _next_cite_key(session)
    session.add(reference)
    session.commit()
    session.refresh(reference)
    # Snapshot before optional RAG work — session expiry must not empty the HTTP body.
    data = reference.model_dump()
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
    for key, value in patch.items():
        if key in Reference.model_fields and key not in {"id", "cite_key", "created_at"}:
            setattr(reference, key, value)
    reference.updated_at = datetime.now().isoformat()
    session.add(reference)
    session.commit()
    session.refresh(reference)
    data = reference.model_dump()
    if any(key in patch for key in ("title", "abstract", "notes")):
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
    from selenyx_backend.models import DocumentChunk
    from sqlmodel import select

    for chunk in session.exec(select(DocumentChunk).where(DocumentChunk.reference_id == ref_id)).all():
        session.delete(chunk)
    session.delete(reference)
    session.commit()
    return {"deleted": ref_id}


@router.post("/import")
def import_references(format: str, data: str):
    # Format parsers will be added on top of the persistent store.
    return {"imported": 0, "format": format, "received": len(data)}


@router.post("/export")
def export_references(ids: list[str], format: str):
    # Keeping the response contract while parser/export writers are introduced.
    return {"data": "", "format": format, "count": len(ids)}


@router.post("/deduplicate")
def deduplicate_references(session: Session = Depends(get_session)):
    references = session.exec(select(Reference)).all()
    seen: set[tuple[str, str]] = set()
    duplicate_ids: list[str] = []
    for reference in references:
        normalized_title = "".join(char for char in reference.title.lower() if char.isalnum())
        key = (reference.doi.lower() or reference.pmid.lower() or normalized_title, reference.year)
        if key in seen and key[0]:
            duplicate_ids.append(reference.id)
        else:
            seen.add(key)
    for ref_id in duplicate_ids:
        reference = session.get(Reference, ref_id)
        if reference:
            session.delete(reference)
    session.commit()
    return {"merged": len(duplicate_ids), "remaining": len(references) - len(duplicate_ids)}


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
