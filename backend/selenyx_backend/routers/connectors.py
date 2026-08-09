"""连接器状态汇总：本机能力与外部服务的只读健康视图。"""

from __future__ import annotations

from fastapi import APIRouter

from selenyx_backend.routers.ai import llm_is_configured
from selenyx_backend.routers.zotero import local_zotero_status
from selenyx_backend.services.embeddings import embedding_runtime_summary
from selenyx_backend.settings import get_settings

router = APIRouter()


@router.get("")
async def connectors_status():
    settings = get_settings()
    llm_ready = llm_is_configured(settings)
    try:
        zotero = await local_zotero_status()
        zotero_state = {"status": "ok", "detail": f"API v{zotero.get('apiVersion', '?')}"}
    except Exception:
        zotero_state = {"status": "off", "detail": "未检测到本机 Zotero"}
    return {
        "connectors": [
            {
                "key": "llm-gateway",
                "name": "LLM 网关",
                "status": "ok" if llm_ready else "off",
                "detail": f"{settings.llm_base_url} · {settings.llm_model}" if llm_ready else "未配置密钥；在设置页配置 API",
            },
            {
                "key": "embedding",
                "name": "向量检索",
                "status": "ok",
                "detail": embedding_runtime_summary(settings),
            },
            {"key": "zotero", "name": "Zotero", **zotero_state},
            {
                "key": "scholarly",
                "name": "学术检索",
                "status": "ok",
                "detail": "Crossref / arXiv / OpenAlex，经本机代理调用",
            },
        ]
    }
