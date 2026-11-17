"""Shared path-traversal-safe slug and filename helpers for local disk storage."""

from __future__ import annotations

import re
from pathlib import Path

_SAFE_NAME_RE = re.compile(r"[^\w.\u4e00-\u9fff-]+", re.UNICODE)


def safe_slug(text: str, fallback: str = "untitled", *, max_len: int = 48) -> str:
    """Sanitize an arbitrary identifier or title into a single safe path segment."""
    slug = _SAFE_NAME_RE.sub("-", (text or "").strip()).strip("-.")[:max_len]
    if not slug or slug in {".", ".."}:
        return fallback
    return slug


def safe_markdown_filename(name: str, fallback: str = "untitled", *, max_len: int = 80) -> str:
    """Return a safe `<slug>.md` filename stripped of any directory components."""
    raw = (name or "").strip()
    if raw.lower().endswith(".md"):
        raw = raw[:-3]
    base = Path(safe_slug(raw, fallback, max_len=max_len)).name
    return f"{base}.md"


__all__ = ["safe_slug", "safe_markdown_filename"]
