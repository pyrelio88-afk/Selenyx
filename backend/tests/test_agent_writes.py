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
        json.dumps({"thought": "写笔记", "tool": "write_note", "args": {"title": "谵妄小结", "content": f"正文内容[^e:{evidence_id}]。"}}),
        json.dumps({"thought": "导工件", "tool": "export_artifact", "args": {"name": "summary.md", "content": "成稿内容[^none]。"}}),
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
    note_text = (tmp_path / "notes" / note["name"]).read_text(encoding="utf-8")
    assert note_text.startswith("# 谵妄小结")
    assert f"[^e:{evidence_id}]" in note_text
    assert "## 证据附录" in note_text
    assert "论断：集束化护理降低谵妄发生率" in note_text
    artifact = next(a for a in artifacts if a["kind"] == "artifact")
    assert (tmp_path / artifact["path"]).read_text(encoding="utf-8") == "成稿内容[^none]。"
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
    """A second invalid draft is terminal and never persists as final output."""
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
    assert run.status == "failed"
    assert run.output_text == ""
    errors = [e for e in events if e.get("kind") == "error" and "ghost-2" in e.get("message", "")]
    assert errors
    assert not [e for e in events if e.get("kind") == "final"]


async def test_markerless_research_final_gets_one_repair_then_fails_closed(tmp_path, monkeypatch):
    """A factual project draft cannot bypass coverage by omitting all markers."""
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    run_id = make_run("写研究结论", project_id)
    script_llm(monkeypatch, [
        json.dumps({"final": "集束化护理可以降低谵妄发生率。"}),
        json.dumps({"final": "集束化护理可以降低谵妄发生率。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写研究结论", project_id, events.append, lambda: False)

    coverage = [event for event in events if event.get("kind") == "coverage"]
    assert len(coverage) == 2
    assert all(event["missingCitationMarkers"] is True for event in coverage)
    assert len([event for event in events if event.get("kind") == "review" and event.get("critic") == "证据门校验"]) == 1
    run = get_run(run_id)
    assert run.status == "failed" and run.output_text == ""
    assert any("缺少证据标记" in event.get("message", "") for event in events if event.get("kind") == "error")
    assert not [event for event in events if event.get("kind") == "final"]


async def test_markerless_export_artifact_returns_explicit_repair_observation(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    run_id = make_run("导出研究成稿", project_id)
    script_llm(monkeypatch, [
        json.dumps({"tool": "export_artifact", "args": {
            "name": "unmarked.md", "content": "集束化护理可以降低谵妄发生率。",
        }}),
        json.dumps({"final": "当前尚无可引用结论[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "导出研究成稿", project_id, events.append, lambda: False)

    observation = next(event["result"] for event in events if event.get("kind") == "observation")
    assert observation["invalidEvidenceIds"] == []
    assert observation["invalidEvidence"] == []
    assert observation["missingCitationMarkers"] is True
    assert "缺少证据标记" in observation["error"]
    assert json.loads(get_run(run_id).artifacts_json) == []
    assert not (tmp_path / "artifacts" / "runs" / run_id).exists()


async def test_markerless_write_note_returns_explicit_repair_observation(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    run_id = make_run("写研究笔记", project_id)
    script_llm(monkeypatch, [
        json.dumps({"tool": "write_note", "args": {
            "title": "未标注", "content": "集束化护理可以降低谵妄发生率。",
        }}),
        json.dumps({"final": "当前尚无可引用结论[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写研究笔记", project_id, events.append, lambda: False)

    observation = next(event["result"] for event in events if event.get("kind") == "observation")
    assert observation["invalidEvidenceIds"] == []
    assert observation["invalidEvidence"] == []
    assert observation["missingCitationMarkers"] is True
    assert "缺少证据标记" in observation["error"]
    assert json.loads(get_run(run_id).artifacts_json) == []
    assert not (tmp_path / "notes").exists()


async def test_none_marker_allows_research_final_and_writing_tools(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    run_id = make_run("整理研究写作", project_id)
    script_llm(monkeypatch, [
        json.dumps({"tool": "write_note", "args": {
            "title": "不确定性", "content": "当前尚无可接受证据[^none]。",
        }}),
        json.dumps({"tool": "export_artifact", "args": {
            "name": "uncertain.md", "content": "当前尚无可接受证据[^none]。",
        }}),
        json.dumps({"final": "当前尚无可接受证据[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "整理研究写作", project_id, events.append, lambda: False)

    run = get_run(run_id)
    assert run.status == "completed"
    assert run.output_text == "当前尚无可接受证据[^none]。"
    assert {item["kind"] for item in json.loads(run.artifacts_json)} == {"note", "artifact"}
    assert not [
        event for event in events
        if event.get("kind") == "observation" and event.get("result", {}).get("missingCitationMarkers")
    ]


async def test_export_artifact_rejects_pending_and_foreign_evidence(tmp_path, monkeypatch):
    """Tool exports use the same project-scoped accepted-evidence gate as final drafts."""
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    with Session(get_engine()) as session:
        foreign_project = ResearchProject(name="另一个项目")
        session.add(foreign_project)
        session.commit()
        session.refresh(foreign_project)
        pending = EvidenceItem(
            id="ev-pending-export",
            project_id=project_id,
            reference_id="r1",
            claim="待裁决",
            excerpt="原文",
            review="pending",
            status="pending",
        )
        foreign = EvidenceItem(
            id="ev-foreign-export",
            project_id=foreign_project.id,
            reference_id="r2",
            claim="别的项目",
            excerpt="原文",
            review="accepted",
            status="accepted",
        )
        session.add(pending)
        session.add(foreign)
        session.commit()
        pending_id = pending.id
        foreign_id = foreign.id

    run_id = make_run("导出受证据门保护的成稿", project_id)
    script_llm(monkeypatch, [
        json.dumps({"tool": "export_artifact", "args": {"name": "pending.md", "content": f"待裁决[^e:{pending_id}]。"}}),
        json.dumps({"tool": "export_artifact", "args": {"name": "foreign.md", "content": f"跨项目[^e:{foreign_id}]。"}}),
        json.dumps({"final": "未引用证据的说明[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "导出受证据门保护的成稿", project_id, events.append, lambda: False)

    observations = [e["result"] for e in events if e.get("kind") == "observation"]
    assert [item["invalidEvidenceIds"] for item in observations] == [[pending_id], [foreign_id]]
    assert all("证据门拒绝导出" in item["error"] for item in observations)
    run = get_run(run_id)
    assert run.status == "completed"
    assert json.loads(run.artifacts_json) == []
    assert not (tmp_path / "artifacts" / "runs" / run_id).exists()


async def test_export_artifact_rejects_projectless_evidence_reference(tmp_path, monkeypatch):
    """A run without a project cannot turn a library-wide card into an export."""
    reset_backend(tmp_path, monkeypatch)
    _project_id, evidence_id = seed_project_with_evidence()
    run_id = make_run("无项目导出", "")
    script_llm(monkeypatch, [
        json.dumps({"tool": "export_artifact", "args": {
            "name": "unscoped.md",
            "content": f"无项目不能引用[^e:{evidence_id}]。",
        }}),
        json.dumps({"final": "没有证据引用的说明[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "无项目导出", None, events.append, lambda: False)

    observation = next(e["result"] for e in events if e.get("kind") == "observation")
    assert observation["invalidEvidenceIds"] == [evidence_id]
    assert "证据门拒绝导出" in observation["error"]
    assert get_run(run_id).status == "completed"
    assert not (tmp_path / "artifacts" / "runs" / run_id).exists()


async def test_write_note_rejects_pending_and_foreign_evidence(tmp_path, monkeypatch):
    """Citation-bearing notes cannot bypass the export evidence gate."""
    reset_backend(tmp_path, monkeypatch)
    project_id, _ = seed_project_with_evidence()
    with Session(get_engine()) as session:
        foreign_project = ResearchProject(name="另一个项目")
        session.add(foreign_project)
        session.commit()
        session.refresh(foreign_project)
        pending = EvidenceItem(
            id="ev-pending-note",
            project_id=project_id,
            reference_id="r1",
            claim="待裁决",
            excerpt="原文",
            review="pending",
            status="pending",
        )
        foreign = EvidenceItem(
            id="ev-foreign-note",
            project_id=foreign_project.id,
            reference_id="r2",
            claim="别的项目",
            excerpt="原文",
            review="accepted",
            status="accepted",
        )
        session.add(pending)
        session.add(foreign)
        session.commit()
        pending_id = pending.id
        foreign_id = foreign.id

    run_id = make_run("写受证据门保护的笔记", project_id)
    script_llm(monkeypatch, [
        json.dumps({"tool": "write_note", "args": {
            "title": "pending", "content": f"待裁决[^e:{pending_id}]。",
        }}),
        json.dumps({"tool": "write_note", "args": {
            "title": "foreign", "content": f"跨项目[^e:{foreign_id}]。",
        }}),
        json.dumps({"final": "未引用证据的说明[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写受证据门保护的笔记", project_id, events.append, lambda: False)

    observations = [e["result"] for e in events if e.get("kind") == "observation"]
    assert [item["invalidEvidenceIds"] for item in observations] == [[pending_id], [foreign_id]]
    assert all("证据门拒绝写入笔记" in item["error"] for item in observations)
    assert json.loads(get_run(run_id).artifacts_json) == []
    assert not (tmp_path / "notes").exists()


async def test_write_note_rejects_projectless_evidence_reference(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    _project_id, evidence_id = seed_project_with_evidence()
    run_id = make_run("无项目笔记", "")
    script_llm(monkeypatch, [
        json.dumps({"tool": "write_note", "args": {
            "title": "unscoped", "content": f"无项目不能引用[^e:{evidence_id}]。",
        }}),
        json.dumps({"final": "没有证据引用的说明[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "无项目笔记", None, events.append, lambda: False)

    observation = next(e["result"] for e in events if e.get("kind") == "observation")
    assert observation["invalidEvidenceIds"] == [evidence_id]
    assert "证据门拒绝写入笔记" in observation["error"]
    assert json.loads(get_run(run_id).artifacts_json) == []
    assert not (tmp_path / "notes").exists()
