"""技能管理（V4 模块 F）：SKILL.md 包的列出/新建/更新/启停/删除。

两级存储：用户级 ~/.selenyx/skills/，项目级 ~/.selenyx/projects/{id}/skills/；
请求带 projectId 即操作项目级（读取时项目级同名遮蔽用户级）。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from selenyx_backend.services import skills as skills_svc

router = APIRouter()


class SkillBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=200)
    instructions: str = Field(min_length=1, max_length=6000)
    allowed_tools: list[str] = Field(default_factory=list, alias="allowedTools", max_length=20)
    enabled: bool = True
    project_id: str | None = Field(default=None, alias="projectId")


@router.get("")
def list_skills(project_id: str | None = Query(default=None, alias="projectId")):
    return {"skills": skills_svc.list_skills(project_id)}


@router.post("", status_code=201)
def create_skill(body: SkillBody):
    skill = skills_svc.save_skill(
        body.name,
        body.instructions,
        body.description,
        body.allowed_tools,
        body.enabled,
        body.project_id,
    )
    if skill.get("error"):
        raise HTTPException(422, skill["error"])
    return skill


@router.put("/{name}")
def update_skill(name: str, body: SkillBody):
    existing = skills_svc.get_skill(name, body.project_id)
    if not existing:
        raise HTTPException(404, "技能不存在。")
    skill = skills_svc.save_skill(
        body.name,
        body.instructions,
        body.description,
        body.allowed_tools,
        body.enabled,
        body.project_id if existing.get("scope") == "project" else None,
    )
    if skill.get("error"):
        raise HTTPException(422, skill["error"])
    return skill


class ToggleBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    enabled: bool
    project_id: str | None = Field(default=None, alias="projectId")


@router.post("/{name}/toggle")
def toggle_skill(name: str, body: ToggleBody):
    skill = skills_svc.set_enabled(name, body.enabled, body.project_id)
    if not skill:
        raise HTTPException(404, "技能不存在。")
    return skill


@router.delete("/{name}")
def delete_skill(name: str, project_id: str | None = Query(default=None, alias="projectId")):
    if not skills_svc.delete_skill(name, project_id):
        raise HTTPException(404, "技能不存在。")
    return {"deleted": name}
