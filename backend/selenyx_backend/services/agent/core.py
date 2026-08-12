"""Agent 核心共享件：LLM 网关调用、动作协议解析、工具白名单、消息折叠。

loop.py（主自循环）与 subagents.py（专家子循环）共用本模块；
两者以「私有别名」方式 re-export（如 `from .core import complete as _complete`），
保持既有测试的 monkeypatch 落点（agent_loop._complete 等）稳定。
"""

from __future__ import annotations

import inspect
import json
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select
from sqlalchemy import func

from selenyx_backend.models import EvidenceItem, Reference, ResearchProject
from selenyx_backend.routers.ai import _auth_headers, _completion_content, _completion_url, llm_is_configured
from selenyx_backend.services.artifacts import list_notes as list_notes_svc
from selenyx_backend.services.artifacts import read_note as read_note_svc
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

可用工具（读本机数据 + 落证据卡 + 写笔记/工件）：
1. search_library — 在项目文献库做混合语义检索。args: {"query": "检索词", "topK": 6}
2. list_references — 列出文献标题清单（返回 id/title/year，save_evidence 的 referenceId 用这里的 id）。args: {"limit": 30}
3. project_context — 查看当前项目概况（阶段、文献数、证据数）。args: {}
4. list_evidence — 列出项目证据链（默认仅人工已接受）。args: {"acceptedOnly": true}
5. ask_expert — 把子问题委托给专家子代理（独立人格与上下文）。args: {"expert": "专家 key 或名称", "question": "子问题"}
6. save_evidence — 把一条可核验的证据存为证据卡（进人工待裁决队列）。args: {"claim": "论断", "excerpt": "原文摘录", "referenceId": "文献 id（可空）", "page": 页码（可空）, "relation": "supports|contradicts|qualifies"}
7. list_pending_evidence — 查看当前待人工裁决的证据卡。args: {}
8. write_note — 把成稿/要点写入本机笔记（.md 落盘）。args: {"title": "标题", "content": "正文"}
9. export_artifact — 把本次运行的成稿导出为工件文件。args: {"name": "draft.md", "content": "正文"}
10. list_notes / read_note — 读取本机笔记作为上下文。args: {} / {"name": "笔记文件名"}
11. read_memory — 读取本机记忆（项目 + 全局）。args: {}
12. write_memory — 把值得长期记住的要点追加进记忆（有项目归属写项目记忆）。args: {"content": "要点"}
13. mcp:<server-id>/<tool> — 仅当系统另行列出已探测 MCP 工具时可用；参数遵循该工具的 inputSchema。

原则：计划 2-6 步、量力而行；不编造文献、作者、DOI 或数据；工具没查到的就明说不知道；final 用中文、结构清晰、直给结论。
证据门：final 中凡引用文献结论，必须先 save_evidence 落卡并附原文摘录；证据卡一律 pending，经人接受才算数。
成稿标记：final 成稿里每个事实性论断句末必须标注 [^e:证据id]（只能用 save_evidence 返回或 list_evidence 里真实存在的 id）；
无据断言句末标 [^none]。编造的证据 id 会被后端拒绝并打回修订。
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


# ---------------------------------------------------------------------------
# 工具实现：每工具一个独立函数 + TOOLS 注册表（借鉴 huggingface/smolagents
# 的 {name: tool} 注册表模式——替代 if-chain，便于测试与模块 F 的技能
# 白名单按名裁剪）。所有查询一律下推 SQL（limit / where / count），
# 不全表进内存再切片。
# ---------------------------------------------------------------------------


