"""Backend tests: health, CRUD, hybrid RAG, evidence gate."""

import json

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


def test_init_db_adds_provenance_columns_without_rebuilding_a_legacy_library(tmp_path, monkeypatch):
    """The additive migration preserves the old accepted-review decision."""
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    engine = get_engine()
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE document_chunks ("
            "id TEXT PRIMARY KEY, reference_id TEXT, source TEXT, page INTEGER, section TEXT, "
            "char_start INTEGER, char_end INTEGER, text TEXT, embedding_json TEXT, "
            "embedding_backend TEXT, created_at TEXT)"
        )
        connection.exec_driver_sql(
            "CREATE TABLE evidence_items ("
            "id TEXT PRIMARY KEY, project_id TEXT, reference_id TEXT, claim TEXT, excerpt TEXT, "
            "relation TEXT, review TEXT, confidence TEXT, page INTEGER, chunk_id TEXT, notes TEXT, "
            "created_at TEXT, updated_at TEXT)"
        )
        connection.exec_driver_sql(
            "INSERT INTO evidence_items VALUES "
            "('legacy-evidence', 'legacy-project', 'legacy-reference', '', 'verbatim', "
            "'supports', 'accepted', 'high', NULL, NULL, '', 'now', 'now')"
        )
    init_db()
    with engine.connect() as connection:
        chunk_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('document_chunks')")}
        evidence_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('evidence_items')")}
        migrated_status = connection.exec_driver_sql(
            "SELECT status FROM evidence_items WHERE id = 'legacy-evidence'"
        ).scalar_one()
    assert {"bbox_json", "heading_path_json", "parser_version"}.issubset(chunk_columns)
    assert {"status", "anchor_id"}.issubset(evidence_columns)
    assert migrated_status == "accepted"


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

        project = await client.post(
            "/api/projects",
            json={"id": "proj-demo", "name": "Evidence project", "referenceIds": [reference["id"]]},
        )
        assert project.status_code == 200

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


