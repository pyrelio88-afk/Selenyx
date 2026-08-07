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
    return session.exec(statement.order_by(Reference.updated_at.desc())).all()


@router.get("/{ref_id}")
def get_reference(ref_id: str, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
    return reference


@router.post("")
def create_reference(payload: dict, session: Session = Depends(get_session)):
    fields = {key: value for key, value in payload.items() if key in Reference.model_fields and key != "id"}
    reference = Reference(**fields)
    reference.cite_key = _next_cite_key(session)
    session.add(reference)
    session.commit()
    session.refresh(reference)
    return reference


@router.patch("/{ref_id}")
def update_reference(ref_id: str, patch: dict, session: Session = Depends(get_session)):
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
    return reference


@router.delete("/{ref_id}")
def delete_reference(ref_id: str, session: Session = Depends(get_session)):
    reference = session.get(Reference, ref_id)
    if not reference:
        raise HTTPException(404, "Reference not found")
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
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.crossref.org/works/{doi}",
            headers={"User-Agent": "Selenyx/2.0"},
        )
    if response.status_code != 200:
        raise HTTPException(404, f"Crossref could not find DOI: {doi}")
    work = response.json()["message"]
    return {
        "title": work.get("title", [""])[0],
        "creators": [
            {"firstName": author.get("given", ""), "lastName": author.get("family", ""), "type": "author"}
            for author in work.get("author", [])
        ],
        "publication": work.get("container-title", [""])[0],
        "year": str(work.get("published-print", work.get("published-online", {}).get("date-parts", [[""]])[0][0], "")),
        "doi": doi,
        "volume": str(work.get("volume", "")),
        "issue": str(work.get("issue", "")),
        "pages": work.get("page", ""),
        "issn": work.get("ISSN", [""])[0] if work.get("ISSN") else "",
        "url": work.get("URL", ""),
        "abstract": work.get("abstract", ""),
    }


@router.get("/lookup/pmid/{pmid}")
def lookup_pmid(pmid: str):
    raise HTTPException(501, f"PubMed lookup is not implemented for PMID {pmid}")
