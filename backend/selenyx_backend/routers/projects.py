"""项目路由"""

from fastapi import APIRouter, HTTPException
from selenyx_backend.models import ResearchProject
from datetime import datetime

router = APIRouter()
_projects: list[ResearchProject] = []

PIPELINE_ORDER = ['problem', 'literature', 'fulltext', 'screening', 'reading', 'evidence', 'synthesis', 'writing']


@router.get("")
async def list_projects():
    return _projects


@router.get("/{pid}")
async def get_project(pid: str):
    for p in _projects:
        if p.id == pid:
            return p
    raise HTTPException(404, "项目不存在")


@router.post("")
async def create_project(p: dict):
    proj = ResearchProject(**{k: v for k, v in p.items() if k in ResearchProject.model_fields})
    _projects.append(proj)
    return proj


@router.patch("/{pid}")
async def update_project(pid: str, patch: dict):
    for p in _projects:
        if p.id == pid:
            for k, v in patch.items():
                if k in ResearchProject.model_fields and k != "id":
                    setattr(p, k, v)
            p.updated_at = datetime.now().isoformat()
            return p
    raise HTTPException(404, "项目不存在")


@router.post("/{pid}/advance")
async def advance_stage(pid: str):
    """推进流水线阶段"""
    for p in _projects:
        if p.id == pid:
            idx = PIPELINE_ORDER.index(p.current_stage)
            if idx < len(PIPELINE_ORDER) - 1:
                p.current_stage = PIPELINE_ORDER[idx + 1]
                p.updated_at = datetime.now().isoformat()
            return p
    raise HTTPException(404, "项目不存在")
