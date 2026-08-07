"""Local-only OpenAI-compatible LLM gateway.

The API key is read from backend/.env.local. The frontend never needs to embed
or persist it, which keeps a packaged desktop or mobile client free of secrets.
"""

from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException

from selenyx_backend.settings import get_settings

router = APIRouter()


def _llm_settings():
    settings = get_settings()
    if not settings.llm_api_key:
        raise HTTPException(503, "LLM is not configured. Set SELENYX_LLM_API_KEY in backend/.env.local.")
    return settings


@router.get("/config")
def config_status():
    settings = get_settings()
    return {
        "configured": bool(settings.llm_api_key),
        "baseUrl": settings.llm_base_url,
        "model": settings.llm_model,
    }


@router.get("/test")
async def test_connection():
    settings = _llm_settings()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json={
                    "model": settings.llm_model,
                    "messages": [{"role": "user", "content": "Reply with: Selenyx OK"}],
                    "max_tokens": 10,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"LLM connection failed: {exc}") from exc
    if response.status_code != 200:
        raise HTTPException(response.status_code, "LLM rejected the local backend request")
    return {"ok": True, "model": settings.llm_model}


@router.post("/chat")
async def chat(messages: list[dict], project_id: str | None = None):
    settings = _llm_settings()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json={"model": settings.llm_model, "messages": messages, "temperature": 0.3, "max_tokens": 4096},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"LLM connection failed: {exc}") from exc
    if response.status_code != 200:
        raise HTTPException(response.status_code, response.text[:300])
    data = response.json()
    return {
        "id": f"msg-{datetime.now().timestamp()}",
        "role": "assistant",
        "content": data["choices"][0]["message"]["content"],
        "toolCalls": [],
        "referenceIds": [],
        "annotationIds": [],
        "timestamp": datetime.now().isoformat(),
        "projectId": project_id,
    }


@router.post("/recipes/run")
def run_recipe(recipe_id: str, input: str, project_id: str):
    return {"runId": f"run-{datetime.now().timestamp()}", "status": "staged", "recipeId": recipe_id, "projectId": project_id}
