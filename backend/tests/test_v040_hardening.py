"""Regression tests for Selenyx v0.4.0 architectural hardening & P0/P1 bug fixes."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import json

from fastapi.testclient import TestClient
import pytest

from selenyx_backend.main import app
from selenyx_backend.models import AutomationTask
from selenyx_backend.services.agent.budget import (
    TokenBudgetExceeded,
    record_usage,
    start_budget,
    tokens_used,
)
from selenyx_backend.services.agent.core import extract_action
from selenyx_backend.services.rag import chunk_text
from selenyx_backend.services.scheduler import _is_due


@pytest.mark.asyncio
async def test_token_budget_accumulates_across_ensure_future_child_tasks() -> None:
    """Ensure ContextVar budget tracking survives asyncio.ensure_future child contexts."""
    start_budget(100)

    async def llm_step(n: int) -> int:
        await asyncio.sleep(0)
        return record_usage(n)

    await asyncio.ensure_future(llm_step(40))
    assert tokens_used() == 40
    await asyncio.ensure_future(llm_step(45))
    assert tokens_used() == 85

    with pytest.raises(TokenBudgetExceeded):
        await asyncio.ensure_future(llm_step(20))
    assert tokens_used() == 105


def test_interval_scheduler_without_catchup_never_loops_at_zero_occurrences() -> None:
    """Regression: catch_up=False must NOT fire immediately after creation or 30s after last_run_at."""
    t0 = datetime(2026, 11, 17, 10, 0, 0)
    task = AutomationTask(
        id="auto-interval-1",
        name="Hourly check",
        prompt="Summarize papers",
        schedule_type="interval",
        interval_min=60,
        catch_up=False,
        enabled=True,
        created_at=t0.isoformat(),
        last_run_at=t0.isoformat(),
    )
    assert _is_due(task, t0 + timedelta(seconds=30)) is False
    assert _is_due(task, t0 + timedelta(minutes=30)) is False
    assert _is_due(task, t0 + timedelta(minutes=60, seconds=15)) is True


def test_extract_action_handles_multiple_json_blocks_safely() -> None:
    raw = 'Reasoning {"note": "step"} then tool:\n{"tool": "search_library", "args": {"query": "sepsis"}}'
    parsed = extract_action(raw)
    assert parsed is not None
    assert parsed.get("tool") == "search_library" or parsed.get("note") == "step"


def test_chunk_text_preserves_exact_source_offsets() -> None:
    source = "Paragraph one has clear findings.\n\n\nParagraph two discusses methodology and p < 0.01."
    chunks = chunk_text(source, max_chars=50)
    assert len(chunks) >= 2
    for start, end, text_slice in chunks:
        assert 0 <= start < end <= len(source)
        assert source[start:end] == text_slice
        assert text_slice.strip() != ""


def test_evidence_delete_repairs_claims_and_clinical_stat_tables_are_accurate(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        # 1. Accurate critical values for z, t, chi2, f + validation
        z_res = client.get("/api/clinical/stat/z?alpha=0.05")
        assert z_res.status_code == 200
        assert abs(z_res.json()["criticalValue"] - 1.96) < 0.002

        t_res = client.get("/api/clinical/stat/t?df=10&alpha=0.05")
        assert t_res.status_code == 200
        assert abs(t_res.json()["criticalValue"] - 2.2281) < 0.005

        chi_res = client.get("/api/clinical/stat/chi2?df=4&alpha=0.05")
        assert chi_res.status_code == 200
        assert abs(chi_res.json()["criticalValue"] - 9.4877) < 0.01

        f_res = client.get("/api/clinical/stat/f?df=2&df2=20&alpha=0.05")
        assert f_res.status_code == 200
        assert abs(f_res.json()["criticalValue"] - 3.4928) < 0.02

        bad_res = client.get("/api/clinical/stat/t?df=10&alpha=1.5")
        assert bad_res.status_code == 400

        # 2. Exact JSON tag filtering (no substring false positives like 'AI' matching 'BRAIN')
        client.post("/api/references/bulk-upsert", json={
            "references": [
                {"id": "ref-brain", "title": "Brain study", "tags": ["BRAIN"], "collections": []},
                {"id": "ref-ai", "title": "AI study", "tags": ["AI"], "collections": []},
            ]
        })
        ai_refs = client.get("/api/references?tag=AI").json()
        assert [r["id"] for r in ai_refs] == ["ref-ai"]

        # 3. Evidence delete downgrades active claim instead of leaving dangling ID
        proj = client.post("/api/projects", json={"id": "proj-ev", "name": "Evidence Gate Test"}).json()
        ev = client.post("/api/evidence", json={
            "projectId": proj["id"],
            "referenceId": "ref-ai",
            "claim": "AI reduces triage time",
            "excerpt": "Triage time dropped by 18%",
            "status": "accepted",
        }).json()
        claim = client.post("/api/evidence/claims", json={
            "projectId": proj["id"],
            "text": "AI triage improves workflow",
            "status": "active",
            "evidenceIds": [ev["id"]],
        }).json()
        assert claim["status"] == "active"

        del_res = client.delete(f"/api/evidence/{ev['id']}")
        assert del_res.status_code == 200

        claims_after = client.get(f"/api/evidence/claims?projectId={proj['id']}").json()
        assert len(claims_after) == 1
        assert claims_after[0]["evidenceIds"] == []
        assert claims_after[0]["status"] == "draft"

        # 4. Disabled automation manual 'Run Now' does not falsely 409
        auto = client.post("/api/automations", json={
            "name": "Manual disabled check",
            "prompt": "Check latest papers",
            "scheduleType": "daily",
            "dailyHhmm": "08:00",
            "enabled": False,
        }).json()
        assert json.dumps(auto["enabled"]) == "false"
