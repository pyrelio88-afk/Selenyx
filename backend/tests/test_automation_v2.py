"""V4 模块 G：cron 调度、失败指数退避重试、停机补偿、运行历史的测试。"""

from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, AutomationTask
from selenyx_backend.routers import automations as automations_router
from selenyx_backend.services import scheduler
from selenyx_backend.services.cronparse import cron_matches, parse_cron, prev_fire
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def make_task(**overrides) -> str:
    with Session(get_engine()) as session:
        task = AutomationTask(name="定时任务", prompt="梳理证据", enabled=True, **overrides)
        session.add(task)
        session.commit()
        session.refresh(task)
        return task.id


def get_task(task_id: str) -> AutomationTask:
    with Session(get_engine()) as session:
        return session.get(AutomationTask, task_id)


# ---------- cron 解析 ----------


def test_cron_parse_and_match():
    assert cron_matches("*/15 * * * *", datetime(2026, 8, 11, 10, 30))
    assert not cron_matches("*/15 * * * *", datetime(2026, 8, 11, 10, 31))
    assert cron_matches("0 8 * * *", datetime(2026, 8, 11, 8, 0))
    assert cron_matches("0 8 * * 1", datetime(2026, 8, 10, 8, 0))  # 2026-08-10 是周一
    assert not cron_matches("0 8 * * 1", datetime(2026, 8, 11, 8, 0))
    # 日/星期同时受限取 OR（cron 惯例）：1 号或周三
    assert cron_matches("0 0 1 * 3", datetime(2026, 8, 12, 0, 0))  # 周三非 1 号
    assert cron_matches("0 0 1 * 3", datetime(2026, 9, 1, 0, 0))  # 1 号非周三
    # 非法表达式
    assert parse_cron("not a cron") is None
    assert parse_cron("61 * * * *") is None
    assert parse_cron("0 8 * *") is None


def test_cron_prev_fire():
    now = datetime(2026, 8, 11, 10, 0)
    assert prev_fire("30 9 * * *", now) == datetime(2026, 8, 11, 9, 30)
    # after 边界之外的命中不算
    assert prev_fire("30 9 * * *", now, after=datetime(2026, 8, 11, 9, 30)) == datetime(2026, 8, 11, 9, 30)
    assert prev_fire("0 8 * * 0", now, max_lookback_days=1) is None  # 周日触发点超出回看窗
    # 无年份 cron 仍能表达闰日；默认回看窗覆盖一个完整闰年周期。
    assert prev_fire("0 0 29 2 *", datetime(2028, 3, 1), after=datetime(2025, 1, 1)) == datetime(2028, 2, 29)


def test_cron_body_validation_uses_aliases():
    valid = automations_router.AutomationBody(
        name="每周整理",
        prompt="整理证据",
        scheduleType="cron",
        cronExpr="0 8 * * 1-5",
    )
    assert valid.cron_expr == "0 8 * * 1-5"
    with pytest.raises(ValidationError):
        automations_router.AutomationBody(
            name="坏 cron",
            prompt="整理证据",
            scheduleType="cron",
            cronExpr="0 8 * *",
        )


# ---------- cron 调度与补偿 ----------


