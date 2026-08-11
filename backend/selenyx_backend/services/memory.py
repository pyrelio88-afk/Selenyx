"""两层记忆（V4 模块 F）：全局 + 项目级 Markdown 记忆。

本地优先的铁律：**记忆永不外发**——只作为 prompt 上下文注入用户自己
配置的 LLM 网关，不写入任何遥测/同步通路。

- 全局：``{data_dir}/memory/MEMORY.md``
- 项目：``{data_dir}/projects/{project_id}/memory.md``

run 启动注入摘要（digest），运行中 agent 可用 read_memory / write_memory
工具读写；设置弹窗「记忆」分区提供查看/编辑/清空/导出。
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from selenyx_backend.settings import get_settings

_SAFE_NAME_RE = re.compile(r"[^\w.一-鿿-]+", re.UNICODE)
_DIGEST_CHARS = 800  # 每层注入 prompt 的上限
_FULL_CHARS = 4000  # read_memory 工具返回上限


def _slug(text: str, fallback: str = "project") -> str:
    slug = _SAFE_NAME_RE.sub("-", (text or "").strip()).strip("-.")[:48]
    return slug or fallback


def memory_file(project_id: str | None = None) -> Path:
    if project_id:
        path = get_settings().data_dir / "projects" / _slug(project_id) / "memory.md"
    else:
        path = get_settings().data_dir / "memory" / "MEMORY.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def read_memory(project_id: str | None = None, limit: int = _FULL_CHARS) -> str:
    path = memory_file(project_id)
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    return text[:limit]


def write_memory(content: str, project_id: str | None = None) -> str:
    """全文写入（设置页编辑用）。"""
    memory_file(project_id).write_text((content or "").strip() + "\n", encoding="utf-8")
    return "project" if project_id else "global"


def append_memory(line: str, project_id: str | None = None) -> dict:
    """追加一条要点（agent write_memory 工具用）：带日期前缀的列表项。"""
    line = " ".join((line or "").split())[:300]
    if not line:
        return {"error": "content 不能为空"}
    path = memory_file(project_id)
    existing = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    entry = f"- [{datetime.now().strftime('%Y-%m-%d')}] {line}"
    body = existing.rstrip() + ("\n" if existing.strip() else "") + entry + "\n"
    path.write_text(body, encoding="utf-8")
    return {"saved": True, "scope": "project" if project_id else "global", "entry": entry}


def clear_memory(project_id: str | None = None) -> None:
    path = memory_file(project_id)
    if path.exists():
        path.unlink()


def memory_digest(project_id: str | None = None) -> str:
    """run 启动注入的摘要：全局 + 项目两层，各限长。无记忆返回空串。"""
    parts: list[str] = []
    global_mem = read_memory(None, _DIGEST_CHARS)
    if global_mem:
        parts.append(f"【全局记忆】\n{global_mem}")
    if project_id:
        project_mem = read_memory(project_id, _DIGEST_CHARS)
        if project_mem:
            parts.append(f"【项目记忆】\n{project_mem}")
    return "\n\n".join(parts)


__all__ = [
    "memory_file",
    "read_memory",
    "write_memory",
    "append_memory",
    "clear_memory",
    "memory_digest",
]
