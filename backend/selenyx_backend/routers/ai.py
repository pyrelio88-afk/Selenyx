"""Local-only OpenAI-compatible LLM gateway.

The backend reads provider credentials from private local environment files.
It proxies only completion results and safe streaming deltas, never the
credential used to make the upstream request.
"""

from __future__ import annotations

import ipaddress
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from selenyx_backend.settings import Settings, get_settings

router = APIRouter()

_CHAT_TIMEOUT = 120.0
_STREAM_TIMEOUT = httpx.Timeout(connect=15.0, read=180.0, write=60.0, pool=15.0)


class ChatRequest(BaseModel):
    """The local frontend's OpenAI-compatible completion request."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    messages: list[dict[str, Any]] = Field(min_length=1)
    project_id: str | None = Field(default=None, alias="projectId")


def _is_loopback_base_url(base_url: str) -> bool:
    """Return whether an HTTP endpoint is explicitly bound to this device."""

    try:
        hostname = urlsplit(base_url).hostname
    except ValueError:
        return False

    if not hostname:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _completion_url(settings: Settings) -> str:
    """Validate and construct the OpenAI-compatible chat-completions URL."""

    base_url = settings.llm_base_url.strip()
    try:
        parsed = urlsplit(base_url)
    except ValueError as exc:
        raise HTTPException(503, "LLM base URL must be an absolute HTTP(S) URL.") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(503, "LLM base URL must be an absolute HTTP(S) URL.")
    return f"{base_url.rstrip('/')}/chat/completions"


def _has_api_key(settings: Settings) -> bool:
    return bool(settings.llm_api_key.strip())


def llm_is_configured(settings: Settings) -> bool:
    """Report readiness without exposing an API key.

    Local Ollama-compatible endpoints are allowed without a credential. Any
    non-loopback endpoint must have a key configured before it is considered
    usable, which avoids accidentally sending research data to an arbitrary
    remote endpoint with no authentication.
    """

    try:
        _completion_url(settings)
    except HTTPException:
        return False
    return _has_api_key(settings) or _is_loopback_base_url(settings.llm_base_url)


def _llm_settings() -> Settings:
    settings = get_settings()
    _completion_url(settings)
    if not llm_is_configured(settings):
        raise HTTPException(
            503,
            "LLM is not configured. Set SELENYX_LLM_API_KEY, or use a loopback Ollama-compatible endpoint.",
        )
    return settings


def _auth_headers(settings: Settings) -> dict[str, str]:
    """Use bearer auth when present; loopback Ollama needs no header."""

    if _has_api_key(settings):
        return {"Authorization": f"Bearer {settings.llm_api_key.strip()}"}
    return {}


def _completion_payload(settings: Settings, request: ChatRequest, *, stream: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": request.messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if stream:
        payload["stream"] = True
    return payload


def _new_http_client(timeout: httpx.Timeout | float) -> httpx.AsyncClient:
    """Factory kept small so gateway behavior can be tested with MockTransport."""

    return httpx.AsyncClient(timeout=timeout, follow_redirects=False)


def _completion_content(data: Any) -> str:
    """Extract a text completion while rejecting unexpected upstream payloads."""

    if not isinstance(data, dict):
        raise HTTPException(502, "LLM returned an unexpected response format.")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise HTTPException(502, "LLM returned an unexpected response format.")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise HTTPException(502, "LLM returned an unexpected response format.")
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text", ""), str)
        )
    if content is None:
        return ""
    raise HTTPException(502, "LLM returned an unexpected response format.")


def _stream_delta(data: Any) -> str:
    """Extract a text delta from OpenAI-compatible (or Ollama) streaming data."""

    if not isinstance(data, dict):
        return ""

    choices = data.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        choice = choices[0]
        delta = choice.get("delta")
        if isinstance(delta, dict) and isinstance(delta.get("content"), str):
            return delta["content"]
        if isinstance(choice.get("text"), str):
            return choice["text"]

    # Ollama's native response shape is harmless to support as a fallback,
    # even though the gateway normally targets its OpenAI-compatible endpoint.
    message = data.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"]
    if isinstance(data.get("response"), str):
        return data["response"]
    return ""


def _sse_data(payload: dict[str, str] | str) -> str:
    data = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"data: {data}\n\n"


async def _proxy_stream(response: httpx.Response, client: httpx.AsyncClient) -> AsyncIterator[str]:
    """Translate upstream chunks to a minimal, key-safe SSE contract."""

    try:
        async for line in response.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            upstream_data = line.removeprefix("data:").strip()
            if upstream_data == "[DONE]":
                yield _sse_data("[DONE]")
                return
            try:
                delta = _stream_delta(json.loads(upstream_data))
            except json.JSONDecodeError:
                # Ignore a malformed upstream event rather than reflecting it
                # to the desktop client (or accidentally reflecting a secret).
                continue
            if delta:
                yield _sse_data({"delta": delta})
        # A few compatible servers close a completed stream without [DONE].
        yield _sse_data("[DONE]")
    except httpx.HTTPError:
        yield "event: error\ndata: {\"detail\":\"LLM stream interrupted\"}\n\n"
    finally:
        await response.aclose()
        await client.aclose()


async def _post_completion(request: ChatRequest) -> httpx.Response:
    settings = _llm_settings()
    try:
        async with _new_http_client(_CHAT_TIMEOUT) as client:
            response = await client.post(
                _completion_url(settings),
                headers=_auth_headers(settings),
                json=_completion_payload(settings, request, stream=False),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "LLM connection failed.") from exc
    if response.status_code != 200:
        raise HTTPException(502, f"LLM request failed with status {response.status_code}.")
    return response


@router.get("/config")
def config_status():
    settings = get_settings()
    return {
        "configured": llm_is_configured(settings),
        "baseUrl": settings.llm_base_url,
        "model": settings.llm_model,
    }


@router.get("/test")
async def test_connection():
    settings = _llm_settings()
    try:
        async with _new_http_client(15.0) as client:
            response = await client.post(
                _completion_url(settings),
                headers=_auth_headers(settings),
                json={
                    "model": settings.llm_model,
                    "messages": [{"role": "user", "content": "Reply with: Selenyx OK"}],
                    "max_tokens": 10,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "LLM connection failed.") from exc
    if response.status_code != 200:
        raise HTTPException(502, f"LLM request failed with status {response.status_code}.")
    return {"ok": True, "model": settings.llm_model}


@router.post("/chat")
async def chat(request: ChatRequest):
    response = await _post_completion(request)
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(502, "LLM returned an unexpected response format.") from exc
    return {
        "id": f"msg-{datetime.now().timestamp()}",
        "role": "assistant",
        "content": _completion_content(data),
        "toolCalls": [],
        "referenceIds": [],
        "annotationIds": [],
        "timestamp": datetime.now().isoformat(),
        "projectId": request.project_id,
    }


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    settings = _llm_settings()
    client = _new_http_client(_STREAM_TIMEOUT)
    try:
        upstream = await client.send(
            client.build_request(
                "POST",
                _completion_url(settings),
                headers=_auth_headers(settings),
                json=_completion_payload(settings, request, stream=True),
            ),
            stream=True,
        )
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(502, "LLM connection failed.") from exc

    if upstream.status_code != 200:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(502, f"LLM request failed with status {upstream.status_code}.")

    return StreamingResponse(
        _proxy_stream(upstream, client),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/recipes/run")
def run_recipe(recipe_id: str, input: str, project_id: str):
    return {"runId": f"run-{datetime.now().timestamp()}", "status": "staged", "recipeId": recipe_id, "projectId": project_id}
