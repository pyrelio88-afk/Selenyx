import httpx
import pytest

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app
from selenyx_backend.settings import get_settings


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    get_settings.cache_clear()
    init_db()


@pytest.mark.asyncio
async def test_health_and_persistent_reference_crud(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        health = await client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["storage"] == "local-sqlite"

        created = await client.post(
            "/api/references",
            json={"title": "Local evidence", "year": "2026", "doi": "10.1000/local"},
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

    # Re-opening a client keeps the record because it was committed to SQLite.
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        listed = await client.get("/api/references")
        assert listed.status_code == 200
        assert [item["title"] for item in listed.json()] == ["Local evidence"]
