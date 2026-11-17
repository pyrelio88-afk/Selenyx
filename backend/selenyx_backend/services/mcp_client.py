"""Minimal JSON-RPC 2.0 MCP client over shell-free stdio and Streamable HTTP/SSE."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from selenyx_backend.models import McpServer
from selenyx_backend.services.mcp_security import (
    McpConnectorError,
    McpProtocolError,
    McpSecurityError,
    McpTransportError,
    _MCP_TOOL_RE,
    _SAFE_SESSION_RE,
    assert_safe_mcp_destination,
    single_line,
    validate_args,
    validate_stdio_command,
)

MCP_MAX_RESPONSE_BYTES = 1_000_000
MCP_MAX_TOOL_SCHEMA_BYTES = 8_000
MCP_MAX_TOOL_RESULT_BYTES = 32_000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json_list(value: str) -> list[Any]:
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def load_json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def _read_limited(response: httpx.Response, limit: int = MCP_MAX_RESPONSE_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > limit:
            raise McpProtocolError("MCP 响应超过 1 MB 上限。")
        chunks.append(chunk)
    return b"".join(chunks)


def _json_rpc_payload(request_id: int | None, method: str, params: dict[str, Any] | None = None) -> bytes:
    payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
    if request_id is not None:
        payload["id"] = request_id
    if params is not None:
        payload["params"] = params
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data) > MCP_MAX_TOOL_RESULT_BYTES:
        raise McpProtocolError("MCP 请求参数超过 32 KB 上限。")
    return data


def _parse_json_rpc_result(payload: Any, request_id: int) -> Any:
    if not isinstance(payload, dict) or payload.get("jsonrpc") != "2.0" or payload.get("id") != request_id:
        raise McpProtocolError("MCP 响应不是预期的 JSON-RPC 结果。")
    if "error" in payload:
        code = payload.get("error", {}).get("code") if isinstance(payload.get("error"), dict) else None
        suffix = f"（code {code}）" if isinstance(code, int) else ""
        raise McpProtocolError(f"MCP 服务返回错误{suffix}。")
    if "result" not in payload:
        raise McpProtocolError("MCP 响应缺少 result。")
    return payload["result"]


def _parse_sse_result(raw: bytes, request_id: int) -> Any:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise McpProtocolError("MCP SSE 响应不是 UTF-8。") from exc
    data_lines: list[str] = []
    candidates: list[Any] = []

    def flush() -> None:
        nonlocal data_lines
        if not data_lines:
            return
        try:
            candidates.append(json.loads("\n".join(data_lines)))
        except json.JSONDecodeError:
            pass
        data_lines = []

    for line in text.splitlines():
        if not line:
            flush()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    flush()
    for candidate in candidates:
        if isinstance(candidate, dict) and candidate.get("id") == request_id:
            return _parse_json_rpc_result(candidate, request_id)
    raise McpProtocolError("MCP SSE 响应中没有匹配的 JSON-RPC 结果。")


class _StdioMcpSession:
    """One short-lived, shell-free JSON-RPC session for a local MCP process."""

    def __init__(self, server: McpServer):
        self.server = server
        self.process: asyncio.subprocess.Process | None = None
        self._next_id = 0
        self._stderr_chunks: list[bytes] = []
        self._stderr_size = 0
        self._stderr_task: asyncio.Task[None] | None = None

    async def __aenter__(self) -> "_StdioMcpSession":
        command = validate_stdio_command(self.server.command)
        args = validate_args(load_json_list(self.server.args_json))
        try:
            self.process = await asyncio.create_subprocess_exec(
                command,
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=MCP_MAX_RESPONSE_BYTES + 1,
            )
        except OSError as exc:
            raise McpTransportError("MCP stdio 进程无法启动。") from exc
        self._stderr_task = asyncio.create_task(self._collect_stderr())
        return self

    async def __aexit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        process = self.process
        if process and process.stdin:
            process.stdin.close()
        if process and process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=0.5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        if self._stderr_task:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass

    async def _collect_stderr(self) -> None:
        if not self.process or not self.process.stderr:
            return
        while True:
            chunk = await self.process.stderr.read(1024)
            if not chunk:
                return
            if self._stderr_size < 2_000:
                allowed = 2_000 - self._stderr_size
                self._stderr_chunks.append(chunk[:allowed])
                self._stderr_size += min(len(chunk), allowed)

    def _stderr_hint(self) -> str:
        if not self._stderr_chunks:
            return ""
        return "（进程已输出 stderr，内容已隐藏）"

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        if not self.process or not self.process.stdin or not self.process.stdout:
            raise McpTransportError("MCP stdio 会话未启动。")
        self._next_id += 1
        request_id = self._next_id
        self.process.stdin.write(_json_rpc_payload(request_id, method, params) + b"\n")
        try:
            await asyncio.wait_for(self.process.stdin.drain(), timeout=self.server.timeout_seconds)
            while True:
                try:
                    line = await asyncio.wait_for(self.process.stdout.readline(), timeout=self.server.timeout_seconds)
                except ValueError as exc:
                    raise McpProtocolError("MCP stdio 单行响应超过 1 MB 上限。") from exc
                if not line:
                    hint = self._stderr_hint()
                    raise McpTransportError(f"MCP stdio 进程提前退出{hint}。")
                if len(line) > MCP_MAX_RESPONSE_BYTES:
                    raise McpProtocolError("MCP stdio 单行响应超过 1 MB 上限。")
                try:
                    payload = json.loads(line.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise McpProtocolError("MCP stdio 输出不是 JSON-RPC。") from exc
                if isinstance(payload, dict) and payload.get("id") != request_id:
                    continue
                return _parse_json_rpc_result(payload, request_id)
        except asyncio.TimeoutError as exc:
            raise McpTransportError(f"MCP stdio 请求超时（{self.server.timeout_seconds:g} 秒）。") from exc

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        if not self.process or not self.process.stdin:
            raise McpTransportError("MCP stdio 会话未启动。")
        self.process.stdin.write(_json_rpc_payload(None, method, params) + b"\n")
        try:
            await asyncio.wait_for(self.process.stdin.drain(), timeout=self.server.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise McpTransportError(f"MCP stdio 通知超时（{self.server.timeout_seconds:g} 秒）。") from exc


class _HttpSseMcpSession:
    """MCP Streamable HTTP client that also accepts SSE-encoded responses."""

    def __init__(self, server: McpServer):
        self.server = server
        self._next_id = 0
        self._client: httpx.AsyncClient | None = None
        self._session_id = ""

    async def __aenter__(self) -> "_HttpSseMcpSession":
        await assert_safe_mcp_destination(self.server.url)
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.server.timeout_seconds),
            follow_redirects=False,
            trust_env=False,
        )
        return self

    async def __aexit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        if self._client:
            await self._client.aclose()

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": "Selenyx/0.4 local-mcp-client",
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        return headers

    async def _send(self, payload: bytes, *, request_id: int | None) -> Any:
        if not self._client:
            raise McpTransportError("MCP HTTP 会话未启动。")
        await assert_safe_mcp_destination(self.server.url)
        try:
            async with self._client.stream(
                "POST", self.server.url, content=payload, headers=self._headers()
            ) as response:
                session_id = response.headers.get("mcp-session-id", "")
                if _SAFE_SESSION_RE.fullmatch(session_id):
                    self._session_id = session_id
                if not 200 <= response.status_code < 300:
                    raise McpTransportError(f"MCP HTTP 请求失败（HTTP {response.status_code}）。")
                raw = await _read_limited(response)
                if request_id is None:
                    return None
                content_type = response.headers.get("content-type", "").lower()
        except httpx.TimeoutException as exc:
            raise McpTransportError(f"MCP HTTP 请求超时（{self.server.timeout_seconds:g} 秒）。") from exc
        except httpx.HTTPError as exc:
            raise McpTransportError("MCP HTTP 连接失败。") from exc
        if not raw:
            raise McpProtocolError("MCP HTTP 响应为空。")
        if "text/event-stream" in content_type:
            return _parse_sse_result(raw, request_id)
        try:
            return _parse_json_rpc_result(json.loads(raw), request_id)
        except json.JSONDecodeError as exc:
            raise McpProtocolError("MCP HTTP 响应不是 JSON-RPC 或 SSE。") from exc

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        self._next_id += 1
        request_id = self._next_id
        return await self._send(_json_rpc_payload(request_id, method, params), request_id=request_id)

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        await self._send(_json_rpc_payload(None, method, params), request_id=None)


def _mcp_session(server: McpServer) -> _StdioMcpSession | _HttpSseMcpSession:
    if server.transport == "stdio":
        return _StdioMcpSession(server)
    if server.transport == "sse":
        return _HttpSseMcpSession(server)
    raise McpSecurityError("MCP transport 不受支持。")


def public_tool_name(server_id: str, tool_name: str) -> str:
    return f"mcp:{server_id}/{tool_name}"


def parse_public_tool_name(tool: str) -> tuple[str, str] | None:
    if not tool.startswith("mcp:"):
        return None
    server_id, separator, name = tool[4:].partition("/")
    if not separator or not server_id or not _MCP_TOOL_RE.fullmatch(name):
        return None
    return server_id, name


def is_mcp_tool_name(tool: str) -> bool:
    return parse_public_tool_name(tool) is not None


def _sanitize_schema(schema: Any) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return {"type": "object"}
    try:
        encoded = json.dumps(schema, ensure_ascii=False)
    except (TypeError, ValueError):
        return {"type": "object"}
    if len(encoded.encode("utf-8")) > MCP_MAX_TOOL_SCHEMA_BYTES:
        return {"type": "object", "description": "Schema omitted: too large."}
    return schema


def normalize_mcp_tools(server_id: str, result: Any) -> list[dict[str, Any]]:
    """Turn ``tools/list`` into a capped, agent-safe capability snapshot."""
    raw_tools = result.get("tools") if isinstance(result, dict) else None
    if not isinstance(raw_tools, list):
        raise McpProtocolError("MCP tools/list 响应缺少 tools 数组。")
    tools: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_tools:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name")
        if not isinstance(name, str) or not _MCP_TOOL_RE.fullmatch(name) or name in seen:
            continue
        seen.add(name)
        tools.append(
            {
                "name": name,
                "tool": public_tool_name(server_id, name),
                "description": single_line(raw.get("description", ""), 500),
                "inputSchema": _sanitize_schema(raw.get("inputSchema")),
            }
        )
        if len(tools) >= 50:
            break
    return tools


def safe_tool_result(value: Any) -> Any:
    """Keep observations bounded; a remote server must not balloon an agent run."""
    try:
        encoded = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return {"value": single_line(value, 1_000), "truncated": True}
    if len(encoded.encode("utf-8")) <= MCP_MAX_TOOL_RESULT_BYTES:
        return value
    return {
        "truncated": True,
        "preview": encoded[:MCP_MAX_TOOL_RESULT_BYTES],
        "message": "MCP 工具结果超过 32 KB，已截断。",
    }


def serialize_mcp_server(server: McpServer) -> dict[str, Any]:
    """API-safe local config view (there are intentionally no header secrets)."""
    return {
        "id": server.id,
        "name": server.name,
        "transport": server.transport,
        "command": server.command,
        "args": [str(item) for item in load_json_list(server.args_json)],
        "url": server.url,
        "timeoutSeconds": server.timeout_seconds,
        "enabled": server.enabled,
        "status": "disabled" if not server.enabled else server.last_status,
        "lastError": server.last_error,
        "lastCheckedAt": server.last_checked_at,
        "protocolVersion": server.protocol_version,
        "serverInfo": load_json_object(server.server_info_json),
        "capabilities": [item for item in load_json_list(server.capabilities_json) if isinstance(item, dict)],
        "createdAt": server.created_at,
        "updatedAt": server.updated_at,
    }


async def _initialize_and_list(server: McpServer) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    async with _mcp_session(server) as client:
        initialized = await client.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "Selenyx", "version": "0.4.0"},
            },
        )
        if not isinstance(initialized, dict):
            raise McpProtocolError("MCP initialize 响应必须是对象。")
        await client.notify("notifications/initialized")
        listed = await client.request("tools/list", {})
    return initialized, normalize_mcp_tools(server.id, listed)


async def probe_mcp_server(server: McpServer) -> dict[str, Any]:
    """Run the minimal MCP handshake and persistable tool snapshot on ``server``."""
    started = time.perf_counter()
    try:
        initialized, tools = await _initialize_and_list(server)
        server.capabilities_json = json.dumps(tools, ensure_ascii=False)
        server.protocol_version = single_line(initialized.get("protocolVersion", ""), 80)
        info = initialized.get("serverInfo") if isinstance(initialized.get("serverInfo"), dict) else {}
        server.server_info_json = json.dumps(
            {
                "name": single_line(info.get("name", ""), 120),
                "version": single_line(info.get("version", ""), 120),
            },
            ensure_ascii=False,
        )
        server.last_status = "ok"
        server.last_error = ""
        detail = f"initialize + tools/list · {len(tools)} 个工具"
    except McpConnectorError as exc:
        server.capabilities_json = "[]"
        server.protocol_version = ""
        server.server_info_json = "{}"
        server.last_status = "error"
        server.last_error = single_line(exc)
        detail = server.last_error
    server.last_checked_at = _now()
    server.updated_at = _now()
    return {
        "ok": server.last_status == "ok",
        "detail": detail,
        "latencyMs": round((time.perf_counter() - started) * 1000),
        "server": serialize_mcp_server(server),
    }


async def call_server_tool(server: McpServer, tool_name: str, arguments: dict[str, Any]) -> Any:
    """Re-verify tool exposure during call and invoke ``tools/call``."""
    async with _mcp_session(server) as client:
        initialized = await client.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "Selenyx", "version": "0.4.0"},
            },
        )
        if not isinstance(initialized, dict):
            raise McpProtocolError("MCP initialize 响应必须是对象。")
        await client.notify("notifications/initialized")
        listed = await client.request("tools/list", {})
        current_tools = {entry["name"] for entry in normalize_mcp_tools(server.id, listed)}
        if tool_name not in current_tools:
            raise McpProtocolError("MCP 服务当前未暴露该工具。请重新探测连接器。")
        return await client.request("tools/call", {"name": tool_name, "arguments": arguments})


__all__ = [
    "MCP_MAX_RESPONSE_BYTES",
    "MCP_MAX_TOOL_RESULT_BYTES",
    "MCP_MAX_TOOL_SCHEMA_BYTES",
    "_HttpSseMcpSession",
    "_StdioMcpSession",
    "call_server_tool",
    "is_mcp_tool_name",
    "load_json_list",
    "load_json_object",
    "normalize_mcp_tools",
    "parse_public_tool_name",
    "probe_mcp_server",
    "public_tool_name",
    "safe_tool_result",
    "serialize_mcp_server",
]
