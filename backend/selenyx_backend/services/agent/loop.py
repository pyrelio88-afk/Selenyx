"""Agent 自循环（plan → tool → observe → final）。

设计约束：
- 纯 asyncio + httpx，无重依赖；LLM 调用经 core.complete 复用网关校验与密钥处理。
- 模型协议：每轮输出一个 JSON 对象——
  首轮规划 {"thought": "...", "plan": ["步骤1", "步骤2"]}
  工具调用 {"thought": "...", "tool": "<name>", "args": {...}}
  结束作答 {"thought": "...", "final": "..."}
  解析失败时把整段文本当作 final（模型不遵守协议也能兜底）。
- 每一步都增量落 audit_log（_RunTimeline.record），前端轮询即可看到实时步骤，
  进程重启后已完成步骤不丢失。
- 可选 finalize 批评审查门（review=True）：final 前先由内置批评员审一轮，
  意见回灌修订一次；默认关闭（按量计费的额外调用，显式 opt-in）。
- 步数耗尽时强制模型基于已收集信息收尾一次，收尾也失败才落兜底文案。

共享件（LLM 调用 / 动作解析 / 工具白名单 / 观察折叠）在 core.py；
本模块以私有别名引入，保持测试 monkeypatch 落点（agent_loop._complete 等）稳定。
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import AgentRun, Expert
from selenyx_backend.services.agent.core import (
    FOLD_KEEP_LAST as _FOLD_KEEP_LAST,
    SYSTEM_PROMPT,
    complete as _complete,
    extract_action as _extract_action,
    fold_observations as _fold_observations,
    run_tool as _run_tool,
    truncate as _truncate,
)
from selenyx_backend.services.agent.subagents import get_expert, run_subagent
from selenyx_backend.services.artifacts import write_artifact as _write_artifact
from selenyx_backend.services.artifacts import write_note as _write_note
from selenyx_backend.services.citations import (
    analyze_citations as _analyze_citations,
    has_evidence_markers as _has_evidence_markers,
    rejection_message as _rejection_message,
)

MAX_STEPS = 12

_PLAN_MAX_ITEMS = 8
_PLAN_ITEM_CHARS = 120
_REVIEW_TEXT_CHARS = 1500

_WRAP_UP_PROMPT = (
    "已达到最大工具步数。请停止调用工具，基于目前已收集的信息直接输出最终 JSON 动作"
    "（{\"thought\": ..., \"final\": \"阶段性结论\"}）。"
)
_WRAP_UP_FALLBACK = "已达到最大步数，本次任务未能成稿；已完成的检索与观察可见于运行时间线。"

Emit = Callable[[dict[str, Any]], None]
CancelCheck = Callable[[], bool]


def _persist(run_id: str, **fields: Any) -> None:
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            return
        for key, value in fields.items():
            setattr(run, key, value)
        session.add(run)
        session.commit()


class _RunTimeline:
    """单 run 的审计时间线：record 即增量落库并 emit；finalize 集中收尾落库。"""

    def __init__(self, run_id: str, emit: Emit) -> None:
        self.run_id = run_id
        self.emit = emit
        self.audit: list[dict[str, Any]] = []
        self.step_no = 0

    def next_step(self) -> int:
        self.step_no += 1
        return self.step_no

    def record(self, kind: str, **payload: Any) -> None:
        entry = {"step": self.step_no, "kind": kind, "ts": datetime.now().isoformat(), **payload}
        self.audit.append(entry)
        # 每步增量落库：前端轮询可见实时步骤，进程重启已完成步骤不丢
        _persist(self.run_id, audit_log_json=json.dumps(self.audit, ensure_ascii=False))
        self.emit({"type": "step", **entry})

    def finalize(self, status: str, output: str) -> None:
        try:
            _persist(
                self.run_id,
                status=status,
                output_text=output,
                audit_log_json=json.dumps(self.audit, ensure_ascii=False),
                completed_at=datetime.now().isoformat(),
            )
        except Exception:
            # 最终落库失败保底重试一次；再失败则由重启时的 stale 清理收敛
            try:
                _persist(self.run_id, status=status, output_text=output, completed_at=datetime.now().isoformat())
            except Exception:
                pass
        self.emit({"type": "status", "status": status, "output": output})


def _plan_items(action: dict[str, Any]) -> list[str]:
    """从 plan 动作提取计划条目（截断条数与单条长度）。"""
    raw = action.get("plan") if isinstance(action.get("plan"), list) else []
    items = [_truncate(str(item), _PLAN_ITEM_CHARS) for item in raw][:_PLAN_MAX_ITEMS]
    return [item for item in items if item]


async def _ask_expert(project_id: str | None, args: dict[str, Any], record: Callable[..., None]) -> Any:
    """ask_expert 工具：把子问题委托给专家子代理（subagent）。

    子代理的 LLM 故障降级为 error 观察回灌主循环，不炸掉整个 run。
    """
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

    try:
        answer = await run_subagent(expert_snapshot, question, project_id, emit_sub)
    except HTTPException as exc:
        return {"expert": expert_snapshot.name, "error": f"专家暂不可用：{exc.detail}"}
    return {"expert": expert_snapshot.name, "answer": _truncate(answer, 2000)}


def _record_artifact(run_id: str, entry: dict[str, Any]) -> None:
    """把写工具产物追加进 run 的工件清单（读-改-写 artifacts_json）。"""
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            return
        try:
            artifacts = json.loads(run.artifacts_json or "[]")
        except ValueError:
            artifacts = []
        artifacts.append(entry)
        run.artifacts_json = json.dumps(artifacts, ensure_ascii=False)
        session.add(run)
        session.commit()


async def _dispatch_tool(run_id: str, project_id: str | None, tool: str, args: dict[str, Any], record: Callable[..., None]) -> Any:
    if tool == "ask_expert":
        return await _ask_expert(project_id, args, record)
    # 写工具（V4 模块 B）：loop 层处理——需要 run_id 归属工件并落 audit
    if tool == "write_note":
        result = _write_note(str(args.get("title", "")), str(args.get("content", "")))
        if result.get("saved"):
            _record_artifact(run_id, {"kind": "note", "name": result["name"], "title": result.get("title", "")})
        return result
    if tool == "export_artifact":
        result = _write_artifact(run_id, str(args.get("name", "")), str(args.get("content", "")))
        if result.get("saved"):
            _record_artifact(run_id, {"kind": "artifact", "name": result["name"], "path": result["path"]})
        return result
    with Session(get_engine()) as session:
        return await _run_tool(session, project_id, tool, args)


def _critic_snapshot() -> tuple[str, str] | None:
    """审查门：取内置批评员专家快照。返回 (name, system_prompt) 或 None。"""
    with Session(get_engine()) as session:
        critic = get_expert(session, "critic")
        if not critic:
            return None
        return critic.name, critic.system_prompt


# 审查门指令（参考 synthetic-sciences/openscience 的 reviewer sub-agent：
# 盲审对抗式核查，「论断有罪推定，证据自证清白」；五类结构化发现对齐证据门）
_REVIEW_INSTRUCTION = (
    "你是盲审核查员：默认怀疑，论断有罪推定，证据自证清白。"
    "逐项核查以下草稿，只报告有依据的缺陷，按类别列出（无问题就明说通过）：\n"
    "(a) 引用不符——论断所附证据不支持该论断（错引、夸大、断章取义）；\n"
    "(b) 无源数字——数字或统计无法回溯到检索/观察记录，查无出处即视为编造；\n"
    "(c) 记录不全——声称的结论缺少对应的检索、阅读或证据卡记录；\n"
    "(d) 方法结论错位——所用方法或材料撑不起结论的强度与置信表述；\n"
    "(e) 表述失真——与原文摘录相比存在曲解或过度概括。\n"
    "只审不改：直给问题清单，不重写草稿。\n\n"
)


async def _review_draft(draft: str) -> tuple[str, str]:
    """让批评员审一遍 final 草稿，返回 (批评员名, 意见)。失败抛 HTTPException。"""
    snapshot = _critic_snapshot()
    if not snapshot:
        raise HTTPException(500, "批评员专家不存在。")
    name, persona = snapshot
    messages = [
        {"role": "system", "content": persona},
        {
            "role": "user",
            "content": f"{_REVIEW_INSTRUCTION}{_truncate(draft, 6000)}",
        },
    ]
    return name, await _complete(messages)


async def _wrap_up(messages: list[dict[str, str]], timeline: _RunTimeline) -> str:
    """步数耗尽：强制模型基于已收集信息收尾一次；收尾失败落兜底文案。"""
    timeline.next_step()
    _fold_observations(messages)
    messages.append({"role": "user", "content": _WRAP_UP_PROMPT})
    draft = ""
    try:
        reply = await _complete(messages)
        action = _extract_action(reply)
        thought = str(action.get("thought", "")).strip()
        if thought:
            timeline.record("thought", text=_truncate(thought, 600))
        draft = str(action.get("final", "")).strip()
    except HTTPException as exc:
        timeline.record("error", message=f"收尾调用失败：{exc.detail}")
    final_text = draft or _WRAP_UP_FALLBACK
    timeline.record("final", text=final_text)
    return final_text


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
    timeline = _RunTimeline(run_id, emit)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"我的目标：{goal}"},
    ]

    final_text = ""
    status = "completed"
    reviewed = False
    citation_bounced = False  # 染色校验打回上限一次，防编造-打回死循环
    try:
        for _ in range(MAX_STEPS):
            timeline.next_step()
            if is_cancelled():
                status = "cancelled"
                timeline.record("error", message="已被用户取消")
                break
            _fold_observations(messages)
            reply = await _complete(messages)
            action = _extract_action(reply)
            thought = str(action.get("thought", "")).strip()
            if thought:
                timeline.record("thought", text=_truncate(thought, 600))
            messages.append({"role": "assistant", "content": reply})

            # 规划动作：不落工具、不额外计步，回灌确认后继续
            if "plan" in action and "final" not in action and "tool" not in action:
                items = _plan_items(action)
                timeline.record("plan", items=items)
                messages.append({
                    "role": "user",
                    "content": f"已收到你的计划（{len(items)} 步）。请按计划执行，输出下一个 JSON 动作。",
                })
                continue

            if "final" in action:
                draft = str(action.get("final", "")).strip()
                # 证据染色校验（V4 模块 C）：带标记的成稿先验真实性——
                # 编造 [^e:id] 一律打回修订一次；二次仍编造则审计存证、前端染红，不再打回
                if draft and project_id and _has_evidence_markers(draft):
                    with Session(get_engine()) as session:
                        report = _analyze_citations(session, project_id, draft)
                    timeline.record(
                        "coverage",
                        sentences=report.sentences,
                        supported=report.supported,
                        fullyAccepted=report.fully_accepted,
                        unsourced=report.unsourced,
                        coverage=round(report.coverage, 4),
                    )
                    if not report.ok:
                        message = _rejection_message(report)
                        if not citation_bounced:
                            citation_bounced = True
                            timeline.record("review", critic="证据门校验", text=message, error=True)
                            messages.append({
                                "role": "user",
                                "content": f"{message}\n修订后重新输出最终 JSON 动作（{{\"thought\": ..., \"final\": 修订稿}}）。",
                            })
                            continue
                        timeline.record(
                            "error",
                            message=f"成稿仍含未通过校验的引用：{'、'.join(report.invalid_ids)}（已按无据标记展示）",
                        )
                if review and not reviewed and draft:
                    reviewed = True
                    try:
                        critic_name, critique = await _review_draft(draft)
                        timeline.record("review", critic=critic_name, text=_truncate(critique, _REVIEW_TEXT_CHARS))
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
                        timeline.record("review", critic="论文批评员", text=f"审查跳过：{exc.detail}", error=True)
                final_text = draft
                timeline.record("final", text=final_text)
                break

            tool = str(action.get("tool", ""))
            args = action.get("args") if isinstance(action.get("args"), dict) else {}
            timeline.record("tool", tool=tool, args=args)
            observation = await _dispatch_tool(run_id, project_id, tool, args, timeline.record)
            timeline.record("observation", tool=tool, result=observation)
            messages.append({
                "role": "user",
                "content": f"工具 {tool} 的观察结果：\n{json.dumps(observation, ensure_ascii=False)}\n\n请继续：输出下一个 JSON 动作。",
            })
        else:
            # 步数耗尽（非取消、非 final）：强制收尾一次，失败落兜底文案
            final_text = await _wrap_up(messages, timeline)
    except HTTPException as exc:
        status = "failed"
        timeline.record("error", message=str(exc.detail))
    except Exception as exc:  # 自循环绝不能把异常漏给 lifespan/调用方
        status = "failed"
        timeline.record("error", message=f"agent 运行异常：{exc}")

    timeline.finalize(status, final_text)


__all__ = ["execute_run", "SYSTEM_PROMPT", "MAX_STEPS", "Emit", "CancelCheck"]
