from unittest.mock import AsyncMock

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from selenyx_backend.models import DocumentChunk, EvidenceItem, Reference, ResearchProject
from selenyx_backend.services.rag import ChunkHit


@pytest.fixture
def tool_db(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    from selenyx_backend import settings

    monkeypatch.setattr(settings, "development_env_file", lambda: tmp_path / "unused.env")
    monkeypatch.setattr(settings, "local_env_file", lambda: tmp_path / "unused.env")
    from selenyx_backend.services.agent import core

    def forbidden(*args, **kwargs):
        raise AssertionError("Core tool tests must not read settings or use the network")

    monkeypatch.setattr(core, "get_settings", forbidden)
    monkeypatch.setattr("httpx.Client.request", forbidden)
    monkeypatch.setattr("httpx.AsyncClient.request", AsyncMock(side_effect=forbidden))
    monkeypatch.setattr(core, "semantic_search", AsyncMock(side_effect=forbidden))
    monkeypatch.setattr(core, "complete", AsyncMock(side_effect=forbidden))
    engine = create_engine(f"sqlite:///{(tmp_path / 'tools.sqlite3').as_posix()}")
    SQLModel.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            session.add_all([
                Reference(id="ref-b", title="Foreign paper", year="2020"),
                Reference(id="ref-a", title="Local paper", year="2024"),
                Reference(id="shared", title="Shared paper"),
                ResearchProject(id="a", reference_ids_json='["ref-a", "shared"]'),
                ResearchProject(id="b", reference_ids_json='["ref-b", "shared"]'),
                ResearchProject(id="empty"),
                DocumentChunk(
                    id="chunk-a", reference_id="ref-a", source="pdf", page=7,
                    section="Results", char_start=100, char_end=145,
                    text="Before. The effect\n was 12%,\t not 20%. After.",
                ),
                DocumentChunk(id="chunk-b", reference_id="ref-b", text="Foreign text"),
            ])
            session.commit()
            yield core, session
    finally:
        engine.dispose()


@pytest.mark.parametrize("project_id,expected", [
    ("a", {"ref-a", "shared"}),
    ("b", {"ref-b", "shared"}),
    (None, {"ref-a", "ref-b", "shared"}),
])
async def test_reference_list_respects_scope(tool_db, project_id, expected):
    core, session = tool_db
    result = await core.run_tool(session, project_id, "list_references", {})
    assert {item["id"] for item in result["references"]} == expected
    assert result["count"] == len(expected)


async def test_reference_limit_applies_after_project_filter(tool_db):
    core, session = tool_db
    result = await core.run_tool(session, "a", "list_references", {"limit": 1})
    assert result["count"] == 1
    assert result["references"][0]["id"] in {"ref-a", "shared"}


@pytest.mark.parametrize("project_id", ["missing", ""])
@pytest.mark.parametrize("tool", ["list_references", "search_library"])
async def test_missing_project_does_not_read_global_library(tool_db, project_id, tool):
    core, session = tool_db
    result = await core.run_tool(session, project_id, tool, {"query": "effect"})
    assert "项目不存在" in result["error"]
    core.semantic_search.assert_not_called()


@pytest.mark.parametrize("raw_ids", ["[]", "", "null", "{}", '"ref-a"', "invalid json"])
async def test_empty_or_invalid_membership_does_not_read_global_library(tool_db, raw_ids):
    core, session = tool_db
    project = session.get(ResearchProject, "empty")
    project.reference_ids_json = raw_ids
    session.add(project)
    session.commit()
    refs = await core.run_tool(session, "empty", "list_references", {})
    hits = await core.run_tool(session, "empty", "search_library", {"query": "effect"})
    assert refs == {"references": [], "count": 0}
    assert hits == {"hits": [], "count": 0}
    core.semantic_search.assert_not_called()
    denied = await core.run_tool(session, "empty", "save_evidence", {
        "referenceId": "ref-a", "excerpt": "Source text",
    })
    assert "不属于当前项目" in denied["error"]
    assert session.exec(select(EvidenceItem)).all() == []


@pytest.mark.parametrize("project_id", ["a", None])
async def test_search_preserves_source_identity_and_locators(tool_db, monkeypatch, project_id):
    core, session = tool_db
    hits = [
        ChunkHit("chunk-a", "ref-a", "Local paper", "x" * 600, 7, "Results", 100, 900, 0.9, "pdf"),
        ChunkHit("chunk-b", "ref-b", "Foreign paper", "Foreign text", None, None, 0, 12, 0.8, "metadata"),
    ]
    search = AsyncMock(return_value=hits)
    monkeypatch.setattr(core, "semantic_search", search)
    result = await core.run_tool(session, project_id, "search_library", {"query": " effect ", "topK": 3})
    search.assert_awaited_once_with(session, "effect", project_id=project_id, top_k=3)
    assert result["hits"][0] == {
        "referenceId": "ref-a", "chunkId": "chunk-a", "title": "Local paper",
        "excerpt": "x" * 600, "page": 7, "section": "Results", "charStart": 100,
        "charEnd": 900, "score": 0.9, "source": "pdf",
    }
    assert result["count"] == (1 if project_id else 2)
    if project_id is None:
        assert result["hits"][1]["page"] is None
        assert result["hits"][1]["section"] is None


async def test_search_ids_round_trip_to_pending_evidence(tool_db, monkeypatch):
    core, session = tool_db
    chunk = session.get(DocumentChunk, "chunk-a")
    hit = ChunkHit(
        chunk.id, chunk.reference_id, "Local paper", chunk.text, chunk.page,
        chunk.section, chunk.char_start, chunk.char_end, 0.9, chunk.source,
    )
    monkeypatch.setattr(core, "semantic_search", AsyncMock(return_value=[hit]))
    search = await core.run_tool(session, "a", "search_library", {"query": "effect"})
    source = search["hits"][0]
    result = await core.run_tool(session, "a", "save_evidence", {
        **source, "claim": "A claim still requiring human review",
        "excerpt": "The effect was 12%, not 20%.", "status": "accepted", "review": "accepted",
    })
    assert result["saved"] is True
    assert result["status"] == "pending"
    assert result["excerptVerification"] == "matched_chunk_text"
    session.expire_all()
    item = session.get(EvidenceItem, result["evidenceId"])
    assert item.project_id == "a"
    assert item.reference_id == source["referenceId"]
    assert item.chunk_id == source["chunkId"]
    assert item.page == source["page"]
    assert item.anchor_id is None
    assert item.status == item.review == "pending"
    assert item.excerpt == "The effect was 12%, not 20%."
    assert (await core.run_tool(session, "a", "list_evidence", {}))["count"] == 0
    listed = await core.run_tool(session, "a", "list_evidence", {"acceptedOnly": False})
    pending = await core.run_tool(session, "a", "list_pending_evidence", {})
    for card in (listed["evidence"][0], pending["pending"][0]):
        assert card["id"] == item.id
        assert card["referenceId"] == "ref-a"
        assert card["chunkId"] == "chunk-a"
        assert card["page"] == 7
        assert card["anchorId"] is None


@pytest.mark.parametrize("project_id,error", [
    (None, "未关联项目"), ("", "未关联项目"), ("missing", "项目不存在"),
])
async def test_save_requires_existing_project(tool_db, project_id, error):
    core, session = tool_db
    result = await core.run_tool(session, project_id, "save_evidence", {"excerpt": "text"})
    assert error in result["error"]
    assert session.exec(select(EvidenceItem)).all() == []


@pytest.mark.parametrize("reference_id,error", [
    ("ref-b", "不属于当前项目"), ("invented", "文献不存在"),
])
async def test_save_rejects_foreign_or_unknown_reference(tool_db, reference_id, error):
    core, session = tool_db
    result = await core.run_tool(session, "a", "save_evidence", {
        "referenceId": reference_id, "excerpt": "text",
    })
    assert error in result["error"]
    assert session.exec(select(EvidenceItem)).all() == []


@pytest.mark.parametrize("args,error", [
    ({"chunkId": "missing"}, "文本块不存在"),
    ({"chunkId": "chunk-b"}, "不属于该文献"),
    ({"referenceId": None}, "chunkId 必须同时提供 referenceId"),
    ({"excerpt": "The effect was 20%, not 12%."}, "excerpt 与文本块原文不匹配"),
    ({"excerpt": "the effect was 12%, not 20%."}, "excerpt 与文本块原文不匹配"),
    ({"excerpt": "Theeffectwas12%,not20%."}, "excerpt 与文本块原文不匹配"),
    ({"excerpt": "The effect was 12% not 20%."}, "excerpt 与文本块原文不匹配"),
    ({"excerpt": "The effect was 12%, …"}, "excerpt 与文本块原文不匹配"),
    ({"excerpt": " \n\t "}, "excerpt 不能为空"),
    ({"excerpt": None}, "excerpt 不能为空"),
    ({"page": 99}, "page 与文本块页码不匹配"),
])
async def test_save_rejects_invalid_chunk_link_or_excerpt(tool_db, args, error):
    core, session = tool_db
    result = await core.run_tool(session, "a", "save_evidence", {
        "referenceId": "ref-a", "chunkId": "chunk-a",
        "excerpt": "The effect was 12%, not 20%.", **args,
    })
    assert error in result["error"]
    assert session.exec(select(EvidenceItem)).all() == []


async def test_valid_chunk_supplies_real_page_without_inventing_anchor(tool_db):
    core, session = tool_db
    result = await core.run_tool(session, "a", "save_evidence", {
        "referenceId": "ref-a", "chunkId": "chunk-a", "excerpt": "The effect was 12%, not 20%.",
    })
    item = session.get(EvidenceItem, result["evidenceId"])
    assert item.page == 7
    assert item.anchor_id is None
    assert item.status == item.review == "pending"


@pytest.mark.parametrize("reference_id", [None, "", "ref-a", "shared"])
async def test_save_without_chunk_stays_explicitly_unverified(tool_db, reference_id):
    core, session = tool_db
    result = await core.run_tool(session, "a", "save_evidence", {
        "referenceId": reference_id, "chunkId": None, "excerpt": "Unverified source text",
    })
    assert result["saved"] is True
    assert result["excerptVerification"] == "unverified"
    item = session.get(EvidenceItem, result["evidenceId"])
    assert item.reference_id == (reference_id or "")
    assert item.chunk_id is None and item.anchor_id is None and item.page is None
    assert item.status == item.review == "pending"


async def test_excerpt_validation_checks_entire_input_before_storage_limit(tool_db):
    core, session = tool_db
    chunk = session.get(DocumentChunk, "chunk-a")
    chunk.text = "x" * 2100
    session.add(chunk)
    session.commit()
    args = {"referenceId": "ref-a", "chunkId": "chunk-a", "excerpt": chunk.text + "fabricated"}
    rejected = await core.run_tool(session, "a", "save_evidence", args)
    assert "excerpt 与文本块原文不匹配" in rejected["error"]
    args["excerpt"] = chunk.text
    saved = await core.run_tool(session, "a", "save_evidence", args)
    item = session.get(EvidenceItem, saved["evidenceId"])
    assert item.excerpt == "x" * 2000


async def test_evidence_list_retains_ids_locators_and_acceptance_filters(tool_db):
    core, session = tool_db
    session.add_all([
        EvidenceItem(id="accepted", project_id="a", reference_id="ref-a", chunk_id="chunk-a",
                     page=7, anchor_id="existing-anchor", claim="Claim", excerpt="Excerpt",
                     status="accepted", review="accepted"),
        EvidenceItem(id="pending", project_id="a"),
        EvidenceItem(id="status-only", project_id="a", status="accepted", review="pending"),
        EvidenceItem(id="review-only", project_id="a", status="pending", review="accepted"),
        EvidenceItem(id="foreign", project_id="b", status="accepted", review="accepted"),
    ])
    session.commit()
    result = await core.run_tool(session, "a", "list_evidence", {})
    assert result["count"] == 1
    card = result["evidence"][0]
    assert card["id"] == "accepted"
    assert card["referenceId"] == "ref-a"
    assert card["chunkId"] == "chunk-a"
    assert card["page"] == 7
    assert card["anchorId"] == "existing-anchor"
    all_cards = await core.run_tool(session, "a", "list_evidence", {"acceptedOnly": False})
    assert {card["id"] for card in all_cards["evidence"]} == {
        "accepted", "pending", "status-only", "review-only",
    }
    assert (await core.run_tool(session, "empty", "list_evidence", {}))["count"] == 0
    assert (await core.run_tool(session, "missing", "list_evidence", {}))["count"] == 0
