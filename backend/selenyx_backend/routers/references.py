"""
文献管理路由 — CRUD / 搜索 / 去重 / 导入导出 / DOI/PMID 检索
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import json
import httpx

from selenyx_backend.models import Reference

router = APIRouter()

# 内存存储（后续替换为 SQLite）
_refs: list[Reference] = []
_ref_counter = 0


def _next_cite_key() -> str:
    global _ref_counter
    _ref_counter += 1
    return f"Selenyx-{_ref_counter:04d}"


@router.get("")
async def list_references(
    q: Optional[str] = None,
    collection: Optional[str] = None,
    tag: Optional[str] = None,
    stage: Optional[str] = None,
):
    """列出/搜索文献"""
    result = _refs
    if q:
        ql = q.lower()
        result = [r for r in result if ql in r.title.lower() or ql in r.doi.lower() or ql in r.publication.lower()]
    if stage:
        result = [r for r in result if r.pipeline_stage == stage]
    return result


@router.get("/{ref_id}")
async def get_reference(ref_id: str):
    for r in _refs:
        if r.id == ref_id:
            return r
    raise HTTPException(404, "文献不存在")


@router.post("")
async def create_reference(ref: dict):
    """新建文献"""
    r = Reference(**{k: v for k, v in ref.items() if k in Reference.model_fields})
    r.cite_key = _next_cite_key()
    _refs.append(r)
    return r


@router.patch("/{ref_id}")
async def update_reference(ref_id: str, patch: dict):
    for i, r in enumerate(_refs):
        if r.id == ref_id:
            for k, v in patch.items():
                if k in Reference.model_fields and k != "id":
                    setattr(r, k, v)
            from datetime import datetime
            r.updated_at = datetime.now().isoformat()
            return r
    raise HTTPException(404, "文献不存在")


@router.delete("/{ref_id}")
async def delete_reference(ref_id: str):
    global _refs
    _refs = [r for r in _refs if r.id != ref_id]
    return {"deleted": ref_id}


@router.post("/import")
async def import_references(format: str, data: str):
    """导入 BibTeX/RIS/CSV"""
    # TODO: 解析对应格式
    return {"imported": 0, "format": format}


@router.post("/export")
async def export_references(ids: list[str], format: str):
    """导出 BibTeX/RIS/CSV/JSON"""
    # TODO: 生成对应格式
    return {"data": "", "format": format, "count": len(ids)}


@router.post("/deduplicate")
async def deduplicate_references():
    """三策略去重: DOI / PMID / 标题+年份"""
    seen_doi: dict[str, str] = {}
    seen_pmid: dict[str, str] = {}
    seen_title_year: dict[str, str] = {}
    merged = 0

    for r in _refs:
        if r.doi and r.doi in seen_doi:
            merged += 1
        elif r.pmid and r.pmid in seen_pmid:
            merged += 1
        else:
            normalized = "".join(c for c in r.title.lower() if c.isalnum())
            key = f"{normalized}_{r.year}"
            if key in seen_title_year:
                merged += 1
            else:
                if r.doi:
                    seen_doi[r.doi] = r.id
                if r.pmid:
                    seen_pmid[r.pmid] = r.id
                seen_title_year[key] = r.id

    return {"merged": merged, "remaining": len(_refs) - merged}


@router.get("/lookup/doi/{doi}")
async def lookup_doi(doi: str):
    """通过 DOI 从 Crossref 检索文献元数据"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.crossref.org/works/{doi}", headers={"User-Agent": "Selenyx/2.0"})
        if resp.status_code != 200:
            raise HTTPException(404, f"Crossref 未找到 DOI: {doi}")
        work = resp.json()["message"]
        return {
            "title": work.get("title", [""])[0],
            "creators": [{"firstName": a.get("given", ""), "lastName": a.get("family", ""), "type": "author"} for a in work.get("author", [])],
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
async def lookup_pmid(pmid: str):
    """通过 PMID 从 PubMed 检索"""
    # TODO: 使用 NCBI E-utilities
    raise HTTPException(501, "PubMed 检索待实现")
