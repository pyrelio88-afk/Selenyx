"""Cached reachability probes for fixed public scholarly APIs."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx

ACADEMIC_PROBE_TIMEOUT_SECONDS = 3.0
ACADEMIC_PROBE_CACHE_TTL_SECONDS = 60.0

_ACADEMIC_PROBES: tuple[dict[str, str], ...] = (
    {
        "key": "openalex",
        "name": "OpenAlex",
        "url": "https://api.openalex.org/works",
        "params": "search=selenyx&per-page=1",
    },
    {
        "key": "crossref",
        "name": "Crossref",
        "url": "https://api.crossref.org/works",
        "params": "query=selenyx&rows=1",
    },
    {
        "key": "pubmed",
        "name": "PubMed",
        "url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        "params": "db=pubmed&term=selenyx&retmax=1&retmode=json",
    },
    {
        "key": "arxiv",
        "name": "arXiv",
        "url": "https://export.arxiv.org/api/query",
        "params": "search_query=all:selenyx&start=0&max_results=1",
    },
)

_ACADEMIC_PROBE_CACHE: tuple[float, dict[str, Any]] | None = None
_ACADEMIC_PROBE_LOCK = asyncio.Lock()

ProbeFn = Callable[[dict[str, str], float], Awaitable[dict[str, Any]]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_clone(value: Any) -> Any:
    """Copy JSON-shaped cached data so callers cannot mutate the cache."""
    return json.loads(json.dumps(value, ensure_ascii=False))


def clear_academic_probe_cache() -> None:
    """Reset the short-lived cache (used by tests and explicit force probes)."""
    global _ACADEMIC_PROBE_CACHE
    _ACADEMIC_PROBE_CACHE = None


def cached_academic_probe() -> dict[str, Any] | None:
    """Return a fresh probe snapshot without initiating network traffic."""
    cached = _ACADEMIC_PROBE_CACHE
    if not cached or time.monotonic() - cached[0] >= ACADEMIC_PROBE_CACHE_TTL_SECONDS:
        return None
    payload = _json_clone(cached[1])
    payload["cached"] = True
    return payload


async def _probe_academic_one(spec: dict[str, str], timeout_seconds: float) -> dict[str, Any]:
    """Make one tiny public API request; only fixed URLs reach this function."""
    started = time.perf_counter()
    try:
        params = dict(item.split("=", 1) for item in spec["params"].split("&"))
        timeout = httpx.Timeout(timeout_seconds)
        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=False, trust_env=False
        ) as client:
            async with client.stream(
                "GET",
                spec["url"],
                params=params,
                headers={"User-Agent": "Selenyx/0.4 connector-probe"},
            ) as response:
                async for _chunk in response.aiter_bytes():
                    break
                status_code = response.status_code
        elapsed = round((time.perf_counter() - started) * 1000)
        if 200 <= status_code < 400:
            return {
                "key": spec["key"],
                "name": spec["name"],
                "status": "ok",
                "statusCode": status_code,
                "latencyMs": elapsed,
                "detail": f"HTTP {status_code} · {elapsed} ms",
            }
        return {
            "key": spec["key"],
            "name": spec["name"],
            "status": "error",
            "statusCode": status_code,
            "latencyMs": elapsed,
            "detail": f"HTTP {status_code}",
        }
    except httpx.TimeoutException:
        return {
            "key": spec["key"],
            "name": spec["name"],
            "status": "timeout",
            "statusCode": None,
            "latencyMs": round((time.perf_counter() - started) * 1000),
            "detail": f"超时（{timeout_seconds:g} 秒）",
        }
    except httpx.HTTPError:
        return {
            "key": spec["key"],
            "name": spec["name"],
            "status": "error",
            "statusCode": None,
            "latencyMs": round((time.perf_counter() - started) * 1000),
            "detail": "连接失败（未显示上游响应内容）",
        }


async def _bounded_academic_probe(
    spec: dict[str, str],
    timeout_seconds: float,
    probe_fn: ProbeFn,
) -> dict[str, Any]:
    """Protect the aggregate probe even if a mocked/client implementation hangs."""
    try:
        return await asyncio.wait_for(probe_fn(spec, timeout_seconds), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return {
            "key": spec["key"],
            "name": spec["name"],
            "status": "timeout",
            "statusCode": None,
            "latencyMs": round(timeout_seconds * 1000),
            "detail": f"超时（{timeout_seconds:g} 秒）",
        }


async def probe_academic_connectors(
    *,
    force: bool = False,
    timeout_seconds: float | None = None,
    probe_one: ProbeFn | None = None,
) -> dict[str, Any]:
    """Probe public scholarly providers in parallel with a transparent TTL cache."""
    global _ACADEMIC_PROBE_CACHE
    effective_timeout = (
        ACADEMIC_PROBE_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    )
    effective_probe = _probe_academic_one if probe_one is None else probe_one

    now = time.monotonic()
    cached = _ACADEMIC_PROBE_CACHE
    if not force and cached and now - cached[0] < ACADEMIC_PROBE_CACHE_TTL_SECONDS:
        payload = _json_clone(cached[1])
        payload["cached"] = True
        return payload

    async with _ACADEMIC_PROBE_LOCK:
        now = time.monotonic()
        cached = _ACADEMIC_PROBE_CACHE
        if not force and cached and now - cached[0] < ACADEMIC_PROBE_CACHE_TTL_SECONDS:
            payload = _json_clone(cached[1])
            payload["cached"] = True
            return payload
        results = await asyncio.gather(
            *(
                _bounded_academic_probe(spec, effective_timeout, effective_probe)
                for spec in _ACADEMIC_PROBES
            )
        )
        payload = {
            "checkedAt": _now(),
            "cached": False,
            "timeoutSeconds": effective_timeout,
            "cacheTtlSeconds": ACADEMIC_PROBE_CACHE_TTL_SECONDS,
            "connectors": results,
        }
        _ACADEMIC_PROBE_CACHE = (time.monotonic(), _json_clone(payload))
        return payload


__all__ = [
    "ACADEMIC_PROBE_CACHE_TTL_SECONDS",
    "ACADEMIC_PROBE_TIMEOUT_SECONDS",
    "_ACADEMIC_PROBES",
    "_probe_academic_one",
    "cached_academic_probe",
    "clear_academic_probe_cache",
    "probe_academic_connectors",
]
