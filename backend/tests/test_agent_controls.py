"""V4 模块 D：SSE 事件总线、steer 插话、plan 确认门、取消即时化的测试。"""

import asyncio
import json
import sqlite3
import time
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from sqlmodel import Session

from selenyx_backend import database, settings
from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, ResearchProject
from selenyx_backend.services.agent import events, registry
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.routers import agent as agent_router
from selenyx_backend.routers.agent import (
    ConfirmBody,
    cancel_run as api_cancel_run,
    confirm_run,
    get_run as api_get_run,
    run_events,
)
from selenyx_backend.services.rate_limit import reset_rate_limits


@pytest.fixture(autouse=True)
def isolated_backend(tmp_path, monkeypatch):
    """Never load real settings/secrets or contact a model/network in control tests."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    isolated = settings.Settings.model_construct(data_dir=tmp_path)
    monkeypatch.setattr(settings, "get_settings", lambda: isolated)
    monkeypatch.setattr(database, "get_settings", lambda: isolated)
    monkeypatch.setattr(agent_loop, "_memory_digest", lambda _pid: "测试记忆")
    monkeypatch.setattr(agent_loop, "agent_mcp_prompt", lambda: "")

    def unexpected_network(*args, **kwargs):
        pytest.fail("Control tests must not use a real model or network")

    monkeypatch.setattr(agent_loop, "_complete", unexpected_network)
    monkeypatch.setattr(httpx.AsyncClient, "send", unexpected_network)
    monkeypatch.setattr(httpx.Client, "send", unexpected_network)
    get_engine.cache_clear()
    yield
    if get_engine.cache_info().currsize:
        get_engine().dispose()
    get_engine.cache_clear()


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


async def test_sse_captures_completion_after_snapshot_read(tmp_path, monkeypatch):
    """A completion between snapshot capture and response streaming must reach SSE."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    serialize = agent_router._serialize

    def complete_after_snapshot(run, *, with_log):
        snapshot = serialize(run, with_log=with_log)
        with Session(get_engine()) as session:
            persisted = session.get(AgentRun, run_id)
            persisted.status = "completed"
            persisted.output_text = "已保存的最终回答"
            session.add(persisted)
            session.commit()
        events.publish(run_id, {
            "type": "status", "status": "completed", "output": "已保存的最终回答",
        })
        return snapshot

    monkeypatch.setattr(agent_router, "_serialize", complete_after_snapshot)
    response = await run_events(run_id)
    stream = response.body_iterator
    try:
        first = await asyncio.wait_for(stream.__anext__(), timeout=1)
        second = await asyncio.wait_for(stream.__anext__(), timeout=0.05)
    finally:
        await stream.aclose()

    assert "event: snapshot" in first
    assert '"status": "running"' in first
    assert "event: status" in second
    assert '"output": "已保存的最终回答"' in second
    assert events.subscriber_count(run_id) == 0


