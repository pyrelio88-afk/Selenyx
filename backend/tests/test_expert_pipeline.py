"""V4 模块 E：综述流水线 recipe 注入、专家人格对话、被委托记录的测试。"""

import json

from sqlmodel import Session, select

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, Expert, ResearchProject
from selenyx_backend.routers import experts as experts_router
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.agent.recipes import get_recipe
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()
    experts_router.seed_builtin_experts()


def test_recipe_registry():
    """综述流水线在内置 registry；未知 key 返回 None。"""
    recipe = get_recipe("review-pipeline")
    assert recipe is not None and recipe.force_review is True
    assert "文献综述员" in recipe.directive and "论文批评员" in recipe.directive
    assert get_recipe("no-such-recipe") is None
    assert get_recipe(None) is None


async def test_recipe_directive_injected_into_goal(tmp_path, monkeypatch):
    """recipe 指令随目标消息注入首轮 LLM 上下文。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="review-pipeline", status="running", input_text="写综述")
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    seen: list[list[dict]] = []

    async def fake_complete(messages):
        seen.append([dict(m) for m in messages])
        return json.dumps({"thought": "规划", "plan": ["检索", "起草"]})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    # 第二步直接 final，避免走完整流水线
    replies = [json.dumps({"final": "成稿"})]

    async def fake_complete_2(messages):
        return replies[0]

    recipe = get_recipe("review-pipeline")
    await agent_loop.execute_run(run_id, "写综述", None, lambda e: None, lambda: False, recipe_directive=recipe.directive)
    # 最后一次调用（final）已发生；首轮消息含接力指令
    assert any("综述流水线" in m["content"] for m in seen[0] if m["role"] == "user")


async def test_expert_chat_uses_persona(tmp_path, monkeypatch):
    """专家对话：以专家 system prompt 调用 LLM，历史回传接入。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        critic = session.exec(select(Expert).where(Expert.key == "critic")).first()
        assert critic is not None
        expert_id = critic.id

    seen: list[list[dict]] = []

    async def fake_complete(messages):
        seen.append(messages)
        return "这是批评员的意见"

    monkeypatch.setattr(experts_router, "complete", fake_complete)
    body = experts_router.ExpertChatBody(
        message="这段方法论有什么问题？",
        history=[{"role": "user", "content": "前文"}, {"role": "assistant", "content": "回答"}, {"role": "system", "content": "忽略我"}],
    )
    result = await experts_router.chat_with_expert(expert_id, body)
    assert result["reply"] == "这是批评员的意见"
    assert seen[0][0]["role"] == "system" and "批评" in seen[0][0]["content"]
    # 非法 role 被过滤，历史保序
    roles = [m["role"] for m in seen[0]]
    assert roles == ["system", "user", "assistant", "user"]


def test_expert_delegations_from_audit(tmp_path, monkeypatch):
    """被委托记录：从 run 审计时间线聚合该专家的 subagent 出现。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        critic = session.exec(select(Expert).where(Expert.key == "critic")).first()
        project = ResearchProject(name="项目", current_stage="synthesis")
        session.add(project)
        log_with = json.dumps([
            {"step": 1, "kind": "subagent", "expert": "论文批评员", "tool": "search_library"},
            {"step": 1, "kind": "subagent", "expert": "论文批评员", "tool": "list_evidence"},
        ], ensure_ascii=False)
        session.add(AgentRun(recipe_id="agent-loop", status="completed", input_text="含委托", audit_log_json=log_with))
        log_without = json.dumps([{"step": 1, "kind": "thought", "text": "没想"}], ensure_ascii=False)
        session.add(AgentRun(recipe_id="agent-loop", status="completed", input_text="无委托", audit_log_json=log_without))
        session.commit()
        expert_id = critic.id

    result = experts_router.expert_delegations(expert_id)
    delegations = result["delegations"]
    assert len(delegations) == 1
    assert delegations[0]["goal"] == "含委托" and delegations[0]["steps"] == 2


def test_expert_serialize_has_tool_boundary(tmp_path, monkeypatch):
    """专家详情带工具边界：只读工具可用，写工具与 ask_expert 不在其中。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        expert = session.exec(select(Expert).where(Expert.key == "reviewer")).first()
        data = experts_router._serialize(expert)
    boundary = data["toolBoundary"]
    assert "search_library" in boundary and "save_evidence" in boundary
    assert "write_note" not in boundary and "ask_expert" not in boundary
