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

from selenyx_backend.services.path_safety import safe_slug
from selenyx_backend.settings import get_settings

_FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.DOTALL)
_MAX_INSTRUCTIONS = 6000
_MAX_NAME = 60
_slug = safe_slug


def _clean_header_value(value: Any) -> str:
    return str(value or "").replace("\r", " ").replace("\n", " ").strip()


def skills_dir() -> Path:
    path = get_settings().data_dir / "skills"
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_skills_dir(project_id: str) -> Path:
    path = get_settings().data_dir / "projects" / safe_slug(project_id, "project") / "skills"
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
    clean_name = _clean_header_value(skill["name"])
    clean_desc = _clean_header_value(skill.get("description", ""))
    tools = ", ".join(
        cleaned
        for item in (skill.get("allowedTools") or [])
        if (cleaned := _clean_header_value(item).replace(",", ""))
    )
    lines = [
        "---",
        f"name: {clean_name}",
        f"description: {clean_desc}",
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
    wanted = _clean_header_value(name).lstrip("/")
    if not wanted:
        return None
    if project_id:
        skill = _load_file(project_skills_dir(project_id) / f"{safe_slug(wanted, 'skill')}.md", "project")
        if skill and skill["name"] == wanted:
            return skill
        for candidate in sorted(project_skills_dir(project_id).glob("*.md")):
            loaded = _load_file(candidate, "project")
            if loaded and loaded["name"] == wanted:
                return loaded
    path = skills_dir() / f"{safe_slug(wanted, 'skill')}.md"
    if path.exists():
        loaded = _load_file(path, "user")
        if loaded and loaded["name"] == wanted:
            return loaded
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
    clean_name = _clean_header_value(name)[:_MAX_NAME]
    if not clean_name:
        return {"error": "name 不能为空"}
    if not (instructions or "").strip():
        return {"error": "instructions 不能为空"}
    skill: dict[str, Any] = {
        "name": clean_name,
        "description": _clean_header_value(description)[:200],
        "allowedTools": [
            cleaned
            for t in (allowed_tools or [])
            if (cleaned := _clean_header_value(t).replace(",", ""))
        ],
        "enabled": enabled,
        "instructions": instructions.strip()[:_MAX_INSTRUCTIONS],
    }
    folder = project_skills_dir(project_id) if project_id else skills_dir()
    target = folder / f"{safe_slug(clean_name, 'skill')}.md"
    target.write_text(_serialize_md(skill), encoding="utf-8")
    skill["scope"] = "project" if project_id else "user"
    skill["file"] = target.name
    return skill


def _resolve_skill_path_in_folder(folder: Path, scope: str, name: str) -> Path | None:
    wanted = _clean_header_value(name).lstrip("/")
    if not wanted:
        return None
    direct = folder / f"{safe_slug(wanted, 'skill')}.md"
    if direct.is_file():
        loaded = _load_file(direct, scope)
        if loaded is None or loaded["name"] == wanted:
            return direct
    for candidate in sorted(folder.glob("*.md")):
        loaded = _load_file(candidate, scope)
        if loaded and loaded["name"] == wanted:
            return candidate
    return None


def delete_skill(name: str, project_id: str | None = None) -> bool:
    folder = project_skills_dir(project_id) if project_id else skills_dir()
    scope = "project" if project_id else "user"
    target = _resolve_skill_path_in_folder(folder, scope, name)
    if target is None or not target.exists():
        return False
    target.unlink()
    return True


def set_enabled(name: str, enabled: bool, project_id: str | None = None) -> dict[str, Any] | None:
    skill = get_skill(name, project_id if project_id else None)
    if not skill:
        return None
    scope_project = project_id if skill.get("scope") == "project" else None
    saved = save_skill(
        skill["name"],
        skill["instructions"],
        skill.get("description", ""),
        skill.get("allowedTools") or [],
        enabled,
        scope_project,
    )
    old_file = skill.get("file")
    if old_file and saved.get("file") and old_file != saved["file"]:
        folder = project_skills_dir(scope_project) if scope_project else skills_dir()
        stale = folder / Path(old_file).name
        if stale.is_file():
            stale.unlink(missing_ok=True)
    return saved


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
