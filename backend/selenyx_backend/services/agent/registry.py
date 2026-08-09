"""进行中 run / 自动化任务的进程内登记表。

单进程 sidecar 语义：运行状态以 SQLite 为准，本模块只保存易失的
「取消标志」与「自动化任务执行中」守卫。全部函数同步、仅在单事件
循环线程内调用，天然原子。

进程重启后本表清空：stale run 由 main.py lifespan 的
`mark_stale_runs_failed` 收敛，in-flight 守卫随进程重建。
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun

# run_id -> {"cancelled": bool}
_LIVE_RUNS: dict[str, dict[str, bool]] = {}
# 正在执行的自动化任务 id（tick 与手动触发共用，防并发重跑）
_IN_FLIGHT_TASKS: set[str] = set()


def register_run(run_id: str) -> dict[str, bool]:
    """登记一个进行中的 run（幂等），返回其可变状态 dict。"""
    state = _LIVE_RUNS.get(run_id)
    if state is None:
        state = {"cancelled": False}
        _LIVE_RUNS[run_id] = state
    return state


def cancel_run(run_id: str) -> bool:
    """标记取消；run 不在进行中（或已结束）返回 False。"""
    state = _LIVE_RUNS.get(run_id)
    if state is None:
        return False
    state["cancelled"] = True
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
    """进程启动时把残留的 running/cancelling run 收敛为 failed（重启即中断）。"""
    now = datetime.now().isoformat()
    with Session(get_engine()) as session:
        stale = list(
            session.exec(select(AgentRun).where(AgentRun.status.in_(("running", "cancelling")))).all()
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
    "register_run",
    "cancel_run",
    "finish_run",
    "is_live",
    "try_acquire_task",
    "release_task",
    "mark_stale_runs_failed",
]
