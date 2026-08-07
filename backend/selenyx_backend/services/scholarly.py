"""Multi-source scholarly connectors with honest empty/rate-limit handling."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote

import httpx

from selenyx_backend.services.rate_limit import await_host
from selenyx_backend.settings import Settings, get_settings

USER_AGENT = "Selenyx/0.01 (local research workbench; mailto:selenyx@research.local)"
_ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}
_YEAR_RE = re.compile(r"(16|17|18|19|20|21)\d{2}")


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _year_from(value: Any) -> str:
    match = _YEAR_RE.search(_text(value))
    return match.group(0) if match else ""


async def _get_json(client: httpx.AsyncClient, url: str, *, params: dict[str, Any] | None = None) -> tuple[int, Any]:
    await await_host(url)
    resp = await client.get(url, params=params, headers={"User-Agent": USER_AGENT})
    if resp.status_code != 200:
        return resp.status_code, None
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, None


async def search_openalex(client: httpx.AsyncClient, query: str, *, per_page: int = 25, settings: Settings | None = None) -> tuple[list[dict], dict]:
    settings = settings or get_settings()
    mailto = settings.openalex_mailto or "selenyx@research.local"
    params: dict[str, Any] = {"search": query, "per_page": per_page, "mailto": mailto}
    if settings.openalex_api_key.strip():
        params["api_key"] = settings.openalex_api_key.strip()
    status, data = await _get_json(client, "https://api.openalex.org/works", params=params)
    meta = {"source": "openalex", "status": status}
    if status == 429:
        meta["error"] = "rate_limited"
        return [], meta
    if not isinstance(data, dict):
        meta["error"] = "upstream_error"
        return [], meta
    results: list[dict] = []
    for work in data.get("results") or []:
        if not isinstance(work, dict):
            continue
        doi = _text(work.get("doi")).removeprefix("https://doi.org/")
        authors = []
        for authorship in work.get("authorships") or []:
            author = authorship.get("author") if isinstance(authorship, dict) else None
            name = _text((author or {}).get("display_name"))
            if name:
                parts = name.split()
                authors.append({"firstName": " ".join(parts[:-1]), "lastName": parts[-1] if parts else name, "type": "author"})
        host = work.get("primary_location") or work.get("host_venue") or {}
        source = host.get("source") if isinstance(host, dict) else {}
        publication = _text((source or {}).get("display_name") if isinstance(source, dict) else "") or _text(
            host.get("display_name") if isinstance(host, dict) else ""
        )
        results.append(
            {
                "title": _text(work.get("title")) or _text(work.get("display_name")),
                "doi": doi,
                "year": str(work.get("publication_year") or ""),
                "publication": publication,
                "abstract": "",  # OpenAlex inverted abstract omitted for honesty/size
                "url": _text(work.get("id")),
                "openAccess": bool((work.get("open_access") or {}).get("is_oa")) if isinstance(work.get("open_access"), dict) else False,
                "source": "openalex",
                "openalexId": _text(work.get("id")),
                "creators": authors,
                "pmid": "",
                "arxivId": "",
            }
        )
    meta["count"] = len(results)
    return results, meta


async def search_crossref(client: httpx.AsyncClient, query: str, *, rows: int = 25) -> tuple[list[dict], dict]:
    status, data = await _get_json(
        client,
        "https://api.crossref.org/works",
        params={"query": query, "rows": rows},
    )
    meta = {"source": "crossref", "status": status}
    if status == 429:
        meta["error"] = "rate_limited"
        return [], meta
    if not isinstance(data, dict):
        meta["error"] = "upstream_error"
        return [], meta
    message = data.get("message") or {}
    results: list[dict] = []
    for work in message.get("items") or []:
        if not isinstance(work, dict):
            continue
        title_list = work.get("title") or []
        title = title_list[0] if isinstance(title_list, list) and title_list else ""
        container = work.get("container-title") or []
        publication = container[0] if isinstance(container, list) and container else ""
        year = ""
        for key in ("published-print", "published-online", "created"):
            parts = ((work.get(key) or {}).get("date-parts") or [[None]])[0]
            if parts and parts[0]:
                year = str(parts[0])
                break
        creators = []
        for author in work.get("author") or []:
            if isinstance(author, dict):
                creators.append(
                    {
                        "firstName": _text(author.get("given")),
                        "lastName": _text(author.get("family")),
                        "type": "author",
                    }
                )
        results.append(
            {
                "title": _text(title),
                "doi": _text(work.get("DOI")),
                "year": year,
                "publication": _text(publication),
                "abstract": re.sub(r"<[^>]+>", "", _text(work.get("abstract"))),
                "url": _text(work.get("URL")),
                "volume": _text(str(work.get("volume") or "")),
                "issue": _text(str(work.get("issue") or "")),
                "pages": _text(work.get("page")),
                "openAccess": False,
                "source": "crossref",
                "creators": creators,
                "pmid": "",
                "arxivId": "",
            }
        )
    meta["count"] = len(results)
    return results, meta


async def search_arxiv(client: httpx.AsyncClient, query: str, *, max_results: int = 25) -> tuple[list[dict], dict]:
    await await_host("http://export.arxiv.org/api/query")
    resp = await client.get(
        "http://export.arxiv.org/api/query",
        params={"search_query": f"all:{query}", "start": 0, "max_results": max_results},
        headers={"User-Agent": USER_AGENT},
    )
    meta = {"source": "arxiv", "status": resp.status_code}
    if resp.status_code != 200:
        meta["error"] = "upstream_error"
        return [], meta
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        meta["error"] = "parse_error"
        return [], meta
    results: list[dict] = []
    for entry in root.findall("a:entry", _ATOM_NS):
        title = _text(entry.findtext("a:title", default="", namespaces=_ATOM_NS)).replace("\n", " ")
        summary = _text(entry.findtext("a:summary", default="", namespaces=_ATOM_NS)).replace("\n", " ")
        published = _text(entry.findtext("a:published", default="", namespaces=_ATOM_NS))
        entry_id = _text(entry.findtext("a:id", default="", namespaces=_ATOM_NS))
        arxiv_id = entry_id.rsplit("/abs/", 1)[-1] if "/abs/" in entry_id else entry_id
        creators = []
        for author in entry.findall("a:author", _ATOM_NS):
            name = _text(author.findtext("a:name", default="", namespaces=_ATOM_NS))
            if not name:
                continue
            parts = name.split()
            creators.append({"firstName": " ".join(parts[:-1]), "lastName": parts[-1] if parts else name, "type": "author"})
        results.append(
            {
                "title": title,
                "doi": "",
                "year": _year_from(published),
                "publication": "arXiv",
                "abstract": summary,
                "url": entry_id,
                "openAccess": True,
                "source": "arxiv",
                "creators": creators,
                "pmid": "",
                "arxivId": arxiv_id,
            }
        )
    meta["count"] = len(results)
    return results, meta


async def search_pubmed(client: httpx.AsyncClient, query: str, *, retmax: int = 25) -> tuple[list[dict], dict]:
    status, esearch = await _get_json(
        client,
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        params={"db": "pubmed", "term": query, "retmax": retmax, "retmode": "json"},
    )
    meta = {"source": "pubmed", "status": status}
    if status == 429:
        meta["error"] = "rate_limited"
        return [], meta
    if not isinstance(esearch, dict):
        meta["error"] = "upstream_error"
        return [], meta
    idlist = ((esearch.get("esearchresult") or {}).get("idlist")) or []
    if not idlist:
        meta["count"] = 0
        return [], meta
    status2, summary = await _get_json(
        client,
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
        params={"db": "pubmed", "id": ",".join(idlist), "retmode": "json"},
    )
    meta["status"] = status2
    if not isinstance(summary, dict):
        meta["error"] = "upstream_error"
        return [], meta
    result = summary.get("result") or {}
    out: list[dict] = []
    for pmid in idlist:
        item = result.get(pmid)
        if not isinstance(item, dict):
            continue
        creators = []
        for author in item.get("authors") or []:
            if isinstance(author, dict) and author.get("name"):
                name = _text(author.get("name"))
                creators.append({"firstName": "", "lastName": name, "type": "author"})
        article_ids = item.get("articleids") or []
        doi = ""
        for aid in article_ids:
            if isinstance(aid, dict) and aid.get("idtype") == "doi":
                doi = _text(aid.get("value"))
        out.append(
            {
                "title": _text(item.get("title")),
                "doi": doi,
                "year": _year_from(item.get("pubdate")),
                "publication": _text(item.get("fulljournalname") or item.get("source")),
                "abstract": "",
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "openAccess": False,
                "source": "pubmed",
                "creators": creators,
                "pmid": str(pmid),
                "arxivId": "",
            }
        )
    meta["count"] = len(out)
    return out, meta


async def related_by_pmid(client: httpx.AsyncClient, pmid: str, *, retmax: int = 15) -> tuple[list[dict], dict]:
    status, data = await _get_json(
        client,
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi",
        params={
            "dbfrom": "pubmed",
            "db": "pubmed",
            "id": pmid,
            "cmd": "neighbor_score",
            "retmode": "json",
        },
    )
    meta = {"source": "pubmed-elink", "status": status, "pmid": pmid}
    if status != 200 or not isinstance(data, dict):
        meta["error"] = "upstream_error" if status != 429 else "rate_limited"
        return [], meta
    linksets = data.get("linksets") or []
    ids: list[str] = []
    for ls in linksets:
        for ldb in (ls or {}).get("linksetdbs") or []:
            for link in (ldb or {}).get("links") or []:
                if isinstance(link, dict) and link.get("id"):
                    ids.append(str(link["id"]))
                elif isinstance(link, (int, str)):
                    ids.append(str(link))
    ids = [i for i in ids if i != str(pmid)][:retmax]
    if not ids:
        meta["count"] = 0
        return [], meta
    # reuse pubmed summary
    status2, summary = await _get_json(
        client,
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
        params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"},
    )
    meta["status"] = status2
    result = (summary or {}).get("result") if isinstance(summary, dict) else {}
    out: list[dict] = []
    for rid in ids:
        item = (result or {}).get(rid)
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "title": _text(item.get("title")),
                "doi": "",
                "year": _year_from(item.get("pubdate")),
                "publication": _text(item.get("fulljournalname") or item.get("source")),
                "abstract": "",
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{rid}/",
                "openAccess": False,
                "source": "pubmed-related",
                "creators": [],
                "pmid": str(rid),
                "arxivId": "",
            }
        )
    meta["count"] = len(out)
    return out, meta


async def lookup_doi(client: httpx.AsyncClient, doi: str) -> tuple[dict | None, dict]:
    doi = doi.strip().removeprefix("https://doi.org/")
    status, data = await _get_json(client, f"https://api.crossref.org/works/{quote(doi, safe='')}")
    meta = {"source": "crossref-doi", "status": status, "doi": doi}
    if status == 404:
        return None, {**meta, "found": False}
    if status != 200 or not isinstance(data, dict):
        return None, {**meta, "found": False, "error": "upstream_error"}
    work = data.get("message") or {}
    title_list = work.get("title") or []
    container = work.get("container-title") or []
    year = ""
    for key in ("published-print", "published-online", "created"):
        parts = ((work.get(key) or {}).get("date-parts") or [[None]])[0]
        if parts and parts[0]:
            year = str(parts[0])
            break
    creators = [
        {"firstName": _text(a.get("given")), "lastName": _text(a.get("family")), "type": "author"}
        for a in (work.get("author") or [])
        if isinstance(a, dict)
    ]
    return {
        "title": title_list[0] if title_list else "",
        "creators": creators,
        "publication": container[0] if container else "",
        "year": year,
        "doi": doi,
        "volume": str(work.get("volume") or ""),
        "issue": str(work.get("issue") or ""),
        "pages": _text(work.get("page")),
        "issn": (work.get("ISSN") or [""])[0] if work.get("ISSN") else "",
        "url": _text(work.get("URL")),
        "abstract": re.sub(r"<[^>]+>", "", _text(work.get("abstract"))),
        "found": True,
    }, {**meta, "found": True}


async def multi_search(query: str, sources: list[str], settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    wanted = [s.lower() for s in sources] or ["openalex", "crossref", "pubmed", "arxiv"]
    results: list[dict] = []
    diagnostics: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        if "openalex" in wanted:
            items, meta = await search_openalex(client, query, settings=settings)
            results.extend(items)
            diagnostics.append(meta)
        if "crossref" in wanted:
            items, meta = await search_crossref(client, query)
            results.extend(items)
            diagnostics.append(meta)
        if "pubmed" in wanted:
            items, meta = await search_pubmed(client, query)
            results.extend(items)
            diagnostics.append(meta)
        if "arxiv" in wanted:
            items, meta = await search_arxiv(client, query)
            results.extend(items)
            diagnostics.append(meta)

    # Dedup by DOI then normalized title
    seen: set[str] = set()
    unique: list[dict] = []
    for item in results:
        key = (item.get("doi") or "").lower() or re.sub(r"[^a-z0-9]+", "", (item.get("title") or "").lower())[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return {
        "results": unique,
        "count": len(unique),
        "sources": wanted,
        "diagnostics": diagnostics,
        "query": query,
    }
