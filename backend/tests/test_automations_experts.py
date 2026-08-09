"""自动化调度器与专家 CRUD 测试。"""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, select

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, AutomationTask, Expert
from selenyx_backend.routers.experts import seed_builtin_experts
from selenyx_backend.services import scheduler
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def test_builtin_experts_seeded_idempotently(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    seed_builtin_experts()  # 第二次不得重复写入
    with Session(get_engine()) as session:
        experts = list(session.exec(select(Expert)).all())
    assert len(experts) == 4
    assert {e.key for e in experts} == {"reviewer", "critic", "methodologist", "writer"}
    assert all(e.builtin for e in experts)


async def test_scheduler_interval_due_triggers_run(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        emit({"type": "status", "status": "completed", "output": "ok"})

    # 调度触发的执行走假 LLM，避免测试依赖真实网关
    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    with Session(get_engine()) as session:
        task = AutomationTask(name="定时综述", prompt="梳理证据", schedule_type="interval", interval_min=30, enabled=True)
        session.add(task)
        session.commit()
        task_id = task.id

    triggered = await scheduler.tick()
    assert len(triggered) == 1
    await scheduler.asyncio.sleep(0)  # 让 create_task 的执行协程跑完

    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        assert task is not None and task.last_run_at
        run = session.get(AgentRun, triggered[0])
        assert run is not None
        assert run.recipe_id == f"automation:{task_id}"
        assert "定时综述" in run.input_text

    # 立刻再 tick：间隔未到，不得重复触发
    assert await scheduler.tick() == []
    # 快进 31 分钟：应再次到期
    future = datetime.now() + timedelta(minutes=31)
    assert len(await scheduler.tick(now=future)) == 1


async def test_scheduler_daily_respects_hhmm(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)

    async def fake_execute(run_id, goal, project_id, emit, is_cancelled):
        pass

    monkeypatch.setattr(scheduler, "execute_run", fake_execute)
    now = datetime.now()
    due_hhmm = (now - timedelta(minutes=1)).strftime("%H:%M")
    with Session(get_engine()) as session:
        session.add(AutomationTask(name="每日监测", prompt="查新", schedule_type="daily", daily_hhmm=due_hhmm, enabled=True))
        session.commit()

    before_due = now - timedelta(minutes=2)
    assert await scheduler.tick(now=before_due) == []
    assert len(await scheduler.tick(now=now)) == 1
    # 到点之后同一天：不得重复触发
    assert await scheduler.tick(now=now + timedelta(minutes=1)) == []


async def test_subagent_via_ask_expert(tmp_path, monkeypatch):
    """ask_expert 工具：主循环委托内置专家，专家 final 作为观察结果回流。"""
    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="agent-loop", status="running", input_text="请人帮忙")
        session.add(run)
        session.commit()
        run_id = run.id

    replies = iter([
        '{"thought": "交给综述员", "tool": "ask_expert", "args": {"expert": "reviewer", "question": "如何归类这些文献？"}}',
        '{"thought": "专家给了方向", "final": "按主题 A/B 归类。"}',
    ])

    async def fake_complete(messages):
        # 子代理（消息里带专家人格）直接 final；主循环按脚本
        system = messages[0]["content"] if messages else ""
        if "文献综述员" in system:
            return '{"thought": "分类", "final": "主题 A：预防；主题 B：监测。"}'
        return next(replies)

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    import selenyx_backend.services.agent.subagents as subagents
    monkeypatch.setattr(subagents, "_complete", fake_complete)

    events: list[dict] = []
    await agent_loop.execute_run(run_id, "请人帮忙", None, events.append, lambda: False)

    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"
        assert run.output_text == "按主题 A/B 归类。"
    observation = next(e for e in events if e.get("kind") == "observation")
    assert observation["result"]["expert"] == "文献综述员"
    assert "主题 A" in observation["result"]["answer"]


def test_run_now_does_not_touch_last_run_at(tmp_path, monkeypatch):
    """手动触发（touch_last_run=False）不刷新节奏；调度路径仍写。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        task = AutomationTask(name="手动", prompt="跑", schedule_type="interval", interval_min=30, enabled=True)
        session.add(task)
        session.commit()
        session.refresh(task)
        task_id = task.id

    run_id = scheduler.launch_automation_run(task_id, touch_last_run=False)
    assert run_id
    with Session(get_engine()) as session:
        task = session.get(AutomationTask, task_id)
        assert task is not None and task.last_run_at is None
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "running"
    scheduler.release_task(task_id)


def test_in_flight_guard(tmp_path, monkeypatch):
    """in-flight 守卫：同一任务并发二次触发返回空；release 后可再跑。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        task = AutomationTask(name="守卫", prompt="跑", schedule_type="daily", daily_hhmm="08:00", enabled=True)
        session.add(task)
        session.commit()
        session.refresh(task)
        task_id = task.id

    first = scheduler.launch_automation_run(task_id)
    assert first
    assert scheduler.launch_automation_run(task_id) == ""  # 已在执行，拒绝并发
    scheduler.release_task(task_id)
    second = scheduler.launch_automation_run(task_id)
    assert second and second != first
    scheduler.release_task(task_id)


def test_automation_run_cancellable(tmp_path, monkeypatch):
    """自动化 run 注册后可被取消，结束后登记表清空。"""
    from selenyx_backend.services.agent import registry

    reset_backend(tmp_path, monkeypatch)
    state = registry.register_run("run-x")
    assert registry.is_live("run-x")
    assert registry.cancel_run("run-x") is True
    assert state["cancelled"] is True
    registry.finish_run("run-x")
    assert not registry.is_live("run-x")
    assert registry.cancel_run("run-x") is False


def test_stale_runs_marked_failed(tmp_path, monkeypatch):
    """重启收敛：残留 running/cancelling 的 run 被标记 failed。"""
    from selenyx_backend.services.agent import registry

    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        session.add(AgentRun(recipe_id="agent-loop", status="running", input_text="中断任务"))
        session.add(AgentRun(recipe_id="agent-loop", status="completed", input_text="正常任务", output_text="ok"))
        session.commit()

    assert registry.mark_stale_runs_failed() == 1
    with Session(get_engine()) as session:
        runs = list(session.exec(select(AgentRun)).all())
        stale = next(r for r in runs if r.input_text == "中断任务")
        assert stale.status == "failed" and stale.completed_at
        assert stale.output_text == "进程重启，任务中断。"
        done = next(r for r in runs if r.input_text == "正常任务")
        assert done.status == "completed"


def test_daily_hhmm_rejects_invalid_time():
    """daily_hhmm 收紧：29:99 之类的非法时间直接校验失败。"""
    from pydantic import ValidationError

    from selenyx_backend.routers.automations import AutomationBody

    with pytest.raises(ValidationError):
        AutomationBody(name="x", prompt="y", daily_hhmm="29:99")
    # 合法边界不受影响
    AutomationBody(name="x", prompt="y", daily_hhmm="23:59")
    AutomationBody(name="x", prompt="y", daily_hhmm="00:00")