@pytest.mark.asyncio
async def test_reference_payload_round_trip_and_bulk_upsert(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    reference = {
        "id": "local-ref-001",
        "citeKey": "Zhang2026Local",
        "type": "journalArticle",
        "title": "Lossless local reference mirror",
        "shortTitle": "Lossless mirror",
        "abstract": "A reference payload used to validate SQLite and RAG integration.",
        "creators": [
            {"id": "creator-1", "firstName": "Wei", "lastName": "Zhang", "type": "author", "order": 0}
        ],
        "collections": ["review"],
        "tags": ["RAG", "local-first"],
        "annotations": [
            {
                "id": "annotation-1",
                "page": 2,
                "type": "highlight",
                "rect": [0.1, 0.2, 0.5, 0.3],
                "text": "verbatim evidence",
                "note": "retain this",
                "color": "#ffff00",
                "createdAt": "2026-08-07T01:00:00Z",
            }
        ],
        "attachments": [
            {"id": "file-1", "filename": "paper.pdf", "mimeType": "application/pdf", "path": "local", "size": 42}
        ],
        "year": "2026",
        "doi": "10.1000/lossless",
        "notes": "full note",
        "readStatus": "reading",
        "pipelineStage": "reading",
        "createdAt": "2026-08-07T01:00:00Z",
        "updatedAt": "2026-08-07T02:00:00Z",
        "source": "import",
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        stored = await client.post("/api/references/bulk-upsert", json={"references": [reference]})
        assert stored.status_code == 200
        assert stored.json()["stored"] == 1
        assert stored.json()["created"] == 1

        # Same local id is an update, never a second backend identity.
        changed = {**reference, "notes": "updated note", "updatedAt": "2026-08-07T03:00:00Z"}
        updated = await client.post("/api/references/bulk-upsert", json={"references": [changed]})
        assert updated.status_code == 200
        assert updated.json()["created"] == 0
        assert updated.json()["updated"] == 1

        snapshot = await client.get("/api/references/snapshot")
        assert snapshot.status_code == 200
        payload = snapshot.json()
        assert payload["count"] == 1
        restored = payload["references"][0]
        assert restored["id"] == reference["id"]
        assert restored["citeKey"] == reference["citeKey"]
        assert restored["annotations"] == reference["annotations"]
        assert restored["attachments"] == reference["attachments"]
        assert restored["creators"] == reference["creators"]
        assert restored["notes"] == "updated note"
        assert restored["updatedAt"] == "2026-08-07T03:00:00Z"


@pytest.mark.asyncio
async def test_reference_exchange_json_is_lossless_and_idempotent(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    source = {
        "id": "exchange-json-001",
        "citeKey": "Chen2026Evidence",
        "type": "journalArticle",
        "title": "Evidence exchange without field loss",
        "abstract": "Local-only import and export round trip.",
        "creators": [{"id": "c1", "firstName": "Mei", "lastName": "Chen", "type": "author", "order": 0}],
        "tags": ["evidence", "本地优先"],
        "annotations": [{"id": "a1", "text": "verbatim", "page": 4, "color": "#ffd400"}],
        "attachments": [{"id": "f1", "filename": "source.pdf", "path": "library/source.pdf"}],
        "customFutureField": {"nested": [1, "two"]},
        "year": "2026",
        "doi": "10.1000/exchange",
        "updatedAt": "2026-08-07T05:00:00Z",
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        stored = await client.post("/api/references/bulk-upsert", json={"references": [source]})
        assert stored.status_code == 200

        exported = await client.post(
            "/api/references/export",
            json={"ids": [source["id"], "not-present"], "format": "json"},
        )
        assert exported.status_code == 200
        export_body = exported.json()
        assert export_body["count"] == 1
        assert export_body["missing"] == ["not-present"]
        assert export_body["mimeType"] == "application/json"
        document = export_body["data"]
        decoded = json.loads(document)
        exported_ref = decoded["references"][0]
        assert exported_ref["id"] == source["id"]
        assert exported_ref["annotations"] == source["annotations"]
        assert exported_ref["attachments"] == source["attachments"]
        assert exported_ref["customFutureField"] == source["customFutureField"]
        assert "payload_json" not in exported_ref
        assert "creators_json" not in exported_ref

        deleted = await client.delete(f"/api/references/{source['id']}")
        assert deleted.status_code == 200

        first_import = await client.post(
            "/api/references/import",
            json={"format": "json", "data": document},
        )
        assert first_import.status_code == 200
        assert first_import.json()["created"] == 1
        assert first_import.json()["updated"] == 0

        second_import = await client.post(
            "/api/references/import",
            json={"format": "json", "data": document},
        )
        assert second_import.status_code == 200
        assert second_import.json()["created"] == 0
        assert second_import.json()["updated"] == 1

        snapshot = await client.get("/api/references/snapshot")
        assert snapshot.json()["count"] == 1
        restored = snapshot.json()["references"][0]
        assert restored["annotations"] == source["annotations"]
        assert restored["attachments"] == source["attachments"]
        assert restored["customFutureField"] == source["customFutureField"]


@pytest.mark.asyncio
async def test_reference_exchange_bibtex_and_ris_are_real_and_repeatable(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    source = {
        "id": "exchange-portable-001",
        "citeKey": "Wang2025RAG",
        "type": "journalArticle",
        "title": "Multilingual RAG for evidence synthesis",
        "abstract": "A portable metadata record.",
        "creators": [
            {"id": "c1", "firstName": "Li", "lastName": "Wang", "type": "author", "order": 0},
            {"id": "c2", "firstName": "Ana", "lastName": "García", "type": "editor", "order": 1},
        ],
        "publication": "Journal of Local Research",
        "volume": "12",
        "issue": "3",
        "pages": "10–19",
        "year": "2025",
        "doi": "10.1000/rag-portable",
        "url": "https://example.test/paper",
        "tags": ["RAG", "证据"],
        "notes": "Reviewed locally",
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert (await client.post("/api/references", json=source)).status_code == 200

        for format_name, marker in (("bibtex", "@article"), ("ris", "TY  - JOUR")):
            exported = await client.post(
                "/api/references/export",
                json={"ids": [source["id"]], "format": format_name},
            )
            assert exported.status_code == 200
            exchange = exported.json()["data"]
            assert marker in exchange
            assert source["title"] in exchange
            assert source["id"] in exchange

            imported = await client.post(
                "/api/references/import",
                json={"format": format_name, "data": exchange},
            )
            assert imported.status_code == 200
            assert imported.json()["created"] == 0
            assert imported.json()["updated"] == 1

        snapshot = await client.get("/api/references/snapshot")
        assert snapshot.json()["count"] == 1
        restored = snapshot.json()["references"][0]
        assert restored["id"] == source["id"]
        assert restored["title"] == source["title"]
        assert restored["doi"] == source["doi"]
        assert restored["creators"][0]["lastName"] == "Wang"


@pytest.mark.asyncio
async def test_reference_exchange_rejects_bad_documents_without_partial_writes(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        malformed = await client.post(
            "/api/references/import",
            json={"format": "json", "data": '[{"id":"valid"}, 42]'},
        )
        assert malformed.status_code == 422

        unsupported = await client.post(
            "/api/references/export",
            json={"ids": [], "format": "csv"},
        )
        assert unsupported.status_code == 422

        snapshot = await client.get("/api/references/snapshot")
        assert snapshot.status_code == 200
        assert snapshot.json()["count"] == 0


@pytest.mark.asyncio
async def test_external_bibtex_without_selenyx_id_is_still_idempotent(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    document = """@article{StableKey2024,
      title = {A stable external import},
      author = {Doe, Jane and Zhang, Wei},
      year = {2024},
      journal = {Reproducible Research},
      doi = {10.1000/stable-import}
    }"""

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/references/import", json={"format": "bib", "data": document})
        second = await client.post("/api/references/import", json={"format": "bibtex", "data": document})
        assert first.status_code == 200
        assert first.json()["created"] == 1
        assert second.status_code == 200
        assert second.json()["created"] == 0
        assert second.json()["updated"] == 1

        snapshot = await client.get("/api/references/snapshot")
        assert snapshot.json()["count"] == 1
        restored = snapshot.json()["references"][0]
        assert restored["id"].startswith("import-bibtex-")
        assert restored["citeKey"] == "StableKey2024"
        assert [creator["lastName"] for creator in restored["creators"]] == ["Doe", "Zhang"]


@pytest.mark.asyncio
async def test_external_json_without_id_gets_a_repeatable_local_identity(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    document = json.dumps([{"title": "Stable JSON import", "year": "2023", "doi": "10.1000/json-stable"}])

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/references/import", json={"format": "json", "data": document})
        second = await client.post("/api/references/import", json={"format": "json", "data": document})
        assert first.status_code == second.status_code == 200
        assert first.json()["created"] == 1
        assert second.json()["created"] == 0
        snapshot = (await client.get("/api/references/snapshot")).json()
        assert snapshot["count"] == 1
        assert snapshot["references"][0]["id"].startswith("import-json-")


@pytest.mark.asyncio
async def test_evidence_provenance_status_and_domain_contracts(tmp_path, monkeypatch):
    """Provenance and new domain records are persisted, constrained, and usable."""
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        project = await client.post("/api/projects", json={"id": "domain-project", "name": "Domain contracts"})
        assert project.status_code == 200
        reference = await client.post(
            "/api/references",
            json={"id": "domain-reference", "title": "Traceable local evidence", "abstract": "A source with a real locator."},
        )
        assert reference.status_code == 200

        indexed = await client.post(
            "/api/search/index",
            json={"referenceId": "domain-reference", "text": "Methods: We enrolled 24 participants and measured the primary outcome."},
        )
        assert indexed.status_code == 200
        semantic = await client.post("/api/search/semantic", json={"query": "participants outcome", "topK": 1})
        assert semantic.status_code == 200
        chunk_id = semantic.json()["results"][0]["chunkId"]

        anchor = await client.post(
            "/api/evidence/provenance-anchors",
            json={
                "referenceId": "domain-reference",
                "chunkId": chunk_id,
                "page": 4,
                "bbox": [12.5, 40, 320, 92],
                "charStart": 0,
                "charEnd": 67,
                "headingPath": ["Methods", "Participants"],
                "parserVersion": "docling-2.1",
                "sourceUri": "attachment://domain-reference/source.pdf",
                "contentHash": "sha256:source-hash",
            },
        )
        assert anchor.status_code == 200
        locator = anchor.json()
        assert locator["bbox"] == [12.5, 40.0, 320.0, 92.0]
        assert locator["headingPath"] == ["Methods", "Participants"]

        evidence = await client.post(
            "/api/evidence",
            json={
                "projectId": "domain-project",
                "referenceId": "domain-reference",
                "chunkId": chunk_id,
                "anchorId": locator["id"],
                "excerpt": "We enrolled 24 participants.",
                "claim": "The pilot enrolled 24 participants.",
                "status": "retrieved",
            },
        )
        assert evidence.status_code == 200
        evidence_item = evidence.json()
        assert evidence_item["status"] == "retrieved"
        assert evidence_item["review"] == "pending"
        assert evidence_item["page"] == 4
        accepted = await client.patch(f"/api/evidence/{evidence_item['id']}", json={"status": "accepted"})
        assert accepted.status_code == 200
        assert accepted.json()["review"] == "accepted"
        conflict = await client.patch(
            f"/api/evidence/{evidence_item['id']}",
            json={"status": "unresolved", "review": "accepted"},
        )
        assert conflict.status_code == 422

        claim = await client.post(
            "/api/evidence/claims",
            json={
                "projectId": "domain-project",
                "text": "The intervention remains feasible for a pilot.",
                "claimType": "finding",
                "evidenceIds": [evidence_item["id"]],
            },
        )
        assert claim.status_code == 200
        assert claim.json()["evidenceIds"] == [evidence_item["id"]]

        contradiction = await client.post(
            "/api/evidence/contradictions",
            json={
                "projectId": "domain-project",
                "claimId": claim.json()["id"],
                "title": "Small sample limits generalisability",
                "evidenceIds": [evidence_item["id"]],
            },
        )
        assert contradiction.status_code == 200
        resolved = await client.patch(
            f"/api/evidence/contradictions/{contradiction.json()['id']}",
            json={"status": "resolved", "resolution": "Record the limitation in the discussion."},
        )
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "resolved"

        first_artifact = await client.post(
            "/api/evidence/stage-artifacts",
            json={
                "projectId": "domain-project",
                "stage": "design",
                "title": "Pilot protocol",
                "artifactType": "protocol",
                "content": {"sampleSize": 24, "outcome": "handover quality"},
                "qualityGate": "Supervisor review required",
            },
        )
        second_artifact = await client.post(
            "/api/evidence/stage-artifacts",
            json={
                "projectId": "domain-project",
                "stage": "design",
                "title": "Pilot protocol",
                "artifactType": "protocol",
                "content": {"sampleSize": 28, "outcome": "handover quality"},
                "qualityGate": "Supervisor review required",
            },
        )
        assert first_artifact.status_code == second_artifact.status_code == 200
        assert first_artifact.json()["version"] == 1
        assert second_artifact.json()["version"] == 2
        assert first_artifact.json()["contentHash"] != second_artifact.json()["contentHash"]
        approved = await client.patch(
            f"/api/evidence/stage-artifacts/{second_artifact.json()['id']}",
            json={"status": "approved"},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"

        summary = await client.get("/api/evidence/summary?projectId=domain-project")
        assert summary.status_code == 200
        assert summary.json()["accepted"] == 1


@pytest.mark.asyncio
async def test_reference_delete_repairs_provenance_claim_and_contradiction_graph(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert (await client.post("/api/projects", json={"id": "cleanup-project", "name": "Cleanup"})).status_code == 200
        for reference_id, title in (("source-to-delete", "Discarded source"), ("source-to-keep", "Retained source")):
            created = await client.post(
                "/api/references",
                json={"id": reference_id, "title": title, "abstract": f"Evidence from {title}."},
            )
            assert created.status_code == 200
        indexed = await client.post(
            "/api/search/index",
            json={"referenceId": "source-to-delete", "text": "A precisely located source statement."},
        )
        assert indexed.status_code == 200
        hit = (await client.post("/api/search/semantic", json={"query": "precisely located", "topK": 1})).json()["results"][0]
        anchor = await client.post(
            "/api/evidence/provenance-anchors",
            json={"referenceId": "source-to-delete", "chunkId": hit["chunkId"], "page": 2, "bbox": [1, 2, 3, 4]},
        )
        assert anchor.status_code == 200
        first = await client.post(
            "/api/evidence",
            json={
                "projectId": "cleanup-project", "referenceId": "source-to-delete", "chunkId": hit["chunkId"],
                "anchorId": anchor.json()["id"], "excerpt": "A precisely located source statement.", "status": "accepted",
            },
        )
        second = await client.post(
            "/api/evidence",
            json={
                "projectId": "cleanup-project", "referenceId": "source-to-keep", "excerpt": "A retained source statement.", "status": "accepted",
            },
        )
        assert first.status_code == second.status_code == 200
        first_id, second_id = first.json()["id"], second.json()["id"]
        claim = await client.post(
            "/api/evidence/claims",
            json={
                "projectId": "cleanup-project", "text": "A claim with two sources.", "status": "active",
                "evidenceIds": [first_id, second_id],
            },
        )
        assert claim.status_code == 200
        case = await client.post(
            "/api/evidence/contradictions",
            json={
                "projectId": "cleanup-project", "claimId": claim.json()["id"], "title": "A documented disagreement",
                "status": "resolved", "resolution": "Original resolution", "evidenceIds": [first_id, second_id],
            },
        )
        assert case.status_code == 200

        deleted = await client.delete("/api/references/source-to-delete")
        assert deleted.status_code == 200
        remaining_evidence = (await client.get("/api/evidence?projectId=cleanup-project")).json()
        assert [item["id"] for item in remaining_evidence] == [second_id]
        assert (await client.get("/api/evidence/provenance-anchors?referenceId=source-to-delete")).json() == []
        repaired_claim = (await client.get("/api/evidence/claims?projectId=cleanup-project")).json()[0]
        assert repaired_claim["evidenceIds"] == [second_id]
        assert repaired_claim["status"] == "draft"
        repaired_case = (await client.get("/api/evidence/contradictions?projectId=cleanup-project")).json()[0]
        assert repaired_case["evidenceIds"] == [second_id]
        assert repaired_case["status"] == "open"
        assert "linked source was removed" in repaired_case["resolution"]
