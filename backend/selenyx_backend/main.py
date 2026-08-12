"""Selenyx local FastAPI application."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from selenyx_backend.database import init_db
from selenyx_backend.routers import agent, ai, automations, citations, clinical, connectors, evidence, experts, memory, projects, references, search, skills, zotero
from selenyx_backend.services.agent import registry
from selenyx_backend.services.embeddings import embedding_runtime_summary
from selenyx_backend.services.scheduler import scheduler_loop
from selenyx_backend.settings import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    experts.seed_builtin_experts()
    # 进程重启后进行中的 run 不可能还活着：收敛为 failed，避免前端永久轮询
    registry.mark_stale_runs_failed()
    stop = asyncio.Event()
    scheduler = asyncio.create_task(scheduler_loop(stop))
    try:
        yield
    finally:
        stop.set()
        await scheduler


# CORS is a startup-only transport setting. Secrets and AI configuration are
# intentionally read inside each route so edits to ~/.selenyx/.env.local take
# effect without retaining an old API key in memory.
startup_settings = get_settings()
app = FastAPI(
    title="Selenyx API",
    version="0.2.0",
    description="Local-first research workspace backend (SQLite + RAG + scholarly connectors).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=startup_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(references.router, prefix="/api/references", tags=["references"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(evidence.router, prefix="/api/evidence", tags=["evidence"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(clinical.router, prefix="/api/clinical", tags=["clinical"])
app.include_router(citations.router, prefix="/api/citations", tags=["citations"])
app.include_router(zotero.router, prefix="/api/zotero", tags=["zotero"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(experts.router, prefix="/api/experts", tags=["experts"])
app.include_router(automations.router, prefix="/api/automations", tags=["automations"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["connectors"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])


@app.get("/api/health")
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "version": app.version,
        "storage": "local-sqlite",
        "llmConfigured": ai.llm_is_configured(settings),
        "rag": "hybrid-hash+optional-dense",
        # This reports configuration, not reachability. Dense calls always
        # retain a deterministic local fallback when the provider is offline.
        "embedding": embedding_runtime_summary(settings),
        "features": ["references", "projects", "rag", "scholarly", "evidence", "zotero", "ai-gateway", "agent", "experts", "automations"],
    }
