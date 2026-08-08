"""Project hard-delete removes child tasks and evidence."""

import httpx
import pytest

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    init_db()


@pytest.mark.asyncio
async def test_delete_project_removes_tasks_and_evidence(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    project = {
        "id": "project-delete-1",
        "name": "To delete",
        "description": "",
        "currentStage": "problem",
        "tags": [],
        "referenceIds": [],
        "taskIds": ["task-delete-1"],
        "status": "planning",
        "startDate": None,
        "endDate": None,
        "createdAt": "2026-08-08T00:00:00Z",
        "updatedAt": "2026-08-08T00:00:00Z",
    }
    task = {
        "id": "task-delete-1",
        "projectId": project["id"],
        "title": "orphan candidate",
        "description": "",
        "column": "todo",
        "stage": "problem",
        "assignee": "",
        "priority": "medium",
        "dueDate": None,
        "tags": [],
        "order": 0,
        "createdAt": "2026-08-08T00:00:00Z",
        "updatedAt": "2026-08-08T00:00:00Z",
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        stored = await client.post(
            "/api/projects/workspace/bulk-upsert",
            json={"projects": [project], "tasks": [task]},
        )
        assert stored.status_code == 200

        evidence = await client.post(
            "/api/evidence",
            json={
                "projectId": project["id"],
                "referenceId": "",
                "claim": "c",
                "excerpt": "original excerpt for delete cascade",
                "relation": "supports",
                "confidence": "medium",
            },
        )
        assert evidence.status_code in (200, 201), evidence.text
        evidence_id = evidence.json()["id"]

        claim = await client.post(
            "/api/evidence/claims",
            json={
                "projectId": project["id"],
                "text": "A claim that belongs only to this project",
                "evidenceIds": [evidence_id],
            },
        )
        assert claim.status_code in (200, 201), claim.text

        contradiction = await client.post(
            "/api/evidence/contradictions",
            json={
                "projectId": project["id"],
                "title": "A scoped conflict",
                "claimId": claim.json()["id"],
                "evidenceIds": [evidence_id],
            },
        )
        assert contradiction.status_code in (200, 201), contradiction.text

        artifact = await client.post(
            "/api/evidence/stage-artifacts",
            json={
                "projectId": project["id"],
                "stage": "problem",
                "title": "Scoped stage artifact",
                "content": {"question": "kept only with the project"},
            },
        )
        assert artifact.status_code in (200, 201), artifact.text

        deleted = await client.delete(f"/api/projects/{project['id']}")
        assert deleted.status_code == 200, deleted.text
        body = deleted.json()
        assert body["deleted"] == project["id"]
        assert body["deletedTasks"] >= 1
        assert body["deletedEvidence"] >= 1
        assert body["deletedClaims"] >= 1
        assert body["deletedContradictions"] >= 1
        assert body["deletedArtifacts"] >= 1

        snapshot = await client.get("/api/projects/workspace/snapshot")
        assert snapshot.status_code == 200
        data = snapshot.json()
        assert all(item["id"] != project["id"] for item in data["projects"])
        assert all(item.get("projectId") != project["id"] for item in data["tasks"])

        missing = await client.get(f"/api/projects/{project['id']}")
        assert missing.status_code == 404
        assert (await client.get(f"/api/evidence/claims?projectId={project['id']}")).json() == []
        assert (await client.get(f"/api/evidence/contradictions?projectId={project['id']}")).json() == []
        assert (await client.get(f"/api/evidence/stage-artifacts?projectId={project['id']}")).json() == []
