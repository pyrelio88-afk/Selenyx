"""Agent 核心共享件：LLM 网关调用、动作协议解析、工具白名单、消息折叠。

loop.py（主自循环）与 subagents.py（专家子循环）共用本模块；
两者以「私有别名」方式 re-export（如 `from .core import complete as _complete`），
保持既有测试的 monkeypatch 落点（agent_loop._complete 等）稳定。
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select
from sqlalchemy import func

from selenyx_backend.models import EvidenceItem, Reference, ResearchProject
from selenyx_backend.routers.ai import _auth_headers, _completion_content, _completion_url, llm_is_configured
from selenyx_backend.services.rag import semantic_search
from selenyx_backend.settings import get_settings

_LLM_TIMEOUT = httpx.Timeout(connect=15.0, read=180.0, write=60.0, pool=15.0)

# 消息压缩：保留最近几条完整观察，更早的折叠为截断占位
FOLD_KEEP_LAST = 4
FOLD_BUDGET = 600
MAX_MSG_CHARS = 24000

SYSTEM_PROMPT = """你是 Selenyx 的本机研究 agent。你通过「规划→思考→调用工具→观察→再思考」的自循环完成用户目标。

每一轮你只能输出一个 JSON 对象（不要输出任何其他文字、不要用代码块包裹）：
- 首轮必须先规划：{"thought": "对目标的理解", "plan": ["第一步做什么", "第二步做什么", ...]}
- 调用工具：{"thought": "本轮推理", "tool": "工具名", "args": {"参数": "值"}}
- 结束并作答：{"thought": "本轮推理", "final": "给用户的完整中文回答"}

可用工具（只读本机数据）：
1. search_library — 在项目文献库做混合语义检索。args: {"query": "检索词", "topK": 6}
2. list_references — 列出文献标题清单。args: {"limit": 30}
3. project_context — 查看当前项目概况（阶段、文献数、证据数）。args: {}
4. list_evidence — 列出项目证据链（默认仅人工已接受）。args: {"acceptedOnly": true}
5. ask_expert — 把子问题委托给专家子代理（独立人格与上下文）。args: {"expert": "专家 key 或名称", "question": "子问题"}

原则：计划 2-6 步、量力而行；不编造文献、作者、DOI 或数据；工具没查到的就明说不知道；final 用中文、结构清晰、直给结论。
通常先 project_context 或 search_library 摸底，再按需补查，然后 final 成稿。"""


def extract_action(text: str) -> dict[str, Any]:
    """把模型输出解析为一个动作；失败则整体视为 final 文本。"""
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            action = json.loads(text[start : end + 1])
            if isinstance(action, dict) and ("tool" in action or "final" in action or "plan" in action):
                return action
        except json.JSONDecodeError:
            pass
    return {"thought": "", "final": text.strip() or "（模型未产出内容）"}


async def complete(messages: list[dict[str, str]]) -> str:
    """经本机网关设置发起一次非流式补全（密钥不落日志、不回传）。"""
    settings = get_settings()
    if not llm_is_configured(settings):
        raise HTTPException(503, "LLM 未配置：请在设置页配置 API，或使用本机 Ollama。")
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 4096,
    }
    try:
        async with httpx.AsyncClient(timeout=_LLM_TIMEOUT, follow_redirects=False) as client:
            response = await client.post(
                _completion_url(settings),
                headers=_auth_headers(settings),
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "LLM 连接失败。") from exc
    if response.status_code != 200:
        raise HTTPException(502, f"LLM 请求失败（HTTP {response.status_code}）。")
    try:
        return _completion_content(response.json())
    except ValueError as exc:
        raise HTTPException(502, "LLM 返回了无法解析的响应。") from exc


def truncate(value: str, limit: int = 1200) -> str:
    value = value.strip()
    return value if len(value) <= limit else value[:limit] + "…"


def fold_observations(messages: list[dict[str, str]]) -> None:
    """折叠早期工具观察消息为截断占位（原地修改）。

    除最近 FOLD_KEEP_LAST 条观察外，更早的「工具 … 的观察结果」user 消息
    压缩为标记 + 前 FOLD_BUDGET 字符；整体超 MAX_MSG_CHARS 时才触发，
    纯确定性、不引入摘要 LLM 调用、不落 audit。
    """
    total = sum(len(m.get("content", "")) for m in messages)
    if total <= MAX_MSG_CHARS:
        return
    observation_indexes = [
        i
        for i, m in enumerate(messages)
        if m.get("role") == "user" and m.get("content", "").startswith("工具 ")
    ]
    fold_upto = len(observation_indexes) - FOLD_KEEP_LAST
    for i in observation_indexes[: max(0, fold_upto)]:
        content = messages[i]["content"]
        if "（早期观察已折叠" in content:
            continue
        messages[i]["content"] = f"（早期观察已折叠，原 {len(content)} 字符）\n{content[:FOLD_BUDGET]}…"


def _clamp_int(raw: Any, default: int, upper: int) -> int:
    try:
        value = int(raw or default)
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, upper))


async def run_tool(session: Session, project_id: str | None, tool: str, args: dict[str, Any]) -> Any:
    """执行白名单工具，返回可 JSON 序列化的观察结果。

    查询一律下推 SQL（limit / where / count），不全表进内存再切片。
    """
    if tool == "search_library":
        query = str(args.get("query", "")).strip()
        if not query:
            return {"error": "query 不能为空"}
        top_k = _clamp_int(args.get("topK"), 6, 12)
        hits = await semantic_search(session, query, project_id=project_id, top_k=top_k)
        return {
            "hits": [
                {"title": h.title, "excerpt": truncate(h.excerpt, 500), "page": h.page, "score": h.score}
                for h in hits
            ],
            "count": len(hits),
        }
    if tool == "list_references":
        limit = _clamp_int(args.get("limit"), 30, 100)
        refs = list(session.exec(select(Reference).limit(limit)).all())
        return {"references": [{"id": r.id, "title": r.title, "year": r.year} for r in refs], "count": len(refs)}
    if tool == "project_context":
        if not project_id:
            return {"error": "任务未关联项目"}
        project = session.get(ResearchProject, project_id)
        if not project:
            return {"error": "项目不存在"}
        ref_ids = json.loads(project.reference_ids_json or "[]")
        evidence_count = session.exec(
            select(func.count(EvidenceItem.id)).where(EvidenceItem.project_id == project_id)
        ).one()
        return {
            "name": project.name,
            "currentStage": project.current_stage,
            "referenceCount": len(ref_ids),
            "evidenceCount": evidence_count,
        }
    if tool == "list_evidence":
        if not project_id:
            return {"error": "任务未关联项目"}
        accepted_only = bool(args.get("acceptedOnly", True))
        filters = [EvidenceItem.project_id == project_id]
        if accepted_only:
            filters.append(EvidenceItem.review == "accepted")
        items = list(session.exec(select(EvidenceItem).where(*filters).limit(20)).all())
        total = session.exec(select(func.count(EvidenceItem.id)).where(*filters)).one()
        return {
            "evidence": [
                {"claim": truncate(item.claim, 300), "excerpt": truncate(item.excerpt, 400), "relation": item.relation, "review": item.review}
                for item in items
            ],
            "count": total,
        }
    return {"error": f"未知工具：{tool}"}


__all__ = [
    "SYSTEM_PROMPT",
    "FOLD_KEEP_LAST",
    "FOLD_BUDGET",
    "MAX_MSG_CHARS",
    "extract_action",
    "complete",
    "truncate",
    "fold_observations",
    "run_tool",
]
