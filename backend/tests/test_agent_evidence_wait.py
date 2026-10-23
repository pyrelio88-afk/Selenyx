"""成稿引用待裁决证据时暂停，人工接受/驳回后自动续跑。"""

import asyncio
import json
import time
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlmodel import Session

from selenyx_backend import database, settings
from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, EvidenceItem, ResearchProject
from selenyx_backend.routers.agent import cancel_run as api_cancel_run
from selenyx_backend.routers.evidence import EvidencePatch, patch_evidence
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.agent import registry
from selenyx_backend.services.rate_limit import reset_rate_limits


@pytest.fixture(autouse=True)
def isolated_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    isolated = settings.Settings.model_construct(data_dir=tmp_path)
    monkeypatch.setattr(settings, "get_settings", lambda: isolated)
    monkeypatch.setattr(database, "get_settings", lambda: isolated)
    monkeypatch.setattr(agent_loop, "_memory_digest", lambda _pid: "")
    monkeypatch.setattr(agent_loop, "agent_mcp_prompt", lambda: "")

    def unexpected_network(*args, **kwargs):
        pytest.fail("Evidence wait tests must not use a real model or network")

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


def make_project_run(goal: str = "调研证据") -> tuple[str, str]:
    with Session(get_engine()) as session:
        project = ResearchProject(name="证据等待项目", current_stage="evidence")
        session.add(project)
        session.commit()
        session.refresh(project)
        run = AgentRun(recipe_id="agent-loop", project_id=project.id, status="running", input_text=goal)
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id, project.id


