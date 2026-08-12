"""V4 模块 H：agent run 与浏览器本地助理会话的来源链接。"""

from selenyx_backend.models import AgentRun
from selenyx_backend.routers import agent as agent_router


def test_start_run_body_accepts_opaque_chat_origin_aliases():
    body = agent_router.StartRunBody.model_validate(
        {
            "goal": "整理术后谵妄预防证据",
            "sourceSessionId": "session-local-42",
            "sourceSessionScope": "project-a",
        }
    )

    assert body.source_session_id == "session-local-42"
    assert body.source_session_scope == "project-a"


def test_agent_run_serializes_chat_origin_without_chat_content():
    run = AgentRun(
        id="run-42",
        project_id="project-a",
        status="completed",
        input_text="整理术后谵妄预防证据",
        output_text="真实任务产出",
        source_session_id="session-local-42",
        source_session_scope="project-a",
    )

    summary = agent_router._serialize(run, with_log=False)
    detail = agent_router._serialize(run, with_log=True)

    assert summary["sourceSessionId"] == "session-local-42"
    assert summary["sourceSessionScope"] == "project-a"
    assert detail["sourceSessionId"] == "session-local-42"
    assert detail["sourceSessionScope"] == "project-a"
    assert detail["outputText"] == "真实任务产出"
