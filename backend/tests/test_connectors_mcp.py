"""V4 module H: academic probe cache/timeout and minimal MCP client boundaries."""

from __future__ import annotations

import asyncio
import json
import sys

import httpx
import pytest
from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.main import app
from selenyx_backend.models import AgentRun
from selenyx_backend.services import connectors as connector_svc
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    connector_svc.clear_academic_probe_cache()
    init_db()


FAKE_MCP_SERVER = r"""
import json
import sys

for raw in sys.stdin:
    message = json.loads(raw)
    if "id" not in message:
        continue
    request_id = message["id"]
    method = message.get("method")
    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "serverInfo": {"name": "test-mcp", "version": "1.0"},
            "capabilities": {"tools": {}},
        }
    elif method == "tools/list":
        result = {
            "tools": [
                {
                    "name": "echo",
                    "description": "Returns exactly the supplied text.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                    },
                }
            ]
        }
    elif method == "tools/call":
        arguments = (message.get("params") or {}).get("arguments") or {}
        result = {"content": [{"type": "text", "text": str(arguments.get("text", ""))}]}
    else:
        print(json.dumps({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601}}), flush=True)
        continue
    print(json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}), flush=True)
"""


@pytest.mark.asyncio
async def test_mcp_stdio_probe_call_and_agent_dispatch(tmp_path, monkeypatch):
    """An approved prefixed capability reaches tools/call through the main agent."""

    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        created = await client.post(
            "/api/connectors/mcp",
            json={
                "name": "Local test echo",
                "transport": "stdio",
                "command": sys.executable,
                "args": ["-u", "-c", FAKE_MCP_SERVER],
                "timeoutSeconds": 2,
            },
        )
        assert created.status_code == 201, created.text
        server = created.json()
        server_id = server["id"]

        probed = await client.post(f"/api/connectors/mcp/{server_id}/probe")
        assert probed.status_code == 200, probed.text
        probe_payload = probed.json()
        assert probe_payload["ok"] is True
        public_tool = f"mcp:{server_id}/echo"
        assert probe_payload["server"]["capabilities"][0]["tool"] == public_tool
        assert probe_payload["server"]["status"] == "ok"

        called = await client.post(
            f"/api/connectors/mcp/{server_id}/tools/echo/call",
            json={"args": {"text": "from route"}},
        )
        assert called.status_code == 200, called.text
        assert called.json()["result"]["content"][0]["text"] == "from route"

    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="agent-loop", project_id="", status="running", input_text="echo with mcp")
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    seen_system: list[str] = []
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        seen_system.append(next(item["content"] for item in messages if item["role"] == "system"))
        if calls == 1:
            return json.dumps({"thought": "use approved connector", "tool": public_tool, "args": {"text": "from agent"}})
        return json.dumps({"final": "已完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []
    await agent_loop.execute_run(
        run_id,
        "echo with mcp",
        None,
        events.append,
        lambda: False,
        allowed_tools={public_tool},
    )
    assert any(public_tool in prompt for prompt in seen_system)
    observation = next(event["result"] for event in events if event.get("kind") == "observation")
    assert observation["ok"] is True
    assert observation["result"]["content"][0]["text"] == "from agent"


@pytest.mark.asyncio
async def test_mcp_rejects_loopback_sse_config(tmp_path, monkeypatch):
    """The UI route cannot turn the sidecar into a localhost SSRF proxy."""

    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/connectors/mcp",
            json={
                "name": "loopback must fail",
                "transport": "sse",
                "url": "http://127.0.0.1:9999/mcp",
            },
        )
    assert response.status_code == 422
    assert "SSRF" in response.json()["detail"]


@pytest.mark.asyncio
async def test_academic_probe_cache_and_timeout(monkeypatch):
    """All fixed providers are bounded, then cached without another network pass."""

    connector_svc.clear_academic_probe_cache()
    calls: list[str] = []

    async def immediate(spec, _timeout):
        calls.append(spec["key"])
        return {
            "key": spec["key"],
            "name": spec["name"],
            "status": "ok",
            "statusCode": 200,
            "latencyMs": 1,
            "detail": "HTTP 200 · 1 ms",
        }

    monkeypatch.setattr(connector_svc, "_probe_academic_one", immediate)
    first = await connector_svc.probe_academic_connectors()
    second = await connector_svc.probe_academic_connectors()
    assert first["cached"] is False
    assert second["cached"] is True
    assert len(calls) == 4

    connector_svc.clear_academic_probe_cache()
    monkeypatch.setattr(connector_svc, "ACADEMIC_PROBE_TIMEOUT_SECONDS", 0.01)

    async def slow(_spec, _timeout):
        await asyncio.sleep(0.1)
        raise AssertionError("wait_for should have timed out")

    monkeypatch.setattr(connector_svc, "_probe_academic_one", slow)
    timed_out = await connector_svc.probe_academic_connectors(force=True)
    assert {item["status"] for item in timed_out["connectors"]} == {"timeout"}
    assert timed_out["timeoutSeconds"] == 0.01


@pytest.mark.asyncio
async def test_connectors_status_details_are_plain_strings(tmp_path, monkeypatch):
    """契约回归：每个连接器的 detail 必须是字符串（前端直接渲染文本；
    曾因向量检索项塞入 embedding_runtime_summary 字典导致整个视图渲染崩溃）。"""

    reset_backend(tmp_path, monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/connectors")
    assert response.status_code == 200, response.text
    connectors = response.json()["connectors"]
    assert len(connectors) >= 4
    for item in connectors:
        assert isinstance(item["detail"], str), f"{item['key']} 的 detail 不是字符串: {item['detail']!r}"
        assert isinstance(item["status"], str) and item["status"]
