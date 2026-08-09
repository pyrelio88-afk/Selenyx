"""Agent 自循环（plan → tool → observe → final）。

设计约束：
- 纯 asyncio + httpx，无重依赖；LLM 调用复用 routers/ai.py 的网关校验与密钥处理。
- 模型协议：每轮输出一个 JSON 对象——
  首轮规划 {"thought": "...", "plan": ["步骤1", "步骤2"]}
  工具调用 {"thought": "...", "tool": "<name>", "args": {...}}
  结束作答 {"thought": "...", "final": "..."}
  解析失败时把整段文本当作 final（模型不遵守协议也能兜底）。
- 工具白名单只读为主；每一步都增量落 audit_log（AgentRun.audit_log_json），
  前端轮询即可看到实时步骤，进程重启后已完成步骤不丢失。
- 可选 finalize 批评审查门（review=True）：final 前先由内置批评员审一轮，
  意见回灌修订一次；默认关闭（按量计费的额外调用，显式 opt-in）。
- 消息压缩：早期工具观察确定性折叠为截断占位，防长 run token 膨胀。
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun, EvidenceItem, Expert, Reference, ResearchProject
from selenyx_backend.routers.ai import _auth_headers, _completion_content, _completion_url, llm_is_configured
from selenyx_backend.services.rag import semantic_search
from selenyx_backend.settings import get_settings

MAX_STEPS = 12
_LLM_TIMEOUT = httpx.Timeout(connect=15.0, read=180.0, write=60.0, pool=15.0)

# 消息压缩：保留最近几条完整观察，更早的折叠为截断占位
_FOLD_KEEP_LAST = 4
_FOLD_BUDGET = 600
_MAX_MSG_CHARS = 24000

_PLAN_MAX_ITEMS = 8
_PLAN_ITEM_CHARS = 120
_REVIEW_TEXT_CHARS = 1500

Emit = Callable[[dict[str, Any]], None]
CancelCheck = Callable[[], bool]

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


def _extract_action(text: str) -> dict[str, Any]:
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


async def _complete(messages: list[dict[str, str]]) -> str:
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


def _truncate(value: str, limit: int = 1200) -> str:
    value = value.strip()
    return value if len(value) <= limit else value[:limit] + "…"


def _fold_observations(messages: list[dict[str, str]]) -> None:
    """折叠早期工具观察消息为截断占位（原地修改）。

    除最近 _FOLD_KEEP_LAST 条观察外，更早的「工具 … 的观察结果」user 消息
    压缩为标记 + 前 _FOLD_BUDGET 字符；整体超 _MAX_MSG_CHARS 时才触发，
    纯确定性、不引入摘要 LLM 调用、不落 audit。
    """
    total = sum(len(m.get("content", "")) for m in messages)
    if total <= _MAX_MSG_CHARS:
        return
    observation_indexes = [
        i
        for i, m in enumerate(messages)
        if m.get("role") == "user" and m.get("content", "").startswith("工具 ")
    ]
    fold_upto = len(observation_indexes) - _FOLD_KEEP_LAST
    for i in observation_indexes[: max(0, fold_upto)]:
        content = messages[i]["content"]
        if "（早期观察已折叠" in content:
            continue
        messages[i]["content"] = f"（早期观察已折叠，原 {len(content)} 字符）\n{content[:_FOLD_BUDGET]}…"


async def _run_tool(session: Session, project_id: str | None, tool: str, args: dict[str, Any]) -> Any:
    """执行白名单工具，返回可 JSON 序列化的观察结果。"""
    if tool == "search_library":
        query = str(args.get("query", "")).strip()
        if not query:
            return {"error": "query 不能为空"}
        top_k = int(args.get("topK", 6) or 6)
        hits = await semantic_search(session, query, project_id=project_id, top_k=max(1, min(top_k, 12)))
        return {
            "hits": [
                {"title": h.title, "excerpt": _truncate(h.excerpt, 500), "page": h.page, "score": h.score}
                for h in hits
            ],
            "count": len(hits),
        }
    if tool == "list_references":
        limit = int(args.get("limit", 30) or 30)
        refs = list(session.exec(select(Reference)).all())[: max(1, min(limit, 100))]
        return {"references": [{"id": r.id, "title": r.title, "year": r.year} for r in refs], "count": len(refs)}
    if tool == "project_context":
        if not project_id:
            return {"error": "任务未关联项目"}
        project = session.get(ResearchProject, project_id)
        if not project:
            return {"error": "项目不存在"}
        ref_ids = json.loads(project.reference_ids_json or "[]")
        evidence_count = len(list(session.exec(select(EvidenceItem).where(EvidenceItem.project_id == project_id)).all()))
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
        items = list(session.exec(select(EvidenceItem).where(EvidenceItem.project_id == project_id)).all())
        if accepted_only:
            items = [item for item in items if item.review == "accepted"]
        return {
            "evidence": [
                {"claim": _truncate(item.claim, 300), "excerpt": _truncate(item.excerpt, 400), "relation": item.relation, "review": item.review}
                for item in items[:20]
            ],
            "count": len(items),
        }
    return {"error": f"未知工具：{tool}"}


def _persist(run_id: str, **fields: Any) -> None:
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            return
        for key, value in fields.items():
            setattr(run, key, value)
        session.add(run)
        session.commit()


async def _ask_expert(project_id: str | None, args: dict[str, Any], record: Callable[..., None]) -> Any:
    """ask_expert 工具：把子问题委托给专家子代理（subagent）。"""
    from selenyx_backend.services.agent.subagents import get_expert, run_subagent

    wanted = str(args.get("expert", "")).strip()
    question = str(args.get("question", "")).strip()
    if not question:
        return {"error": "question 不能为空"}
    with Session(get_engine()) as session:
        expert = get_expert(session, wanted)
        if not expert:
            available = [e.name for e in session.exec(select(Expert)).all()]
            return {"error": f"专家不存在：{wanted or '（未指定）'}", "availableExperts": available}
        expert_snapshot = Expert(id=expert.id, key=expert.key, name=expert.name, tagline=expert.tagline, system_prompt=expert.system_prompt, builtin=expert.builtin)

    def emit_sub(event: dict[str, Any]) -> None:
        record("subagent", expert=expert_snapshot.name, **event)

    answer = await run_subagent(expert_snapshot, question, project_id, emit_sub)
    return {"expert": expert_snapshot.name, "answer": _truncate(answer, 2000)}


def _critique_draft(draft: str) -> tuple[str, str] | None:
    """审查门：取内置批评员专家快照。返回 (name, system_prompt) 或 None。"""
    from selenyx_backend.services.agent.subagents import get_expert

    with Session(get_engine()) as session:
        critic = get_expert(session, "critic")
        if not critic:
            return None
        return critic.name, critic.system_prompt


async def _review_draft(draft: str) -> tuple[str, str]:
    """让批评员审一遍 final 草稿，返回 (批评员名, 意见)。失败抛 HTTPException。"""
    snapshot = _critique_draft(draft)
    if not snapshot:
        raise HTTPException(500, "批评员专家不存在。")
    name, persona = snapshot
    messages = [
        {"role": "system", "content": persona},
        {
            "role": "user",
            "content": (
                "请从事实准确性、证据支撑、逻辑一致性、结构完整性、表述清晰度五个维度"
                "审阅以下草稿，直给问题清单（无问题就明说通过）：\n\n"
                f"{_truncate(draft, 6000)}"
            ),
        },
    ]
    return name, await _complete(messages)


async def execute_run(
    run_id: str,
    goal: str,
    project_id: str | None,
    emit: Emit,
    is_cancelled: CancelCheck,
    review: bool = False,
) -> None:
    """执行一个 agent run：自循环直到 final / 达到步数上限 / 被取消 / 出错。

    review=True 时启用 finalize 批评审查门：首个 final 先送批评员审一轮，
    意见回灌修订一次后再收尾（reviewed 标志防循环）。
    """
    audit: list[dict[str, Any]] = []
    step_no = 0

    def persist_audit() -> None:
        # 每步增量落库：前端轮询可见实时步骤，进程重启已完成步骤不丢
        _persist(run_id, audit_log_json=json.dumps(audit, ensure_ascii=False))

    def record(kind: str, **payload: Any) -> None:
        entry = {"step": step_no, "kind": kind, "ts": datetime.now().isoformat(), **payload}
        audit.append(entry)
        persist_audit()
        emit({"type": "step", **entry})

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"我的目标：{goal}"},
    ]

    final_text = ""
    status = "completed"
    reviewed = False
    try:
        for _ in range(MAX_STEPS):
            step_no += 1
            if is_cancelled():
                status = "cancelled"
                record("error", message="已被用户取消")
                break
            _fold_observations(messages)
            reply = await _complete(messages)
            action = _extract_action(reply)
            thought = str(action.get("thought", "")).strip()
            if thought:
                record("thought", text=_truncate(thought, 600))
            messages.append({"role": "assistant", "content": reply})

            # 规划动作：不落工具、不额外计步，回灌确认后继续
            if "plan" in action and "final" not in action and "tool" not in action:
                items = [
                    _truncate(str(item), _PLAN_ITEM_CHARS)
                    for item in (action.get("plan") if isinstance(action.get("plan"), list) else [])
                ][: _PLAN_MAX_ITEMS]
                items = [item for item in items if item]
                record("plan", items=items)
                messages.append({
                    "role": "user",
                    "content": f"已收到你的计划（{len(items)} 步）。请按计划执行，输出下一个 JSON 动作。",
                })
                continue

            if "final" in action:
                draft = str(action.get("final", "")).strip()
                if review and not reviewed and draft:
                    reviewed = True
                    try:
                        critic_name, critique = await _review_draft(draft)
                        record("review", critic=critic_name, text=_truncate(critique, _REVIEW_TEXT_CHARS))
                        messages.append({
                            "role": "user",
                            "content": (
                                f"批评员审阅意见：\n{critique}\n\n"
                                "请根据意见修订后重新输出最终 JSON 动作（{\"thought\": ..., \"final\": 修订稿}）。"
                                "若意见不成立可说明理由后保留原稿。"
                            ),
                        })
                        continue
                    except HTTPException as exc:
                        record("review", critic="论文批评员", text=f"审查跳过：{exc.detail}", error=True)
                final_text = draft
                record("final", text=final_text)
                break

            tool = str(action.get("tool", ""))
            args = action.get("args") if isinstance(action.get("args"), dict) else {}
            record("tool", tool=tool, args=args)
            if tool == "ask_expert":
                observation = await _ask_expert(project_id, args, record)
            else:
                with Session(get_engine()) as session:
                    observation = await _run_tool(session, project_id, tool, args)
            record("observation", tool=tool, result=observation)
            messages.append({
                "role": "user",
                "content": f"工具 {tool} 的观察结果：\n{json.dumps(observation, ensure_ascii=False)}\n\n请继续：输出下一个 JSON 动作。",
            })
        else:
            final_text = final_text or "已达到最大步数，根据目前收集到的信息给出阶段性结论。"
            record("final", text=final_text)
            status = "completed"
    except HTTPException as exc:
        status = "failed"
        record("error", message=str(exc.detail))
    except Exception as exc:  # 自循环绝不能把异常漏给 lifespan/调用方
        status = "failed"
        record("error", message=f"agent 运行异常：{exc}")

    try:
        _persist(
            run_id,
            status=status,
            output_text=final_text,
            audit_log_json=json.dumps(audit, ensure_ascii=False),
            completed_at=datetime.now().isoformat(),
        )
    except Exception:
        # 最终落库失败保底重试一次；再失败则由重启时的 stale 清理收敛
        try:
            _persist(run_id, status=status, output_text=final_text, completed_at=datetime.now().isoformat())
        except Exception:
            pass
    emit({"type": "status", "status": status, "output": final_text})
