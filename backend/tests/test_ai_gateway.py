import json

import httpx
import pytest

import selenyx_backend.routers.ai as ai_router
import selenyx_backend.settings as settings_module
from selenyx_backend.main import app
from selenyx_backend.settings import get_settings


def configure_local_llm(tmp_path, monkeypatch, *, api_key: str = "", base_url: str = "http://127.0.0.1:11434/v1"):
    """Point settings at a temporary app-local env file without reading user secrets."""

    local_config = tmp_path / ".selenyx" / ".env.local"
    local_config.parent.mkdir()
    local_config.write_text(
        "\n".join(
            [
                f"SELENYX_LLM_BASE_URL={base_url}",
                "SELENYX_LLM_MODEL=qwen2.5:0.5b",
                f"SELENYX_LLM_API_KEY={api_key}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings_module, "development_env_file", lambda: tmp_path / "missing-dev.env")
    monkeypatch.setattr(settings_module, "local_env_file", lambda: local_config)
    monkeypatch.delenv("SELENYX_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("SELENYX_LLM_MODEL", raising=False)
    monkeypatch.delenv("SELENYX_LLM_API_KEY", raising=False)
    return local_config


def test_settings_reloads_application_env_file_without_cached_key(tmp_path, monkeypatch):
    local_config = configure_local_llm(tmp_path, monkeypatch, api_key="first-local-key")

    assert get_settings().llm_api_key == "first-local-key"

    local_config.write_text(
        "\n".join(
            [
                "SELENYX_LLM_BASE_URL=http://127.0.0.1:11434/v1",
                "SELENYX_LLM_MODEL=qwen2.5:0.5b",
                "SELENYX_LLM_API_KEY=second-local-key",
                "",
            ]
        ),
        encoding="utf-8",
    )

    assert get_settings().llm_api_key == "second-local-key"


@pytest.mark.asyncio
async def test_loopback_ollama_chat_and_stream_do_not_send_or_return_a_key(tmp_path, monkeypatch):
    configure_local_llm(tmp_path, monkeypatch)
    seen_requests: list[httpx.Request] = []

    def upstream(request: httpx.Request) -> httpx.Response:
        seen_requests.append(request)
        body = json.loads(request.content)
        if body.get("stream"):
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                content=(
                    b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
                    b'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
                    b"data: [DONE]\n\n"
                ),
            )
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Local response"}}]},
        )

    transport = httpx.MockTransport(upstream)
    monkeypatch.setattr(
        ai_router,
        "_new_http_client",
        lambda timeout: httpx.AsyncClient(transport=transport, timeout=timeout),
    )

    local_transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=local_transport, base_url="http://testserver") as client:
        config = await client.get("/api/ai/config")
        assert config.status_code == 200
        assert config.json() == {
            "configured": True,
            "baseUrl": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5:0.5b",
        }

        chat = await client.post(
            "/api/ai/chat",
            json={"messages": [{"role": "user", "content": "Hello"}], "projectId": "project-1"},
        )
        assert chat.status_code == 200
        assert chat.json()["content"] == "Local response"
        assert chat.json()["projectId"] == "project-1"

        stream = await client.post(
            "/api/ai/chat/stream",
            json={"messages": [{"role": "user", "content": "Hello"}], "projectId": "project-1"},
        )

    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert stream.text == 'data: {"delta":"Hello"}\n\ndata: {"delta":" world"}\n\ndata: [DONE]\n\n'
    assert len(seen_requests) == 2
    assert all(request.headers.get("authorization") is None for request in seen_requests)
    assert all(request.url.host == "127.0.0.1" for request in seen_requests)
    assert json.loads(seen_requests[1].content)["stream"] is True


@pytest.mark.asyncio
async def test_remote_endpoint_without_a_key_is_not_treated_as_configured(tmp_path, monkeypatch):
    configure_local_llm(tmp_path, monkeypatch, base_url="https://example.invalid/v1")
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        config = await client.get("/api/ai/config")
        chat = await client.post(
            "/api/ai/chat",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

    assert config.json()["configured"] is False
    assert chat.status_code == 503
    assert "API_KEY" in chat.json()["detail"]


@pytest.mark.asyncio
async def test_gateway_never_reflects_a_configured_key(tmp_path, monkeypatch):
    test_key = "test-gateway-key"
    configure_local_llm(tmp_path, monkeypatch, api_key=test_key, base_url="https://provider.invalid/v1")

    def rejected_upstream(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == f"Bearer {test_key}"
        # A badly behaved upstream might echo request metadata in its error
        # body; the local gateway must not surface that body to the client.
        return httpx.Response(401, text=f"diagnostic includes {test_key}")

    monkeypatch.setattr(
        ai_router,
        "_new_http_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(rejected_upstream), timeout=timeout),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        config = await client.get("/api/ai/config")
        failed_chat = await client.post(
            "/api/ai/chat",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

    assert test_key not in config.text
    assert test_key not in failed_chat.text
    assert failed_chat.status_code == 502


def test_packaged_sidecar_uses_the_fixed_desktop_loopback_endpoint(monkeypatch):
    monkeypatch.setenv("SELENYX_HOST", "0.0.0.0")
    monkeypatch.setenv("SELENYX_PORT", "49152")

    import sidecar

    assert sidecar.sidecar_host() == "127.0.0.1"
    assert sidecar.sidecar_port() == 8770