async def test_cron_due_and_no_refire_same_minute(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        pass

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    make_task(schedule_type="cron", cron_expr="* * * * *")
    now = datetime.now().replace(second=10, microsecond=0)
    assert len(await scheduler.tick(now=now)) == 1
    await scheduler.asyncio.sleep(0)  # 让执行协程跑完并释放 in-flight 守卫
    # 同一分钟内不重复触发
    assert await scheduler.tick(now=now.replace(second=40)) == []
    # 下一分钟再次触发
    assert len(await scheduler.tick(now=now + timedelta(minutes=1))) == 1


async def test_cron_catch_up_after_downtime(tmp_path, monkeypatch):
    """停机错过 08:00 的触发，catch_up 开 → 补跑；关 → 跳过。"""
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        pass

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    now = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    created = now - timedelta(days=1, hours=1)  # 昨天 08:00 之后创建
    task_on = make_task(schedule_type="cron", cron_expr="0 8 * * *", catch_up=True)
    task_off = make_task(schedule_type="cron", cron_expr="0 8 * * *", catch_up=False)
    with Session(get_engine()) as session:
        for tid, ts in ((task_on, created), (task_off, created)):
            task = session.get(AutomationTask, tid)
            task.created_at = ts.isoformat()
            session.add(task)
        session.commit()

    triggered = await scheduler.tick(now=now)
    assert len(triggered) == 1  # 只有 catch_up 开的补跑


def test_catch_up_toggle_skips_missed_interval_and_new_daily_task(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    now = datetime(2026, 8, 11, 16, 0)
    interval_id = make_task(schedule_type="interval", interval_min=5, catch_up=False)
    daily_id = make_task(schedule_type="daily", daily_hhmm="08:00", catch_up=False)
    daily_catchup_id = make_task(schedule_type="daily", daily_hhmm="08:00", catch_up=True)
    with Session(get_engine()) as session:
        interval = session.get(AutomationTask, interval_id)
        interval.created_at = (now - timedelta(minutes=12)).isoformat()
        daily = session.get(AutomationTask, daily_id)
        daily.created_at = now.replace(hour=15, minute=0).isoformat()
        daily_catchup = session.get(AutomationTask, daily_catchup_id)
        daily_catchup.created_at = now.replace(hour=15, minute=0).isoformat()
        session.add(interval)
        session.add(daily)
        session.add(daily_catchup)
        session.commit()

    interval = get_task(interval_id)
    daily = get_task(daily_id)
    daily_catchup = get_task(daily_catchup_id)
    # The last 5-minute occurrence was two minutes ago: no compensation.
    assert not scheduler._is_due(interval, now)
    # Its next ordinary slot is still eligible.
    assert scheduler._is_due(interval, now + timedelta(minutes=3))
    # With catch-up disabled, creating a daily task after today's 08:00 is
    # not a "missed" run. The default/on behavior preserves legacy immediate
    # first-run scheduling.
    assert not scheduler._is_due(daily, now)
    assert scheduler._is_due(daily_catchup, now)


# ---------- 失败指数退避重试 ----------


async def test_retry_backoff_and_reset_on_success(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    should_fail = True

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        with Session(get_engine()) as session:
            run = session.get(AgentRun, run_id)
            run.status = "failed" if should_fail else "completed"
            run.completed_at = datetime.now().isoformat()
            session.add(run)
            session.commit()

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    task_id = make_task(schedule_type="interval", interval_min=60)
    now = datetime.now()

    assert len(await scheduler.tick(now=now)) == 1
    await scheduler.asyncio.sleep(0)
    task = get_task(task_id)
    assert task.retry_count == 1 and task.next_retry_at  # +1 分钟

    # 重试到期 → 再次触发且仍失败 → 退避到 +2 分钟
    retry_at = datetime.fromisoformat(task.next_retry_at)
    assert len(await scheduler.tick(now=retry_at + timedelta(seconds=1))) == 1
    await scheduler.asyncio.sleep(0)
    task = get_task(task_id)
    assert task.retry_count == 2

    # 这次成功 → 计数复位
    should_fail = False
    retry_at = datetime.fromisoformat(task.next_retry_at)
    assert len(await scheduler.tick(now=retry_at + timedelta(seconds=1))) == 1
    await scheduler.asyncio.sleep(0)
    task = get_task(task_id)
    assert task.retry_count == 0 and task.next_retry_at is None


async def test_new_scheduled_occurrence_restarts_retry_series_after_three_failures(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        with Session(get_engine()) as session:
            run = session.get(AgentRun, run_id)
            run.status = "failed"
            run.completed_at = datetime.now().isoformat()
            session.add(run)
            session.commit()

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    task_id = make_task(schedule_type="interval", interval_min=5)
    now = datetime.now()
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        task.last_run_at = (now - timedelta(minutes=6)).isoformat()
        task.retry_count = 3
        task.next_retry_at = None
        session.add(task)
        session.commit()

    assert len(await scheduler.tick(now=now)) == 1
    await scheduler.asyncio.sleep(0)
    task = get_task(task_id)
    assert task.retry_count == 1 and task.next_retry_at


async def test_manual_run_not_retried(tmp_path, monkeypatch):
    """手动触发（scheduled=False）失败不参与重试记账。"""
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        with Session(get_engine()) as session:
            run = session.get(AgentRun, run_id)
            run.status = "failed"
            session.add(run)
            session.commit()

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    task_id = make_task(schedule_type="daily", daily_hhmm="23:59")
    run_id = scheduler.launch_automation_run(task_id, touch_last_run=False)
    await scheduler._execute_automation(task_id, run_id, "梳理证据", None, scheduled=False)
    task = get_task(task_id)
    assert task.retry_count == 0 and task.next_retry_at is None


# ---------- 运行历史 ----------


def test_automation_run_history(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    task_id = make_task(schedule_type="daily", daily_hhmm="08:00")
    with Session(get_engine()) as session:
        for i, day in enumerate((10, 11)):
            session.add(AgentRun(
                recipe_id=f"automation:{task_id}",
                status="completed",
                input_text=f"第{i}次",
                started_at=datetime(2026, 8, day, 8, 0).isoformat(),
            ))
        session.add(AgentRun(recipe_id="agent-loop", status="completed", input_text="别的 run"))
        session.commit()

    result = automations_router.automation_run_history(task_id)
    assert len(result["runs"]) == 2
    assert result["runs"][0]["startedAt"] > result["runs"][1]["startedAt"]  # 倒序
