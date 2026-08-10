"""文献去重匹配：Zotero duplicates.js 的多通路算法移植。

参考 zotero/zotero ``chrome/content/zotero/xpcom/duplicates.js``：
- ``normalizeString``：去重音 → 标点转空格 → 小写（标题规范化）；
- 多维判重：DOI / PMID 精确通路 + 标题通路（同标题且同年份，或共享至少
  一位作者的「姓 + 名首字母」）——Zotero 的 reprocessMatches 多维比较；
- ``DisjointSetForest`` 并查集做传递归并（A≈B、B≈C ⇒ 三者同组）。

与 Zotero 的一处刻意差异：DOI/PMID 相同即判重，不要求年份一致
（同一文献录入了不同年份元数据也应合并）；旧实现恰好要求同年，会漏并。
纯函数、不依赖 Session，便于单测；路由层只负责取数与合并落库。
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from selenyx_backend.models import Reference

_PUNCT_RE = re.compile(r"[^\w\s]+", re.UNICODE)
_SPACES_RE = re.compile(r"\s+")


def normalize_string(text: str) -> str:
    """Zotero normalizeString：去重音、标点转空格、压缩空白、小写。"""
    decomposed = unicodedata.normalize("NFKD", text or "")
    no_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _SPACES_RE.sub(" ", _PUNCT_RE.sub(" ", no_marks)).strip().lower()


def _creator_keys(reference: Reference) -> frozenset[str]:
    """「姓(规范化) + 名首字母」集合；单名作者无首字母（Zotero fieldMode 语义）。"""
    try:
        creators = json.loads(reference.creators_json or "[]")
    except (TypeError, ValueError):
        creators = []
    keys: set[str] = set()
    for creator in creators:
        if not isinstance(creator, dict):
            continue
        last = normalize_string(str(creator.get("lastName") or creator.get("name") or ""))
        if not last:
            continue
        first = str(creator.get("firstName") or "")
        initial = normalize_string(first)[:1] if first else ""
        keys.add(f"{last}:{initial}")
    return frozenset(keys)


class _UnionFind:
    """Zotero DisjointSetForest 的精简版（按秩合并 + 路径压缩）。"""

    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1


def _bucket_union(uf: _UnionFind, keys: list[str]) -> None:
    """精确通路：同一非空 key 的全部条目并为一组。"""
    buckets: dict[str, int] = {}
    for idx, key in enumerate(keys):
        if not key:
            continue
        if key in buckets:
            uf.union(buckets[key], idx)
        else:
            buckets[key] = idx


def find_duplicate_sets(references: list[Reference]) -> list[list[int]]:
    """返回重复组（输入下标，组内首个为保留者）；无重复返回空列表。"""
    n = len(references)
    uf = _UnionFind(n)

    _bucket_union(uf, [(r.doi or "").strip().lower() for r in references])
    _bucket_union(uf, [(r.pmid or "").strip().lower() for r in references])

    # 标题通路：同标题下同年份 OR 共享作者（多维判重）
    title_buckets: dict[str, list[int]] = {}
    titles = [normalize_string(r.title) for r in references]
    for idx, title in enumerate(titles):
        if title:
            title_buckets.setdefault(title, []).append(idx)
    creators = [_creator_keys(r) for r in references]
    for members in title_buckets.values():
        if len(members) < 2:
            continue
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                same_year = (references[a].year or "").strip() == (references[b].year or "").strip()
                if same_year or (creators[a] and creators[a] & creators[b]):
                    uf.union(a, b)

    groups: dict[int, list[int]] = {}
    for idx in range(n):
        root = uf.find(idx)
        groups.setdefault(root, []).append(idx)
    return [sorted(members) for members in groups.values() if len(members) > 1]
