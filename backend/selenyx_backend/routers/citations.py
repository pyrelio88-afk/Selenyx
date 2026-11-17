"""Citation formatting backed by the local SQLite reference library."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, col, select

from selenyx_backend.database import get_session
from selenyx_backend.models import Reference

router = APIRouter()
CITATION_STYLES = [
    {"id": "apa7", "name": "APA 7th"},
    {"id": "vancouver", "name": "Vancouver"},
    {"id": "gbt7714", "name": "GB/T 7714-2015"},
    {"id": "ama", "name": "AMA"},
]
_SUPPORTED_STYLES = {item["id"] for item in CITATION_STYLES}


class FormatCitationsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    ref_ids: list[str] = Field(default_factory=list, alias="refIds", max_length=10_000)
    style: str = Field(default="apa7", min_length=1, max_length=40)


@router.get("/styles")
def list_styles():
    return CITATION_STYLES


@router.post("/format")
def format_citations(body: FormatCitationsBody, session: Session = Depends(get_session)):
    style = body.style.strip().lower()
    if style == "apa":
        style = "apa7"
    if style not in _SUPPORTED_STYLES:
        raise HTTPException(400, f"Unsupported citation style: {body.style}")
    unique_ids = list(dict.fromkeys(rid for rid in body.ref_ids if rid))
    refs_by_id = (
        {
            ref.id: ref
            for ref in session.exec(select(Reference).where(col(Reference.id).in_(unique_ids))).all()
        }
        if unique_ids
        else {}
    )
    citations = [_format(refs_by_id[ref_id], style) for ref_id in body.ref_ids if ref_id in refs_by_id]
    return {"citations": citations, "style": style}


def _authors(reference: Reference, style: str) -> str:
    try:
        creators = json.loads(reference.creators_json)
    except (TypeError, json.JSONDecodeError):
        creators = []
    names = [
        f"{creator.get('lastName', '')} {creator.get('firstName', '')}".strip()
        for creator in (creators if isinstance(creators, list) else [])
        if isinstance(creator, dict) and creator.get("type", "author") == "author"
    ]
    names = [name for name in names if name]
    if not names:
        return "Anonymous"
    if style == "apa7":
        return ", ".join(names[:-1]) + ", & " + names[-1] if len(names) > 1 else names[0]
    return ", ".join(names[:6]) + (" et al." if len(names) > 6 else "")


def _vol_issue(volume: str, issue: str) -> str:
    if volume and issue:
        return f"{volume}({issue})"
    if volume:
        return volume
    if issue:
        return f"({issue})"
    return ""


def _format(reference: Reference, style: str) -> str:
    authors = _authors(reference, style)
    year = (reference.year or "").strip()
    title = (reference.title or "Untitled").strip().rstrip(".")
    pub = (reference.publication or "").strip().rstrip(".")
    vol = (reference.volume or "").strip()
    iss = (reference.issue or "").strip()
    pages = (reference.pages or "").strip()
    vol_iss = _vol_issue(vol, iss)

    if style == "apa7":
        year_seg = f"({year})" if year else "(n.d.)"
        venue = ", ".join(part for part in (pub, vol_iss, pages) if part)
        if venue:
            return f"{authors} {year_seg}. {title}. {venue}."
        return f"{authors} {year_seg}. {title}."

    if style == "gbt7714":
        tail_meta = ", ".join(part for part in (pub, year, vol_iss) if part)
        if tail_meta and pages:
            venue = f"{tail_meta}: {pages}"
        else:
            venue = tail_meta or pages
        if venue:
            return f"{authors}. {title}[J]. {venue}."
        return f"{authors}. {title}[J]."

    loc = f"{vol_iss}:{pages}" if (vol_iss and pages) else (vol_iss or pages)
    yr_loc = f"{year};{loc}" if (year and loc) else (year or loc)
    segments = [authors, title]
    if pub:
        segments.append(pub)
    if yr_loc:
        segments.append(yr_loc)
    return ". ".join(segments) + "."
