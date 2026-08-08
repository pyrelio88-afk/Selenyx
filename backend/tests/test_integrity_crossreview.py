"""Adversarial integrity tests for the local mirror and evidence chain."""

import json

import httpx
import pytest
from sqlmodel import Session, select

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app
from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services import rag


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    init_db()


@pytest.mark.asyncio
async def test_project_scoped_rag_never_widens_empty_or_missing_project_to_whole_library(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        reference = (await client.post(
            "/api/references",
            json={"id": "ref-global", "title": "Private global item", "abstract": "unique sentinel zebracactus"},
        )).json()
        assert reference["id"] == "ref-global"
        assert (await client.post("/api/projects", json={"id": "empty-project", "name": "Empty"})).status_code == 200

        whole_library = await client.post("/api/search/semantic", json={"query": "zebracactus"})
        empty_project = await client.post(
            "/api/search/semantic", json={"query": "zebracactus", "projectId": "empty-project"}
        )
        missing_project = await client.post(
            "/api/search/semantic", json={"query": "zebracactus", "projectId": "missing-project"}
        )
        assert whole_library.json()["count"] == 1
        assert empty_project.json()["count"] == 0
        assert missing_project.json()["count"] == 0


@pytest.mark.asyncio
async def test_embedding_failure_preserves_last_known_good_chunks(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    engine = get_engine()
    with Session(engine) as session:
        reference = Reference(id="ref-index", title="Old searchable text")
        session.add(reference)
        session.commit()
        await rag.index_reference_text(
            session, reference_id=reference.id, text="old searchable sentinel", source="metadata"
        )

    async def fail_embeddings(*args, **kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(rag, "embed_texts", fail_embeddings)
    with Session(engine) as session:
        with pytest.raises(RuntimeError, match="model unavailable"):
            await rag.index_reference_text(
                session, reference_id="ref-index", text="replacement text", source="metadata"
            )

    with Session(engine) as session:
        chunks = session.exec(select(DocumentChunk).where(DocumentChunk.reference_id == "ref-index")).all()
        assert [chunk.text for chunk in chunks] == ["old searchable sentinel"]


@pytest.mark.asyncio
async def test_evidence_rejects_dangling_project_reference_and_chunk(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        missing_project = await client.post(
            "/api/evidence", json={"projectId": "missing", "excerpt": "verbatim"}
        )
        assert missing_project.status_code == 409

        assert (await client.post("/api/projects", json={"id": "project-1", "name": "P"})).status_code == 200
        missing_reference = await client.post(
            "/api/evidence",
            json={"projectId": "project-1", "referenceId": "missing", "excerpt": "verbatim"},
        )
        assert missing_reference.status_code == 409

        reference = (await client.post(
            "/api/references", json={"id": "reference-1", "title": "Indexed", "abstract": "chunk text"}
        )).json()
        wrong_chunk = await client.post(
            "/api/evidence",
            json={
                "projectId": "project-1",
                "referenceId": reference["id"],
                "chunkId": "missing-chunk",
                "excerpt": "verbatim",
            },
        )
        assert wrong_chunk.status_code == 409
        assert (await client.get("/api/evidence")).json() == []


@pytest.mark.asyncio
async def test_reference_delete_cleans_project_link_chunks_and_evidence(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert (await client.post(
            "/api/references", json={"id": "ref-delete", "title": "Delete", "abstract": "indexed sentinel"}
        )).status_code == 200
        assert (await client.post(
            "/api/projects", json={"id": "project-delete", "name": "P", "referenceIds": ["ref-delete"]}
        )).status_code == 200
        assert (await client.post(
            "/api/evidence",
            json={"projectId": "project-delete", "referenceId": "ref-delete", "excerpt": "indexed sentinel"},
        )).status_code == 200

        assert (await client.delete("/api/references/ref-delete")).status_code == 200
        project = (await client.get("/api/projects/project-delete")).json()
        assert project["referenceIds"] == []
        assert (await client.get("/api/evidence?projectId=project-delete")).json() == []
        assert (await client.post("/api/search/semantic", json={"query": "sentinel"})).json()["count"] == 0


@pytest.mark.asyncio
async def test_deduplicate_retargets_relations_to_surviving_reference(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        for ref_id in ("keeper", "duplicate"):
            assert (await client.post(
                "/api/references",
                json={
                    "id": ref_id,
                    "title": ref_id,
                    "abstract": f"indexed {ref_id}",
                    "doi": "10.1000/same",
                    "year": "2026",
                },
            )).status_code == 200
        assert (await client.post(
            "/api/projects", json={"id": "project-dedupe", "name": "P", "referenceIds": ["duplicate"]}
        )).status_code == 200
        duplicate_hit = (await client.post(
            "/api/search/semantic", json={"query": "indexed duplicate", "projectId": "project-dedupe"}
        )).json()["results"][0]
        assert (await client.post(
            "/api/evidence",
            json={
                "projectId": "project-dedupe",
                "referenceId": "duplicate",
                "chunkId": duplicate_hit["chunkId"],
                "excerpt": "keep relation",
            },
        )).status_code == 200

        merged = await client.post("/api/references/deduplicate")
        assert merged.json()["merged"] == 1
        snapshot = (await client.get("/api/references/snapshot")).json()
        surviving_id = snapshot["references"][0]["id"]
        project = (await client.get("/api/projects/project-dedupe")).json()
        evidence = (await client.get("/api/evidence?projectId=project-dedupe")).json()
        assert project["referenceIds"] == [surviving_id]
        assert evidence[0]["reference_id"] == surviving_id
        assert evidence[0]["chunk_id"] is None


@pytest.mark.asyncio
async def test_legacy_reference_snapshot_reconstructs_indexed_fields(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        session.add(Reference(
            id="legacy-reference",
            cite_key="Legacy2020",
            title="Legacy",
            creators_json=json.dumps([{"firstName": "Mei", "lastName": "Chen", "type": "author"}]),
            tags_json=json.dumps(["legacy"]),
            collections_json=json.dumps(["archive"]),
            read_status="reading",
            pipeline_stage="evidence",
            payload_json="{}",
        ))
        session.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        restored = (await client.get("/api/references/snapshot")).json()["references"][0]
        assert restored["citeKey"] == "Legacy2020"
        assert restored["creators"][0]["lastName"] == "Chen"
        assert restored["tags"] == ["legacy"]
        assert restored["collections"] == ["archive"]
        assert restored["readStatus"] == "reading"
        assert restored["pipelineStage"] == "evidence"
