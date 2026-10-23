"""Version 1 is only the first human plan gate, before any tool dispatch."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from selenyx_backend.models import AgentRun
from selenyx_backend.services.agent.core import extract_action, truncate

MAX_STEPS = 12
PLAN_MAX_ITEMS = 8
PLAN_ITEM_CHARS = 120
PLAN_REQUIRED_PROMPT = (
    "本任务必须先提交计划并等待人工确认，确认前不能调用工具、审查或输出 final。"
    "请仅输出计划 JSON：{\"thought\": \"规划思路\", \"plan\": [\"具体步骤\"]}。"
    "plan 必须是非空数组，每项均为非空字符串；不得包含 tool、args、final 或其他字段。"
)
PLAN_REJECTION = f"计划确认门拒绝当前动作：{PLAN_REQUIRED_PROMPT}"
STEER_PREFIX = "用户插话（请务必纳入后续行动与成稿）："
WAITING_TEXT = "等待人工确认计划"


class _Message(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    role: Literal["system", "user", "assistant"]
    content: str


class PlanCheckpoint(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    version: int = Field(ge=1, le=1)
    boundary: Literal["first_plan_approval"]
    messages: list[_Message]
    review: bool
    allowed_tools: list[str] | None
    consumed_steps: int = Field(ge=1, le=MAX_STEPS)
    max_steps: int = Field(ge=1, le=MAX_STEPS)
    tokens_used: int = Field(ge=0)
    token_limit: int = Field(ge=0)

    def message_dicts(self) -> list[dict[str, str]]:
        return [message.model_dump() for message in self.messages]

    def plan_items(self) -> list[str]:
        action = extract_action(self.messages[-1].content)
        return [truncate(item, PLAN_ITEM_CHARS) for item in action["plan"]][:PLAN_MAX_ITEMS]


def is_pure_plan(action: dict[str, Any]) -> bool:
    plan = action.get("plan")
    return (
        not (set(action) - {"thought", "plan"})
        and isinstance(plan, list)
        and bool(plan)
        and all(isinstance(item, str) and item.strip() for item in plan)
    )


def validate_checkpoint(snapshot: PlanCheckpoint, audit: Any) -> None:
    """Match the exact pre-tool transcript grammar and its audit, never replay it."""
    if snapshot.consumed_steps > snapshot.max_steps:
        raise ValueError("Plan step budget is inconsistent")
    if snapshot.token_limit and snapshot.tokens_used > snapshot.token_limit:
        raise ValueError("Plan token budget is exhausted")
    tools = snapshot.allowed_tools
    if tools is not None and (any(not name.strip() for name in tools) or len(tools) != len(set(tools))):
        raise ValueError("Invalid plan tool allowlist")
    messages = snapshot.messages
    if (len(messages) < 3 or messages[0].role != "system"
            or PLAN_REQUIRED_PROMPT not in messages[0].content
            or messages[1].role != "user" or not messages[1].content.startswith("我的目标：")):
        raise ValueError("Invalid plan context")
    expected: list[dict[str, Any]] = []
    index = 2
    for step in range(1, snapshot.consumed_steps + 1):
        while index < len(messages) and messages[index].role == "user":
            content = messages[index].content
            if not content.startswith(STEER_PREFIX):
                raise ValueError("Unexpected pre-plan user message")
            expected.append({"step": step, "kind": "steer", "text": truncate(content[len(STEER_PREFIX):], 600)})
            index += 1
        if index >= len(messages) or messages[index].role != "assistant":
            raise ValueError("Missing plan attempt")
        action = extract_action(messages[index].content)
        index += 1
        thought = str(action.get("thought", "")).strip()
        if thought:
            expected.append({"step": step, "kind": "thought", "text": truncate(thought, 600)})
        if step == snapshot.consumed_steps:
            if not is_pure_plan(action) or index != len(messages):
                raise ValueError("Checkpoint is not the first pure plan gate")
            expected.append({"step": step, "kind": "plan", "items": snapshot.plan_items()})
            expected.append({"step": step, "kind": "waiting", "text": WAITING_TEXT})
        else:
            # A rejected tool-shaped reply is not a dispatched call: require
            # the exact refusal and forbid all tool/observation audit entries.
            if (is_pure_plan(action) or index >= len(messages)
                    or messages[index].role != "user" or messages[index].content != PLAN_REJECTION):
                raise ValueError("Unaccounted pre-plan action")
            index += 1
            expected.append({"step": step, "kind": "error", "message": PLAN_REJECTION})
    if not isinstance(audit, list) or len(audit) != len(expected):
        raise ValueError("Plan audit does not match context")
    for entry, wanted in zip(audit, expected):
        if (not isinstance(entry, dict) or type(entry.get("step")) is not int
                or not isinstance(entry.get("ts"), str)
                or {key: value for key, value in entry.items() if key != "ts"} != wanted):
            raise ValueError("Unsafe or inconsistent plan audit")
        datetime.fromisoformat(entry["ts"])


def load_checkpoint(run: AgentRun) -> PlanCheckpoint:
    if (run.status != "waiting_confirm" or run.completed_at is not None
            or run.output_text or json.loads(run.artifacts_json) != []):
        raise ValueError("Run is not a safe pre-tool wait")
    snapshot = PlanCheckpoint.model_validate_json(run.checkpoint_json)
    validate_checkpoint(snapshot, json.loads(run.audit_log_json))
    return snapshot
