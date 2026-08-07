"""检索路由 — 语义 RAG + 学术 API 检索 + 相关文献"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
import httpx

from selenyx_backend.database import get_session
from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services import rag as rag_service
from selenyx_backend.services import scholarly
from selenyx_backend.settings import get_settings

router = APIRouter()


class SemanticBody(BaseModel):
    query: str = Field(min_length=1)
    projectId: str | None = None
    topK: int = Field(default=8, ge=1, le=50)


class ScholarlyBody(BaseModel):
    query: str = Field(min_length=1)
    sources: list[str] = Field(default_factory=lambda: ["openalex", "crossref", "pubmed", "arxiv"])


class IndexBody(BaseModel):
    referenceId: str
    text: str = Field(min_length=1)
    source: str = "paste"
    page: int | None = None
    section: str | None = None


class RelatedBody(BaseModel):
    pmid: str | None = None
    doi: str | None = None


@router.post("/semantic")
async def semantic_search(body: SemanticBody, session: Session = Depends(get_session)):
    """语义检索 — 从本地索引返回带页码/字符偏移的原文引用（不编造）。"""
    hits = await rag_service.semantic_search(
        session,
        body.query,
        project_id=body.projectId,
        top_k=body.topK,
        settings=get_settings(),
    )
    return {
        "results": [
            {
                "referenceId": h.reference_id,
                "chunkId": h.chunk_id,
                "title": h.title,
                "page": h.page,
                "section": h.section,
                "charOffset": {"start": h.char_start, "end": h.char_end},
                "excerpt": h.excerpt,
                "score": h.score,
                "source": h.source,
            }
            for h in hits
        ],
        "query": body.query,
        "projectId": body.projectId,
        "count": len(hits),
    }


@router.post("/scholarly")
async def scholarly_search(body: ScholarlyBody):
    """学术 API 检索 — OpenAlex / Crossref / PubMed / arXiv（含限流与诚实空结果）。"""
    return await scholarly.multi_search(body.query, body.sources, settings=get_settings())


@router.post("/index")
async def index_text(body: IndexBody, session: Session = Depends(get_session)):
    ref = session.get(Reference, body.referenceId)
    if not ref:
        raise HTTPException(404, "Reference not found")
    count = await rag_service.index_reference_text(
        session,
        reference_id=body.referenceId,
        text=body.text,
        source=body.source,
        page=body.page,
        section=body.section,
        settings=get_settings(),
    )
    return {"indexed": count, "referenceId": body.referenceId}


@router.post("/reindex")
async def reindex_library(session: Session = Depends(get_session)):
    """Re-index all local references (title+abstract)."""
    refs = list(session.exec(select(Reference)).all())
    total = 0
    for ref in refs:
        total += await rag_service.index_reference_record(session, ref, settings=get_settings())
    chunk_count = len(list(session.exec(select(DocumentChunk)).all()))
    return {"references": len(refs), "chunksWritten": total, "chunksTotal": chunk_count}


@router.post("/related")
async def related_papers(body: RelatedBody):
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        if body.pmid:
            items, meta = await scholarly.related_by_pmid(client, body.pmid.strip())
            return {"results": items, "count": len(items), "diagnostics": meta}
        if body.doi:
            work, meta = await scholarly.lookup_doi(client, body.doi.strip())
            if not work:
                return {"results": [], "count": 0, "diagnostics": meta, "found": False}
            # DOI path: return the work itself; related graph via OpenAlex is best-effort later
            return {"results": [work], "count": 1, "diagnostics": meta, "found": True}
    raise HTTPException(400, "Provide pmid or doi")
