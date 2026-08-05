"""
AI 路由 — BYOK LLM 聊天 + Agent 配方编排
借鉴 HydraLab: agents behind gates, extractive retrieval, audit ledger
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
import httpx

router = APIRouter()

# 内存中的 LLM 配置（实际应存 OS keychain）
_llm_config: dict | None = None


@router.post("/config")
async def set_llm_config(config: dict):
    """设置 LLM 配置 (BYOK)"""
    global _llm_config
    _llm_config = config
    return {"ok": True}


@router.get("/test")
async def test_connection():
    """测试 LLM 连接"""
    if not _llm_config:
        return {"ok": False, "error": "未配置 LLM"}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_llm_config.get('baseUrl', 'https://api.openai.com/v1')}/chat/completions",
                headers={"Authorization": f"Bearer {_llm_config['apiKey']}"},
                json={
                    "model": _llm_config.get("model", "gpt-4o"),
                    "messages": [{"role": "user", "content": "Say 'Selenyx connection OK' in 3 words."}],
                    "max_tokens": 10,
                },
                timeout=15,
            )
        if resp.status_code == 200:
            return {"ok": True, "model": _llm_config.get("model", "")}
        return {"ok": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/chat")
async def chat(messages: list[dict], project_id: str | None = None):
    """
    LLM 聊天 — 支持 extractive retrieval 注入上下文
    所有请求记录审计日志
    """
    if not _llm_config:
        raise HTTPException(400, "未配置 LLM，请先在设置中配置 API Key")

    # TODO: 1. extractive retrieval 检索相关文献段落
    #       2. 将检索结果注入 system prompt
    #       3. 调用 LLM
    #       4. 记录审计日志 + token 消耗

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_llm_config.get('baseUrl', 'https://api.openai.com/v1')}/chat/completions",
            headers={"Authorization": f"Bearer {_llm_config['apiKey']}"},
            json={
                "model": _llm_config.get("model", "gpt-4o"),
                "messages": messages,
                "temperature": _llm_config.get("temperature", 0.3),
                "max_tokens": _llm_config.get("maxTokens", 4096),
            },
            timeout=60,
        )

    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"LLM API 错误: {resp.text}")

    data = resp.json()
    return {
        "id": f"msg-{datetime.now().timestamp()}",
        "role": "assistant",
        "content": data["choices"][0]["message"]["content"],
        "toolCalls": [],
        "referenceIds": [],
        "annotationIds": [],
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/recipes/run")
async def run_recipe(recipe_id: str, input: str, project_id: str):
    """
    执行 Agent 研究配方
    借鉴 HydraLab: staged, traceable, gated by approvals
    """
    # TODO: 1. 加载配方定义
    #       2. 审批门控检查
    #       3. 执行（可能多步）
    #       4. 记录审计日志
    return {"runId": f"run-{datetime.now().timestamp()}", "status": "staged"}
