"""Agent 自循环测试：脚本化 LLM 响应驱动 plan→tool→observe→final。"""

import json

import pytest
from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, EvidenceItem, ResearchProject
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def seed_project() -> str:
    with Session(get_engine()) as session:
        project = ResearchProject(name="谵妄预防", current_stage="evidence", reference_ids_json='["r1"]')
        session.add(project)
        session.commit()
        session.refresh(project)
        session.add(EvidenceItem(project_id=project.id, reference_id="r1", claim="集束化护理降低谵妄发生率", excerpt="ABCDE 集束…", review="accepted", status="accepted"))
        session.commit()
        return project.id


def make_run(goal: str, project_id: str) -> str:
    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="agent-loop", project_id=project_id, status="running", input_text=goal)
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id


def script_llm(monkeypatch, replies: list[str]) -> list[list[dict]]:
    """把 _complete 换成按脚本依次应答的假 LLM，并记录每次收到的消息。"""
    calls: list[list[dict]] = []

    async def fake_complete(messages):
        calls.append(messages)
        return replies[min(len(calls) - 1, len(replies) - 1)]

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    return calls


async def test_loop_tool_then_final(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("总结项目证据", project_id)
    script_llm(monkeypatch, [
        json.dumps({"thought": "先看证据", "tool": "list_evidence", "args": {"acceptedOnly": True}}),
        json.dumps({"thought": "够了", "final": "结论：集束化护理有效[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "总结项目证据", project_id, events.append, lambda: False)

    kinds = [e.get("kind") for e in events if e.get("type") == "step"]
    assert kinds == ["thought", "tool", "observation", "thought", "coverage", "final"]
    observation = next(e for e in events if e.get("kind") == "observation")
    assert observation["result"]["count"] == 1
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"
        assert run.output_text == "结论：集束化护理有效[^none]。"
        assert run.completed_at
        audit = json.loads(run.audit_log_json)
        assert [e["kind"] for e in audit] == kinds


async def test_loop_non_json_reply_falls_back_to_final(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("随便聊聊", project_id)
    script_llm(monkeypatch, ["这是一段不遵守协议的普通回答。"])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "随便聊聊", project_id, events.append, lambda: False)

    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"
        assert run.output_text == "这是一段不遵守协议的普通回答。"


async def test_project_scoped_small_talk_final_does_not_require_provenance(tmp_path, monkeypatch):
    """A project context alone must not turn a greeting into a research draft."""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("你好", project_id)
    script_llm(monkeypatch, [json.dumps({"final": "你好！我可以帮你整理接下来的任务。"})])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "你好", project_id, events.append, lambda: False)

    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert run.output_text == "你好！我可以帮你整理接下来的任务。"
    assert not [event for event in events if event.get("kind") == "coverage"]


async def test_loop_unknown_tool_gets_error_observation(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("探测工具边界", project_id)
    calls = script_llm(monkeypatch, [
        json.dumps({"thought": "试试不存在的工具", "tool": "delete_everything", "args": {}}),
        json.dumps({"thought": "作罢", "final": "无法执行该操作。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "探测工具边界", project_id, events.append, lambda: False)

    observation = next(e for e in events if e.get("kind") == "observation")
    assert "未知工具" in observation["result"]["error"]
    # 观察结果必须回灌给模型，形成闭环
    assert any("delete_everything" in m.get("content", "") for m in calls[-1] if m["role"] == "user")


async def test_loop_cancel_stops_between_steps(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("长跑任务", project_id)
    script_llm(monkeypatch, [json.dumps({"thought": "继续", "tool": "list_references", "args": {}})])
    events: list[dict] = []
    state = {"cancelled": False}

    def emit(event: dict) -> None:
        events.append(event)
        if event.get("kind") == "observation":
            state["cancelled"] = True

    await agent_loop.execute_run(run_id, "长跑任务", project_id, emit, lambda: state["cancelled"])

    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "cancelled"


async def test_plan_action_recorded_and_replayed(tmp_path, monkeypatch):
    """plan-first：首轮规划落 audit、回灌确认，后续步骤照常。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("综述现状", project_id)
    calls = script_llm(monkeypatch, [
        json.dumps({"thought": "先规划", "plan": ["摸底项目", "检索文献", "成稿"]}),
        json.dumps({"thought": "够了", "final": "综述成稿[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "综述现状", project_id, events.append, lambda: False)

    plan = next(e for e in events if e.get("kind") == "plan")
    assert plan["items"] == ["摸底项目", "检索文献", "成稿"]
    assert plan["step"] == 1
    # 计划确认回灌给模型
    assert any("已收到你的计划（3 步）" in m.get("content", "") for m in calls[-1] if m["role"] == "user")
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        audit = json.loads(run.audit_log_json)
        assert [e["kind"] for e in audit] == ["thought", "plan", "thought", "coverage", "final"]


async def test_review_gate_revises_final(tmp_path, monkeypatch):
    """审查门：review=True 时批评员审一轮、意见回灌修订后收尾。"""
    from selenyx_backend.routers.experts import seed_builtin_experts

    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    project_id = seed_project()
    run_id = make_run("写结论", project_id)

    main_replies = iter([
        json.dumps({"thought": "直接成稿", "final": "草稿 v1[^none]。"}),
        json.dumps({"thought": "按意见修订", "final": "终稿 v2[^none]。"}),
    ])
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        if any("核查以下草稿" in m.get("content", "") for m in messages):
            return "问题：缺少证据引用；结论过度外推。"
        return next(main_replies)

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写结论", project_id, events.append, lambda: False, review=True)

    review = next(e for e in events if e.get("kind") == "review")
    assert review["critic"] and "缺少证据引用" in review["text"]
    assert calls == 3  # 草稿、批评、修订
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert run.output_text == "终稿 v2[^none]。"


async def test_review_gate_off_by_default(tmp_path, monkeypatch):
    """默认 review=False：不触发批评员、无 review 事件。"""
    from selenyx_backend.routers.experts import seed_builtin_experts

    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    project_id = seed_project()
    run_id = make_run("写结论", project_id)

    async def fake_complete(messages):
        assert not any("审阅以下草稿" in m.get("content", "") for m in messages)
        return json.dumps({"thought": "成稿", "final": "直接终稿[^none]。"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "写结论", project_id, events.append, lambda: False)

    assert not [e for e in events if e.get("kind") == "review"]
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.output_text == "直接终稿[^none]。"


async def test_observation_folding(tmp_path, monkeypatch):
    """消息压缩：超长会话折叠早期观察，最近观察保持完整。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("多轮检索", project_id)

    async def fake_run_tool(session, pid, tool, args):
        return {"data": "x" * 5000, "n": args.get("n")}

    monkeypatch.setattr(agent_loop, "_run_tool", fake_run_tool)
    steps = [
        json.dumps({"thought": f"第 {i} 查", "tool": "search_library", "args": {"query": "q", "n": i}})
        for i in range(8)
    ]
    calls = script_llm(monkeypatch, steps + [json.dumps({"thought": "收尾", "final": "完。"})])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "多轮检索", project_id, events.append, lambda: False)

    final_call = calls[-1]
    observations = [m["content"] for m in final_call if m["role"] == "user" and m["content"].startswith(("工具 ", "（早期观察已折叠"))]
    assert len(observations) == 8
    folded = [c for c in observations if "（早期观察已折叠" in c]
    intact = [c for c in observations if "（早期观察已折叠" not in c]
    assert len(intact) == agent_loop._FOLD_KEEP_LAST
    assert len(folded) == 4
    assert all(len(c) < 1000 for c in folded)
    total = sum(len(m.get("content", "")) for m in final_call)
    assert total < 8 * 5100  # 折叠后显著小于全量


async def test_incremental_audit_persist(tmp_path, monkeypatch):
    """增量落库：run 进行中，已发生步骤已写入数据库。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("分两步走", project_id)

    replies = iter([
        json.dumps({"thought": "第一步", "tool": "project_context", "args": {}}),
        json.dumps({"thought": "第二步", "final": "完成。"}),
    ])
    mid_run_audit: list = []
    calls = 0

    async def fake_complete(messages):
        # json.dumps 默认转义非 ASCII，不能用中文子串判断，改用调用计数
        nonlocal calls
        calls += 1
        reply = next(replies)
        if calls == 2:  # 第二次调用时，第一步的 thought/tool/observation 应已落库
            with Session(get_engine()) as session:
                run = session.get(AgentRun, run_id)
                mid_run_audit.extend(json.loads(run.audit_log_json or "[]"))
        return reply

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)

    await agent_loop.execute_run(run_id, "分两步走", project_id, lambda e: None, lambda: False)

    kinds = [e["kind"] for e in mid_run_audit]
    assert kinds == ["thought", "tool", "observation"]


async def test_step_numbering_no_gaps(tmp_path, monkeypatch):
    """步数编号：含 subagent 的 run，step 序列单调、同轮事件同号、无跳号。"""
    from selenyx_backend.routers.experts import seed_builtin_experts

    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    run_id = make_run("委托专家", seed_project())

    replies = iter([
        '{"thought": "委托", "tool": "ask_expert", "args": {"expert": "reviewer", "question": "怎么归类？"}}',
        '{"thought": "再用工具", "tool": "list_references", "args": {}}',
        '{"thought": "收尾", "final": "完。"}',
    ])

    async def fake_complete(messages):
        system = messages[0]["content"] if messages else ""
        if "文献综述员" in system:
            return '{"thought": "分类", "final": "A/B 两类。"}'
        return next(replies)

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    import selenyx_backend.services.agent.subagents as subagents
    monkeypatch.setattr(subagents, "_complete", fake_complete)

    events: list[dict] = []
    await agent_loop.execute_run(run_id, "委托专家", None, events.append, lambda: False)

    steps = [e["step"] for e in events if e.get("type") == "step"]
    assert steps == sorted(steps)
    first_seen = list(dict.fromkeys(steps))
    assert first_seen == [1, 2, 3]


async def test_max_steps_forces_wrap_up(tmp_path, monkeypatch):
    """步数耗尽：强制模型基于已收集信息收尾一次，终稿来自强制收尾。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("超长任务", project_id)
    replies = [
        json.dumps({"thought": f"第 {i} 查", "tool": "list_references", "args": {}})
        for i in range(agent_loop.MAX_STEPS)
    ] + [json.dumps({"thought": "被迫收尾", "final": "阶段性结论：证据不足[^none]。"})]
    calls = script_llm(monkeypatch, replies)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "超长任务", project_id, events.append, lambda: False)

    assert len(calls) == agent_loop.MAX_STEPS + 1  # 12 步工具循环 + 1 次强制收尾
    assert any("已达到最大工具步数" in m.get("content", "") for m in calls[-1] if m["role"] == "user")
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert run.output_text == "阶段性结论：证据不足[^none]。"


async def test_max_steps_invalid_wrap_up_fails_closed(tmp_path, monkeypatch):
    """The forced-final path must not bypass the same evidence gate."""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("超长任务", project_id)
    replies = [
        json.dumps({"thought": f"第 {i} 查", "tool": "list_references", "args": {}})
        for i in range(agent_loop.MAX_STEPS)
    ] + [json.dumps({"final": "不能放行[^e:ghost-wrap-up]。"})]
    script_llm(monkeypatch, replies)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "超长任务", project_id, events.append, lambda: False)

    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "failed"
        assert run.output_text == ""
    assert any("ghost-wrap-up" in e.get("message", "") for e in events if e.get("kind") == "error")
    assert not [e for e in events if e.get("kind") == "final"]


async def test_max_steps_markerless_wrap_up_gets_one_repair_turn(tmp_path, monkeypatch):
    """Forced finalization cannot bypass the one-repair marker policy."""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("撰写研究结论", project_id)
    replies = [
        json.dumps({"thought": f"第 {i} 查", "tool": "list_references", "args": {}})
        for i in range(agent_loop.MAX_STEPS)
    ] + [
        json.dumps({"final": "集束化护理可以降低谵妄发生率。"}),
        json.dumps({"final": "当前尚无可接受证据[^none]。"}),
    ]
    calls = script_llm(monkeypatch, replies)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "撰写研究结论", project_id, events.append, lambda: False)

    assert len(calls) == agent_loop.MAX_STEPS + 2
    assert len([event for event in events if event.get("kind") == "review" and event.get("critic") == "证据门校验"]) == 1
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert run.output_text == "当前尚无可接受证据[^none]。"


async def test_max_steps_wrap_up_failure_falls_back(tmp_path, monkeypatch):
    """强制收尾也失败（LLM 故障）：落兜底文案，run 仍正常 completed。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("超长任务", project_id)
    replies = iter([
        json.dumps({"thought": f"第 {i} 查", "tool": "list_references", "args": {}})
        for i in range(agent_loop.MAX_STEPS)
    ])

    async def fake_complete(messages):
        try:
            return next(replies)
        except StopIteration:
            from fastapi import HTTPException
            raise HTTPException(502, "LLM 连接失败。")

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "超长任务", project_id, events.append, lambda: False)

    errors = [e for e in events if e.get("kind") == "error"]
    assert any("收尾调用失败" in e.get("message", "") for e in errors)
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert "已达到最大步数" in run.output_text


async def test_subagent_llm_failure_degrades_to_observation(tmp_path, monkeypatch):
    """子代理 LLM 故障：降级为 error 观察回灌主循环，不炸掉整个 run。"""
    from fastapi import HTTPException

    from selenyx_backend.routers.experts import seed_builtin_experts

    reset_backend(tmp_path, monkeypatch)
    seed_builtin_experts()
    run_id = make_run("委托专家", seed_project())

    script_llm(monkeypatch, [
        '{"thought": "委托", "tool": "ask_expert", "args": {"expert": "reviewer", "question": "怎么归类？"}}',
        '{"thought": "专家挂了，自己答", "final": "fallback 结论。"}',
    ])

    async def failing_complete(messages):
        raise HTTPException(503, "LLM 未配置。")

    import selenyx_backend.services.agent.subagents as subagents
    monkeypatch.setattr(subagents, "_complete", failing_complete)

    events: list[dict] = []
    await agent_loop.execute_run(run_id, "委托专家", None, events.append, lambda: False)

    observation = next(e for e in events if e.get("kind") == "observation")
    assert "暂不可用" in observation["result"]["error"]
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None and run.status == "completed"
        assert run.output_text == "fallback 结论。"


async def test_save_evidence_creates_pending_card(tmp_path, monkeypatch):
    """证据门：save_evidence 落 pending 卡（claim/excerpt/page），裁决权在人。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("落证据卡", project_id)
    script_llm(monkeypatch, [
        json.dumps({"thought": "落卡", "tool": "save_evidence", "args": {
            "claim": "集束化护理降低谵妄发生率", "excerpt": "ABCDE 集束使谵妄发生率下降 12%…",
            "page": 5, "relation": "supports",
        }}),
        json.dumps({"thought": "收尾", "final": "证据已落卡。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "落证据卡", project_id, events.append, lambda: False)

    observation = next(e for e in events if e.get("kind") == "observation")
    assert observation["result"]["saved"] is True
    assert observation["result"]["status"] == "pending"
    with Session(get_engine()) as session:
        item = session.get(EvidenceItem, observation["result"]["evidenceId"])
        assert item is not None
        assert item.status == "pending" and item.review == "pending"
        assert item.claim == "集束化护理降低谵妄发生率"
        assert item.page == 5
        assert item.project_id == project_id


async def test_save_evidence_requires_project(tmp_path, monkeypatch):
    """证据门：未关联项目的 run 不能落卡。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run("无项目落卡", seed_project())
    script_llm(monkeypatch, [
        json.dumps({"thought": "落卡", "tool": "save_evidence", "args": {"claim": "x", "excerpt": "y"}}),
        json.dumps({"thought": "收尾", "final": "完。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "无项目落卡", None, events.append, lambda: False)

    observation = next(e for e in events if e.get("kind") == "observation")
    assert "未关联项目" in observation["result"]["error"]


async def test_save_evidence_rejects_unknown_reference(tmp_path, monkeypatch):
    """证据门：referenceId 必须真实存在，防 agent 编造出处。"""
    reset_backend(tmp_path, monkeypatch)
    project_id = seed_project()
    run_id = make_run("编造出处", project_id)
    script_llm(monkeypatch, [
        json.dumps({"thought": "落卡", "tool": "save_evidence", "args": {
            "claim": "x", "excerpt": "y", "referenceId": "ref-not-exist",
        }}),
        json.dumps({"thought": "收尾", "final": "完。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "编造出处", project_id, events.append, lambda: False)

    observation = next(e for e in events if e.get("kind") == "observation")
    assert "文献不存在" in observation["result"]["error"]


def test_pending_evidence_route_enriches_titles(tmp_path, monkeypatch):
    """/evidence/pending：只回 pending 卡，并附文献标题与项目名。"""
    from selenyx_backend.models import Reference
    from selenyx_backend.routers.evidence import pending_evidence

    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        project = ResearchProject(name="谵妄预防", current_stage="evidence", reference_ids_json="[]")
        session.add(project)
        session.commit()
        session.refresh(project)
        session.add(Reference(id="r1", title="ABCDE 集束化护理与谵妄"))
        session.add(EvidenceItem(project_id=project.id, reference_id="r1", claim="待裁决论断", excerpt="摘录", status="pending", review="pending"))
        session.add(EvidenceItem(project_id=project.id, reference_id="r1", claim="已接受论断", excerpt="摘录2", status="accepted", review="accepted"))
        session.commit()

        result = pending_evidence(projectId=None, session=session)

    assert result["count"] == 1
    card = result["items"][0]
    assert card["claim"] == "待裁决论断"
    assert card["referenceTitle"] == "ABCDE 集束化护理与谵妄"
    assert card["projectName"] == "谵妄预防"


async def test_projectless_run_fabricated_citation_bounced(tmp_path, monkeypatch):
    """无项目 run 也不得放行编造引用：save_evidence 要求项目上下文，
    此时任何 [^e:id] 都不可能真实存在，必须打回一次并记录覆盖率为 0。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run("无项目成稿", "")
    script_llm(monkeypatch, [
        json.dumps({"thought": "直接成稿", "final": "集束化护理有效[^e:ghost-1]。"}),
        json.dumps({"thought": "修订", "final": "集束化护理可能有效[^none]。"}),
    ])
    events: list[dict] = []

    await agent_loop.execute_run(run_id, "无项目成稿", "", events.append, lambda: False)

    review = next(e for e in events if e.get("kind") == "review" and e.get("critic") == "证据门校验")
    assert "ghost-1" in review["text"]
    with Session(get_engine()) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"
        assert run.output_text == "集束化护理可能有效[^none]。"