async def test_sse_missing_run_does_not_leak_subscriber(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    with pytest.raises(HTTPException) as missing:
        await run_events("missing-run")
    assert missing.value.status_code == 404
    assert events.subscriber_count("missing-run") == 0


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


def script_llm(monkeypatch, replies):
    seen_messages: list[list[dict]] = []
    scripted = iter(replies)

    async def fake_complete(messages):
        seen_messages.append([dict(message) for message in messages])
        reply = next(scripted)
        return reply if isinstance(reply, str) else json.dumps(reply)

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    return seen_messages


def start_gated_run(run_id, controls, *, review=False, on_event=None):
    waiting = asyncio.Event()
    events_log: list[dict] = []

    def emit(event):
        events_log.append(event)
        if on_event:
            on_event(event)
        if event.get("kind") == "waiting":
            waiting.set()

    task = asyncio.create_task(agent_loop.execute_run(
        run_id, "调研", None, emit, lambda: False, controls=controls, review=review,
    ))
    return task, waiting, events_log


def execution_spies(monkeypatch):
    dispatch = AsyncMock(return_value={"saved": True})
    reviewer = AsyncMock(return_value=("测试批评员", "通过"))
    wrap_up = AsyncMock(return_value="不应收尾")
    monkeypatch.setattr(agent_loop, "_dispatch_tool", dispatch)
    monkeypatch.setattr(agent_loop, "_review_draft", reviewer)
    monkeypatch.setattr(agent_loop, "_wrap_up", wrap_up)
    return dispatch, reviewer, wrap_up


def assert_no_execution(run_id, events_log, spies):
    for spy in spies:
        spy.assert_not_awaited()
    assert not {e.get("kind") for e in events_log} & {"tool", "observation", "final", "review", "coverage"}
    run = get_run(run_id)
    assert run.output_text == ""
    assert json.loads(run.artifacts_json) == []


async def test_plan_confirm_gate_blocks_then_resumes(tmp_path, monkeypatch):
    """An explicit confirmation dispatches once; adjustments reach the next model call."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    seen = script_llm(monkeypatch, [
        {"thought": "规划", "plan": ["检索", "成稿"]},
        {"tool": "write_note", "args": {"title": "测试", "content": "笔记"}},
        {"final": "调整后的成稿"},
    ])
    spies = execution_spies(monkeypatch)
    task, waiting, events_log = start_gated_run(run_id, controls)
    try:
        await asyncio.wait_for(waiting.wait(), timeout=5)
        assert get_run(run_id).status == "waiting_confirm"
        assert len(seen) == 1
        assert_no_execution(run_id, events_log, spies)
        assert "测试记忆" in seen[0][0]["content"]
        assert "发送给配置模型的上下文参考" in seen[0][0]["content"]

        controls.confirm("  先查近三年文献  ")
        await asyncio.wait_for(task, timeout=5)
        run = get_run(run_id)
        assert run.status == "completed"
        assert run.output_text == "调整后的成稿"
        assert len(seen) == 3
        spies[0].assert_awaited_once()
        spies[1].assert_not_awaited()
        spies[2].assert_not_awaited()
        assert any("近三年文献" in m["content"] for m in seen[1] if m["role"] == "user")
        assert any("近三年文献" in e.get("text", "") for e in events_log if e.get("kind") == "steer")
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


async def test_plan_confirm_never_auto_continues(tmp_path, monkeypatch):
    """Elapsed time and losing the viewer are not approval, and waiting uses no model calls."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    # Exercise the former timeout regression quickly if that path is reintroduced.
    monkeypatch.setattr(agent_loop, "PLAN_CONFIRM_TIMEOUT_S", 0.01, raising=False)
    seen = script_llm(monkeypatch, [{"plan": ["检索"]}, {"final": "完成"}])
    spies = execution_spies(monkeypatch)
    task, waiting, events_log = start_gated_run(run_id, controls)
    try:
        await asyncio.wait_for(waiting.wait(), timeout=5)
        assert events.subscriber_count(run_id) == 0
        for _ in range(2):
            done, _pending = await asyncio.wait({task}, timeout=0.05)
            assert not done
            assert get_run(run_id).status == "waiting_confirm"
            assert len(seen) == 1
            assert_no_execution(run_id, events_log, spies)
        controls.confirm()
        await asyncio.wait_for(task, timeout=5)
        assert get_run(run_id).status == "completed"
        assert len(seen) == 2
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


@pytest.mark.parametrize("first_action", [
    pytest.param({"tool": "write_memory", "args": {"content": "禁止写入"}}, id="first-tool"),
    pytest.param({"final": "禁止成稿"}, id="first-final"),
    pytest.param({}, id="missing-plan"),
    pytest.param("不是 JSON", id="unstructured-reply"),
    pytest.param({"plan": []}, id="empty-plan"),
    pytest.param({"plan": ["  ", "\n"]}, id="blank-plan"),
    pytest.param({"plan": "检索"}, id="string-plan"),
    pytest.param({"plan": None}, id="null-plan"),
    pytest.param({"plan": [None]}, id="null-item"),
    pytest.param({"plan": [123]}, id="number-item"),
    pytest.param({"plan": [{"step": "检索"}]}, id="object-item"),
    pytest.param({"plan": ["检索", " "]}, id="partly-blank-plan"),
    pytest.param({"plan": ["检索"], "tool": "ask_expert"}, id="plan-with-tool"),
    pytest.param({"plan": ["检索"], "final": "越过确认"}, id="plan-with-final"),
    pytest.param({"plan": ["检索"], "tool": None}, id="plan-with-null-tool"),
    pytest.param({"plan": ["检索"], "args": {}}, id="plan-with-args"),
])
async def test_invalid_first_action_rejected_until_plan_approved(tmp_path, monkeypatch, first_action):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    seen = script_llm(monkeypatch, [
        first_action,
        {"plan": ["  检索  ", "成稿"]},
        {"tool": "write_memory", "args": {"content": "已获确认"}},
        {"final": "草稿"},
        {"final": "完成"},
    ])
    spies = execution_spies(monkeypatch)
    task, waiting, events_log = start_gated_run(run_id, controls, review=True)
    try:
        await asyncio.wait_for(waiting.wait(), timeout=5)
        assert get_run(run_id).status == "waiting_confirm"
        assert len(seen) == 2
        assert_no_execution(run_id, events_log, spies)
        correction = seen[1][-1]
        assert correction["role"] == "user"
        assert "计划确认门拒绝" in correction["content"]
        assert "非空数组" in correction["content"]
        assert "人工确认" in correction["content"]
        plans = [e for e in events_log if e.get("kind") == "plan"]
        assert len(plans) == 1 and plans[0]["items"] == ["检索", "成稿"]

        controls.confirm()
        await asyncio.wait_for(task, timeout=5)
        assert get_run(run_id).status == "completed"
        assert get_run(run_id).output_text == "完成"
        assert len(seen) == 5
        spies[0].assert_awaited_once()
        assert spies[0].call_args.args[2:4] == ("write_memory", {"content": "已获确认"})
        spies[1].assert_awaited_once()
        spies[2].assert_not_awaited()
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


@pytest.mark.parametrize("confirm_when", ["before-run", "plan-published"])
async def test_early_confirmation_is_discarded(tmp_path, monkeypatch, confirm_when):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    if confirm_when == "before-run":
        controls.confirm("过期调整")

    def on_event(event):
        if confirm_when == "plan-published" and event.get("kind") == "plan":
            controls.confirm("过期调整")

    seen = script_llm(monkeypatch, [{"plan": ["检索"]}, {"final": "完成"}])
    spies = execution_spies(monkeypatch)
    task, waiting, events_log = start_gated_run(run_id, controls, on_event=on_event)
    try:
        await asyncio.wait_for(waiting.wait(), timeout=5)
        done, _pending = await asyncio.wait({task}, timeout=0.05)
        assert not done
        assert get_run(run_id).status == "waiting_confirm"
        assert not controls.plan_gate.is_set()
        assert controls.plan_adjustment is None
        assert len(seen) == 1
        assert_no_execution(run_id, events_log, spies)
        controls.confirm()
        await asyncio.wait_for(task, timeout=5)
        assert get_run(run_id).status == "completed"
        assert not any("过期调整" in m["content"] for m in seen[-1])
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


@pytest.mark.parametrize("cancel_when", ["waiting", "plan-published", "waiting-published", "confirm-race"])
async def test_cancel_during_plan_gate(tmp_path, monkeypatch, cancel_when):
    """Cancellation wakes the gate, including cancellation racing publication or confirmation."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    seen = script_llm(monkeypatch, [{"plan": ["检索"]}, {"final": "禁止成稿"}])
    spies = execution_spies(monkeypatch)

    def on_event(event):
        if (cancel_when, event.get("kind")) in {("plan-published", "plan"), ("waiting-published", "waiting")}:
            controls.cancel()

    task, waiting, events_log = start_gated_run(run_id, controls, on_event=on_event)
    try:
        if cancel_when in {"waiting", "confirm-race"}:
            await asyncio.wait_for(waiting.wait(), timeout=5)
            if cancel_when == "confirm-race":
                controls.confirm()
            controls.cancel()
        await asyncio.wait_for(task, timeout=5)
        assert get_run(run_id).status == "cancelled"
        assert len(seen) == 1
        assert_no_execution(run_id, events_log, spies)
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


@pytest.mark.parametrize("action", [
    {"tool": "export_artifact", "args": {"name": "blocked.txt", "content": "禁止写入"}},
    {"final": "禁止成稿"},
    {"plan": []},
    {"plan": ["检索"], "tool": "write_note"},
])
async def test_exhausted_planning_fails_closed(tmp_path, monkeypatch, action):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    monkeypatch.setattr(agent_loop, "MAX_STEPS", 3)
    seen = script_llm(monkeypatch, [action] * 3)
    spies = execution_spies(monkeypatch)
    events_log: list[dict] = []
    await agent_loop.execute_run(
        run_id, "调研", None, events_log.append, lambda: False, controls=controls, review=True,
    )
    assert len(seen) == 3
    run = get_run(run_id)
    assert run.status == "failed" and run.completed_at
    assert_no_execution(run_id, events_log, spies)
    assert not any(e.get("kind") in {"waiting", "plan"} for e in events_log)
    assert any("规划步数已耗尽" in e.get("message", "") for e in events_log)
    emitted_steps = [
        {key: value for key, value in event.items() if key != "type"}
        for event in events_log if event.get("type") == "step"
    ]
    assert json.loads(run.audit_log_json) == emitted_steps


async def test_token_budget_exhausted_before_approval_fails_closed(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    complete = AsyncMock(side_effect=agent_loop.TokenBudgetExceeded(used=101, limit=100))
    monkeypatch.setattr(agent_loop, "_complete", complete)
    spies = execution_spies(monkeypatch)
    events_log: list[dict] = []
    await agent_loop.execute_run(
        run_id, "调研", None, events_log.append, lambda: False, controls=controls, review=True,
    )
    complete.assert_awaited_once()
    assert get_run(run_id).status == "failed"
    assert_no_execution(run_id, events_log, spies)
    assert any("token 预算硬闸" in e.get("message", "") for e in events_log)


async def test_last_planning_step_waits_before_wrap_up(tmp_path, monkeypatch):
    """A valid plan on the last step still needs approval before the wrap-up path."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    monkeypatch.setattr(agent_loop, "MAX_STEPS", 1)
    seen = script_llm(monkeypatch, [{"plan": ["检索"]}, {"final": "阶段性结论"}])
    dispatch = AsyncMock()
    monkeypatch.setattr(agent_loop, "_dispatch_tool", dispatch)
    task, waiting, events_log = start_gated_run(run_id, controls)
    try:
        await asyncio.wait_for(waiting.wait(), timeout=5)
        done, _pending = await asyncio.wait({task}, timeout=0.05)
        assert not done and len(seen) == 1
        assert get_run(run_id).status == "waiting_confirm"
        assert_no_execution(run_id, events_log, [dispatch])
        controls.confirm()
        await asyncio.wait_for(task, timeout=5)
        assert len(seen) == 2
        assert "已达到最大工具步数" in seen[1][-1]["content"]
        assert get_run(run_id).output_text == "阶段性结论"
        assert get_run(run_id).status == "completed"
        dispatch.assert_not_awaited()
    finally:
        controls.cancel()
        await asyncio.wait_for(task, timeout=5)


# ---------- 计划检查点：重启后人工确认，绝不重放 ----------


async def crash_after_plan(task: asyncio.Task, run_id: str) -> None:
    registry.finish_run(run_id)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def wait_for_status(run_id: str, expected: str, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if get_run(run_id).status == expected:
            return
        await asyncio.sleep(0.02)
    current = get_run(run_id)
    raise AssertionError(f"run did not reach {expected}: {current.status}; {current.audit_log_json[-700:]}")


async def test_plan_checkpoint_survives_restart_and_resumes_once(tmp_path, monkeypatch):
    """A validated pre-tool wait survives startup; approval resumes once, no tool replay."""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.register_run(run_id)
    controls.confirm_plan = True
    seen = script_llm(monkeypatch, [{"thought": "先规划", "plan": ["检索", "成稿"]}])
    task, waiting, _events = start_gated_run(run_id, controls)
    await asyncio.wait_for(waiting.wait(), timeout=5)
    waiting_run = get_run(run_id)
    assert waiting_run.status == "waiting_confirm"
    assert waiting_run.checkpoint_json != "{}"
    assert [entry["kind"] for entry in json.loads(waiting_run.audit_log_json)] == ["thought", "plan", "waiting"]
    await crash_after_plan(task, run_id)

    assert registry.mark_stale_runs_failed() == 0
    assert get_run(run_id).status == "waiting_confirm"

    release = asyncio.Event()
    resumed_messages: list[list[dict]] = []

    async def resumed_complete(messages):
        resumed_messages.append([dict(message) for message in messages])
        await release.wait()
        return json.dumps({"final": "重启后恢复的成稿。[^none]"})

    monkeypatch.setattr(agent_loop, "_complete", resumed_complete)
    dispatch = AsyncMock()
    monkeypatch.setattr(agent_loop, "_dispatch_tool", dispatch)

    assert await confirm_run(run_id, ConfirmBody(adjustment="  仅纳入有原文的研究  ")) == {
        "runId": run_id, "status": "running",
    }
    with pytest.raises(HTTPException) as conflict:
        await confirm_run(run_id, ConfirmBody())
    assert conflict.value.status_code == 409
    release.set()
    await wait_for_status(run_id, "completed")

    assert len(resumed_messages) == 1 and len(seen) == 1
    dispatch.assert_not_awaited()
    assert any("仅纳入有原文的研究" in m["content"] for m in resumed_messages[0] if m["role"] == "user")
    assert not any("观察结果" in m["content"] for m in resumed_messages[0])
    run = get_run(run_id)
    assert run.status == "completed" and run.output_text == "重启后恢复的成稿。[^none]"
    assert run.checkpoint_json == "{}"
    audit = json.loads(run.audit_log_json)
    assert not any(entry["kind"] in {"tool", "observation"} for entry in audit)
    payload = api_get_run(run_id)
    assert not any("checkpoint" in key.lower() for key in payload)


async def test_malformed_plan_checkpoint_never_resumes(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    script_llm(monkeypatch, [{"plan": ["检索"]}])
    task, waiting, _events = start_gated_run(run_id, controls)
    await asyncio.wait_for(waiting.wait(), timeout=5)
    await crash_after_plan(task, run_id)
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        run.checkpoint_json = json.dumps({"version": 1})
        session.add(run)
        session.commit()

    complete = AsyncMock()
    monkeypatch.setattr(agent_loop, "_complete", complete)
    with pytest.raises(HTTPException) as rejected:
        await confirm_run(run_id, ConfirmBody())
    assert rejected.value.status_code == 409
    assert get_run(run_id).status == "waiting_confirm"
    complete.assert_not_awaited()

    assert registry.mark_stale_runs_failed() == 1
    failed = get_run(run_id)
    assert failed.status == "failed" and failed.checkpoint_json == "{}"
    assert "无法安全恢复" in failed.output_text


def test_restart_marks_unanswered_tool_outcome_unknown(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        run.audit_log_json = json.dumps([
            {"step": 1, "kind": "tool", "ts": "2026-01-01T00:00:00", "tool": "search_library", "args": {}},
            {"step": 1, "kind": "observation", "ts": "2026-01-01T00:00:01", "tool": "search_library", "result": []},
            {"step": 2, "kind": "tool", "ts": "2026-01-01T00:00:02", "tool": "write_note", "args": {"title": "草稿"}},
        ], ensure_ascii=False)
        session.add(run)
        session.commit()

    assert registry.mark_stale_runs_failed() == 1
    run = get_run(run_id)
    audit = json.loads(run.audit_log_json)
    assert run.status == "failed" and run.checkpoint_json == "{}"
    assert [entry["kind"] for entry in audit] == ["tool", "observation", "tool", "error"]
    assert audit[-1]["step"] == 2
    assert "write_note" in audit[-1]["message"] and "执行状态未知" in audit[-1]["message"]
    assert "search_library" not in audit[-1]["message"]
    assert registry.mark_stale_runs_failed() == 0
    assert json.loads(get_run(run_id).audit_log_json) == audit
    assert api_get_run(run_id)["auditLog"] == audit


def test_restart_keeps_completed_tool_outcome(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        run.audit_log_json = json.dumps([
            {"step": 1, "kind": "tool", "ts": "2026-01-01T00:00:00", "tool": "write_note", "args": {}},
            {"step": 1, "kind": "observation", "ts": "2026-01-01T00:00:01", "tool": "write_note", "result": {"saved": True}},
        ])
        session.add(run)
        session.commit()

    assert registry.mark_stale_runs_failed() == 1
    audit = json.loads(get_run(run_id).audit_log_json)
    assert [entry["kind"] for entry in audit] == ["tool", "observation"]


async def test_tool_tainted_plan_checkpoint_is_rejected_not_replayed(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    controls.confirm_plan = True
    script_llm(monkeypatch, [{"plan": ["检索"]}])
    task, waiting, _events = start_gated_run(run_id, controls)
    await asyncio.wait_for(waiting.wait(), timeout=5)
    await crash_after_plan(task, run_id)
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        audit = json.loads(run.audit_log_json)
        audit.append({"step": 1, "kind": "tool", "ts": "2026-01-01T00:00:00", "tool": "search_library", "args": {}})
        run.audit_log_json = json.dumps(audit)
        session.add(run)
        session.commit()

    complete = AsyncMock()
    monkeypatch.setattr(agent_loop, "_complete", complete)
    with pytest.raises(HTTPException) as rejected:
        await confirm_run(run_id, ConfirmBody())
    assert rejected.value.status_code == 409
    assert get_run(run_id).status == "waiting_confirm"
    complete.assert_not_awaited()
    assert registry.mark_stale_runs_failed() == 1
    assert get_run(run_id).status == "failed"


async def test_cancel_from_plan_wait_clears_checkpoint(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.register_run(run_id)
    controls.confirm_plan = True
    script_llm(monkeypatch, [{"plan": ["检索"]}])
    task, waiting, _events = start_gated_run(run_id, controls)
    await asyncio.wait_for(waiting.wait(), timeout=5)
    assert (await api_cancel_run(run_id))["status"] == "cancelling"
    await asyncio.wait_for(task, timeout=5)
    run = get_run(run_id)
    assert run.status == "cancelled" and run.checkpoint_json == "{}"


def test_init_db_adds_checkpoint_column_to_legacy_runs(tmp_path, monkeypatch):
    db_path = settings.get_settings().database_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE agent_runs (id TEXT PRIMARY KEY, input_text TEXT)")
        connection.commit()
    init_db()
    with sqlite3.connect(db_path) as connection:
        columns = {row[1]: row[4] for row in connection.execute("PRAGMA table_info('agent_runs')")}
        assert columns["checkpoint_json"] == "'{}'"
        connection.execute("INSERT INTO agent_runs (id, input_text) VALUES ('legacy', 'old')")
        assert connection.execute("SELECT checkpoint_json FROM agent_runs WHERE id = 'legacy'").fetchone()[0] == "{}"


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


async def test_cancel_interrupts_inflight_tool_without_observation(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    entered = asyncio.Event()
    stopped = asyncio.Event()
    events = []
    calls = 0

    async def complete(_messages):
        nonlocal calls
        calls += 1
        return json.dumps({"tool": "search_library", "args": {"query": "测试"}})

    async def slow_tool(_run_id, _project_id, _tool, _args, _record):
        entered.set()
        try:
            await asyncio.sleep(30)
            return {"count": 1}
        finally:
            stopped.set()

    monkeypatch.setattr(agent_loop, "_complete", complete)
    monkeypatch.setattr(agent_loop, "_dispatch_tool", slow_tool)
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研", None, events.append, lambda: False, controls=controls)
    )
    await asyncio.wait_for(entered.wait(), timeout=5)
    controls.cancel()
    await asyncio.wait_for(task, timeout=2)

    assert stopped.is_set()
    assert calls == 1
    assert get_run(run_id).status == "cancelled"
    assert [event["kind"] for event in events if event.get("type") == "step"] == ["tool", "error"]


async def test_completed_tool_result_survives_simultaneous_cancel(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    controls = registry.RunControls()
    events = []
    calls = 0

    async def complete(_messages):
        nonlocal calls
        calls += 1
        return json.dumps({"tool": "search_library", "args": {"query": "测试"}})

    async def completed_tool(_run_id, _project_id, _tool, _args, _record):
        controls.cancel()
        return {"count": 1}

    monkeypatch.setattr(agent_loop, "_complete", complete)
    monkeypatch.setattr(agent_loop, "_dispatch_tool", completed_tool)
    await agent_loop.execute_run(run_id, "调研", None, events.append, lambda: False, controls=controls)

    assert get_run(run_id).status == "cancelled"
    assert calls == 1
    observations = [event for event in events if event.get("kind") == "observation"]
    assert len(observations) == 1 and observations[0]["result"] == {"count": 1}
