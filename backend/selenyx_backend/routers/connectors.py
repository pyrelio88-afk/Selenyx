"""Local connector status plus configurable, minimal MCP servers (V4 module H)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from selenyx_backend.routers.ai import llm_is_configured
from selenyx_backend.routers.zotero import local_zotero_status
from selenyx_backend.services.connectors import (
    McpSecurityError,
    cached_academic_probe,
    call_mcp_tool,
    create_mcp_server,
    delete_mcp_server,
    list_mcp_servers,
    normalize_mcp_configuration,
    probe_academic_connectors,
    probe_saved_mcp_server,
    serialize_mcp_server,
    update_mcp_server,
)
from selenyx_backend.services.embeddings import embedding_runtime_summary
from selenyx_backend.settings import get_settings

router = APIRouter()


class McpServerBody(BaseModel):
    """No headers/env field by design: secrets are not copied into connector JSON."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    transport: Literal["stdio", "sse"]
    command: str = ""
    args: list[str] = Field(default_factory=list, max_length=48)
    url: str = ""
    timeout_seconds: float = Field(default=10.0, alias="timeoutSeconds", ge=1.0, le=30.0)
    enabled: bool = True


class McpCallBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    args: dict[str, Any] = Field(default_factory=dict)


def _status_from_academic_probe(probe: dict[str, Any] | None) -> tuple[str, str]:
    if not probe:
        return "unknown", "尚未探测；点击“探测学术检索”会用 3 秒超时检查公开 API。"
    connectors = probe.get("connectors") if isinstance(probe, dict) else []
    healthy = sum(1 for item in connectors if isinstance(item, dict) and item.get("status") == "ok")
    total = len(connectors) if isinstance(connectors, list) else 0
    freshness = "缓存结果" if probe.get("cached") else "刚刚探测"
    return ("ok" if healthy else "error"), f"{freshness}：{healthy}/{total} 个来源可达。"


@router.get("")
async def connectors_status():
    """Read-only status; does not initiate scholarly network traffic by itself."""

    settings = get_settings()
    llm_ready = llm_is_configured(settings)
    # detail 契约是纯文本（前端直接渲染）：嵌入运行摘要转成一句话，不塞对象
    embedding = embedding_runtime_summary(settings)
    if embedding["configured"]:
        embedding_detail = f"稠密向量（{embedding['provider']} · {embedding['model'] or '默认模型'}），失败回退哈希"
    else:
        embedding_detail = "哈希向量（未配置稠密嵌入；可在设置中接入嵌入服务）"
    try:
        zotero = await local_zotero_status()
        zotero_state = {"status": "ok", "detail": f"API v{zotero.get('apiVersion', '?')}"}
    except Exception:
        zotero_state = {"status": "off", "detail": "未检测到本机 Zotero"}
    academic = cached_academic_probe()
    scholarly_status, scholarly_detail = _status_from_academic_probe(academic)
    mcp_servers = list_mcp_servers()
    return {
        "connectors": [
            {
                "key": "llm-gateway",
                "name": "LLM 网关",
                "status": "ok" if llm_ready else "off",
                "detail": f"{settings.llm_base_url} · {settings.llm_model}" if llm_ready else "未配置密钥；请在设置中配置 API。",
            },
            {
                "key": "embedding",
                "name": "向量检索",
                "status": "ok",
                "detail": embedding_detail,
            },
            {"key": "zotero", "name": "Zotero", **zotero_state},
            {
                "key": "scholarly",
                "name": "学术检索",
                "status": scholarly_status,
                "detail": scholarly_detail,
            },
        ],
        "academicProbe": academic,
        "mcpServers": mcp_servers,
    }


@router.get("/academic/probe")
async def academic_probe(force: bool = False):
    """Explicit, cached reachability probe for fixed public scholarly APIs."""

    return await probe_academic_connectors(force=force)


@router.get("/mcp")
def list_mcp():
    return {"servers": list_mcp_servers()}


def _validated_config(body: McpServerBody) -> dict[str, Any]:
    try:
        return normalize_mcp_configuration(
            name=body.name,
            transport=body.transport,
            command=body.command,
            args=body.args,
            url=body.url,
            timeout_seconds=body.timeout_seconds,
        )
    except McpSecurityError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/mcp", status_code=201)
def create_mcp(body: McpServerBody):
    server = create_mcp_server(_validated_config(body), enabled=body.enabled)
    return serialize_mcp_server(server)


@router.put("/mcp/{server_id}")
def update_mcp(server_id: str, body: McpServerBody):
    server = update_mcp_server(server_id, _validated_config(body), enabled=body.enabled)
    if not server:
        raise HTTPException(404, "MCP server 不存在。")
    return serialize_mcp_server(server)


@router.delete("/mcp/{server_id}")
def remove_mcp(server_id: str):
    if not delete_mcp_server(server_id):
        raise HTTPException(404, "MCP server 不存在。")
    return {"deleted": server_id}


@router.post("/mcp/{server_id}/probe")
async def probe_mcp(server_id: str):
    result = await probe_saved_mcp_server(server_id)
    if result is None:
        raise HTTPException(404, "MCP server 不存在。")
    return result


@router.post("/mcp/{server_id}/tools/{tool_name}/call")
async def call_mcp(server_id: str, tool_name: str, body: McpCallBody):
    # The service rechecks server id, enabled state and its last probed tool
    # snapshot, so this route cannot become an arbitrary JSON-RPC proxy.
    result = await call_mcp_tool(f"mcp:{server_id}/{tool_name}", body.args)
    if not result.get("ok"):
        raise HTTPException(422, str(result.get("error", "MCP 调用失败。")))
    return result
