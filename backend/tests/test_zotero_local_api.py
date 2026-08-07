import httpx
import pytest

import selenyx_backend.routers.zotero as zotero_router
from selenyx_backend.main import app


@pytest.mark.asyncio
async def test_zotero_client_does_not_inherit_proxy_environment():
    async with zotero_router._new_zotero_client(timeout=3.0) as client:
        assert client._trust_env is False
        assert client.follow_redirects is False


@pytest.mark.asyncio
async def test_reads_explicit_zotero_import_candidates_from_loopback(monkeypatch):
    requests: list[httpx.Request] = []

    def zotero(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        headers = {"Zotero-API-Version": "3"}
        if request.url.path == "/api/":
            return httpx.Response(200, headers=headers, json={})
        if request.url.path == "/api/users/0/items/top":
            return httpx.Response(
                200,
                headers=headers,
                json=[
                    {
                        "key": "ABCD1234",
                        "data": {
                            "itemType": "journalArticle",
                            "title": "Local Zotero evidence",
                            "creators": [
                                {"creatorType": "author", "firstName": "Ada", "lastName": "Lovelace"},
                                {"creatorType": "editor", "name": "Research Group"},
                            ],
                            "publicationTitle": "Evidence Journal",
                            "date": "2025-09-01",
                            "DOI": "10.1000/example",
                            "url": "https://example.test/article",
                            "tags": [{"tag": "methods"}],
                            "collections": ["COLLECTION1"],
                        },
                    },
                    {"key": "ATTACHMENT", "data": {"itemType": "attachment", "title": "skip me"}},
                ],
            )
        raise AssertionError(f"Unexpected Zotero request: {request.url}")

    monkeypatch.setattr(
        zotero_router,
        "_new_zotero_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(zotero), timeout=timeout),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        status = await client.get("/api/zotero/status")
        imported = await client.get("/api/zotero/items?limit=20")

    assert status.status_code == 200
    assert status.json() == {"available": True, "apiVersion": "3"}
    assert imported.status_code == 200
    assert imported.json() == {
        "apiVersion": "3",
        "items": [
            {
                "key": "ABCD1234",
                "type": "journalArticle",
                "title": "Local Zotero evidence",
                "creators": [
                    {"firstName": "Ada", "lastName": "Lovelace", "type": "author"},
                    {"firstName": "", "lastName": "Research Group", "type": "editor"},
                ],
                "publication": "Evidence Journal",
                "year": "2025",
                "date": "2025-09-01",
                "doi": "10.1000/example",
                "url": "https://example.test/article",
                "volume": "",
                "issue": "",
                "pages": "",
                "abstract": "",
                "publisher": "",
                "place": "",
                "isbn": "",
                "issn": "",
                "language": "",
                "rights": "",
                "collections": ["COLLECTION1"],
                "tags": ["methods"],
            },
        ],
        "skipped": 1,
    }
    assert [request.url.host for request in requests] == ["127.0.0.1", "127.0.0.1"]
    assert all(request.headers["Zotero-API-Version"] == "3" for request in requests)


@pytest.mark.asyncio
async def test_reports_when_zotero_local_api_is_disabled(monkeypatch):
    monkeypatch.setattr(
        zotero_router,
        "_new_zotero_client",
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: httpx.Response(403)), timeout=timeout
        ),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/zotero/items")

    assert response.status_code == 403
    assert "Local API is disabled" in response.json()["detail"]
