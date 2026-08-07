"""Per-host polite rate limiter (Runcell / OpenScience absorb)."""

from __future__ import annotations

import asyncio
import time
from urllib.parse import urlsplit

# Minimum interval between outbound requests to the same host (ms → s).
_DEFAULT_INTERVALS: dict[str, float] = {
    "api.openalex.org": 0.12,
    "api.crossref.org": 0.15,
    "eutils.ncbi.nlm.nih.gov": 0.35,
    "export.arxiv.org": 3.0,
    "arxiv.org": 3.0,
    "api.unpaywall.org": 0.25,
}

_last_call: dict[str, float] = {}
_locks: dict[str, asyncio.Lock] = {}


def reset_rate_limits() -> None:
    """Test helper."""
    _last_call.clear()


def _interval_for(host: str) -> float:
    host = host.lower()
    if host in _DEFAULT_INTERVALS:
        return _DEFAULT_INTERVALS[host]
    for key, value in _DEFAULT_INTERVALS.items():
        if host.endswith(key):
            return value
    return 0.05


def _lock_for(host: str) -> asyncio.Lock:
    lock = _locks.get(host)
    if lock is None:
        lock = asyncio.Lock()
        _locks[host] = lock
    return lock


async def await_host(url_or_host: str) -> None:
    """Wait until it is polite to call this host again."""
    host = url_or_host
    if "://" in url_or_host:
        host = urlsplit(url_or_host).hostname or url_or_host
    host = host.lower()
    interval = _interval_for(host)
    async with _lock_for(host):
        now = time.monotonic()
        last = _last_call.get(host, 0.0)
        wait = interval - (now - last)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call[host] = time.monotonic()
