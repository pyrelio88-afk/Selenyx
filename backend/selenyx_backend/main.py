"""
Selenyx 后端入口 — FastAPI 应用
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from selenyx_backend.routers import references, projects, search, ai, clinical, citations

app = FastAPI(
    title="Selenyx API",
    version="2.0.0-alpha",
    description="本地优先科研工作台后端 — 文献管理 / 检索 / AI / 临床数据",
)

# CORS — 允许前端 Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 路由挂载 ===
app.include_router(references.router, prefix="/api/references", tags=["文献"])
app.include_router(projects.router, prefix="/api/projects", tags=["项目"])
app.include_router(search.router, prefix="/api/search", tags=["检索"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
app.include_router(clinical.router, prefix="/api/clinical", tags=["临床数据"])
app.include_router(citations.router, prefix="/api/citations", tags=["引用格式化"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0-alpha"}
