"""SSRF, DNS-rebinding, and shell-free stdio validators for MCP connectors."""

from __future__ import annotations

import asyncio
import ipaddress
import os
import re
import socket
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

MCP_DEFAULT_TIMEOUT_SECONDS = 10.0
MCP_MAX_TIMEOUT_SECONDS = 30.0

_STDIO_COMMAND_RE = re.compile(r"^[^\x00\r\n]{1,1024}$")
_MCP_TOOL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_SAFE_SESSION_RE = re.compile(r"^[A-Za-z0-9._~=-]{1,200}$")


class McpConnectorError(RuntimeError):
    """A safe, UI-facing MCP failure. It never includes upstream bodies."""


class McpSecurityError(McpConnectorError):
    """Configuration or destination violates the local connector boundary."""


class McpProtocolError(McpConnectorError):
    """The configured server did not speak the small JSON-RPC subset we need."""


class McpTransportError(McpConnectorError):
    """Connection, timeout or process-lifecycle failure."""


def single_line(value: Any, limit: int = 360) -> str:
    """Keep remote/process diagnostics small and safe to render or log."""
    text = str(value or "").replace("\r", " ").replace("\n", " ").replace("\x00", " ").strip()
    return text[:limit]


def validate_name(name: str) -> str:
    value = single_line(name, 80)
    if not value:
        raise McpSecurityError("MCP server 名称不能为空。")
    return value


def validate_args(raw_args: list[str] | tuple[str, ...] | None) -> list[str]:
    args = list(raw_args or [])
    if len(args) > 48:
        raise McpSecurityError("stdio 参数最多 48 个。")
    result: list[str] = []
    total = 0
    for item in args:
        if not isinstance(item, str):
            raise McpSecurityError("stdio 参数必须是字符串数组。")
        if "\x00" in item:
            raise McpSecurityError("stdio 参数不能包含空字符。")
        if len(item) > 2_000:
            raise McpSecurityError("单个 stdio 参数不能超过 2000 个字符。")
        total += len(item)
        result.append(item)
    if total > 8_000:
        raise McpSecurityError("stdio 参数总长度不能超过 8000 个字符。")
    return result


def validate_stdio_command(command: str) -> str:
    value = command.strip()
    if not _STDIO_COMMAND_RE.fullmatch(value):
        raise McpSecurityError("stdio command 必须是单个可执行文件路径，不能包含换行或空字符。")
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise McpSecurityError("stdio command 必须是绝对可执行文件路径；不会通过 shell 或 PATH 查找执行。")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise McpSecurityError("stdio command 指向的可执行文件不存在。") from exc
    if not resolved.is_file():
        raise McpSecurityError("stdio command 必须指向文件。")
    if os.name != "nt" and not os.access(resolved, os.X_OK):
        raise McpSecurityError("stdio command 没有执行权限。")
    return str(resolved)


def _url_parts(url: str) -> tuple[str, str, int | None]:
    value = url.strip()
    if not value or len(value) > 2_048:
        raise McpSecurityError("MCP URL 不能为空且不能超过 2048 个字符。")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise McpSecurityError("MCP URL 的端口不合法。") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise McpSecurityError("MCP SSE URL 必须是完整的 http:// 或 https:// 地址。")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise McpSecurityError("MCP SSE URL 不支持用户信息、查询参数或片段；请不要把令牌写入 URL。")
    if port is not None and not 1 <= port <= 65535:
        raise McpSecurityError("MCP URL 端口不合法。")
    return value, parsed.hostname.rstrip("."), port


def _assert_public_ip(address: str) -> None:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError as exc:
        raise McpSecurityError("MCP 域名解析结果无效。") from exc
    if not parsed.is_global:
        raise McpSecurityError("为防 SSRF，MCP SSE 不能访问回环、内网或保留地址；本地服务请使用 stdio。")


def _validate_sse_url_shape(url: str) -> str:
    value, host, _port = _url_parts(url)
    lowered = host.lower()
    if (
        lowered == "localhost"
        or lowered.endswith(".localhost")
        or lowered.endswith(".local")
        or lowered.endswith(".internal")
    ):
        raise McpSecurityError("为防 SSRF，MCP SSE 不能使用 localhost 或本地域名；本地服务请使用 stdio。")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        _assert_public_ip(host)
    return value


async def _resolve_mcp_host(host: str, port: int | None) -> set[str]:
    """Resolve through the system resolver without blocking the event loop."""
    infos = await asyncio.to_thread(socket.getaddrinfo, host, port or 443, type=socket.SOCK_STREAM)
    return {str(info[4][0]) for info in infos if info[4]}


async def assert_safe_mcp_destination(url: str) -> None:
    """Validate DNS results right before every remote MCP request."""
    _value, host, port = _url_parts(url)
    try:
        _assert_public_ip(host)
        return
    except McpSecurityError:
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise
    lowered = host.lower()
    if (
        lowered == "localhost"
        or lowered.endswith(".localhost")
        or lowered.endswith(".local")
        or lowered.endswith(".internal")
    ):
        raise McpSecurityError("为防 SSRF，MCP SSE 不能使用 localhost 或本地域名；本地服务请使用 stdio。")
    try:
        addresses = await _resolve_mcp_host(host, port)
    except (OSError, asyncio.TimeoutError) as exc:
        raise McpTransportError("MCP 域名无法解析。") from exc
    if not addresses:
        raise McpTransportError("MCP 域名没有可用地址。")
    for address in addresses:
        _assert_public_ip(address)


def normalize_mcp_configuration(
    *,
    name: str,
    transport: Literal["stdio", "sse"] | str,
    command: str = "",
    args: list[str] | tuple[str, ...] | None = None,
    url: str = "",
    timeout_seconds: float | int | None = None,
) -> dict[str, Any]:
    """Validate a config at its trust boundary before it reaches SQLite."""
    if transport not in {"stdio", "sse"}:
        raise McpSecurityError("transport 只能是 stdio 或 sse。")
    try:
        timeout = float(timeout_seconds if timeout_seconds is not None else MCP_DEFAULT_TIMEOUT_SECONDS)
    except (TypeError, ValueError) as exc:
        raise McpSecurityError("MCP timeoutSeconds 必须是数字。") from exc
    if not 1 <= timeout <= MCP_MAX_TIMEOUT_SECONDS:
        raise McpSecurityError(f"MCP timeoutSeconds 必须在 1 到 {MCP_MAX_TIMEOUT_SECONDS:g} 秒之间。")
    normalized: dict[str, Any] = {
        "name": validate_name(name),
        "transport": transport,
        "timeout_seconds": timeout,
        "command": "",
        "args": [],
        "url": "",
    }
    if transport == "stdio":
        normalized["command"] = validate_stdio_command(command)
        normalized["args"] = validate_args(args)
    else:
        normalized["url"] = _validate_sse_url_shape(url)
        if command.strip() or args:
            raise McpSecurityError("SSE transport 不接受 command 或 args。")
    return normalized


__all__ = [
    "MCP_DEFAULT_TIMEOUT_SECONDS",
    "MCP_MAX_TIMEOUT_SECONDS",
    "McpConnectorError",
    "McpProtocolError",
    "McpSecurityError",
    "McpTransportError",
    "_MCP_TOOL_RE",
    "_SAFE_SESSION_RE",
    "assert_safe_mcp_destination",
    "normalize_mcp_configuration",
    "single_line",
    "validate_args",
    "validate_name",
    "validate_stdio_command",
]
