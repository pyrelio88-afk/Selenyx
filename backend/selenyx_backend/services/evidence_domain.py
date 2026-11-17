"""Shared domain integrity helpers for the evidence/claim/contradiction graph."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from selenyx_backend.models import ContradictionCase, ResearchClaim


def _json_list(raw: str) -> list[Any]:
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def repair_evidence_domain_after_delete(
    session: Session, removed_evidence_ids: set[str]
) -> None:
    """Prune deleted evidence IDs from claims/cases without inventing support.

    Claims are user-authored research objects, so deleting one source or
    evidence card does not delete the claim text. It does, however, return an
    active claim to draft and reopen a contradiction case whenever its evidence
    graph changed.
    """
    if not removed_evidence_ids:
        return

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
        # vanished. Do not synthesize a replacement or silently keep a claim.
        case.status = "open"
        marker = "[A linked source was removed; review the remaining evidence.]"
        if marker not in case.resolution:
            case.resolution = f"{marker}\n{case.resolution}".strip()
        case.updated_at = now
        session.add(case)


_repair_evidence_domain_after_source_delete = repair_evidence_domain_after_delete

__all__ = [
    "repair_evidence_domain_after_delete",
    "_repair_evidence_domain_after_source_delete",
]
