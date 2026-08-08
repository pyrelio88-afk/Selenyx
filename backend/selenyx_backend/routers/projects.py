"""Persistent research workspace routes.

Projects and their Kanban tasks are mirrored together because task foreign
keys must never be restored before their parent project.  ``payload_json`` is
the compatibility envelope: queryable columns serve current backend features,
while the complete frontend object survives schema evolution losslessly.
"""

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from selenyx_backend.database import get_session
from selenyx_backend.models import EvidenceItem, KanbanTask, ResearchProject

router = APIRouter()
PIPELINE_ORDER = ["problem", "literature", "fulltext", "screening", "reading", "evidence", "synthesis", "writing"]
PAYLOAD_VERSION = 1


def _text(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _payload(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
    except (TypeError, ValueError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _json_value(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _project_payload(project: ResearchProject) -> dict[str, Any]:
    payload = _payload(project.payload_json)
    payload.update(
        {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "currentStage": project.current_stage,
            "pico": _json_value(project.pico_json, {}),
            "tags": _json_value(project.tags_json, []),
            "sbar": _json_value(project.sbar_json, None),
            "referenceIds": _json_value(project.reference_ids_json, []),
            "status": project.status,
            "startDate": project.start_date,
            "endDate": project.end_date,
            "createdAt": project.created_at,
            "updatedAt": project.updated_at,
        }
    )
    payload.setdefault("taskIds", [])
    return payload


def _task_payload(task: KanbanTask) -> dict[str, Any]:
    payload = _payload(task.payload_json)
    payload.update(
        {
            "id": task.id,
            "projectId": task.project_id,
            "title": task.title,
            "description": task.description,
            "column": task.column,
            "stage": task.stage,
            "assignee": task.assignee,
            "priority": task.priority,
            "dueDate": task.due_date,
            "tags": _json_value(task.tags_json, []),
            "order": task.sort_order,
            "createdAt": task.created_at,
            "updatedAt": task.updated_at,
        }
    )
    return payload


def _apply_project(project: ResearchProject, incoming: dict[str, Any]) -> None:
    now = datetime.now().isoformat()
    project.name = _text(incoming.get("name"))
    project.description = _text(incoming.get("description"))
    project.current_stage = _text(incoming.get("currentStage"), "problem") or "problem"
    project.pico_json = json.dumps(incoming.get("pico") or {}, ensure_ascii=False)
    project.sbar_json = json.dumps(incoming["sbar"], ensure_ascii=False) if incoming.get("sbar") else None
    project.tags_json = json.dumps(_list(incoming.get("tags")), ensure_ascii=False)
    project.reference_ids_json = json.dumps(_list(incoming.get("referenceIds")), ensure_ascii=False)
    project.status = _text(incoming.get("status"), "planning") or "planning"
    project.start_date = incoming.get("startDate") if isinstance(incoming.get("startDate"), str) else None
    project.end_date = incoming.get("endDate") if isinstance(incoming.get("endDate"), str) else None
    project.created_at = _text(incoming.get("createdAt"), project.created_at or now) or now
    project.updated_at = _text(incoming.get("updatedAt"), project.updated_at or now) or now
    normalized = dict(incoming)
    normalized.update({"id": project.id, "createdAt": project.created_at, "updatedAt": project.updated_at})
    project.payload_json = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    project.payload_version = PAYLOAD_VERSION


def _apply_task(task: KanbanTask, incoming: dict[str, Any]) -> None:
    now = datetime.now().isoformat()
    task.project_id = _text(incoming.get("projectId"))
    task.title = _text(incoming.get("title"))
    task.description = _text(incoming.get("description"))
    task.column = _text(incoming.get("column"), "todo") or "todo"
    task.stage = _text(incoming.get("stage"), "problem") or "problem"
    task.assignee = _text(incoming.get("assignee"))
    task.priority = _text(incoming.get("priority"), "medium") or "medium"
    task.due_date = incoming.get("dueDate") if isinstance(incoming.get("dueDate"), str) else None
    task.tags_json = json.dumps(_list(incoming.get("tags")), ensure_ascii=False)
    order = incoming.get("order")
    task.sort_order = order if isinstance(order, int) and not isinstance(order, bool) else 0
    task.created_at = _text(incoming.get("createdAt"), task.created_at or now) or now
    task.updated_at = _text(incoming.get("updatedAt"), task.updated_at or now) or now
    normalized = dict(incoming)
    normalized.update({"id": task.id, "projectId": task.project_id, "createdAt": task.created_at, "updatedAt": task.updated_at})
    task.payload_json = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    task.payload_version = PAYLOAD_VERSION


def _validated_items(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    items = payload.get(key, [])
    if not isinstance(items, list):
        raise HTTPException(422, f"{key} must be an array")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise HTTPException(422, f"Every {key} item must be an object")
        item_id = _text(item.get("id")).strip()
        if not item_id:
            raise HTTPException(422, f"Every {key} item requires a stable id")
        if item_id in seen:
            raise HTTPException(409, f"Duplicate {key} id: {item_id}")
        seen.add(item_id)
        result.append({**item, "id": item_id})
    return result


@router.get("/workspace/snapshot")
def workspace_snapshot(session: Session = Depends(get_session)):
    projects = session.exec(select(ResearchProject).order_by(ResearchProject.updated_at.desc())).all()
    tasks = session.exec(select(KanbanTask).order_by(KanbanTask.updated_at.desc())).all()
    return {
        "projects": [_project_payload(project) for project in projects],
        "tasks": [_task_payload(task) for task in tasks],
        "projectCount": len(projects),
        "taskCount": len(tasks),
        "payloadVersion": PAYLOAD_VERSION,
    }


@router.post("/workspace/bulk-upsert")
def workspace_bulk_upsert(payload: dict, session: Session = Depends(get_session)):
    projects = _validated_items(payload, "projects")
    tasks = _validated_items(payload, "tasks")
    available_project_ids = set(session.exec(select(ResearchProject.id)).all())
    available_project_ids.update(project["id"] for project in projects)
    for task in tasks:
        project_id = _text(task.get("projectId")).strip()
        if not project_id or project_id not in available_project_ids:
            raise HTTPException(409, f"Task {task['id']} references missing project {project_id or '<empty>'}")

    created_projects = created_tasks = 0
    try:
        for incoming in projects:
            project = session.get(ResearchProject, incoming["id"])
            if project is None:
                project = ResearchProject(id=incoming["id"])
                created_projects += 1
            _apply_project(project, incoming)
            session.add(project)

        # Flush parent rows before children without committing half a workspace.
        session.flush()
        for incoming in tasks:
            task = session.get(KanbanTask, incoming["id"])
            if task is None:
                task = KanbanTask(id=incoming["id"], project_id=_text(incoming.get("projectId")))
                created_tasks += 1
            _apply_task(task, incoming)
            session.add(task)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {
        "storedProjects": len(projects),
        "storedTasks": len(tasks),
        "createdProjects": created_projects,
        "updatedProjects": len(projects) - created_projects,
        "createdTasks": created_tasks,
        "updatedTasks": len(tasks) - created_tasks,
    }


@router.get("")
def list_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(ResearchProject).order_by(ResearchProject.updated_at.desc())).all()
    return [_project_payload(project) for project in projects]


@router.get("/{project_id}")
def get_project(project_id: str, session: Session = Depends(get_session)):
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return _project_payload(project)


@router.post("")
def create_project(payload: dict, session: Session = Depends(get_session)):
    requested_id = _text(payload.get("id")).strip()
    if requested_id and session.get(ResearchProject, requested_id):
        raise HTTPException(409, f"Project id already exists: {requested_id}")
    project = ResearchProject(id=requested_id) if requested_id else ResearchProject()
    _apply_project(project, payload)
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_payload(project)


@router.patch("/{project_id}")
def update_project(project_id: str, patch: dict, session: Session = Depends(get_session)):
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    merged = {**_project_payload(project), **patch, "id": project.id, "createdAt": project.created_at}
    merged["updatedAt"] = datetime.now().isoformat()
    _apply_project(project, merged)
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_payload(project)




@router.delete("/{project_id}")
def delete_project(project_id: str, session: Session = Depends(get_session)):
    """Hard-delete a project and its local child rows (tasks + evidence)."""
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    tasks = session.exec(select(KanbanTask).where(KanbanTask.project_id == project_id)).all()
    for task in tasks:
        session.delete(task)

    evidence_items = session.exec(select(EvidenceItem).where(EvidenceItem.project_id == project_id)).all()
    for item in evidence_items:
        session.delete(item)

    session.delete(project)
    session.commit()
    return {
        "deleted": project_id,
        "deletedTasks": len(tasks),
        "deletedEvidence": len(evidence_items),
    }

@router.post("/{project_id}/advance")
def advance_stage(project_id: str, session: Session = Depends(get_session)):
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        index = PIPELINE_ORDER.index(project.current_stage)
    except ValueError:
        raise HTTPException(409, f"Unknown pipeline stage: {project.current_stage}") from None
    if index < len(PIPELINE_ORDER) - 1:
        project.current_stage = PIPELINE_ORDER[index + 1]
        project.updated_at = datetime.now().isoformat()
        session.add(project)
        session.commit()
        session.refresh(project)
    return _project_payload(project)
