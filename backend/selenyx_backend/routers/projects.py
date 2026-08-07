"""Persistent research project routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from selenyx_backend.database import get_session
from selenyx_backend.models import ResearchProject

router = APIRouter()
PIPELINE_ORDER = ["problem", "literature", "fulltext", "screening", "reading", "evidence", "synthesis", "writing"]


@router.get("")
def list_projects(session: Session = Depends(get_session)):
    return session.exec(select(ResearchProject).order_by(ResearchProject.updated_at.desc())).all()


@router.get("/{project_id}")
def get_project(project_id: str, session: Session = Depends(get_session)):
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.post("")
def create_project(payload: dict, session: Session = Depends(get_session)):
    fields = {key: value for key, value in payload.items() if key in ResearchProject.model_fields and key != "id"}
    project = ResearchProject(**fields)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.patch("/{project_id}")
def update_project(project_id: str, patch: dict, session: Session = Depends(get_session)):
    project = session.get(ResearchProject, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    for key, value in patch.items():
        if key in ResearchProject.model_fields and key not in {"id", "created_at"}:
            setattr(project, key, value)
    project.updated_at = datetime.now().isoformat()
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


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
    return project
