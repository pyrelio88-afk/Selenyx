"""Explicit, read-only access to a locally running Zotero desktop client.

Zotero exposes a local Web API when the user enables it in Zotero's advanced
preferences.  Selenyx deliberately talks to that API through the loopback
sidecar instead of reading Zotero's SQLite database, which Zotero documents as
fragile.  No request is made until a user explicitly asks to import items.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

_ZOTERO_BASE_URL = "http://127.0.0.1:23119/api"
_ZOTERO_HEADERS = {"Zotero-API-Version": "3"}
_YEAR_PATTERN = re.compile(r"(?:16|17|18|19|20|21)\d{2}")
_MAX_TEXT_LENGTH = 16_384
_MAX_SHORT_TEXT_LENGTH = 2_048
_MAX_LIST_ENTRIES = 100

_ITEM_TYPES = {
    "journalArticle": "journalArticle",
    "book": "book",
    "bookSection": "bookSection",
    "conferencePaper": "conferencePaper",
    "thesis": "thesis",
    "report": "report",
    "webpage": "webpage",
    "preprint": "preprint",
    "dataset": "dataset",
    "computerProgram": "software",
    "software": "software",
    "patent": "patent",
    "standard": "standard",
    "magazineArticle": "magazineArticle",
    "newspaperArticle": "newspaperArticle",
    "bookReview": "bookReview",
    "dictionaryEntry": "dictionaryEntry",
    "encyclopediaArticle": "encyclopediaArticle",
    "chapter": "chapter",
    "presentation": "presentation",
    "hearing": "hearing",
    "bill": "bill",
    "statute": "statute",
    "case": "case",
    "film": "film",
    "tvBroadcast": "tvBroadcast",
    "radioBroadcast": "radioBroadcast",
    "podcast": "podcast",
    "interview": "interview",
    "letter": "letter",
    "map": "map",
    "blogPost": "blogPost",
}
_CREATOR_TYPES = {"author", "editor", "translator", "contributor", "director", "producer"}


def _new_zotero_client(timeout: float) -> httpx.AsyncClient:
    # Do not inherit HTTP(S)_PROXY/NO_PROXY.  A user-level proxy is not a
    # trusted route for a local, private Zotero library request.
    return httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False)


def _text(value: Any, *, limit: int = _MAX_SHORT_TEXT_LENGTH) -> str:
    return value[:limit] if isinstance(value, str) else ""


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [entry[:_MAX_SHORT_TEXT_LENGTH] for entry in value[:_MAX_LIST_ENTRIES] if isinstance(entry, str) and entry.strip()]


def _year(value: Any) -> str:
    match = _YEAR_PATTERN.search(_text(value))
    return match.group(0) if match else ""


def _creators(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    creators: list[dict[str, str]] = []
    for creator in value:
        if not isinstance(creator, dict):
            continue
        display_name = _text(creator.get("name"), limit=512)
        first_name = _text(creator.get("firstName"), limit=512)
        last_name = _text(creator.get("lastName"), limit=512) or display_name
        if not first_name and not last_name:
            continue
        creator_type = _text(creator.get("creatorType"))
        creators.append(
            {
                "firstName": first_name,
                "lastName": last_name,
                "type": creator_type if creator_type in _CREATOR_TYPES else "author",
            }
        )
    return creators


def _tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    tags: list[str] = []
    for tag in value[:_MAX_LIST_ENTRIES]:
        if isinstance(tag, dict):
            name = _text(tag.get("tag"), limit=512).strip()
            if name:
                tags.append(name)
    return tags


def _to_candidate(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    data = item.get("data")
    if not isinstance(data, dict):
        return None
    item_type = _text(data.get("itemType"))
    if item_type in {"attachment", "note", "annotation"}:
        return None
    key = _text(item.get("key"), limit=128) or _text(data.get("key"), limit=128)
    return {
        "key": key,
        "type": _ITEM_TYPES.get(item_type, "journalArticle"),
        "title": _text(data.get("title"), limit=_MAX_SHORT_TEXT_LENGTH).strip() or "[Untitled Zotero item]",
        "creators": _creators(data.get("creators")),
        "publication": _text(data.get("publicationTitle")) or _text(data.get("proceedingsTitle")),
        "year": _year(data.get("date")),
        "date": _text(data.get("date")),
        "doi": _text(data.get("DOI")),
        "url": _text(data.get("url")),
        "volume": _text(data.get("volume")),
        "issue": _text(data.get("issue")),
        "pages": _text(data.get("pages")),
        "abstract": _text(data.get("abstractNote"), limit=_MAX_TEXT_LENGTH),
        "publisher": _text(data.get("publisher")),
        "place": _text(data.get("place")),
        "isbn": _text(data.get("ISBN")),
        "issn": _text(data.get("ISSN")),
        "language": _text(data.get("language")),
        "rights": _text(data.get("rights")),
        "collections": _string_list(data.get("collections")),
        "tags": _tags(data.get("tags")),
    }


async def _get_local(path: str, *, params: dict[str, str] | None = None) -> httpx.Response:
    try:
        async with _new_zotero_client(timeout=3.0) as client:
            return await client.get(f"{_ZOTERO_BASE_URL}{path}", params=params, headers=_ZOTERO_HEADERS)
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=503,
            detail="Zotero desktop is not reachable on this device. Start Zotero and enable its Local API first.",
        ) from error


def _require_zotero_response(response: httpx.Response) -> str:
    if response.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail="Zotero Local API is disabled. In Zotero, enable ‘Allow other applications on this computer to communicate with Zotero’.",
        )
    version = response.headers.get("Zotero-API-Version", "").strip()
    if response.status_code != 200 or not version:
        raise HTTPException(status_code=502, detail="The local Zotero endpoint did not return a valid Zotero API response.")
    return version


@router.get("/status")
async def local_zotero_status():
    """Check the user-enabled local API without reading their library."""

    response = await _get_local("/")
    return {"available": True, "apiVersion": _require_zotero_response(response)}


@router.get("/items")
async def local_zotero_items(limit: int = Query(default=250, ge=1, le=500)):
    """Read top-level Zotero items for an explicit one-way Selenyx import."""

    response = await _get_local(
        "/users/0/items/top",
        params={"format": "json", "include": "data", "limit": str(limit)},
    )
    version = _require_zotero_response(response)
    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Zotero returned invalid JSON.") from error
    if not isinstance(payload, list):
        raise HTTPException(status_code=502, detail="Zotero returned an unexpected item payload.")

    candidates = [candidate for item in payload if (candidate := _to_candidate(item)) is not None]
    return {"apiVersion": version, "items": candidates, "skipped": len(payload) - len(candidates)}
