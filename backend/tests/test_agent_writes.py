"""V4 模块 B+C：agent 写工具（笔记/工件落盘）与成稿染色校验的循环接线测试。"""

import json

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, EvidenceItem, ResearchProject
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def seed_project_with_evidence() -> tuple[str, str]:
    with Session(get_engine()) as session:
        project = ResearchProject(name="谵妄预防", current_stage="evidence")
        session.add(project)
        session.commit()
        session.refresh(project)
        evidence = EvidenceItem(
            id="ev-real-1",
            project_id=project.id,
            reference_id="r1",
            claim="集束化护理降低谵妄发生率",
            excerpt="ABCDE 集束…",
            review="accepted",
            status="accepted",
        )
        session.add(evidence)
        session.commit()
        return project.id, evidence.id


def make_run(goal: str, project_id: str) -> str:
    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="agent-loop", project_id=project_id, status="running", input_text=goal)
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id


def script_llm(monkeypatch, replies: list[str]) -> None:
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        reply = replies[min(calls, len(replies) - 1)]
        calls += 1
        return reply

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)


def get_run(run_id: str) -> AgentRun:
    with Session(get_engine()) as session:
        return session.get(AgentRun, run_id)


async def test_write_tools_persist_artifacts(tmp_path, monkeypatch):
    """write_note/export_artifact 落盘并登记 artifacts_json，时间线可见。"""
    reset_backend(tmp_path, monkeypatch)
    project_id, evidence_id = seed_project_with_evidence()
    run_id = make_run("写小结", project_id)
    script_llm(monkeypatch, [
        json.dumps({"thought": "写笔记", "tool": "write_note", "args": {"title": "谵妄小结", "content": "正文内容"}}),
        json.dumps({"thought": "导工件", "tool": "export_artifact", "args": {"name": "summary.md", "content": "成稿内容"}}),
        json.dumps({"thought": "收尾", "final": f"集束化护理有效[^e:{evidence_id}]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写小结", project_id, events.append, lambda: False)

    run = get_run(run_id)
    artifacts = json.loads(run.artifacts_json)
    kinds = {a["kind"] for a in artifacts}
    assert kinds == {"note", "artifact"}
    # 文件真实落盘
    note = next(a for a in artifacts if a["kind"] == "note")
    assert (tmp_path / "notes" / note["name"]).read_text(encoding="utf-8").startswith("# 谵妄小结")
    artifact = next(a for a in artifacts if a["kind"] == "artifact")
    assert (tmp_path / artifact["path"]).read_text(encoding="utf-8") == "成稿内容"
    # 有效引用 → 覆盖率入审计，无打回
    coverage = [e for e in events if e.get("kind") == "coverage"]
    assert coverage and coverage[-1]["supported"] == 1 and coverage[-1]["fullyAccepted"] == 1
    assert not [e for e in events if e.get("kind") == "review"]
    assert run.status == "completed"


async def test_fabricated_citation_bounced_once(tmp_path, monkeypatch):
    """编造 [^e:id] 被打回修订一次，修订稿通过后正常收尾。"""
    reset_backend(tmp_path, monkeypatch)
    project_id, evidence_id = seed_project_with_evidence()
    run_id = make_run("写结论", project_id)
    script_llm(monkeypatch, [
        json.dumps({"thought": "成稿", "final": "有效性已证实[^e:ghost-9]。"}),
        json.dumps({"thought": "修订", "final": f"有效性已证实[^e:{evidence_id}]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写结论", project_id, events.append, lambda: False)

    gate = [e for e in events if e.get("kind") == "review" and e.get("critic") == "证据门校验"]
    assert len(gate) == 1 and "ghost-9" in gate[0]["text"]
    run = get_run(run_id)
    assert run.status == "completed"
    assert f"[^e:{evidence_id}]" in run.output_text


async def test_double_fabrication_recorded_not_looping(tmp_path, monkeypatch):
    """二次仍编造：不再打回（防死循环），审计存证，run 照常收尾。"""
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    run_id = make_run("写结论", project_id)
    script_llm(monkeypatch, [
        json.dumps({"final": "结论A[^e:ghost-1]。"}),
        json.dumps({"final": "结论B[^e:ghost-2]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写结论", project_id, events.append, lambda: False)

    run = get_run(run_id)
    assert run.status == "completed"  # 没有死循环
    errors = [e for e in events if e.get("kind") == "error" and "ghost-2" in e.get("message", "")]
    assert errors