def add_evidence(project_id: str, *, status: str = "pending", review: str = "pending") -> str:
    with Session(get_engine()) as session:
        item = EvidenceItem(
            project_id=project_id,
            claim="候选论断",
            excerpt="原文摘录",
            status=status,
            review=review,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item.id


def adjudicate_via_api(evidence_id: str, review: str) -> None:
    """Exercise the same PATCH contract the evidence card uses (review only)."""
    with Session(get_engine()) as session:
        patch_evidence(evidence_id, EvidencePatch(review=review), session)


def get_run(run_id: str) -> AgentRun:
    with Session(get_engine()) as session:
        return session.get(AgentRun, run_id)


async def wait_for_status(run_id: str, expected: str, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if get_run(run_id).status == expected:
            return
        await asyncio.sleep(0.01)
    current = get_run(run_id)
    raise AssertionError(f"run did not reach {expected}: {current.status}; {current.audit_log_json[-700:]}")


def script_llm(monkeypatch, replies):
    seen = []
    scripted = iter(replies)

    async def fake_complete(messages):
        seen.append([dict(message) for message in messages])
        reply = next(scripted)
        return reply if isinstance(reply, str) else json.dumps(reply)

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    return seen


async def test_pending_citation_pauses_until_human_accepts(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    monkeypatch.setattr(agent_loop, "EVIDENCE_WAIT_POLL_S", 0.01)
    run_id, project_id = make_project_run()
    evidence_id = add_evidence(project_id)
    seen = script_llm(monkeypatch, [{"thought": "成稿", "final": f"研究结论成立。[^e:{evidence_id}]"}])
    events_log: list[dict] = []
    status_at_wait_event: list[str] = []

    def on_event(event: dict) -> None:
        events_log.append(event)
        if event.get("kind") == "evidence_wait":
            status_at_wait_event.append(get_run(run_id).status)

    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研证据", project_id, on_event, lambda: False)
    )
    try:
        await wait_for_status(run_id, "waiting_evidence")
        waiting = get_run(run_id)
        assert waiting.output_text == ""
        assert len(seen) == 1
        assert status_at_wait_event == ["waiting_evidence"]
        assert any(entry.get("kind") == "evidence_wait" and evidence_id in entry.get("ids", [])
                   for entry in json.loads(waiting.audit_log_json))

        adjudicate_via_api(evidence_id, "accepted")
        with Session(get_engine()) as session:
            accepted = session.get(EvidenceItem, evidence_id)
            assert accepted.status == "accepted" and accepted.review == "accepted"
        await asyncio.wait_for(task, timeout=5)
    finally:
        if not task.done():
            task.cancel()

    run = get_run(run_id)
    assert run.status == "completed"
    assert run.output_text == f"研究结论成立。[^e:{evidence_id}]"
    assert len(seen) == 1
    kinds = [entry["kind"] for entry in json.loads(run.audit_log_json)]
    assert kinds == ["thought", "evidence_wait", "evidence_resume", "coverage", "final"]
    assert any(event.get("kind") == "evidence_resume" for event in events_log)


async def test_rejected_citation_goes_back_for_one_repair(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    monkeypatch.setattr(agent_loop, "EVIDENCE_WAIT_POLL_S", 0.01)
    run_id, project_id = make_project_run()
    evidence_id = add_evidence(project_id)
    seen = script_llm(monkeypatch, [
        {"final": f"引用待裁决证据。[^e:{evidence_id}]"},
        {"final": "保留可核对结论，其余标为无据。[^none]"},
    ])
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研证据", project_id, lambda event: None, lambda: False)
    )
    try:
        await wait_for_status(run_id, "waiting_evidence")
        adjudicate_via_api(evidence_id, "rejected")
        await asyncio.wait_for(task, timeout=5)
    finally:
        if not task.done():
            task.cancel()

    run = get_run(run_id)
    assert run.status == "completed"
    assert run.output_text == "保留可核对结论，其余标为无据。[^none]"
    assert len(seen) == 2
    assert any("未通过证据门" in message["content"] for message in seen[1] if message["role"] == "user")


async def test_cancel_interrupts_evidence_wait(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    monkeypatch.setattr(agent_loop, "EVIDENCE_WAIT_POLL_S", 0.01)
    run_id, project_id = make_project_run()
    evidence_id = add_evidence(project_id)
    script_llm(monkeypatch, [{"final": f"等待裁决。[^e:{evidence_id}]"}])
    controls = registry.register_run(run_id)
    task = asyncio.create_task(
        agent_loop.execute_run(run_id, "调研证据", project_id, lambda event: None, lambda: False, controls=controls)
    )
    try:
        await wait_for_status(run_id, "waiting_evidence")
        assert (await api_cancel_run(run_id))["status"] == "cancelling"
        await asyncio.wait_for(task, timeout=5)
    finally:
        controls.cancel()
        if not task.done():
            task.cancel()

    run = get_run(run_id)
    assert run.status == "cancelled"
    assert run.output_text == ""


async def test_unrelated_pending_evidence_does_not_block_final(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id, project_id = make_project_run()
    add_evidence(project_id)
    accepted_id = add_evidence(project_id, status="accepted", review="accepted")
    seen = script_llm(monkeypatch, [{"final": f"已接受证据支持结论。[^e:{accepted_id}]"}])
    await asyncio.wait_for(
        agent_loop.execute_run(run_id, "调研证据", project_id, lambda event: None, lambda: False),
        timeout=5,
    )
    run = get_run(run_id)
    assert run.status == "completed"
    assert len(seen) == 1
    assert not any(entry["kind"] == "evidence_wait" for entry in json.loads(run.audit_log_json))


async def test_evidence_wait_times_out_without_writing_final(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    monkeypatch.setattr(agent_loop, "EVIDENCE_WAIT_POLL_S", 0.01)
    monkeypatch.setattr(agent_loop, "EVIDENCE_WAIT_TIMEOUT_S", 0.05)
    run_id, project_id = make_project_run()
    evidence_id = add_evidence(project_id)
    script_llm(monkeypatch, [{"final": f"等待裁决。[^e:{evidence_id}]"}])
    events_log: list[dict] = []
    await asyncio.wait_for(
        agent_loop.execute_run(run_id, "调研证据", project_id, events_log.append, lambda: False),
        timeout=5,
    )
    run = get_run(run_id)
    assert run.status == "failed"
    assert run.output_text == ""
    assert any("等待证据人工裁决超时" in entry.get("message", "") for entry in events_log)


async def test_restart_fails_waiting_evidence_without_replay(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id, _project_id = make_project_run()
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        run.status = "waiting_evidence"
        session.add(run)
        session.commit()

    complete = AsyncMock()
    monkeypatch.setattr(agent_loop, "_complete", complete)
    assert registry.mark_stale_runs_failed() == 1
    failed = get_run(run_id)
    assert failed.status == "failed"
    assert "无法安全恢复" in failed.output_text
    complete.assert_not_awaited()
