"""Backend tests: health, CRUD, hybrid RAG, evidence gate."""

import httpx
import pytest

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


@pytest.mark.asyncio
async def test_health_and_persistent_reference_crud(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        health = await client.get("/api/health")
        assert health.status_code == 200
        body = health.json()
        assert body["storage"] == "local-sqlite"
        assert "rag" in body

        created = await client.post(
            "/api/references",
            json={
                "title": "Local evidence for hybrid retrieval",
                "year": "2026",
                "doi": "10.1000/local",
                "abstract": "This paper studies semantic retrieval of nursing handover SBAR training outcomes.",
            },
        )
        assert created.status_code == 200
        reference = created.json()
        assert reference["cite_key"] == "Selenyx-0001"

        updated = await client.patch(
            f"/api/references/{reference['id']}",
            json={"read_status": "reading"},
        )
        assert updated.status_code == 200
        assert updated.json()["read_status"] == "reading"

        semantic = await client.post(
            "/api/search/semantic",
            json={"query": "SBAR nursing handover training", "topK": 5},
        )
        assert semantic.status_code == 200
        payload = semantic.json()
        assert payload["count"] >= 1
        hit = payload["results"][0]
        assert hit["referenceId"] == reference["id"]
        assert hit["excerpt"]
        assert "charOffset" in hit

        evidence = await client.post(
            "/api/evidence",
            json={
                "projectId": "proj-demo",
                "referenceId": reference["id"],
                "excerpt": hit["excerpt"][:200],
                "claim": "SBAR training improves handover quality",
                "relation": "supports",
                "confidence": "high",
            },
        )
        assert evidence.status_code == 200
        item = evidence.json()
        accepted = await client.patch(f"/api/evidence/{item['id']}", json={"review": "accepted"})
        assert accepted.status_code == 200
        outline = await client.get("/api/evidence/writing-outline/proj-demo")
        assert outline.status_code == 200
        assert outline.json()["acceptedCount"] == 1
        assert not any("【需证据】尚无已接受" in b for b in outline.json()["bullets"])

        deleted = await client.delete(f"/api/references/{reference['id']}")
        assert deleted.status_code == 200

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        listed = await client.get("/api/references")
        assert listed.status_code == 200
        assert listed.json() == []


@pytest.mark.asyncio
async def test_doi_unknown_is_honest(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async def fake_lookup(client, doi):
        return None, {"found": False, "status": 404, "doi": doi}

    monkeypatch.setattr(
        "selenyx_backend.services.scholarly.lookup_doi",
        fake_lookup,
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/api/references/lookup/doi/10.0000/does-not-exist")
        assert resp.status_code == 404