async def _tool_search_library(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
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


def _tool_list_references(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    limit = _clamp_int(args.get("limit"), 30, 100)
    refs = list(session.exec(select(Reference).limit(limit)).all())
    return {"references": [{"id": r.id, "title": r.title, "year": r.year} for r in refs], "count": len(refs)}


def _tool_project_context(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
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


def _evidence_filters(project_id: str, accepted_only: bool) -> list[Any]:
    filters: list[Any] = [EvidenceItem.project_id == project_id]
    if accepted_only:
        filters.append(EvidenceItem.review == "accepted")
    return filters


def _tool_list_evidence(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    if not project_id:
        return {"error": "任务未关联项目"}
    filters = _evidence_filters(project_id, bool(args.get("acceptedOnly", True)))
    items = list(session.exec(select(EvidenceItem).where(*filters).limit(20)).all())
    total = session.exec(select(func.count(EvidenceItem.id)).where(*filters)).one()
    return {
        "evidence": [
            {"claim": truncate(item.claim, 300), "excerpt": truncate(item.excerpt, 400), "relation": item.relation, "review": item.review}
            for item in items
        ],
        "count": total,
    }


def _tool_save_evidence(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    # 证据门：agent 只能落 pending 卡，接受/驳回权永远在人
    if not project_id:
        return {"error": "任务未关联项目，无法保存证据卡"}
    excerpt = truncate(str(args.get("excerpt", "")).strip(), 2000)
    if not excerpt:
        return {"error": "excerpt 不能为空：证据卡必须附原文摘录"}
    claim = truncate(str(args.get("claim", "")).strip(), 300)
    reference_id = str(args.get("referenceId", "")).strip()
    if reference_id and not session.get(Reference, reference_id):
        return {"error": f"文献不存在：{reference_id}（先用 list_references 取真实 id）"}
    relation = str(args.get("relation", "supports"))
    if relation not in ("supports", "contradicts", "qualifies"):
        return {"error": f"relation 非法：{relation}"}
    page_raw = args.get("page")
    page = page_raw if isinstance(page_raw, int) and page_raw > 0 else None
    item = EvidenceItem(
        project_id=project_id,
        reference_id=reference_id,
        claim=claim,
        excerpt=excerpt,
        relation=relation,
        review="pending",
        status="pending",
        confidence="medium",
        page=page,
        notes="agent 产出，待人工裁决",
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return {"saved": True, "evidenceId": item.id, "status": "pending", "message": "证据卡已进入待裁决队列"}


def _tool_list_pending_evidence(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    if not project_id:
        return {"error": "任务未关联项目"}
    pending_filters = [EvidenceItem.project_id == project_id, EvidenceItem.status == "pending"]
    items = list(session.exec(select(EvidenceItem).where(*pending_filters).limit(20)).all())
    total = session.exec(select(func.count(EvidenceItem.id)).where(*pending_filters)).one()
    return {
        "pending": [
            {"id": item.id, "claim": item.claim, "excerpt": truncate(item.excerpt, 300), "page": item.page}
            for item in items
        ],
        "count": total,
    }


def _tool_list_notes(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    return list_notes_svc()


def _tool_read_note(session: Session, project_id: str | None, args: dict[str, Any]) -> Any:
    name = str(args.get("name", "")).strip()
    if not name:
        return {"error": "name 不能为空"}
    return read_note_svc(name)


ToolHandler = Callable[..., Any]

TOOLS: dict[str, ToolHandler] = {
    "search_library": _tool_search_library,
    "list_references": _tool_list_references,
    "project_context": _tool_project_context,
    "list_evidence": _tool_list_evidence,
    "save_evidence": _tool_save_evidence,
    "list_pending_evidence": _tool_list_pending_evidence,
    "list_notes": _tool_list_notes,
    "read_note": _tool_read_note,
}


async def run_tool(
    session: Session,
    project_id: str | None,
    tool: str,
    args: dict[str, Any],
    *,
    allow_mcp: bool = False,
) -> Any:
    """按注册表执行工具。

    ``mcp:`` 不是进程级静态注册表项：它必须经过主 agent 显式放行，随后
    再由连接器服务核验持久化的已探测能力快照。这样专家子代理仍只有原有
    的内置工具边界，配置失效也不会成为任意 JSON-RPC 代理。
    """
    if tool.startswith("mcp:"):
        if not allow_mcp:
            return {"error": "当前 agent 边界不允许调用 MCP 工具。"}
        # 延迟导入避免 core ↔ connector service 的初始化环；错误会以观察结果
        # 返回，连接器故障不会让整个 run 抛异常。
        from selenyx_backend.services.connectors import call_mcp_tool

        return await call_mcp_tool(tool, args)
    handler = TOOLS.get(tool)
    if handler is None:
        return {"error": f"未知工具：{tool}"}
    result = handler(session, project_id, args)
    if inspect.isawaitable(result):
        result = await result
    return result


__all__ = [
    "SYSTEM_PROMPT",
    "FOLD_KEEP_LAST",
    "FOLD_BUDGET",
    "MAX_MSG_CHARS",
    "TOOLS",
    "extract_action",
    "complete",
    "truncate",
    "fold_observations",
    "run_tool",
]
