"""自动化任务 CRUD + 手动触发。"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AutomationTask
from selenyx_backend.services.scheduler import _execute_automation, launch_automation_run

router = APIRouter()


class AutomationBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    schedule_type: str = Field(default="daily", pattern="^(interval|daily)$")
    interval_min: int = Field(default=60, ge=5, le=24 * 60)
    daily_hhmm: str = Field(default="08:00", pattern="^([01]\\d|2[0-3]):[0-5]\\d$")
    project_id: str | None = Field(default=None, alias="projectId")
    enabled: bool = True


def _serialize(task: AutomationTask) -> dict:
    return {
        "id": task.id,
        "name": task.name,
        "prompt": task.prompt,
        "scheduleType": task.schedule_type,
        "intervalMin": task.interval_min,
        "dailyHhmm": task.daily_hhmm,
        "projectId": task.project_id or None,
        "enabled": task.enabled,
        "lastRunAt": task.last_run_at,
    }


@router.get("")
def list_automations():
    with Session(get_engine()) as session:
        tasks = list(session.exec(select(AutomationTask)).all())
    return {"automations": [_serialize(t) for t in tasks]}


@router.post("", status_code=201)
def create_automation(body: AutomationBody):
    task = AutomationTask(
        name=body.name.strip(),
        prompt=body.prompt.strip(),
        schedule_type=body.schedule_type,
        interval_min=body.interval_min,
        daily_hhmm=body.daily_hhmm,
        project_id=body.project_id or "",
        enabled=body.enabled,
    )
    with Session(get_engine()) as session:
        session.add(task)
        session.commit()
        session.refresh(task)
        return _serialize(task)


@router.put("/{task_id}")
def update_automation(task_id: str, body: AutomationBody):
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        task.name = body.name.strip()
        task.prompt = body.prompt.strip()
        task.schedule_type = body.schedule_type
        task.interval_min = body.interval_min
        task.daily_hhmm = body.daily_hhmm
        task.project_id = body.project_id or ""
        task.enabled = body.enabled
        session.add(task)
        session.commit()
        session.refresh(task)
        return _serialize(task)


@router.post("/{task_id}/toggle")
def toggle_automation(task_id: str):
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        task.enabled = not task.enabled
        session.add(task)
        session.commit()
        session.refresh(task)
        return _serialize(task)


@router.delete("/{task_id}")
def delete_automation(task_id: str):
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        session.delete(task)
        session.commit()
    return {"deleted": task_id}


@router.post("/{task_id}/run", status_code=202)
async def run_automation_now(task_id: str):
    """手动立即触发一次（不刷新 last_run_at，不影响既定节奏）。"""
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        prompt, project_id = task.prompt, task.project_id or None
    run_id = launch_automation_run(task_id, touch_last_run=False)
    if not run_id:
        raise HTTPException(409, "该任务已有正在运行的实例。")
    asyncio.create_task(_execute_automation(task_id, run_id, prompt, project_id))
    return {"runId": run_id, "status": "running"}
