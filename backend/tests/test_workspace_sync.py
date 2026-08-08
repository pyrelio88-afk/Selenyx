"""Lossless local project/task workspace mirroring."""

import httpx
import pytest
from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app
from selenyx_backend.models import KanbanTask, ResearchProject


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    init_db()


@pytest.mark.asyncio
async def test_workspace_payload_round_trip_and_stable_upsert(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    project = {
        "id": "project-local-1",
        "name": "Lossless evidence review",
        "description": "Offline-first project",
        "currentStage": "evidence",
        "frameworkId": "prisma",
        "pico": {"population": "nurses", "intervention": "SBAR", "comparison": "usual", "outcome": "quality"},
        "tags": ["nursing", "RAG"],
        "referenceIds": ["ref-local-1"],
        "taskIds": ["task-local-1"],
        "status": "active",
        "startDate": "2026-08-07",
        "endDate": None,
        "createdAt": "2026-08-07T01:00:00Z",
        "updatedAt": "2026-08-07T02:00:00Z",
        "futureProjectField": {"must": "survive"},
    }
    task = {
        "id": "task-local-1",
        "projectId": project["id"],
        "title": "Review accepted evidence",
        "description": "Use only original excerpts",
        "column": "doing",
        "stage": "evidence",
        "assignee": "local-user",
        "priority": "high",
        "dueDate": "2026-08-10",
        "tags": ["review"],
        "order": 3,
        "createdAt": "2026-08-07T01:30:00Z",
        "updatedAt": "2026-08-07T02:30:00Z",
        "futureTaskField": ["must", "survive"],
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        stored = await client.post(
            "/api/projects/workspace/bulk-upsert",
            json={"projects": [project], "tasks": [task]},
        )
        assert stored.status_code == 200
        assert stored.json()["createdProjects"] == 1
        assert stored.json()["createdTasks"] == 1

        updated_project = {**project, "description": "New description", "updatedAt": "2026-08-07T03:00:00Z"}
        updated = await client.post(
            "/api/projects/workspace/bulk-upsert",
            json={"projects": [updated_project], "tasks": [task]},
        )
        assert updated.status_code == 200
        assert updated.json()["createdProjects"] == 0
        assert updated.json()["updatedProjects"] == 1

        snapshot = await client.get("/api/projects/workspace/snapshot")
        assert snapshot.status_code == 200
        payload = snapshot.json()
        assert payload["projectCount"] == 1
        assert payload["taskCount"] == 1
        restored_project = payload["projects"][0]
        restored_task = payload["tasks"][0]
        assert restored_project["id"] == project["id"]
        assert restored_project["frameworkId"] == "prisma"
        assert restored_project["futureProjectField"] == {"must": "survive"}
        assert restored_project["description"] == "New description"
        assert restored_task["id"] == task["id"]
        assert restored_task["projectId"] == project["id"]
        assert restored_task["futureTaskField"] == ["must", "survive"]


@pytest.mark.asyncio
async def test_workspace_rejects_dangling_task_without_partial_write(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        rejected = await client.post(
            "/api/projects/workspace/bulk-upsert",
            json={
                "projects": [{"id": "would-have-been-created", "name": "Uncommitted"}],
                "tasks": [{"id": "dangling", "projectId": "missing", "title": "Do not store"}],
            },
        )
        assert rejected.status_code == 409
        snapshot = await client.get("/api/projects/workspace/snapshot")
        assert snapshot.json()["projectCount"] == 0
        assert snapshot.json()["taskCount"] == 0


@pytest.mark.asyncio
async def test_workspace_rolls_back_parent_flush_when_task_write_fails(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    import selenyx_backend.routers.projects as projects_router

    original_apply_task = projects_router._apply_task

    def fail_second_phase(task, incoming):
        raise RuntimeError("injected task write failure")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    monkeypatch.setattr(projects_router, "_apply_task", fail_second_phase)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/projects/workspace/bulk-upsert",
            json={
                "projects": [{"id": "must-rollback", "name": "Not durable"}],
                "tasks": [{"id": "task-fail", "projectId": "must-rollback", "title": "Fail"}],
            },
        )
        assert response.status_code == 500

    monkeypatch.setattr(projects_router, "_apply_task", original_apply_task)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        snapshot = (await client.get("/api/projects/workspace/snapshot")).json()
        assert snapshot["projectCount"] == 0
        assert snapshot["taskCount"] == 0


def test_payload_column_migration_keeps_legacy_project_and_task(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    engine = get_engine()
    with Session(engine) as session:
        session.add(ResearchProject(id="legacy-project", name="Keep me"))
        session.add(KanbanTask(id="legacy-task", project_id="legacy-project", title="Keep task"))
        session.commit()

    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE projects DROP COLUMN payload_json")
        connection.exec_driver_sql("ALTER TABLE projects DROP COLUMN payload_version")
        connection.exec_driver_sql("ALTER TABLE tasks DROP COLUMN payload_json")
        connection.exec_driver_sql("ALTER TABLE tasks DROP COLUMN payload_version")

    get_engine.cache_clear()
    init_db()
    migrated_engine = get_engine()
    with migrated_engine.connect() as connection:
        project_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('projects')")}
        task_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info('tasks')")}
        project_name = connection.exec_driver_sql(
            "SELECT name FROM projects WHERE id = 'legacy-project'"
        ).scalar_one()
        task_title = connection.exec_driver_sql(
            "SELECT title FROM tasks WHERE id = 'legacy-task'"
        ).scalar_one()
    assert {"payload_json", "payload_version"}.issubset(project_columns)
    assert {"payload_json", "payload_version"}.issubset(task_columns)
    assert project_name == "Keep me"
    assert task_title == "Keep task"
