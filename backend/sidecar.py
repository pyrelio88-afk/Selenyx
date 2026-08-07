"""Entrypoint used to package the local FastAPI service as a Tauri sidecar."""

import os

import uvicorn

from selenyx_backend.main import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.environ.get("SELENYX_HOST", "127.0.0.1"),
        port=int(os.environ.get("SELENYX_PORT", "8770")),
        log_level=os.environ.get("SELENYX_LOG_LEVEL", "warning"),
    )
