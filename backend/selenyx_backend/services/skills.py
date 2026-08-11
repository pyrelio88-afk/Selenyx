"""SKILL.md 技能包（V4 模块 F）。

技能 = 单个 Markdown 文件：frontmatter（name/description/allowed_tools/enabled）
+ 指令正文。两级存储，本地优先不出本机——

- 用户级：``{data_dir}/skills/*.md``
- 项目级：``{data_dir}/projects/{project_id}/skills/*.md``（同名遮蔽用户级）

run 启动时按名解析：正文注入 system 后缀，allowed_tools 裁剪工具白名单。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from selenyx_backend.settings import get_settings

_SAFE_NAME_RE = re.compile(r"[^\w.一-鿿-]+", re.UNICODE)
_FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.DOTALL)
_MAX_INSTRUCTIONS = 6000
_MAX_NAME = 60


def _slug(text: str, fallback: str = "skill") -> str:
    slug = _SAFE_NAME_RE.sub("-", (text or "").strip()).strip("-.")[:48]
    return slug or fallback


def skills_dir() -> Path:
    path = get_settings().data_dir / "skills"
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_skills_dir(project_id: str) -> Path:
    path = get_settings().data_dir / "projects" / _slug(project_id, "project") / "skills"
    path.mkdir(parents=True, exist_ok=True)
    return path


def parse_skill(text: str) -> dict[str, Any] | None:
    """解析 SKILL.md 文本；缺 frontmatter 或 name 返回 None。"""
    match = _FM_RE.match(text or "")
    if not match:
        return None
    header, body = match.group(1), match.group(2).strip()
    meta: dict[str, str] = {}
    for line in header.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        meta[key.strip().lower()] = value.strip()
    name = meta.get("name", "")
    if not name:
        return None
    allowed = [t.strip() for t in meta.get("allowed_tools", "").split(",") if t.strip()]
    return {
        "name": name[:_MAX_NAME],
        "description": meta.get("description", "")[:200],
        "allowedTools": allowed,
        "enabled": meta.get("enabled", "true").lower() not in ("false", "0", "no"),
        "instructions": body[:_MAX_INSTRUCTIONS],
    }


def _serialize_md(skill: dict[str, Any]) -> str:
    tools = ", ".join(skill.get("allowedTools") or [])
    lines = [
        "---",
        f"name: {skill['name']}",
        f"description: {skill.get('description', '')}",
        f"allowed_tools: {tools}",
        f"enabled: {'true' if skill.get('enabled', True) else 'false'}",
        "---",
        "",
        (skill.get("instructions") or "").strip(),
        "",
    ]
    return "\n".join(lines)


def _load_file(path: Path, scope: str) -> dict[str, Any] | None:
    try:
        parsed = parse_skill(path.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return None
    if not parsed:
        return None
    parsed["scope"] = scope
    parsed["file"] = path.name
    return parsed


def list_skills(project_id: str | None = None) -> list[dict[str, Any]]:
    """合并两级技能；项目级同名遮蔽用户级。"""
    merged: dict[str, dict[str, Any]] = {}
    for path in sorted(skills_dir().glob("*.md")):
        skill = _load_file(path, "user")
        if skill:
            merged[skill["name"]] = skill
    if project_id:
        for path in sorted(project_skills_dir(project_id).glob("*.md")):
            skill = _load_file(path, "project")
            if skill:
                merged[skill["name"]] = skill
    return sorted(merged.values(), key=lambda s: (s["scope"] != "project", s["name"]))


def get_skill(name: str, project_id: str | None = None) -> dict[str, Any] | None:
    """按名解析：项目级优先。"""
    wanted = (name or "").strip().lstrip("/")
    if project_id:
        skill = _load_file(project_skills_dir(project_id) / f"{_slug(wanted)}.md", "project")
        if skill:
            return skill
    path = skills_dir() / f"{_slug(wanted)}.md"
    if path.exists():
        return _load_file(path, "user")
    # 文件名与技能名可能不一致（改名过），兜底全量匹配
    for skill in list_skills(project_id):
        if skill["name"] == wanted:
            return skill
    return None


def save_skill(
    name: str,
    instructions: str,
    description: str = "",
    allowed_tools: list[str] | None = None,
    enabled: bool = True,
    project_id: str | None = None,
) -> dict[str, Any]:
    name = (name or "").strip()[:_MAX_NAME]
    if not name:
        return {"error": "name 不能为空"}
    if not (instructions or "").strip():
        return {"error": "instructions 不能为空"}
    skill = {
        "name": name,
        "description": (description or "").strip()[:200],
        "allowedTools": [t for t in (allowed_tools or []) if t],
        "enabled": enabled,
        "instructions": instructions.strip()[:_MAX_INSTRUCTIONS],
    }
    folder = project_skills_dir(project_id) if project_id else skills_dir()
    (folder / f"{_slug(name)}.md").write_text(_serialize_md(skill), encoding="utf-8")
    skill["scope"] = "project" if project_id else "user"
    return skill


def delete_skill(name: str, project_id: str | None = None) -> bool:
    folder = project_skills_dir(project_id) if project_id else skills_dir()
    path = folder / f"{_slug(name)}.md"
    if not path.exists():
        return False
    path.unlink()
    return True


def set_enabled(name: str, enabled: bool, project_id: str | None = None) -> dict[str, Any] | None:
    skill = get_skill(name, project_id if project_id else None)
    if not skill:
        return None
    scope_project = project_id if skill.get("scope") == "project" else None
    return save_skill(
        skill["name"],
        skill["instructions"],
        skill.get("description", ""),
        skill.get("allowedTools") or [],
        enabled,
        scope_project,
    )


__all__ = [
    "parse_skill",
    "list_skills",
    "get_skill",
    "save_skill",
    "delete_skill",
    "set_enabled",
    "skills_dir",
    "project_skills_dir",
]
