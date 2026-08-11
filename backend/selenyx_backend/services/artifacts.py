"""agent 写工具的本地落盘：笔记与运行工件（V4 模块 B）。

本地优先：一律写到数据目录（默认 ~/.selenyx）下，不出本机——
- ``{data_dir}/notes/``                    agent 笔记（.md）
- ``{data_dir}/artifacts/runs/{runId}/``  run 工件（成稿等）

所有文件名经净化（去路径分隔与遍历），agent 生成的名字不能直接拼路径。
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any

from selenyx_backend.settings import get_settings

_SAFE_NAME_RE = re.compile(r"[^\w.一-鿿-]+", re.UNICODE)
_MAX_LIST = 20
_CONTENT_LIMIT = 4000


def _slug(text: str, fallback: str = "untitled") -> str:
    slug = _SAFE_NAME_RE.sub("-", (text or "").strip()).strip("-.")[:48]
    return slug or fallback


def notes_dir() -> Path:
    path = get_settings().data_dir / "notes"
    path.mkdir(parents=True, exist_ok=True)
    return path


def run_artifacts_dir(run_id: str) -> Path:
    path = get_settings().data_dir / "artifacts" / "runs" / _slug(run_id, "run")
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_note(title: str, content: str) -> dict[str, Any]:
    """写一篇 agent 笔记，返回文件名与预览。同名同日追加序号防覆盖。"""
    title = (title or "").strip()[:80] or "未命名笔记"
    content = (content or "").strip()
    if not content:
        return {"error": "content 不能为空"}
    stamp = datetime.now().strftime("%Y%m%d")
    base = f"{stamp}-{_slug(title)}"
    name = f"{base}.md"
    seq = 2
    while (notes_dir() / name).exists():
        name = f"{base}-{seq}.md"
        seq += 1
    body = f"# {title}\n\n{content}\n"
    (notes_dir() / name).write_text(body, encoding="utf-8")
    return {"saved": True, "name": name, "title": title, "preview": content[:120]}


def list_notes() -> dict[str, Any]:
    entries = []
    for path in sorted(notes_dir().glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[
        :_MAX_LIST
    ]:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        first_line = text.splitlines()[0].lstrip("# ").strip() if text.strip() else ""
        entries.append(
            {
                "name": path.name,
                "title": first_line[:80] or path.stem,
                "preview": " ".join(text.split())[:120],
                "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            }
        )
    return {"notes": entries, "count": len(entries)}


def read_note(name: str) -> dict[str, Any]:
    safe = Path(_slug(name)).name  # 防 ../ 遍历
    if not safe.endswith(".md"):
        safe += ".md"
    path = notes_dir() / safe
    if not path.exists():
        return {"error": f"笔记不存在：{safe}（先用 list_notes 取真实名字）"}
    content = path.read_text(encoding="utf-8", errors="replace")
    return {"name": safe, "content": content[:_CONTENT_LIMIT], "truncated": len(content) > _CONTENT_LIMIT}


def write_artifact(run_id: str, name: str, content: str) -> dict[str, Any]:
    """把工件（成稿等）落到 run 目录，返回相对路径。"""
    content = (content or "").strip()
    if not content:
        return {"error": "content 不能为空"}
    safe = _slug(name or "draft.md", "draft.md")
    if "." not in safe:
        safe += ".md"
    path = run_artifacts_dir(run_id) / safe
    path.write_text(content, encoding="utf-8")
    rel = path.relative_to(get_settings().data_dir).as_posix()
    return {"saved": True, "name": safe, "path": rel, "chars": len(content)}
