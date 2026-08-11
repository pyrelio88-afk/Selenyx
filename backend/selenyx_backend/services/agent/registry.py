"""进行中 run / 自动化任务的进程内登记表。

单进程 sidecar 语义：运行状态以 SQLite 为准，本模块只保存易失的
「运行控制面」（取消/插话/计划确认）与「自动化任务执行中」守卫。
全部函数仅在单事件循环线程内调用，天然原子。

进程重启后本表清空：stale run 由 main.py lifespan 的
`mark_stale_runs_failed` 收敛，in-flight 守卫随进程重建。
"""

from __future__ import annotations

import asyncio
from datetime import datetime

from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun

# steer 插话积压上限：防失控客户端灌爆内存
_MAX_STEER_BACKLOG = 20
# plan 确认等待上限：超时自动按计划继续（用户可能关了窗口）
PLAN_CONFIRM_TIMEOUT_S = 1800


class RunControls:
    """单 run 的易失控制面（V4 模块 D）。

    - 取消即时化：cancel_event 一置位，进行中的 LLM 调用立刻被取消；
    - steer：用户运行中插话，loop 在下一步顶部消费；
    - plan 确认门：confirm_plan=True 时首个计划在 plan_gate 上等待，
      confirm()（或 cancel()）放行。
    """

    def __init__(self) -> None:
        self.cancelled = False
        self.cancel_event = asyncio.Event()
        self.steer_backlog: list[str] = []
        self.confirm_plan = False
        self.plan_gate = asyncio.Event()
        self.plan_adjustment: str | None = None

    def cancel(self) -> None:
        self.cancelled = True
        self.cancel_event.set()
        self.plan_gate.set()  # 等待计划确认时也能被 cancel 唤醒

    def add_steer(self, text: str) -> bool:
        if len(self.steer_backlog) >= _MAX_STEER_BACKLOG:
            return False
        self.steer_backlog.append(text)
        return True

    def drain_steer(self) -> list[str]:
        drained, self.steer_backlog = self.steer_backlog, []
        return drained

    def confirm(self, adjustment: str | None = None) -> None:
        self.plan_adjustment = (adjustment or "").strip() or None
        self.plan_gate.set()


# run_id -> RunControls
_LIVE_RUNS: dict[str, RunControls] = {}
# 正在执行的自动化任务 id（tick 与手动触发共用，防并发重跑）
_IN_FLIGHT_TASKS: set[str] = set()


def register_run(run_id: str) -> RunControls:
    """登记一个进行中的 run（幂等），返回其控制面。"""
    controls = _LIVE_RUNS.get(run_id)
    if controls is None:
        controls = RunControls()
        _LIVE_RUNS[run_id] = controls
    return controls


def get_controls(run_id: str) -> RunControls | None:
    return _LIVE_RUNS.get(run_id)


def cancel_run(run_id: str) -> bool:
    """标记取消；run 不在进行中（或已结束）返回 False。"""
    controls = _LIVE_RUNS.get(run_id)
    if controls is None:
        return False
    controls.cancel()
    return True


def finish_run(run_id: str) -> None:
    """run 结束后注销，防内存泄漏。"""
    _LIVE_RUNS.pop(run_id, None)


def is_live(run_id: str) -> bool:
    return run_id in _LIVE_RUNS


def try_acquire_task(task_id: str) -> bool:
    """占用一个自动化任务的执行权；已在执行返回 False。"""
    if task_id in _IN_FLIGHT_TASKS:
        return False
    _IN_FLIGHT_TASKS.add(task_id)
    return True


def release_task(task_id: str) -> None:
    _IN_FLIGHT_TASKS.discard(task_id)


def mark_stale_runs_failed() -> int:
    """进程启动时把残留的 running/cancelling/waiting_confirm run 收敛为 failed（重启即中断）。"""
    now = datetime.now().isoformat()
    with Session(get_engine()) as session:
        stale = list(
            session.exec(
                select(AgentRun).where(AgentRun.status.in_(("running", "cancelling", "waiting_confirm")))
            ).all()
        )
        for run in stale:
            run.status = "failed"
            run.completed_at = now
            if not run.output_text:
                run.output_text = "进程重启，任务中断。"
            session.add(run)
        session.commit()
        return len(stale)


__all__ = [
    "RunControls",
    "PLAN_CONFIRM_TIMEOUT_S",
    "register_run",
    "get_controls",
    "cancel_run",
    "finish_run",
    "is_live",
    "try_acquire_task",
    "release_task",
    "mark_stale_runs_failed",
]
