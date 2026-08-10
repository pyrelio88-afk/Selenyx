"""Local evidence, provenance, claim, contradiction, and stage-artifact APIs.

Writing routes may use only ``accepted`` evidence.  ``review`` remains in the
wire format for existing clients, while ``status`` is the richer canonical
state used by new clients.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_session
from selenyx_backend.models import (
    ContradictionCase,
    DocumentChunk,
    EvidenceItem,
    ProvenanceAnchor,
    Reference,
    ResearchClaim,
    ResearchProject,
    StageArtifact,
)

router = APIRouter()

ALLOWED_RELATIONS = {"supports", "contradicts", "qualifies"}
ALLOWED_STATUSES = {"retrieved", "pending", "accepted", "rejected", "unresolved"}
ALLOWED_REVIEW = {"pending", "accepted", "rejected"}
ALLOWED_CONFIDENCE = {"high", "medium", "low"}
ALLOWED_CLAIM_TYPES = {"finding", "method", "sample", "limitation", "hypothesis"}
ALLOWED_CLAIM_STATUSES = {"draft", "active", "retired"}
ALLOWED_CONTRADICTION_STATUSES = {"open", "resolved", "accepted"}
ALLOWED_ARTIFACT_STATUSES = {"draft", "ready", "approved", "blocked"}

STATUS_TO_REVIEW = {
    "retrieved": "pending",
    "pending": "pending",
    "accepted": "accepted",
    "rejected": "rejected",
    "unresolved": "pending",
}


class EvidenceCreate(BaseModel):
    projectId: str
    referenceId: str = ""
    claim: str = ""
    excerpt: str = Field(min_length=1)
    relation: str = "supports"
    status: str = "pending"
    confidence: str = "medium"
    page: int | None = None
    chunkId: str | None = None
    anchorId: str | None = None
    notes: str = ""


class EvidencePatch(BaseModel):
    claim: str | None = None
    excerpt: str | None = None
    relation: str | None = None
    # review is the backwards-compatible three-state alias.
    review: str | None = None
    status: str | None = None
    confidence: str | None = None
    notes: str | None = None
    page: int | None = None
    chunkId: str | None = None
    anchorId: str | None = None


class ProvenanceAnchorCreate(BaseModel):
    referenceId: str
    chunkId: str | None = None
    page: int | None = None
    bbox: list[float] = Field(default_factory=list)
    charStart: int | None = Field(default=None, ge=0)
    charEnd: int | None = Field(default=None, ge=0)
    headingPath: list[str] = Field(default_factory=list)
    parserVersion: str = "manual-v1"
    sourceUri: str = ""
    contentHash: str = ""


class ClaimCreate(BaseModel):
    projectId: str
    text: str = Field(min_length=1)
    claimType: str = "finding"
    status: str = "draft"
    evidenceIds: list[str] = Field(default_factory=list)
    notes: str = ""


class ClaimPatch(BaseModel):
    text: str | None = None
    claimType: str | None = None
    status: str | None = None
    evidenceIds: list[str] | None = None
    notes: str | None = None


class ContradictionCreate(BaseModel):
    projectId: str
    title: str = Field(min_length=1)
    description: str = ""
    claimId: str | None = None
    evidenceIds: list[str] = Field(default_factory=list)
    status: str = "open"
    resolution: str = ""


class ContradictionPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    claimId: str | None = None
    evidenceIds: list[str] | None = None
    status: str | None = None
    resolution: str | None = None


class StageArtifactCreate(BaseModel):
    projectId: str
    stage: str = Field(min_length=1)
    title: str = Field(min_length=1)
    artifactType: str = "note"
    content: Any = Field(default_factory=dict)
    qualityGate: str = ""
    status: str = "draft"
    sourceUri: str = ""


class StageArtifactPatch(BaseModel):
    title: str | None = None
    qualityGate: str | None = None
    status: str | None = None
    sourceUri: str | None = None


def _json_list(value: str) -> list[Any]:
    try:
        decoded = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    return decoded if isinstance(decoded, list) else []


def _json_content(value: str) -> Any:
    try:
        return json.loads(value or "{}")
    except (TypeError, ValueError):
        return {}


def _dump_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        raise HTTPException(422, "content must be JSON serializable") from error


def _validate_bbox(bbox: list[float]) -> None:
    if not bbox:
        return
    if len(bbox) != 4:
        raise HTTPException(422, "bbox must be [left, top, right, bottom]")
    left, top, right, bottom = bbox
    if right < left or bottom < top:
        raise HTTPException(422, "bbox must have right >= left and bottom >= top")


def _validate_span(char_start: int | None, char_end: int | None) -> None:
    if char_start is not None and char_end is not None and char_end < char_start:
        raise HTTPException(422, "charEnd must be greater than or equal to charStart")


def _require_project(session: Session, project_id: str) -> ResearchProject:
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(409, f"Missing project: {project_id}")
    return project


def _require_reference(session: Session, reference_id: str) -> Reference:
    reference = session.get(Reference, reference_id)
    if not reference:
        raise HTTPException(409, f"Missing reference: {reference_id}")
    return reference


def _require_chunk_for_reference(session: Session, chunk_id: str, reference_id: str) -> DocumentChunk:
    chunk = session.get(DocumentChunk, chunk_id)
    if not chunk:
        raise HTTPException(409, f"Missing chunk: {chunk_id}")
    if chunk.reference_id != reference_id:
        raise HTTPException(409, "Chunk does not belong to the supplied reference")
    return chunk


def _require_anchor_for_reference(session: Session, anchor_id: str, reference_id: str) -> ProvenanceAnchor:
    anchor = session.get(ProvenanceAnchor, anchor_id)
    if not anchor:
        raise HTTPException(409, f"Missing provenance anchor: {anchor_id}")
    if anchor.reference_id != reference_id:
        raise HTTPException(409, "Provenance anchor does not belong to the supplied reference")
    return anchor


def _validate_evidence_ids(session: Session, project_id: str, evidence_ids: list[str]) -> list[str]:
    stable_ids = list(dict.fromkeys(item_id for item_id in evidence_ids if item_id))
    for item_id in stable_ids:
        item = session.get(EvidenceItem, item_id)
        if not item:
            raise HTTPException(409, f"Missing evidence item: {item_id}")
        if item.project_id != project_id:
            raise HTTPException(409, "Evidence belongs to another project")
    return stable_ids


def _evidence_status(status: str | None, review: str | None, *, current: str) -> tuple[str, str]:
    if status is not None and status not in ALLOWED_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_STATUSES)}")
    if review is not None and review not in ALLOWED_REVIEW:
        raise HTTPException(400, f"review must be one of {sorted(ALLOWED_REVIEW)}")
    resolved_status = status if status is not None else (review if review is not None else current)
    resolved_review = STATUS_TO_REVIEW[resolved_status]
    if review is not None and review != resolved_review:
        raise HTTPException(422, "review conflicts with the supplied status")
    return resolved_status, resolved_review


def _anchor_payload(anchor: ProvenanceAnchor) -> dict[str, Any]:
    return {
        "id": anchor.id,
        "referenceId": anchor.reference_id,
        "chunkId": anchor.chunk_id,
        "page": anchor.page,
        "bbox": _json_list(anchor.bbox_json),
        "charStart": anchor.char_start,
        "charEnd": anchor.char_end,
        "headingPath": _json_list(anchor.heading_path_json),
        "parserVersion": anchor.parser_version,
        "sourceUri": anchor.source_uri,
        "contentHash": anchor.content_hash,
        "createdAt": anchor.created_at,
    }


def _claim_payload(claim: ResearchClaim) -> dict[str, Any]:
    return {
        "id": claim.id,
        "projectId": claim.project_id,
        "text": claim.text,
        "claimType": claim.claim_type,
        "status": claim.status,
        "evidenceIds": _json_list(claim.evidence_ids_json),
        "notes": claim.notes,
        "createdAt": claim.created_at,
        "updatedAt": claim.updated_at,
    }


def _contradiction_payload(case: ContradictionCase) -> dict[str, Any]:
    return {
        "id": case.id,
        "projectId": case.project_id,
        "claimId": case.claim_id,
        "title": case.title,
        "description": case.description,
        "evidenceIds": _json_list(case.evidence_ids_json),
        "status": case.status,
        "resolution": case.resolution,
        "createdAt": case.created_at,
        "updatedAt": case.updated_at,
    }


def _artifact_payload(artifact: StageArtifact) -> dict[str, Any]:
    return {
        "id": artifact.id,
        "projectId": artifact.project_id,
        "stage": artifact.stage,
        "title": artifact.title,
        "artifactType": artifact.artifact_type,
        "content": _json_content(artifact.content_json),
        "contentHash": artifact.content_hash,
        "version": artifact.version,
        "qualityGate": artifact.quality_gate,
        "status": artifact.status,
        "sourceUri": artifact.source_uri,
        "createdAt": artifact.created_at,
        "updatedAt": artifact.updated_at,
    }


@router.get("")
def list_evidence(projectId: str | None = None, session: Session = Depends(get_session)):
    statement = select(EvidenceItem).order_by(EvidenceItem.updated_at.desc())
    if projectId:
        statement = statement.where(EvidenceItem.project_id == projectId)
    return session.exec(statement).all()


@router.get("/summary")
def evidence_summary(projectId: str | None = None, session: Session = Depends(get_session)):
    """Counts are explicit about fetched/unresolved evidence as well as review."""
    items = list_evidence(projectId=projectId, session=session)
    by_relation = Counter(i.relation for i in items)
    by_status = Counter(i.status for i in items)
    by_confidence = Counter(i.confidence for i in items)
    return {
        "total": len(items),
        **{status: by_status.get(status, 0) for status in sorted(ALLOWED_STATUSES)},
        "supports": by_relation.get("supports", 0),
        "contradicts": by_relation.get("contradicts", 0),
        "qualifies": by_relation.get("qualifies", 0),
        "confidence": dict(by_confidence),
    }


@router.get("/pending")
def pending_evidence(projectId: str | None = None, session: Session = Depends(get_session)):
    """证据门待裁决队列：附文献标题与项目名，供裁决卡片流直接渲染。"""
    statement = (
        select(EvidenceItem)
        .where(EvidenceItem.status == "pending")
        .order_by(EvidenceItem.updated_at.desc())
    )
    if projectId:
        statement = statement.where(EvidenceItem.project_id == projectId)
    items = list(session.exec(statement).all())
    ref_ids = {item.reference_id for item in items if item.reference_id}
    project_ids = {item.project_id for item in items if item.project_id}
    ref_titles = (
        {r.id: r.title for r in session.exec(select(Reference).where(Reference.id.in_(ref_ids))).all()}
        if ref_ids else {}
    )
    project_names = (
        {p.id: p.name for p in session.exec(select(ResearchProject).where(ResearchProject.id.in_(project_ids))).all()}
        if project_ids else {}
    )
    return {
        "items": [
            {
                "id": item.id,
                "projectId": item.project_id,
                "projectName": project_names.get(item.project_id, ""),
                "referenceId": item.reference_id,
                "referenceTitle": ref_titles.get(item.reference_id, ""),
                "claim": item.claim,
                "excerpt": item.excerpt,
                "relation": item.relation,
                "confidence": item.confidence,
                "page": item.page,
                "notes": item.notes,
                "createdAt": item.created_at,
            }
            for item in items
        ],
        "count": len(items),
    }


@router.post("")
def create_evidence(body: EvidenceCreate, session: Session = Depends(get_session)):
    if body.relation not in ALLOWED_RELATIONS:
        raise HTTPException(400, f"relation must be one of {sorted(ALLOWED_RELATIONS)}")
    if body.confidence not in ALLOWED_CONFIDENCE:
        raise HTTPException(400, f"confidence must be one of {sorted(ALLOWED_CONFIDENCE)}")
    status, review = _evidence_status(body.status, None, current="pending")
    _require_project(session, body.projectId)
    if body.referenceId:
        _require_reference(session, body.referenceId)
    if body.chunkId:
        if not body.referenceId:
            raise HTTPException(422, "chunkId requires referenceId")
        _require_chunk_for_reference(session, body.chunkId, body.referenceId)
    anchor = None
    if body.anchorId:
        if not body.referenceId:
            raise HTTPException(422, "anchorId requires referenceId")
        anchor = _require_anchor_for_reference(session, body.anchorId, body.referenceId)
        if body.chunkId and anchor.chunk_id and anchor.chunk_id != body.chunkId:
            raise HTTPException(409, "Anchor does not belong to the supplied chunk")
    item = EvidenceItem(
        project_id=body.projectId,
        reference_id=body.referenceId,
        claim=body.claim,
        excerpt=body.excerpt,
        relation=body.relation,
        review=review,
        status=status,
        confidence=body.confidence,
        page=body.page if body.page is not None else (anchor.page if anchor else None),
        chunk_id=body.chunkId,
        anchor_id=body.anchorId,
        notes=body.notes,
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
    if "confidence" in data and data["confidence"] not in ALLOWED_CONFIDENCE:
        raise HTTPException(400, f"confidence must be one of {sorted(ALLOWED_CONFIDENCE)}")
    status, review = _evidence_status(data.pop("status", None), data.pop("review", None), current=item.status)
    if "chunkId" in data and data["chunkId"] is not None:
        _require_chunk_for_reference(session, data["chunkId"], item.reference_id)
    if "anchorId" in data and data["anchorId"] is not None:
        anchor = _require_anchor_for_reference(session, data["anchorId"], item.reference_id)
        selected_chunk = data.get("chunkId", item.chunk_id)
        if selected_chunk and anchor.chunk_id and anchor.chunk_id != selected_chunk:
            raise HTTPException(409, "Anchor does not belong to the supplied chunk")
    for key, value in data.items():
        setattr(item, {"chunkId": "chunk_id", "anchorId": "anchor_id"}.get(key, key), value)
    item.status = status
    item.review = review
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
    """Outline bullets use accepted evidence only; other states never leak in."""
    items = session.exec(
        select(EvidenceItem).where(
            EvidenceItem.project_id == project_id,
            EvidenceItem.status == "accepted",
        )
    ).all()
    if not items:
        return {
            "projectId": project_id,
            "bullets": ["【需要证据】尚无已接受证据，请先人工审核摘录后再生成提纲。"],
            "acceptedCount": 0,
        }
    bullets = []
    for item in items:
        tag = {"supports": "支持", "contradicts": "反驳", "qualifies": "限定"}.get(item.relation, item.relation)
        cite = f"（文献 {item.reference_id[:8]}… p.{item.page}）" if item.page is not None else f"（文献 {item.reference_id[:8]}…）"
        claim = item.claim.strip() or item.excerpt[:120]
        bullets.append(f"[{tag}/{item.confidence}] {claim} {cite}")
    return {"projectId": project_id, "bullets": bullets, "acceptedCount": len(items)}


@router.get("/provenance-anchors")
def list_provenance_anchors(referenceId: str | None = None, session: Session = Depends(get_session)):
    statement = select(ProvenanceAnchor).order_by(ProvenanceAnchor.created_at.desc())
    if referenceId:
        statement = statement.where(ProvenanceAnchor.reference_id == referenceId)
    return [_anchor_payload(anchor) for anchor in session.exec(statement).all()]


@router.get("/provenance-anchors/{anchor_id}")
def get_provenance_anchor(anchor_id: str, session: Session = Depends(get_session)):
    anchor = session.get(ProvenanceAnchor, anchor_id)
    if not anchor:
        raise HTTPException(404, "Provenance anchor not found")
    return _anchor_payload(anchor)


@router.post("/provenance-anchors")
def create_provenance_anchor(body: ProvenanceAnchorCreate, session: Session = Depends(get_session)):
    _require_reference(session, body.referenceId)
    if body.chunkId:
        _require_chunk_for_reference(session, body.chunkId, body.referenceId)
    _validate_bbox(body.bbox)
    _validate_span(body.charStart, body.charEnd)
    anchor = ProvenanceAnchor(
        reference_id=body.referenceId,
        chunk_id=body.chunkId,
        page=body.page,
        bbox_json=_dump_json(body.bbox),
        char_start=body.charStart,
        char_end=body.charEnd,
        heading_path_json=_dump_json(body.headingPath),
        parser_version=body.parserVersion.strip() or "manual-v1",
        source_uri=body.sourceUri,
        content_hash=body.contentHash,
    )
    session.add(anchor)
    session.commit()
    session.refresh(anchor)
    return _anchor_payload(anchor)


@router.get("/claims")
def list_claims(projectId: str | None = None, session: Session = Depends(get_session)):
    statement = select(ResearchClaim).order_by(ResearchClaim.updated_at.desc())
    if projectId:
        statement = statement.where(ResearchClaim.project_id == projectId)
    return [_claim_payload(claim) for claim in session.exec(statement).all()]


@router.post("/claims")
def create_claim(body: ClaimCreate, session: Session = Depends(get_session)):
    _require_project(session, body.projectId)
    if body.claimType not in ALLOWED_CLAIM_TYPES:
        raise HTTPException(400, f"claimType must be one of {sorted(ALLOWED_CLAIM_TYPES)}")
    if body.status not in ALLOWED_CLAIM_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_CLAIM_STATUSES)}")
    evidence_ids = _validate_evidence_ids(session, body.projectId, body.evidenceIds)
    claim = ResearchClaim(
        project_id=body.projectId,
        text=body.text,
        claim_type=body.claimType,
        status=body.status,
        evidence_ids_json=_dump_json(evidence_ids),
        notes=body.notes,
    )
    session.add(claim)
    session.commit()
    session.refresh(claim)
    return _claim_payload(claim)


@router.patch("/claims/{claim_id}")
def patch_claim(claim_id: str, body: ClaimPatch, session: Session = Depends(get_session)):
    claim = session.get(ResearchClaim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    data = body.model_dump(exclude_unset=True)
    if "claimType" in data and data["claimType"] not in ALLOWED_CLAIM_TYPES:
        raise HTTPException(400, f"claimType must be one of {sorted(ALLOWED_CLAIM_TYPES)}")
    if "status" in data and data["status"] not in ALLOWED_CLAIM_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_CLAIM_STATUSES)}")
    if "evidenceIds" in data:
        claim.evidence_ids_json = _dump_json(_validate_evidence_ids(session, claim.project_id, data.pop("evidenceIds")))
    for key, value in data.items():
        setattr(claim, {"claimType": "claim_type"}.get(key, key), value)
    claim.updated_at = datetime.now().isoformat()
    session.add(claim)
    session.commit()
    session.refresh(claim)
    return _claim_payload(claim)


@router.get("/contradictions")
def list_contradictions(projectId: str | None = None, session: Session = Depends(get_session)):
    statement = select(ContradictionCase).order_by(ContradictionCase.updated_at.desc())
    if projectId:
        statement = statement.where(ContradictionCase.project_id == projectId)
    return [_contradiction_payload(case) for case in session.exec(statement).all()]


@router.post("/contradictions")
def create_contradiction(body: ContradictionCreate, session: Session = Depends(get_session)):
    _require_project(session, body.projectId)
    if body.status not in ALLOWED_CONTRADICTION_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_CONTRADICTION_STATUSES)}")
    if body.claimId:
        claim = session.get(ResearchClaim, body.claimId)
        if not claim or claim.project_id != body.projectId:
            raise HTTPException(409, "Claim does not belong to the supplied project")
    evidence_ids = _validate_evidence_ids(session, body.projectId, body.evidenceIds)
    case = ContradictionCase(
        project_id=body.projectId,
        claim_id=body.claimId,
        title=body.title,
        description=body.description,
        evidence_ids_json=_dump_json(evidence_ids),
        status=body.status,
        resolution=body.resolution,
    )
    session.add(case)
    session.commit()
    session.refresh(case)
    return _contradiction_payload(case)


@router.patch("/contradictions/{case_id}")
def patch_contradiction(case_id: str, body: ContradictionPatch, session: Session = Depends(get_session)):
    case = session.get(ContradictionCase, case_id)
    if not case:
        raise HTTPException(404, "Contradiction case not found")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ALLOWED_CONTRADICTION_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_CONTRADICTION_STATUSES)}")
    if "claimId" in data and data["claimId"]:
        claim = session.get(ResearchClaim, data["claimId"])
        if not claim or claim.project_id != case.project_id:
            raise HTTPException(409, "Claim does not belong to this project")
    if "evidenceIds" in data:
        case.evidence_ids_json = _dump_json(_validate_evidence_ids(session, case.project_id, data.pop("evidenceIds")))
    for key, value in data.items():
        setattr(case, {"claimId": "claim_id"}.get(key, key), value)
    case.updated_at = datetime.now().isoformat()
    session.add(case)
    session.commit()
    session.refresh(case)
    return _contradiction_payload(case)


@router.get("/stage-artifacts")
def list_stage_artifacts(
    projectId: str | None = None,
    stage: str | None = None,
    session: Session = Depends(get_session),
):
    statement = select(StageArtifact).order_by(StageArtifact.updated_at.desc())
    if projectId:
        statement = statement.where(StageArtifact.project_id == projectId)
    if stage:
        statement = statement.where(StageArtifact.stage == stage)
    return [_artifact_payload(artifact) for artifact in session.exec(statement).all()]


@router.post("/stage-artifacts")
def create_stage_artifact(body: StageArtifactCreate, session: Session = Depends(get_session)):
    _require_project(session, body.projectId)
    if body.status not in ALLOWED_ARTIFACT_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_ARTIFACT_STATUSES)}")
    content_json = _dump_json(body.content)
    previous = session.exec(
        select(StageArtifact).where(
            StageArtifact.project_id == body.projectId,
            StageArtifact.stage == body.stage,
            StageArtifact.title == body.title,
        )
    ).all()
    next_version = max((artifact.version for artifact in previous), default=0) + 1
    artifact = StageArtifact(
        project_id=body.projectId,
        stage=body.stage,
        title=body.title,
        artifact_type=body.artifactType,
        content_json=content_json,
        content_hash=hashlib.sha256(content_json.encode("utf-8")).hexdigest(),
        version=next_version,
        quality_gate=body.qualityGate,
        status=body.status,
        source_uri=body.sourceUri,
    )
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return _artifact_payload(artifact)


@router.patch("/stage-artifacts/{artifact_id}")
def patch_stage_artifact(artifact_id: str, body: StageArtifactPatch, session: Session = Depends(get_session)):
    artifact = session.get(StageArtifact, artifact_id)
    if not artifact:
        raise HTTPException(404, "Stage artifact not found")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ALLOWED_ARTIFACT_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALLOWED_ARTIFACT_STATUSES)}")
    for key, value in data.items():
        setattr(artifact, {"qualityGate": "quality_gate", "sourceUri": "source_uri"}.get(key, key), value)
    artifact.updated_at = datetime.now().isoformat()
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return _artifact_payload(artifact)
