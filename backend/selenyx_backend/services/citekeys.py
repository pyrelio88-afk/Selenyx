"""引用键（cite key）生成：better-bibtex 默认格式的精简实现。

参考 retorquere/zotero-better-bibtex 的 key-manager 默认模式 ``[auth:lower][year]``：
- 第一作者姓（去重音、小写、仅留文字字符）+ 年份，如 ``zhang2024`` / ``王2024``；
- 无作者回退到标题首个实词；无年份省略年份段；全空回退 ``ref``；
- 与库内既有键冲突时追加 a/b/c… 后缀（BBT 的 postfix 机制）。

只影响新生成的键；存量 ``Selenyx-NNNN`` 键不迁移、不受破坏。
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from sqlmodel import Session, select

from selenyx_backend.models import Reference

_NON_WORD_RE = re.compile(r"[^\w]+", re.UNICODE)
# 标题回退时跳过的虚词（中英）
_STOPWORDS = {
    "a", "an", "the", "of", "on", "in", "and", "or", "for", "with", "by", "to",
    "from", "at", "as", "is", "are", "was", "were", "its", "it",
}


def fold(text: str) -> str:
    """去重音（NFKD 分解后丢弃组合记号）、小写、仅留文字/数字字符。

    与 Zotero duplicates.js 的 normalizeString 同源思路；CJK 字符保留
    （``\\w`` 在 Unicode 模式下涵盖汉字），中文姓可直接入键。
    """
    decomposed = unicodedata.normalize("NFKD", text or "")
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_WORD_RE.sub("", stripped).lower()


def _family_name(creators: list[dict[str, Any]]) -> str:
    """第一作者的姓；单名作者（只有 name/lastName）取全名。"""
    if not creators:
        return ""
    first = creators[0]
    if not isinstance(first, dict):
        return ""
    return str(first.get("lastName") or first.get("name") or "")


def _title_word(title: str) -> str:
    for word in re.split(r"\s+", title or ""):
        folded = fold(word)
        if folded and fold(word) not in _STOPWORDS:
            return folded
    return ""


def make_cite_key(
    session: Session,
    creators: list[dict[str, Any]],
    year: str,
    title: str,
) -> str:
    """生成库内唯一的引用键。"""
    author_part = fold(_family_name(creators)) or _title_word(title) or "ref"
    year_part = (year or "").strip()[:4]
    year_part = year_part if year_part.isdigit() else ""
    base = f"{author_part}{year_part}"

    existing = set(
        session.exec(
            select(Reference.cite_key).where(Reference.cite_key.like(f"{base}%"))
        ).all()
    )
    if base not in existing:
        return base
    # BBT postfix：冲突时追加 a/b/c…（超过 26 个继续 aa/ab…，实际到不了）
    for i in range(ord("a"), ord("z") + 1):
        candidate = f"{base}{chr(i)}"
        if candidate not in existing:
            return candidate
    n = 2
    while f"{base}x{n}" in existing:
        n += 1
    return f"{base}x{n}"
