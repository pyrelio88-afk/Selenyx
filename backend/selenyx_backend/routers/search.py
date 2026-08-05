"""
检索路由 — 语义检索 (extractive) + 学术 API 检索
借鉴 HydraLab: extractive retrieval with locators
"""

from fastapi import APIRouter
import httpx

router = APIRouter()


@router.post("/semantic")
async def semantic_search(query: str, project_id: str | None = None):
    """
    语义检索 — 从本地索引返回带页码/字符偏移的原文引用
    (extractive retrieval, 不编造引用)
    """
    # TODO: 实现本地嵌入索引检索
    return {"results": [], "query": query, "project_id": project_id}


@router.post("/scholarly")
async def scholarly_search(query: str, sources: list[str]):
    """学术 API 检索 — OpenAlex / Crossref / arXiv"""
    results = []
    async with httpx.AsyncClient() as client:
        if "openalex" in sources:
            resp = await client.get(
                "https://api.openalex.org/works",
                params={"search": query, "per_page": 25},
                headers={"User-Agent": "Selenyx/2.0"},
            )
            if resp.status_code == 200:
                for work in resp.json().get("results", []):
                    results.append({
                        "title": work.get("title", ""),
                        "doi": work.get("doi", ""),
                        "year": str(work.get("publication_year", "")),
                        "publication": work.get("host_venue", {}).get("display_name", ""),
                        "source": "openalex",
                    })
        if "crossref" in sources:
            resp = await client.get(
                "https://api.crossref.org/works",
                params={"query": query, "rows": 25},
                headers={"User-Agent": "Selenyx/2.0"},
            )
            if resp.status_code == 200:
                for work in resp.json().get("message", {}).get("items", []):
                    results.append({
                        "title": work.get("title", [""])[0] if work.get("title") else "",
                        "doi": work.get("DOI", ""),
                        "year": str(work.get("published-print", work.get("published-online", {}).get("date-parts", [[""]])[0][0], "")),
                        "publication": work.get("container-title", [""])[0] if work.get("container-title") else "",
                        "source": "crossref",
                    })
        if "arxiv" in sources:
            resp = await client.get(
                "http://export.arxiv.org/api/query",
                params={"search_query": f"all:{query}", "max_results": 25},
            )
            # TODO: 解析 Atom XML
    return {"results": results, "count": len(results), "sources": sources}
