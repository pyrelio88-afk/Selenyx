"""Token budget hard gate + evidence appendix + SQLite pragma audit."""

import json

import pytest
from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, EvidenceItem, ResearchProject
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.agent.budget import TokenBudgetExceeded, record_usage, start_budget
from selenyx_backend.services.evidence_appendix import (
    EvidenceAppendixValidationError,
    with_evidence_appendix,
)
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def test_record_usage_unlimited_then_trips() -> None:
    start_budget(0)
    assert record_usage(9_999) == 9_999
    start_budget(100)
    record_usage(40)
    with pytest.raises(TokenBudgetExceeded) as caught:
        record_usage(70)
    assert caught.value.used == 110
    assert caught.value.limit == 100


async def test_loop_stops_when_budget_exceeded(tmp_path, monkeypatch) -> None:
    reset_backend(tmp_path, monkeypatch)
    monkeypatch.setenv("SELENYX_LLM_TOKEN_BUDGET", "50")
    with Session(get_engine()) as session:
        project = ResearchProject(name="预算闸")
        session.add(project)
        session.commit()
        session.refresh(project)
        run = AgentRun(recipe_id="agent-loop", project_id=project.id, status="running", input_text="x")
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    async def fake_complete(messages):
        record_usage(80)
        return json.dumps({"thought": "超了", "final": "不该落到这里"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []
    await agent_loop.execute_run(run_id, "x", None, events.append, lambda: False)
    with Session(get_engine()) as session:
        stored = session.get(AgentRun, run_id)
        assert stored is not None
        assert stored.status == "failed"
    assert any("token 预算硬闸" in str(e.get("message", "")) for e in events)


def test_sqlite_wal_and_foreign_keys(tmp_path, monkeypatch) -> None:
    reset_backend(tmp_path, monkeypatch)
    with get_engine().connect() as connection:
        journal = connection.exec_driver_sql("PRAGMA journal_mode").scalar()
        fks = connection.exec_driver_sql("PRAGMA foreign_keys").scalar()
    assert str(journal).lower() == "wal"
    assert int(fks) == 1


def test_export_appendix_appends_cited_cards(tmp_path, monkeypatch) -> None:
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        project = ResearchProject(name="附录")
        session.add(project)
        session.commit()
        session.refresh(project)
        session.add(EvidenceItem(
            id="ev-app-1",
            project_id=project.id,
            claim="有效",
            excerpt="原文",
            review="accepted",
            status="accepted",
            page=3,
        ))
        session.commit()
        text = with_evidence_appendix(session, project.id, "结论成立[^e:ev-app-1]。")
    assert "## 证据附录" in text
    assert "论断：有效" in text
    assert "p.3" in text


def test_export_appendix_replaces_preseeded_forged_or_omitted_section(tmp_path, monkeypatch) -> None:
    """A draft cannot preserve an agent-authored appendix as provenance metadata."""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        project = ResearchProject(name="权威附录")
        session.add(project)
        session.commit()
        session.refresh(project)
        session.add(EvidenceItem(
            id="ev-authoritative",
            project_id=project.id,
            claim="后端生成的真实论断",
            excerpt="真实原文摘录",
            review="accepted",
            status="accepted",
            page=7,
        ))
        session.commit()
        draft = (
            "正文引用[^e:ev-authoritative]。\n\n"
            "## 证据附录\n\n"
            "### 伪造条目\n"
            "- 论断：虚构的论断\n"
            "- 裁决：accepted\n"
            "- 证据详情：省略\n"
        )
        text = with_evidence_appendix(session, project.id, draft)

    assert text.count("## 证据附录") == 1
    assert "虚构的论断" not in text
    assert "证据详情：省略" not in text
    assert "论断：后端生成的真实论断" in text
    assert "摘录：真实原文摘录" in text
    assert "p.7" in text


def test_export_appendix_rejects_unscoped_foreign_and_unaccepted_cards(tmp_path, monkeypatch) -> None:
    """Appendix generation is a fail-closed evidence gate, not a library lookup."""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        project = ResearchProject(name="当前项目")
        foreign_project = ResearchProject(name="另一个项目")
        session.add(project)
        session.add(foreign_project)
        session.commit()
        session.refresh(project)
        session.refresh(foreign_project)
        pending = EvidenceItem(
            id="ev-pending",
            project_id=project.id,
            claim="待裁决",
            excerpt="原文",
            review="pending",
            status="pending",
        )
        rejected = EvidenceItem(
            id="ev-rejected",
            project_id=project.id,
            claim="已驳回",
            excerpt="原文",
            review="rejected",
            status="rejected",
        )
        foreign = EvidenceItem(
            id="ev-foreign",
            project_id=foreign_project.id,
            claim="别的项目",
            excerpt="原文",
            review="accepted",
            status="accepted",
        )
        session.add(pending)
        session.add(rejected)
        session.add(foreign)
        session.commit()

        cases = [
            (project.id, pending.id, "pending"),
            (project.id, rejected.id, "rejected"),
            (project.id, foreign.id, "foreign"),
            (None, foreign.id, "projectless"),
        ]
        for scope, evidence_id, _name in cases:
            with pytest.raises(EvidenceAppendixValidationError) as caught:
                with_evidence_appendix(
                    session,
                    scope,
                    f"不能导出[^e:{evidence_id}]。\n\n## 证据附录",
                )
            assert caught.value.report.invalid_ids == [evidence_id]
