"""Subagent：角色化专家子循环。

主 agent 可通过 ask_expert 工具把子问题委托给专家（独立 system prompt、
独立消息上下文、更小的步数上限），专家的 final 作为观察结果汇入父 run。
借鉴 OpenScience 的 critique/literature-review 子智能体与 ClawsGO 的
「规划→执行→批评修订」人机协同范式，但保持零额外依赖的轻量实现。

共享件（LLM 调用 / 动作解析 / 工具白名单）来自 core.py；以私有别名引入，
保持测试 monkeypatch 落点（subagents._complete）稳定。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import Expert
from selenyx_backend.services.agent.core import (
    SYSTEM_PROMPT,
    complete as _complete,
    extract_action as _extract_action,
    run_tool as _run_tool,
)

SUBAGENT_MAX_STEPS = 6

_WRAP_UP_PROMPT = (
    "已达到最大工具步数。请停止调用工具，基于目前已获得的信息直接输出最终 JSON 动作"
    "（{\"thought\": ..., \"final\": \"结论\"}）。"
)


def get_expert(session: Session, key_or_name: str) -> Expert | None:
    wanted = key_or_name.strip().lower()
    if not wanted:
        return None
    for expert in session.exec(select(Expert)).all():
        if expert.key.lower() == wanted or expert.name.lower() == wanted:
            return expert
    return None


async def run_subagent(
    expert: Expert,
    question: str,
    project_id: str | None,
    emit_sub: Any = None,
) -> str:
    """以专家人格跑一个受限子循环，返回其 final 文本。"""
    # 子代理复用主协议（工具白名单 + JSON 动作），但人格由专家 system prompt 主导
    messages = [
        {"role": "system", "content": f"{expert.system_prompt}\n\n{SYSTEM_PROMPT}"},
        {"role": "user", "content": question},
    ]

    for _ in range(SUBAGENT_MAX_STEPS):
        reply = await _complete(messages)
        action = _extract_action(reply)
        if "final" in action:
            return str(action.get("final", "")).strip()
        tool = str(action.get("tool", ""))
        args = action.get("args") if isinstance(action.get("args"), dict) else {}
        if tool == "ask_expert":
            observation: Any = {"error": "专家不能再委托其他专家（禁止嵌套）"}
        else:
            with Session(get_engine()) as session:
                observation = await _run_tool(session, project_id, tool, args)
        if emit_sub:
            emit_sub({"tool": tool, "args": args, "result": observation})
        messages.append({"role": "assistant", "content": reply})
        messages.append({
            "role": "user",
            "content": f"工具 {tool} 的观察结果：\n{json.dumps(observation, ensure_ascii=False)}\n\n请继续：输出下一个 JSON 动作。",
        })

    # 步数耗尽：强制专家基于已获得信息直接给结论一次
    messages.append({"role": "user", "content": _WRAP_UP_PROMPT})
    try:
        reply = await _complete(messages)
        text = str(_extract_action(reply).get("final", "")).strip()
        if text:
            return text
    except HTTPException:
        pass
    return "（专家在步数上限内未给出结论）"


__all__ = ["get_expert", "run_subagent", "SUBAGENT_MAX_STEPS"]
