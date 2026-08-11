"""V4 模块 D：SSE 事件总线、steer 插话、plan 确认门、取消即时化的测试。"""

import asyncio
import json
import time

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, ResearchProject
from selenyx_backend.services.agent import events, registry
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def make_run(goal: str = "调研") -> str:
    with Session(get_engine()) as session:
        project = ResearchProject(name="测试项目", current_stage="evidence")
        session.add(project)
        session.commit()
        session.refresh(project)
        run = AgentRun(recipe_id="agent-loop", project_id=project.id, status="running", input_text=goal)
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id


def get_run(run_id: str) -> AgentRun:
    with Session(get_engine()) as session:
        return session.get(AgentRun, run_id)


# ---------- 事件总线 ----------


def test_event_bus_fanout_and_cleanup():
    """多订阅者各自收到事件；退订后不再收到；计数归零。"""
    q1 = events.subscribe("run-1")
    q2 = events.subscribe("run-1")
    assert events.subscriber_count("run-1") == 2
    events.publish("run-1", {"type": "step", "kind": "thought", "text": "想"})
    assert q1.get_nowait()["kind"] == "thought"
    assert q2.get_nowait()["kind"] == "thought"
    events.unsubscribe("run-1", q1)
    events.publish("run-1", {"type": "step", "kind": "final"})
    assert q1.empty() and not q2.empty()
    events.unsubscribe("run-1", q2)
    assert events.subscriber_count("run-1") == 0


def test_event_bus_drops_oldest_when_full():
    """慢消费者队列满时丢最旧保最新，不阻塞发布者。"""
    q = events.subscribe("run-2")
    for i in range(210):
        events.publish("run-2", {"seq": i})
    first = q.get_nowait()
    assert first["seq"] >= 10  # 最旧的已被挤出
    assert q.qsize() <= 200
    events.unsubscribe("run-2", q)


# ---------- steer 插话 ----------


async def test_steer_consumed_next_step(tmp_path, monkeypatch):
    """运行中插话：下一步顶部消费，时间线落 steer 条目且进入模型上下文。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    seen_messages: list[list[dict]] = []
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        seen_messages.append([dict(m) for m in messages])
        if calls == 1:
            # 第一轮进行中用户插话
            controls.add_steer("重点关注老年人群")
            return json.dumps({"thought": "先查", "tool": "list_references", "args": {}})
        return json.dumps({"thought": "收尾", "final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events_log: list[dict] = []
    await agent_loop.execute_run(run_id, "调研", None, events_log.append, lambda: False, controls=controls)

    steer_entries = [e for e in events_log if e.get("kind") == "steer"]
    assert len(steer_entries) == 1 and "老年人群" in steer_entries[0]["text"]
    # 第二轮调用时插话已进入消息上下文
    assert any("老年人群" in m["content"] for m in seen_messages[1] if m["role"] == "user")
    assert get_run(run_id).status == "completed"


# ---------- plan 确认门 ----------


async def test_plan_confirm_gate_blocks_then_resumes(tmp_path, monkeypatch):
    """confirm_plan：首个计划后等待人工确认（waiting_confirm），带调整放行后继续。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        if calls == 1:
            return json.dumps({"thought": "规划", "plan": ["检索", "成稿"]})
        return json.dumps({"thought": "执行", "final": "调整后的成稿"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events_log: list[dict] = []
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研", None, events_log.append, lambda: False, controls=controls)
    )
    # 等 loop 走到 plan 门
    for _ in range(50):
        await asyncio.sleep(0.02)
        if get_run(run_id).status == "waiting_confirm":
            break
    assert get_run(run_id).status == "waiting_confirm"
    await asyncio.sleep(0.1)
    assert calls == 1  # 门未放行，第二次 LLM 调用未发生
    waiting = [e for e in events_log if e.get("kind") == "waiting"]
    assert waiting

    controls.confirm("先查近三年文献")
    await asyncio.wait_for(task, timeout=5)
    run = get_run(run_id)
    assert run.status == "completed"
    assert run.output_text == "调整后的成稿"
    steer_entries = [e for e in events_log if e.get("kind") == "steer"]
    assert any("近三年文献" in e.get("text", "") for e in steer_entries)


async def test_plan_confirm_timeout_auto_continues(tmp_path, monkeypatch):
    """确认超时：自动按计划继续，时间线留有提示，不永远卡住。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    monkeypatch.setattr(agent_loop, "PLAN_CONFIRM_TIMEOUT_S", 0.05)
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        if calls == 1:
            return json.dumps({"thought": "规划", "plan": ["检索"]})
        return json.dumps({"final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    await agent_loop.execute_run(run_id, "调研", None, lambda e: None, lambda: False, controls=controls)
    assert get_run(run_id).status == "completed"
    assert calls == 2  # 超时后自动继续


async def test_cancel_during_plan_gate(tmp_path, monkeypatch):
    """等待确认时取消：门被唤醒，run 立刻收敛为 cancelled。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True

    async def fake_complete(messages):
        return json.dumps({"thought": "规划", "plan": ["检索"]})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研", None, lambda e: None, lambda: False, controls=controls)
    )
    for _ in range(50):
        await asyncio.sleep(0.02)
        if get_run(run_id).status == "waiting_confirm":
            break
    controls.cancel()
    await asyncio.wait_for(task, timeout=5)
    assert get_run(run_id).status == "cancelled"


# ---------- 取消即时化 ----------


async def test_cancel_interrupts_inflight_llm(tmp_path, monkeypatch):
    """LLM 调用在飞时取消：秒级中断，不等 HTTP 慢响应返回。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()

    async def slow_complete(messages):
        await asyncio.sleep(30)
        return json.dumps({"final": "不该到达"})

    monkeypatch.setattr(agent_loop, "_complete", slow_complete)
    started = time.monotonic()
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研", None, lambda e: None, lambda: False, controls=controls)
    )
    await asyncio.sleep(0.1)  # 让 LLM 调用起飞
    controls.cancel()
    await asyncio.wait_for(task, timeout=5)
    elapsed = time.monotonic() - started
    assert elapsed < 2, f"取消应在 2 秒内生效，实际 {elapsed:.2f}s"
    assert get_run(run_id).status == "cancelled"
