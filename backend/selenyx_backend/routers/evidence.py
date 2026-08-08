"""Evidence chain API — writing must use accepted items only."""

from __future__ import annotations

from datetime import datetime
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_session
from selenyx_backend.models import DocumentChunk, EvidenceItem, Reference, ResearchProject

router = APIRouter()

ALLOWED_RELATIONS = {"supports", "contradicts", "qualifies"}
ALLOWED_REVIEW = {"pending", "accepted", "rejected"}
ALLOWED_CONFIDENCE = {"high", "medium", "low"}


class EvidenceCreate(BaseModel):
    projectId: str
    referenceId: str = ""
    claim: str = ""
    excerpt: str = Field(min_length=1)
    relation: str = "supports"
    confidence: str = "medium"
    page: int | None = None
    chunkId: str | None = None
    notes: str = ""


class EvidencePatch(BaseModel):
    claim: str | None = None
    excerpt: str | None = None
    relation: str | None = None
    review: str | None = None
    confidence: str | None = None
    notes: str | None = None
    page: int | None = None


@router.get("")
def list_evidence(projectId: str | None = None, session: Session = Depends(get_session)):
    statement = select(EvidenceItem).order_by(EvidenceItem.updated_at.desc())
    if projectId:
        statement = statement.where(EvidenceItem.project_id == projectId)
    return session.exec(statement).all()


@router.get("/summary")
def evidence_summary(projectId: str | None = None, session: Session = Depends(get_session)):
    """OpenScience-style local evidence graph summary counts."""
    items = list_evidence(projectId=projectId, session=session)
    by_relation = Counter(i.relation for i in items)
    by_review = Counter(i.review for i in items)
    by_confidence = Counter(i.confidence for i in items)
    return {
        "total": len(items),
        "accepted": by_review.get("accepted", 0),
        "pending": by_review.get("pending", 0),
        "rejected": by_review.get("rejected", 0),
        "supports": by_relation.get("supports", 0),
        "contradicts": by_relation.get("contradicts", 0),
        "qualifies": by_relation.get("qualifies", 0),
        "confidence": dict(by_confidence),
    }


@router.post("")
def create_evidence(body: EvidenceCreate, session: Session = Depends(get_session)):
    if body.relation not in ALLOWED_RELATIONS:
        raise HTTPException(400, f"relation must be one of {sorted(ALLOWED_RELATIONS)}")
    if body.confidence not in ALLOWED_CONFIDENCE:
        raise HTTPException(400, f"confidence must be one of {sorted(ALLOWED_CONFIDENCE)}")
    if not session.get(ResearchProject, body.projectId):
        raise HTTPException(409, f"Evidence references missing project: {body.projectId}")
    if body.referenceId and not session.get(Reference, body.referenceId):
        raise HTTPException(409, f"Evidence references missing reference: {body.referenceId}")
    if body.chunkId:
        chunk = session.get(DocumentChunk, body.chunkId)
        if not chunk:
            raise HTTPException(409, f"Evidence references missing chunk: {body.chunkId}")
        if not body.referenceId or chunk.reference_id != body.referenceId:
            raise HTTPException(409, "Evidence chunk does not belong to the supplied reference")
    item = EvidenceItem(
        project_id=body.projectId,
        reference_id=body.referenceId,
        claim=body.claim,
        excerpt=body.excerpt,
        relation=body.relation,
        confidence=body.confidence,
        page=body.page,
        chunk_id=body.chunkId,
        notes=body.notes,
        review="pending",
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}")
def patch_evidence(item_id: str, body: EvidencePatch, session: Session = Depends(get_session)):
    item = session.get(EvidenceItem, item_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    data = body.model_dump(exclude_unset=True)
    if "relation" in data and data["relation"] not in ALLOWED_RELATIONS:
        raise HTTPException(400, f"relation must be one of {sorted(ALLOWED_RELATIONS)}")
    if "review" in data and data["review"] not in ALLOWED_REVIEW:
        raise HTTPException(400, f"review must be one of {sorted(ALLOWED_REVIEW)}")
    if "confidence" in data and data["confidence"] not in ALLOWED_CONFIDENCE:
        raise HTTPException(400, f"confidence must be one of {sorted(ALLOWED_CONFIDENCE)}")
    for key, value in data.items():
        setattr(item, key if key != "chunkId" else "chunk_id", value)
    # map camelCase leftovers
    if "claim" in data:
        item.claim = data["claim"]
    item.updated_at = datetime.now().isoformat()
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_evidence(item_id: str, session: Session = Depends(get_session)):
    item = session.get(EvidenceItem, item_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


@router.get("/writing-outline/{project_id}")
def writing_outline(project_id: str, session: Session = Depends(get_session)):
    """Outline bullets only from accepted evidence; gaps marked explicitly."""
    items = session.exec(
        select(EvidenceItem).where(
            EvidenceItem.project_id == project_id,
            EvidenceItem.review == "accepted",
        )
    ).all()
    if not items:
        return {
            "projectId": project_id,
            "bullets": ["【需证据】尚无已接受证据，请先在证据链中接受摘录后再生成提纲。"],
            "acceptedCount": 0,
        }
    bullets = []
    for item in items:
        tag = {"supports": "支持", "contradicts": "反驳", "qualifies": "限定"}.get(item.relation, item.relation)
        cite = f"（文献 {item.reference_id[:8]}… p.{item.page}）" if item.page is not None else f"（文献 {item.reference_id[:8]}…）"
        claim = item.claim.strip() or item.excerpt[:120]
        bullets.append(f"[{tag}/{item.confidence}] {claim} {cite}")
    return {"projectId": project_id, "bullets": bullets, "acceptedCount": len(items)}
