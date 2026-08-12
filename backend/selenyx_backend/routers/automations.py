"""自动化任务 CRUD + 手动触发 + 运行历史（V4 模块 G）。"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun, AutomationTask
from selenyx_backend.services.cronparse import parse_cron
from selenyx_backend.services.scheduler import _execute_automation, launch_automation_run

router = APIRouter()


class AutomationBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    schedule_type: str = Field(default="daily", alias="scheduleType", pattern="^(interval|daily|cron)$")
    interval_min: int = Field(default=60, alias="intervalMin", ge=5, le=24 * 60)
    daily_hhmm: str = Field(default="08:00", alias="dailyHhmm", pattern="^([01]\\d|2[0-3]):[0-5]\\d$")
    cron_expr: str = Field(default="", alias="cronExpr", max_length=60)
    catch_up: bool = Field(default=True, alias="catchUp")
    project_id: str | None = Field(default=None, alias="projectId")
    enabled: bool = True

    @field_validator("cron_expr")
    @classmethod
    def _cron_must_parse(cls, value: str, info) -> str:
        value = value.strip()
        if info.data.get("schedule_type") == "cron" and parse_cron(value) is None:
            raise ValueError("cron 表达式非法：需五字段（分 时 日 月 星期），支持 * */n a-b 列表")
        return value


def _serialize(task: AutomationTask) -> dict:
    return {
        "id": task.id,
        "name": task.name,
        "prompt": task.prompt,
        "scheduleType": task.schedule_type,
        "intervalMin": task.interval_min,
        "dailyHhmm": task.daily_hhmm,
        "cronExpr": task.cron_expr,
        "catchUp": task.catch_up,
        "retryCount": task.retry_count,
        "nextRetryAt": task.next_retry_at,
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
        cron_expr=body.cron_expr,
        catch_up=body.catch_up,
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
        task.cron_expr = body.cron_expr
        task.catch_up = body.catch_up
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
    """手动立即触发一次（不刷新 last_run_at，不影响既定节奏，不参与失败重试）。"""
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        prompt, project_id = task.prompt, task.project_id or None
    run_id = launch_automation_run(task_id, touch_last_run=False)
    if not run_id:
        raise HTTPException(409, "该任务已有正在运行的实例。")
    asyncio.create_task(_execute_automation(task_id, run_id, prompt, project_id, scheduled=False))
    return {"runId": run_id, "status": "running"}


@router.get("/{task_id}/runs")
def automation_run_history(task_id: str):
    """运行历史（V4 模块 G）：该任务触发的 run 列表，可跳任务详情。"""
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            raise HTTPException(404, "自动化任务不存在。")
        runs = list(
            session.exec(
                select(AgentRun)
                .where(AgentRun.recipe_id == f"automation:{task_id}")
                .order_by(AgentRun.started_at.desc())
            ).all()
        )[:20]
    return {
        "runs": [
            {
                "runId": run.id,
                "status": run.status,
                "startedAt": run.started_at,
                "completedAt": run.completed_at,
            }
            for run in runs
        ]
    }
