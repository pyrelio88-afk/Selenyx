"""引用格式化路由 — APA7 / Vancouver / GB-T7714 / AMA"""

from fastapi import APIRouter
from selenyx_backend.routers.references import _refs

router = APIRouter()

CITATION_STYLES = [
    {"id": "apa7", "name": "APA 7th"},
    {"id": "vancouver", "name": "Vancouver"},
    {"id": "gbt7714", "name": "GB/T 7714-2015"},
    {"id": "ama", "name": "AMA"},
]


@router.get("/styles")
async def list_styles():
    return CITATION_STYLES


@router.post("/format")
async def format_citations(ref_ids: list[str], style: str):
    """格式化引用"""
    citations = []
    for rid in ref_ids:
        ref = next((r for r in _refs if r.id == rid), None)
        if not ref:
            continue
        if style == "apa7":
            citations.append(_format_apa7(ref))
        elif style == "vancouver":
            citations.append(_format_vancouver(ref))
        elif style == "gbt7714":
            citations.append(_format_gbt7714(ref))
        elif style == "ama":
            citations.append(_format_ama(ref))
    return {"citations": citations, "style": style}


def _authors_str(ref, style: str) -> str:
    """作者列表格式化"""
    import json
    creators = json.loads(ref.creators_json) if ref.creators_json else []
    if not creators:
        return "Anonymous"

    names = [f"{c.get('lastName', '')} {c.get('firstName', '')}".strip() for c in creators if c.get('type') == 'author']

    if style == "apa7":
        if len(names) <= 20:
            return ", ".join(names[:-1]) + ", & " + names[-1] if len(names) > 1 else names[0]
        return ", ".join(names[:20]) + " ... " + names[-1]
    elif style == "vancouver":
        return ", ".join(n.split()[-1] + " " + " ".join(w[0] for w in n.split()[:-1]) for n in names[:6]) + (" et al." if len(names) > 6 else "")
    elif style == "gbt7714":
        return ", ".join(n for n in names[:3]) + (" 等" if len(names) > 3 else "")
    elif style == "ama":
        return ", ".join(n for n in names[:6]) + (" et al." if len(names) > 6 else "")
    return ", ".join(names)


def _format_apa7(ref) -> str:
    authors = _authors_str(ref, "apa7")
    return f"{authors} ({ref.year}). {ref.title}. {ref.publication}, {ref.volume}({ref.issue}), {ref.pages}."


def _format_vancouver(ref) -> str:
    authors = _authors_str(ref, "vancouver")
    return f"{authors}. {ref.title}. {ref.publication}. {ref.year};{ref.volume}({ref.issue}):{ref.pages}."


def _format_gbt7714(ref) -> str:
    authors = _authors_str(ref, "gbt7714")
    return f"{authors}. {ref.title}[J]. {ref.publication}, {ref.year}, {ref.volume}({ref.issue}): {ref.pages}."


def _format_ama(ref) -> str:
    authors = _authors_str(ref, "ama")
    return f"{authors}. {ref.title}. {ref.publication}. {ref.year};{ref.volume}({ref.issue}):{ref.pages}."
