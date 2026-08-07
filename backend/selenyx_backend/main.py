"""Selenyx local FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from selenyx_backend.database import init_db
from selenyx_backend.routers import ai, citations, clinical, projects, references, search
from selenyx_backend.settings import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


settings = get_settings()
app = FastAPI(
    title="Selenyx API",
    version="2.0.0-alpha",
    description="Local-first research workspace backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(references.router, prefix="/api/references", tags=["references"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(clinical.router, prefix="/api/clinical", tags=["clinical"])
app.include_router(citations.router, prefix="/api/citations", tags=["citations"])


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": app.version,
        "storage": "local-sqlite",
        "llmConfigured": bool(settings.llm_api_key),
    }
