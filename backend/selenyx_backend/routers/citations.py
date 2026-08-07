"""Citation formatting backed by the local SQLite reference library."""

import json

from fastapi import APIRouter, Depends
from sqlmodel import Session

from selenyx_backend.database import get_session
from selenyx_backend.models import Reference

router = APIRouter()
CITATION_STYLES = [
    {"id": "apa7", "name": "APA 7th"},
    {"id": "vancouver", "name": "Vancouver"},
    {"id": "gbt7714", "name": "GB/T 7714-2015"},
    {"id": "ama", "name": "AMA"},
]


@router.get("/styles")
def list_styles():
    return CITATION_STYLES


@router.post("/format")
def format_citations(ref_ids: list[str], style: str, session: Session = Depends(get_session)):
    citations = []
    for ref_id in ref_ids:
        reference = session.get(Reference, ref_id)
        if not reference:
            continue
        citations.append(_format(reference, style))
    return {"citations": citations, "style": style}


def _authors(reference: Reference, style: str) -> str:
    try:
        creators = json.loads(reference.creators_json)
    except json.JSONDecodeError:
        creators = []
    names = [
        f"{creator.get('lastName', '')} {creator.get('firstName', '')}".strip()
        for creator in creators
        if creator.get("type") == "author"
    ]
    if not names:
        return "Anonymous"
    if style == "apa7":
        return ", ".join(names[:-1]) + ", & " + names[-1] if len(names) > 1 else names[0]
    return ", ".join(names[:6]) + (" et al." if len(names) > 6 else "")


def _format(reference: Reference, style: str) -> str:
    authors = _authors(reference, style)
    if style == "apa7":
        return f"{authors} ({reference.year}). {reference.title}. {reference.publication}, {reference.volume}({reference.issue}), {reference.pages}."
    if style == "gbt7714":
        return f"{authors}. {reference.title}[J]. {reference.publication}, {reference.year}, {reference.volume}({reference.issue}): {reference.pages}."
    return f"{authors}. {reference.title}. {reference.publication}. {reference.year};{reference.volume}({reference.issue}):{reference.pages}."
