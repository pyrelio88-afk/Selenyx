"""Agent 运行管理：启动自循环任务、查询运行记录、取消。

单进程 sidecar 语义：运行状态登记在 SQLite（AgentRun），audit_log 每步
增量落库，前端轮询详情即可看到实时步骤；进行中的取消标志保存在
services/agent/registry.py（进程重启后由 stale 清理收敛）。
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun
from selenyx_backend.services.agent import execute_run, registry

router = APIRouter()


class StartRunBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    goal: str = Field(min_length=1, max_length=4000)
    project_id: str | None = Field(default=None, alias="projectId")
    review: bool = False


def _serialize(run: AgentRun, *, with_log: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": run.id,
        "goal": run.input_text,
        "projectId": run.project_id or None,
        "status": run.status,
        "startedAt": run.started_at,
        "completedAt": run.completed_at,
    }
    if with_log:
        data["outputText"] = run.output_text
        try:
            data["auditLog"] = json.loads(run.audit_log_json or "[]")
        except json.JSONDecodeError:
            data["auditLog"] = []
    return data


@router.post("/runs", status_code=201)
async def start_run(body: StartRunBody):
    goal = body.goal.strip()
    if not goal:
        raise HTTPException(422, "任务目标不能为空。")
    run = AgentRun(
        recipe_id="agent-loop",
        project_id=body.project_id or "",
        status="running",
        input_text=goal,
        started_at=datetime.now().isoformat(),
    )
    with Session(get_engine()) as session:
        session.add(run)
        session.commit()
        session.refresh(run)

    state = registry.register_run(run.id)

    def emit(event: dict[str, Any]) -> None:
        # 事件流已由 audit_log 增量落库承载；保留 emit 签名供测试断言
        _ = event

    async def runner() -> None:
        try:
            await execute_run(run.id, goal, body.project_id, emit, lambda: state["cancelled"], review=body.review)
        finally:
            registry.finish_run(run.id)

    asyncio.create_task(runner())
    return {"runId": run.id, "status": "running"}


@router.get("/runs")
def list_runs():
    with Session(get_engine()) as session:
        runs = list(session.exec(select(AgentRun).order_by(AgentRun.started_at.desc())).all())[:50]
    return {"runs": [_serialize(run, with_log=False) for run in runs]}


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "运行记录不存在。")
    return _serialize(run, with_log=True)


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            raise HTTPException(404, "运行记录不存在。")
        if run.status != "running":
            return {"runId": run_id, "status": run.status}
    marked = registry.cancel_run(run_id)
    return {"runId": run_id, "status": "cancelling" if marked else "running"}
