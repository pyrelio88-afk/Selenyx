"""Agent 运行管理：启动自循环任务、查询运行记录、SSE 事件流、运行中干预。

单进程 sidecar 语义：运行状态登记在 SQLite（AgentRun），audit_log 每步
增量落库；实时事件经 services/agent/events.py 广播给 SSE 订阅者
（事件名对齐 go-claw：thought/tool_call/tool_result/plan/review/final/error）；
运行中干预（取消/插话/计划确认）的易失控制面在 services/agent/registry.py。
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun
from selenyx_backend.services.agent import events, execute_run, registry
from selenyx_backend.services.agent.recipes import get_recipe
from selenyx_backend.services.skills import get_skill

router = APIRouter()

_ACTIVE_STATUSES = ("running", "cancelling", "waiting_confirm")

# SSE 事件名映射（对齐 go-claw 事件类型）：时间线 kind -> wire 事件名
_SSE_EVENT_NAME = {
    "thought": "thought",
    "tool": "tool_call",
    "observation": "tool_result",
    "plan": "plan",
    "review": "review",
    "final": "final",
    "error": "error",
    "coverage": "coverage",
    "subagent": "subagent",
    "steer": "steer",
    "waiting": "waiting",
}


class StartRunBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    goal: str = Field(min_length=1, max_length=4000)
    project_id: str | None = Field(default=None, alias="projectId")
    review: bool = False
    confirm_plan: bool = Field(default=False, alias="confirmPlan")
    recipe: str | None = Field(default=None, max_length=60)
    # 模块 F：技能名（前端解析 /技能名 传入）与自定义指令注入
    skill: str | None = Field(default=None, max_length=60)
    custom_instructions: str | None = Field(default=None, alias="customInstructions", max_length=1500)
    # V4 模块 H：只接收本地会话的 opaque id/scope，不存对话正文。
    source_session_id: str | None = Field(default=None, alias="sourceSessionId", max_length=200)
    source_session_scope: str | None = Field(default=None, alias="sourceSessionScope", max_length=200)


class SteerBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    text: str = Field(min_length=1, max_length=2000)


class ConfirmBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    adjustment: str | None = Field(default=None, max_length=2000)


def _serialize(run: AgentRun, *, with_log: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": run.id,
        "goal": run.input_text,
        "projectId": run.project_id or None,
        "sourceSessionId": run.source_session_id or None,
        "sourceSessionScope": run.source_session_scope or None,
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
        try:
            data["artifacts"] = json.loads(run.artifacts_json or "[]")
        except json.JSONDecodeError:
            data["artifacts"] = []
    return data


@router.post("/runs", status_code=201)
async def start_run(body: StartRunBody):
    goal = body.goal.strip()
    if not goal:
        raise HTTPException(422, "任务目标不能为空。")
    # 流水线 recipe（V4 模块 E）：先校验再建行，避免孤儿 run；综述流水线强制开启批评审查门
    recipe = get_recipe(body.recipe)
    if body.recipe and recipe is None:
        raise HTTPException(422, f"未知流水线：{body.recipe}")
    review = body.review or (recipe.force_review if recipe else False)
    # 技能（V4 模块 F）：解析 SKILL.md——指令正文注入 system，allowedTools 裁剪白名单
    skill_directive: str | None = None
    allowed_tools: set[str] | None = None
    if body.skill:
        skill = get_skill(body.skill, body.project_id)
        if not skill:
            raise HTTPException(422, f"技能不存在：{body.skill}（先在「专家·技能·连接器」里创建）")
        if not skill.get("enabled", True):
            raise HTTPException(422, f"技能「{skill['name']}」未启用。")
        skill_directive = f"技能「{skill['name']}」：{skill.get('description', '')}\n{skill['instructions']}"
        if skill.get("allowedTools"):
            allowed_tools = set(skill["allowedTools"])
    run = AgentRun(
        recipe_id=recipe.key if recipe else "agent-loop",
        project_id=body.project_id or "",
        status="running",
        input_text=goal,
        source_session_id=body.source_session_id or "",
        source_session_scope=body.source_session_scope or "",
        started_at=datetime.now().isoformat(),
    )
    with Session(get_engine()) as session:
        session.add(run)
        session.commit()
        session.refresh(run)

    controls = registry.register_run(run.id)
    controls.confirm_plan = body.confirm_plan

    def emit(event: dict[str, Any]) -> None:
        # 实时事件广播给 SSE 订阅者；audit_log 增量落库仍是真相源（重启不丢）
        events.publish(run.id, event)

    async def runner() -> None:
        try:
            await execute_run(
                run.id,
                goal,
                body.project_id,
                emit,
                lambda: controls.cancelled,
                review=review,
                controls=controls,
                recipe_directive=recipe.directive if recipe else None,
                skill_directive=skill_directive,
                allowed_tools=allowed_tools,
                custom_instructions=body.custom_instructions,
            )
        finally:
            registry.finish_run(run.id)

    asyncio.create_task(runner())
    return {
        "runId": run.id,
        "status": "running",
        "sourceSessionId": run.source_session_id or None,
        "sourceSessionScope": run.source_session_scope or None,
    }


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
        if run.status not in _ACTIVE_STATUSES:
            return {"runId": run_id, "status": run.status}
    marked = registry.cancel_run(run_id)
    return {"runId": run_id, "status": "cancelling" if marked else "running"}


@router.post("/runs/{run_id}/steer")
def steer_run(run_id: str, body: SteerBody):
    """运行中插话（V4 模块 D）：loop 在下一步顶部消费，时间线显示为用户插话。"""
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            raise HTTPException(404, "运行记录不存在。")
        if run.status not in _ACTIVE_STATUSES:
            raise HTTPException(409, f"任务已结束（{run.status}），无法插话。")
    controls = registry.get_controls(run_id)
    if controls is None or not controls.add_steer(body.text.strip()):
        raise HTTPException(409, "插话队列已满或任务不在进行中，请稍后再试。")
    return {"runId": run_id, "queued": True}


@router.post("/runs/{run_id}/confirm")
def confirm_run(run_id: str, body: ConfirmBody):
    """plan 确认门放行（V4 模块 D）：按计划执行，或带调整意见执行。"""
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            raise HTTPException(404, "运行记录不存在。")
        if run.status != "waiting_confirm":
            raise HTTPException(409, f"任务不在等待确认状态（{run.status}）。")
        run.status = "running"
        session.add(run)
        session.commit()
    controls = registry.get_controls(run_id)
    if controls is None:
        raise HTTPException(409, "任务控制面不存在（可能进程已重启）。")
    controls.confirm(body.adjustment)
    return {"runId": run_id, "status": "running"}


def _sse_frame(event_name: str, payload: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str):
    """SSE 事件流（V4 模块 D）：snapshot 先行（迟到者补齐），随后实时推送。

    前端 EventSource 优先、轮询兜底；run 结束（status 事件）后流关闭，
    订阅队列随即注销。
    """
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            raise HTTPException(404, "运行记录不存在。")
        snapshot = _serialize(run, with_log=True)
    queue = events.subscribe(run_id)

    async def stream():
        try:
            yield _sse_frame("snapshot", snapshot)
            if snapshot["status"] not in _ACTIVE_STATUSES:
                # 订阅时 run 已结束：快照即全集，补终态事件后关流
                yield _sse_frame("status", {"status": snapshot["status"], "output": snapshot.get("outputText", "")})
                return
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # 心跳保活（穿透代理 idle 超时）
                    continue
                if event.get("type") == "status":
                    yield _sse_frame("status", event)
                    return
                name = _SSE_EVENT_NAME.get(str(event.get("kind", "")), "step")
                yield _sse_frame(name, event)
        finally:
            events.unsubscribe(run_id, queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
