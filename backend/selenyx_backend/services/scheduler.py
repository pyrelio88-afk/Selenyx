"""自动化调度器：按节奏触发 agent 自循环任务。

轻量 asyncio 调度：挂在 FastAPI lifespan 的 30s tick；到期判定——
interval：last_run_at + interval_min <= now；daily：今天 hh:mm 已过且今天未跑。
触发的执行复用 agent loop，运行记录（AgentRun）照常落库，前端任务页可见。
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun, AutomationTask
from selenyx_backend.services.agent import execute_run
from selenyx_backend.services.agent.registry import (
    finish_run,
    register_run,
    release_task,
    try_acquire_task,
)

_TICK_SECONDS = 30


def _is_due(task: AutomationTask, now: datetime) -> bool:
    if not task.enabled or not task.prompt.strip():
        return False
    last = datetime.fromisoformat(task.last_run_at) if task.last_run_at else None
    if task.schedule_type == "interval":
        if last is None:
            return True
        return last + timedelta(minutes=max(5, task.interval_min)) <= now
    # daily：今天到点且今天还没跑过
    try:
        hour, minute = (int(part) for part in task.daily_hhmm.split(":"))
    except ValueError:
        return False
    due_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < due_today:
        return False
    return last is None or last < due_today


def launch_automation_run(task_id: str, *, touch_last_run: bool = True) -> str:
    """为一次自动化触发创建 AgentRun 记录（执行由调用方驱动）。

    - in-flight 守卫：同一任务已有运行实例时返回 ""，防 tick 与手动触发并发重跑。
    - touch_last_run=False（手动「立即运行」）不刷新 last_run_at，不打乱既定节奏。
    注意：返回非空时调用方必须最终调 release_task（见 _execute_automation 的 finally）。
    """
    if not try_acquire_task(task_id):
        return ""
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task:
            release_task(task_id)
            return ""
        run = AgentRun(
            recipe_id=f"automation:{task_id}",
            project_id=task.project_id,
            status="running",
            input_text=f"[自动化 · {task.name}] {task.prompt}",
            started_at=datetime.now().isoformat(),
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        if touch_last_run:
            task.last_run_at = run.started_at
            session.add(task)
            session.commit()
        return run.id


async def _execute_automation(task_id: str, run_id: str, prompt: str, project_id: str | None) -> None:
    state = register_run(run_id)
    try:
        await execute_run(run_id, prompt, project_id, lambda event: None, lambda: state["cancelled"])
    except Exception:
        # 调度路径上的异常绝不能击穿 lifespan；run 状态由 execute_run 自身兜底
        pass
    finally:
        finish_run(run_id)
        release_task(task_id)


async def tick(now: datetime | None = None) -> list[str]:
    """扫描到期任务并触发；返回本次触发的 run id 列表（测试可断言）。"""
    now = now or datetime.now()
    triggered: list[str] = []
    with Session(get_engine()) as session:
        tasks = list(session.exec(select(AutomationTask).where(AutomationTask.enabled)).all())
        due_specs: list[dict[str, Any]] = [
            {"id": task.id, "prompt": task.prompt, "project_id": task.project_id or None}
            for task in tasks
            if _is_due(task, now)
        ]
    for spec in due_specs:
        run_id = launch_automation_run(spec["id"])
        if not run_id:
            continue
        triggered.append(run_id)
        asyncio.create_task(_execute_automation(spec["id"], run_id, spec["prompt"], spec["project_id"]))
    return triggered


async def scheduler_loop(stop: asyncio.Event) -> None:
    """lifespan 挂载点：每 30s 一次 tick，stop 置位即退出。"""
    while not stop.is_set():
        try:
            await tick()
        except Exception:
            pass  # 单次 tick 失败不影响后续调度
        try:
            await asyncio.wait_for(stop.wait(), timeout=_TICK_SECONDS)
        except asyncio.TimeoutError:
            continue
