"""Lightweight local scheduler for automation tasks.

The FastAPI lifespan invokes :func:`tick` every 30 seconds.  It supports
interval, daily, and five-field cron schedules; optional missed-run catch-up;
and at most three retry attempts with 1/2/4 minute exponential backoff.
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
from selenyx_backend.services.cronparse import cron_matches, parse_cron, prev_fire

_TICK_SECONDS = 30
_MAX_RETRIES = 3


def _parse_timestamp(value: str | None) -> datetime | None:
    """Read local/legacy ISO timestamps without one malformed row breaking ticks."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    # Selenyx writes naive local time. Be forgiving of old offset-bearing data
    # rather than allowing an aware/naive comparison to abort every schedule.
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _within_tick_window(now: datetime, due: datetime) -> bool:
    return due <= now < due + timedelta(seconds=_TICK_SECONDS * 2)


def _interval_due_without_catchup(task: AutomationTask, now: datetime, last: datetime | None) -> bool:
    """Only fire on an ordinary interval occurrence, never backfill one."""
    anchor = last or _parse_timestamp(task.created_at)
    if anchor is None or now < anchor:
        return False
    interval = timedelta(minutes=max(5, task.interval_min))
    elapsed = now - anchor
    occurrences = int(elapsed.total_seconds() // interval.total_seconds())
    due = anchor + interval * occurrences
    return _within_tick_window(now, due)


def _is_due(task: AutomationTask, now: datetime) -> bool:
    """Whether this task has an ordinary/compensated occurrence due now."""
    if not task.enabled or not task.prompt.strip():
        return False
    last = _parse_timestamp(task.last_run_at)

    if task.schedule_type == "interval":
        if task.catch_up:
            return last is None or last + timedelta(minutes=max(5, task.interval_min)) <= now
        return _interval_due_without_catchup(task, now, last)

    if task.schedule_type == "cron":
        if parse_cron(task.cron_expr) is None:
            return False
        current_minute = now.replace(second=0, microsecond=0)
        if cron_matches(task.cron_expr, now):
            return last is None or last < current_minute
        if not task.catch_up:
            return False
        baseline = last or _parse_timestamp(task.created_at)
        if baseline is None:
            return False
        missed = prev_fire(task.cron_expr, now, after=baseline)
        return missed is not None and missed > baseline

    # Daily schedules retain the legacy first-run behavior: with catch-up on
    # (the default), a newly created task whose time has already passed runs
    # once today.  Turning catch-up off is the explicit opt-out that makes a
    # task created after its time wait until tomorrow.
    try:
        hour, minute = (int(part) for part in task.daily_hhmm.split(":"))
    except ValueError:
        return False
    due_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < due_today:
        return False
    if last is None and task.catch_up:
        return True
    baseline = last or _parse_timestamp(task.created_at)
    if baseline is None or baseline >= due_today:
        return False
    return task.catch_up or _within_tick_window(now, due_today)


def launch_automation_run(
    task_id: str,
    *,
    touch_last_run: bool = True,
    consume_retry: bool = False,
) -> str:
    """Create an automation AgentRun and claim its in-flight guard.

    A retry is consumed only after this guard and run row have been created,
    preventing a competing tick from losing an eligible retry.
    """
    if not try_acquire_task(task_id):
        return ""
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        if not task or not task.enabled or not task.prompt.strip():
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
        if touch_last_run:
            task.last_run_at = run.started_at
            session.add(task)
        if consume_retry:
            task.next_retry_at = None
            session.add(task)
        session.commit()
        session.refresh(run)
        return run.id


def _apply_retry_outcome(task_id: str, run_id: str, *, retry_attempt: bool) -> None:
    """Record a scheduled run outcome and calculate its next retry, if any."""
    now = datetime.now()
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        task = session.get(AutomationTask, task_id)
        if not run or not task:
            return
        if run.status == "failed":
            # A fresh normal occurrence starts a fresh retry series after a
            # previous occurrence may have exhausted all three attempts.
            if not retry_attempt:
                task.retry_count = 0
            if task.retry_count < _MAX_RETRIES:
                task.retry_count += 1
                delay_min = 2 ** (task.retry_count - 1)
                task.next_retry_at = (now + timedelta(minutes=delay_min)).isoformat()
            else:
                task.next_retry_at = None
        elif run.status in ("completed", "cancelled"):
            task.retry_count = 0
            task.next_retry_at = None
        session.add(task)
        session.commit()


def _mark_unhandled_run_failure(run_id: str) -> None:
    """Safety net for an exception that escapes execute_run's own guard."""
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run or run.status not in ("staged", "running", "cancelling", "waiting_confirm"):
            return
        run.status = "failed"
        run.completed_at = datetime.now().isoformat()
        session.add(run)
        session.commit()


async def _execute_automation(
    task_id: str,
    run_id: str,
    prompt: str,
    project_id: str | None,
    *,
    scheduled: bool = True,
    retry_attempt: bool = False,
) -> None:
    controls = register_run(run_id)
    try:
        await execute_run(run_id, prompt, project_id, lambda event: None, lambda: controls.cancelled)
    except Exception:
        _mark_unhandled_run_failure(run_id)
    finally:
        finish_run(run_id)
        release_task(task_id)
        if scheduled:
            try:
                _apply_retry_outcome(task_id, run_id, retry_attempt=retry_attempt)
            except Exception:
                # Retry accounting must not stop the lifespan scheduler.
                pass


async def tick(now: datetime | None = None) -> list[str]:
    """Launch due work and return its run ids for deterministic tests."""
    now = now or datetime.now()
    triggered: list[str] = []
    with Session(get_engine()) as session:
        tasks = list(session.exec(select(AutomationTask).where(AutomationTask.enabled)).all())
        due_specs: list[dict[str, Any]] = []
        retry_specs: list[dict[str, Any]] = []
        for task in tasks:
            retry_at = _parse_timestamp(task.next_retry_at)
            if retry_at is not None and retry_at <= now:
                retry_specs.append({"id": task.id, "prompt": task.prompt, "project_id": task.project_id or None})
                continue
            if _is_due(task, now):
                due_specs.append({"id": task.id, "prompt": task.prompt, "project_id": task.project_id or None})

    for spec in retry_specs:
        run_id = launch_automation_run(spec["id"], touch_last_run=False, consume_retry=True)
        if not run_id:
            continue
        triggered.append(run_id)
        asyncio.create_task(
            _execute_automation(
                spec["id"], run_id, spec["prompt"], spec["project_id"], retry_attempt=True,
            )
        )
    for spec in due_specs:
        run_id = launch_automation_run(spec["id"])
        if not run_id:
            continue
        triggered.append(run_id)
        asyncio.create_task(
            _execute_automation(
                spec["id"], run_id, spec["prompt"], spec["project_id"], retry_attempt=False,
            )
        )
    return triggered


async def scheduler_loop(stop: asyncio.Event) -> None:
    """Lifespan attachment point: tick every 30 seconds until stopped."""
    while not stop.is_set():
        try:
            await tick()
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=_TICK_SECONDS)
        except asyncio.TimeoutError:
            continue
