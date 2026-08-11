"""V4 模块 F：SKILL.md 技能包与两层记忆的测试。"""

import json

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import AgentRun, ResearchProject
from selenyx_backend.services import memory as memory_svc
from selenyx_backend.services import skills as skills_svc
from selenyx_backend.services.agent import loop as agent_loop
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def make_run(goal: str = "调研", project_id: str = "") -> str:
    with Session(get_engine()) as session:
        run = AgentRun(recipe_id="agent-loop", project_id=project_id, status="running", input_text=goal)
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id


# ---------- 技能包 ----------


def test_skill_save_parse_and_project_shadow(tmp_path, monkeypatch):
    """SKILL.md 保存/解析；项目级同名遮蔽用户级。"""
    reset_backend(tmp_path, monkeypatch)
    skills_svc.save_skill("文献速读", "只提炼要点，不写长文。", "快速提炼", ["search_library", "list_references"])
    user_skill = skills_svc.get_skill("文献速读")
    assert user_skill is not None and user_skill["scope"] == "user"
    assert user_skill["allowedTools"] == ["search_library", "list_references"]
    assert user_skill["enabled"] is True

    skills_svc.save_skill("文献速读", "项目版指令。", "项目版", [], True, "proj-1")
    shadowed = skills_svc.get_skill("文献速读", "proj-1")
    assert shadowed is not None and shadowed["scope"] == "project"
    assert shadowed["instructions"] == "项目版指令。"
    # 用户级不受影响
    assert skills_svc.get_skill("文献速读")["instructions"].startswith("只提炼要点")


def test_skill_toggle_and_delete(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    skills_svc.save_skill("临时技能", "正文。")
    disabled = skills_svc.set_enabled("临时技能", False)
    assert disabled is not None and disabled["enabled"] is False
    # 启停状态持久化到文件
    assert skills_svc.get_skill("临时技能")["enabled"] is False
    assert skills_svc.delete_skill("临时技能") is True
    assert skills_svc.get_skill("临时技能") is None


async def test_skill_directive_and_tool_whitelist(tmp_path, monkeypatch):
    """技能指令注入 system；白名单外工具被拦截且不执行。"""
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    seen: list[list[dict]] = []
    calls = 0

    async def fake_complete(messages):
        nonlocal calls
        calls += 1
        seen.append([dict(m) for m in messages])
        if calls == 1:
            return json.dumps({"thought": "试越界", "tool": "write_note", "args": {"title": "t", "content": "c"}})
        return json.dumps({"thought": "收尾", "final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    events: list[dict] = []
    await agent_loop.execute_run(
        run_id, "调研", None, events.append, lambda: False,
        skill_directive="技能「只读模式」：只能检索不能写。",
        allowed_tools={"search_library", "list_references"},
    )
    # 技能指令进入 system
    assert any("只读模式" in m["content"] for m in seen[0] if m["role"] == "system")
    # 越界工具被拦截：观察里有错误与可用清单
    blocked = [e for e in events if e.get("kind") == "observation" and isinstance(e.get("result"), dict) and "allowedTools" in e["result"]]
    assert blocked and "不允许使用工具 write_note" in blocked[0]["result"]["error"]
    # 笔记没有真的落盘
    assert not list((tmp_path / "notes").glob("*.md")) if (tmp_path / "notes").exists() else True
    assert get_run(run_id).status == "completed"


# ---------- 两层记忆 ----------


def test_memory_append_read_clear(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    memory_svc.append_memory("该项目聚焦老年谵妄", "proj-1")
    memory_svc.append_memory("用户偏好简体中文", None)
    assert "老年谵妄" in memory_svc.read_memory("proj-1")
    assert "简体中文" in memory_svc.read_memory(None)
    # 追加带日期前缀
    assert "- [20" in memory_svc.read_memory("proj-1")
    memory_svc.clear_memory("proj-1")
    assert memory_svc.read_memory("proj-1") == ""


def test_memory_digest_two_layers(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    memory_svc.append_memory("全局偏好", None)
    memory_svc.append_memory("项目聚焦", "proj-1")
    digest = memory_svc.memory_digest("proj-1")
    assert "【全局记忆】" in digest and "【项目记忆】" in digest
    assert memory_svc.memory_digest(None).find("【项目记忆】") == -1


async def test_memory_injected_at_run_start(tmp_path, monkeypatch):
    """run 启动注入记忆摘要：第二次 run 的 system 上下文能看到第一次写的记忆。"""
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        project = ResearchProject(name="谵妄预防", current_stage="evidence")
        session.add(project)
        session.commit()
        session.refresh(project)
        project_id = project.id
    # 第一次 run：agent 用 write_memory 落记忆
    run1 = make_run("摸底", project_id)
    calls = 0

    async def fake_complete_1(messages):
        nonlocal calls
        calls += 1
        if calls == 1:
            return json.dumps({"thought": "记一笔", "tool": "write_memory", "args": {"content": "该项目聚焦老年谵妄"}})
        return json.dumps({"final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete_1)
    await agent_loop.execute_run(run1, "摸底", project_id, lambda e: None, lambda: False)
    assert "老年谵妄" in memory_svc.read_memory(project_id)

    # 第二次 run：启动即注入项目记忆
    run2 = make_run("继续", project_id)
    seen: list[list[dict]] = []

    async def fake_complete_2(messages):
        seen.append([dict(m) for m in messages])
        return json.dumps({"final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete_2)
    await agent_loop.execute_run(run2, "继续", project_id, lambda e: None, lambda: False)
    system_msg = next(m["content"] for m in seen[0] if m["role"] == "system")
    assert "老年谵妄" in system_msg and "【项目记忆】" in system_msg


async def test_custom_instructions_injected(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    run_id = make_run()
    seen: list[list[dict]] = []

    async def fake_complete(messages):
        seen.append([dict(m) for m in messages])
        return json.dumps({"final": "完成"})

    monkeypatch.setattr(agent_loop, "_complete", fake_complete)
    await agent_loop.execute_run(
        run_id, "调研", None, lambda e: None, lambda: False,
        custom_instructions="所有输出使用简体中文；引用必须给出处。",
    )
    system_msg = next(m["content"] for m in seen[0] if m["role"] == "system")
    assert "用户自定义指令" in system_msg and "引用必须给出处" in system_msg


def get_run(run_id: str) -> AgentRun:
    with Session(get_engine()) as session:
        return session.get(AgentRun, run_id)
