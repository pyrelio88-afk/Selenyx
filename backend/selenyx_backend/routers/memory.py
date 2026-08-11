"""记忆管理（V4 模块 F）：全局 + 项目记忆的查看/编辑/清空/导出。

记忆永不外发——本路由只读写本机文件；注入 prompt 的通路与本管理通路
互不交叉（导出 = 把本机文件内容返回给本机前端，由用户自己保存）。
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import ResearchProject
from selenyx_backend.services import memory as memory_svc

router = APIRouter()

_MAX_CONTENT = 20000


class MemoryBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    content: str = Field(default="", max_length=_MAX_CONTENT)


@router.get("")
def get_global_memory():
    return {"scope": "global", "content": memory_svc.read_memory(None, _MAX_CONTENT)}


@router.put("")
def put_global_memory(body: MemoryBody):
    memory_svc.write_memory(body.content)
    return {"scope": "global", "saved": True}


@router.delete("")
def clear_global_memory():
    memory_svc.clear_memory(None)
    return {"scope": "global", "cleared": True}


@router.get("/projects")
def list_project_memories():
    """项目记忆列表：有记忆文件的项目 + 预览。"""
    with Session(get_engine()) as session:
        projects = {p.id: p.name for p in session.exec(select(ResearchProject)).all()}
    entries = []
    for project_id, name in projects.items():
        content = memory_svc.read_memory(project_id, 200)
        if content:
            entries.append({"projectId": project_id, "projectName": name, "preview": content})
    return {"memories": entries}


@router.get("/projects/{project_id}")
def get_project_memory(project_id: str):
    return {"scope": "project", "projectId": project_id, "content": memory_svc.read_memory(project_id, _MAX_CONTENT)}


@router.put("/projects/{project_id}")
def put_project_memory(project_id: str, body: MemoryBody):
    memory_svc.write_memory(body.content, project_id)
    return {"scope": "project", "projectId": project_id, "saved": True}


@router.delete("/projects/{project_id}")
def clear_project_memory(project_id: str):
    memory_svc.clear_memory(project_id)
    return {"scope": "project", "projectId": project_id, "cleared": True}
