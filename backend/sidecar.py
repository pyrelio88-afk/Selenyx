"""Entrypoint used to package the local FastAPI service as a Tauri sidecar."""

import os

import uvicorn

from selenyx_backend.main import app


# The packaged sidecar is deliberately a fixed loopback service. The desktop
# shell and webview both use this endpoint, so inherited host/port variables
# must not redirect a packaged build to a LAN listener or a mismatched port.
LOOPBACK_HOST = "127.0.0.1"
LOOPBACK_PORT = 8770


def sidecar_host() -> str:
    return LOOPBACK_HOST


def sidecar_port() -> int:
    return LOOPBACK_PORT


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=sidecar_host(),
        port=sidecar_port(),
        log_level=os.environ.get("SELENYX_LOG_LEVEL", "warning"),
    )
