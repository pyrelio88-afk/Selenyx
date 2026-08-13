"""成稿证据标记校验测试（V4 模块 C：防编造引用 + 覆盖率统计）。"""

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import EvidenceItem, ResearchProject
from selenyx_backend.services.citations import (
    analyze_citations,
    extract_evidence_refs,
    rejection_message,
)
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def seed() -> tuple[str, str, str]:
    """返回 (project_id, accepted_evidence_id, pending_evidence_id)。"""
    with Session(get_engine()) as session:
        project = ResearchProject(name="谵妄预防", current_stage="evidence")
        session.add(project)
        session.commit()
        session.refresh(project)
        accepted = EvidenceItem(
            project_id=project.id, reference_id="r1",
            claim="集束化护理降低谵妄发生率", excerpt="ABCDE 集束…", review="accepted", status="accepted",
        )
        pending = EvidenceItem(
            project_id=project.id, reference_id="r2",
            claim="夜间光照与谵妄相关", excerpt="光照试验…", review="pending",
        )
        session.add(accepted)
        session.add(pending)
        session.commit()
        session.refresh(accepted)
        session.refresh(pending)
        return project.id, accepted.id, pending.id


def test_extract_refs_dedupes_and_keeps_order(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    text = "甲[^e:e1]。乙[^e:e2]；丙[^e:e1]。[^none]"
    assert extract_evidence_refs(text) == ["e1", "e2"]


def test_fabricated_ref_is_rejected(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, accepted_id, _ = seed()
    text = f"有效引用[^e:{accepted_id}]。编造引用[^e:ghost-999]。"
    with Session(get_engine()) as session:
        report = analyze_citations(session, project_id, text)
    assert not report.ok
    assert report.invalid_ids == ["ghost-999"]
    assert "ghost-999" in rejection_message(report)


def test_foreign_project_ref_is_rejected(tmp_path, monkeypatch):
    """引用别项目证据同样算编造（防跨项目串供）。"""
    reset_backend(tmp_path, monkeypatch)
    _, accepted_id, _ = seed()  # 属于第一个项目
    with Session(get_engine()) as session:
        other = ResearchProject(name="另一个项目", current_stage="draft")
        session.add(other)
        session.commit()
        session.refresh(other)
        report = analyze_citations(session, other.id, f"串供[^e:{accepted_id}]。")
    assert report.invalid_ids == [accepted_id]


def test_projectless_ref_is_rejected_without_library_fallback(tmp_path, monkeypatch):
    """No project scope may never resolve an otherwise accepted local card."""
    reset_backend(tmp_path, monkeypatch)
    _, accepted_id, _ = seed()
    with Session(get_engine()) as session:
        report = analyze_citations(session, None, f"无项目引用[^e:{accepted_id}]。")
    assert not report.ok
    assert report.invalid_ids == [accepted_id]


def test_rejected_ref_is_rejected(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, _, _ = seed()
    with Session(get_engine()) as session:
        rejected = EvidenceItem(
            project_id=project_id,
            reference_id="r3",
            claim="已驳回",
            excerpt="不应进入成稿",
            review="rejected",
            status="rejected",
        )
        session.add(rejected)
        session.commit()
        session.refresh(rejected)
        report = analyze_citations(session, project_id, f"已驳回卡[^e:{rejected.id}]。")
    assert not report.ok
    assert report.invalid_ids == [rejected.id]


def test_coverage_stats(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id, accepted_id, pending_id = seed()
    text = (
        f"集束化护理有效[^e:{accepted_id}]。\n"
        f"光照或相关[^e:{pending_id}]。\n"
        "这是无据断言[^none]。\n"
        "本句无标记不计入。"
    )
    with Session(get_engine()) as session:
        report = analyze_citations(session, project_id, text)
    assert not report.ok
    assert report.invalid_ids == [pending_id]
    assert report.sentences == 3
    assert report.supported == 1
    assert report.fully_accepted == 1  # 仅 accepted 证据的句子
    assert report.unsourced == 1
    assert abs(report.coverage - 1 / 3) < 1e-9
