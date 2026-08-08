#!/usr/bin/env python3
"""Build a reviewable, source-backed glossary snapshot.

The previous fill generator invented numbered terms such as ``核心概念01``.
This script replaces that practice with real Chinese Wikipedia article/category
members whose Wikidata records provide a Chinese description and stable QID.

Only short Wikidata descriptions (CC0) are embedded.  Wikipedia is used as an
independent title/category cross-check and is attributed in every record.  The
snapshot is committed so normal builds are deterministic and never require the
network.

Run from the repository root:

    python scripts/fetch_discipline_concepts.py
"""

from __future__ import annotations

import json
import hashlib
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "scripts" / "data" / "discipline-concepts.wikidata.json"
CACHE = ROOT / ".research" / "wikimedia-api-cache"
WIKIPEDIA_API = "https://zh.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "SelenyxGlossaryAudit/0.0.1 (local research workbench)"
SNAPSHOT_DATE = "2026-08-07"
TARGET_PER_DISCIPLINE = 520
MIN_REQUEST_INTERVAL_SECONDS = 0.45
_last_request_at = 0.0


ROOT_CATEGORIES: dict[str, list[str]] = {
    "philosophy": ["哲学", "逻辑学", "伦理学", "美学"],
    "economics": ["经济学", "金融学", "计量经济学"],
    "law": ["法学", "法律", "法理学"],
    "education": ["教育学", "教育心理学", "课程"],
    "literature": ["文学", "文学理论", "语言学"],
    "history": ["历史学", "史学史", "考古学"],
    "science": ["自然科学", "数学", "物理学", "化学", "生物学"],
    "engineering": ["工程学", "计算机科学", "机械工程", "电气工程"],
    "agriculture": ["农业", "农学", "园艺", "畜牧业"],
    "medicine": ["医学", "临床医学", "公共卫生", "药学"],
    "management": ["管理学", "工商管理", "公共管理"],
    "art": ["艺术", "艺术学", "设计", "音乐学"],
    "military": ["军事学", "军事理论", "军事战略", "战争"],
}

# These category branches mostly contain people, organizations or maintenance
# pages rather than reusable disciplinary concepts.
SKIP_CATEGORY_PARTS = (
    "人物",
    "学者",
    "作家",
    "艺术家",
    "教育家",
    "哲学家",
    "经济学家",
    "法学家",
    "历史学家",
    "科学家",
    "工程师",
    "医学家",
    "军事家",
    "大学",
    "学校",
    "机构",
    "组织",
    "公司",
    "企业",
    "学会",
    "期刊",
    "杂志",
    "奖项",
    "竞赛",
    "各国",
    "各地",
    "各省",
    "各州",
    "各年",
    "出生",
    "逝世",
    "模板",
    "维基",
)

SKIP_TITLE_PARTS = (
    "列表",
    "名单",
    "年表",
    "索引",
    "消歧义",
    "Portal:",
    "Template:",
)

# Direct instance-of values that are unsuitable as glossary concepts.  We keep
# theories, methods, works and events because humanities glossaries legitimately
# use them, but exclude people, organizations and geographic entities.
FORBIDDEN_INSTANCE_OF = {
    "Q5",  # human
    "Q43229",  # organization
    "Q4830453",  # business
    "Q3918",  # university
    "Q6256",  # country
    "Q515",  # city
    "Q486972",  # human settlement
    "Q4167410",  # disambiguation page
    "Q13406463",  # list article
}


def request_json(base: str, params: dict[str, Any], retries: int = 9) -> dict[str, Any]:
    global _last_request_at
    url = f"{base}?{urllib.parse.urlencode(params)}"
    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = CACHE / f"{cache_key}.json"
    if cache_path.is_file():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    for attempt in range(retries):
        try:
            since_last = time.monotonic() - _last_request_at
            if since_last < MIN_REQUEST_INTERVAL_SECONDS:
                time.sleep(MIN_REQUEST_INTERVAL_SECONDS - since_last)
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.load(response)
            _last_request_at = time.monotonic()
            CACHE.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix(f".{id(data)}.tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            temporary.replace(cache_path)
            return data
        except urllib.error.HTTPError as error:
            _last_request_at = time.monotonic()
            if error.code not in {429, 500, 502, 503, 504} or attempt + 1 == retries:
                raise
            retry_after = error.headers.get("Retry-After", "")
            try:
                wait = float(retry_after)
            except ValueError:
                wait = min(60.0, 2.0 ** (attempt + 1))
            wait = max(wait, min(60.0, 2.0 ** (attempt + 1))) + random.uniform(0.2, 1.0)
            print(f"  Wikimedia HTTP {error.code}; retrying in {wait:.1f}s", flush=True)
            time.sleep(wait)
        except (TimeoutError, urllib.error.URLError, json.JSONDecodeError):
            _last_request_at = time.monotonic()
            if attempt + 1 == retries:
                raise
            time.sleep(min(30.0, 1.5 * (attempt + 1)) + random.uniform(0.1, 0.5))
    raise AssertionError("unreachable")


def unsuitable_category(title: str) -> bool:
    return any(part in title for part in SKIP_CATEGORY_PARTS)


def unsuitable_title(title: str) -> bool:
    return any(part in title for part in SKIP_TITLE_PARTS) or len(title.strip()) < 2


def category_members(category: str) -> list[dict[str, Any]]:
    members: list[dict[str, Any]] = []
    continuation: str | None = None
    while True:
        params: dict[str, Any] = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmtype": "page|subcat",
            "cmlimit": "max",
            "format": "json",
            "formatversion": "2",
            "origin": "*",
        }
        if continuation:
            params["cmcontinue"] = continuation
        data = request_json(WIKIPEDIA_API, params)
        members.extend(data.get("query", {}).get("categorymembers", []))
        continuation = data.get("continue", {}).get("cmcontinue")
        if not continuation:
            return members


def collect_candidates(roots: list[str]) -> list[dict[str, Any]]:
    queue = deque((root, 0) for root in roots)
    seen_categories: set[str] = set()
    pages: dict[int, dict[str, Any]] = {}

    while queue and len(pages) < TARGET_PER_DISCIPLINE * 4:
        category, depth = queue.popleft()
        if category in seen_categories or unsuitable_category(category):
            continue
        seen_categories.add(category)
        for member in category_members(category):
            namespace = member.get("ns")
            title = str(member.get("title", ""))
            if namespace == 14 and depth < 2:
                child = title.removeprefix("Category:")
                if not unsuitable_category(child):
                    queue.append((child, depth + 1))
            elif namespace == 0 and not unsuitable_title(title):
                page_id = int(member["pageid"])
                pages.setdefault(
                    page_id,
                    {"pageId": page_id, "articleTitle": title, "sourceCategory": category},
                )
        time.sleep(0.04)
    return list(pages.values())


def chunks(items: list[Any], size: int) -> list[list[Any]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def attach_qids(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {page["pageId"]: page for page in pages}
    for batch in chunks(list(by_id), 50):
        data = request_json(
            WIKIPEDIA_API,
            {
                "action": "query",
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "pageids": "|".join(map(str, batch)),
                "format": "json",
                "formatversion": "2",
                "origin": "*",
            },
        )
        for result in data.get("query", {}).get("pages", []):
            qid = result.get("pageprops", {}).get("wikibase_item")
            if qid and result.get("pageid") in by_id:
                by_id[result["pageid"]]["qid"] = qid
        time.sleep(0.04)
    return [page for page in pages if page.get("qid")]


def first_language_value(values: dict[str, Any], languages: tuple[str, ...]) -> str:
    for language in languages:
        value = values.get(language, {}).get("value")
        if value:
            return str(value).strip()
    return ""


def direct_instances(entity: dict[str, Any]) -> set[str]:
    instances: set[str] = set()
    for claim in entity.get("claims", {}).get("P31", []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        qid = value.get("id") if isinstance(value, dict) else None
        if qid:
            instances.add(str(qid))
    return instances


def source_records(pages: list[dict[str, Any]]) -> list[dict[str, str]]:
    by_qid = {page["qid"]: page for page in pages}
    records: list[dict[str, str]] = []
    for batch in chunks(list(by_qid), 50):
        data = request_json(
            WIKIDATA_API,
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels|descriptions|claims",
                "languages": "zh-hans|zh|en",
                "languagefallback": "1",
                "format": "json",
                "origin": "*",
            },
        )
        for qid, entity in data.get("entities", {}).items():
            if entity.get("missing") is not None or direct_instances(entity) & FORBIDDEN_INSTANCE_OF:
                continue
            page = by_qid[qid]
            label_zh = first_language_value(entity.get("labels", {}), ("zh-hans", "zh"))
            label_en = first_language_value(entity.get("labels", {}), ("en",))
            description = first_language_value(
                entity.get("descriptions", {}), ("zh-hans", "zh")
            )
            if not label_zh or not description or unsuitable_title(label_zh):
                continue
            description = " ".join(description.split()).strip("。；; ")
            if len(description) < 5 or len(description) > 180:
                continue
            source_category = page["sourceCategory"]
            records.append(
                {
                    "term": label_zh,
                    "termEn": label_en,
                    "definition": (
                        f"{description}。本条按中文维基百科“{source_category}”分类收录；"
                        "该分类用于检索，不表示概念只属于这一分支，具体边界应结合专业教材、标准和原始文献判断。"
                    ),
                    "category": source_category,
                    "source": (
                        f"Wikidata CC0 {qid}；中文维基百科分类对照（CC BY-SA 4.0；"
                        f"{SNAPSHOT_DATE}）"
                    ),
                    "qid": qid,
                    "articleTitle": page["articleTitle"],
                    "sourceUrl": f"https://www.wikidata.org/wiki/{qid}",
                }
            )
        time.sleep(0.04)

    # Stable, deterministic order and term-level deduplication.
    unique: dict[str, dict[str, str]] = {}
    for record in sorted(records, key=lambda item: (item["category"], item["term"], item["qid"])):
        unique.setdefault(record["term"], record)
    return list(unique.values())


def main() -> None:
    snapshot: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedAt": SNAPSHOT_DATE,
        "licenseNotes": {
            "wikidata": "Descriptions and identifiers: CC0 1.0",
            "wikipedia": "Article-title/category cross-check: CC BY-SA 4.0",
        },
        "disciplines": {},
    }
    for discipline, roots in ROOT_CATEGORIES.items():
        print(f"[{discipline}] collecting category members ...", flush=True)
        candidates = collect_candidates(roots)
        candidates = attach_qids(candidates)
        records = source_records(candidates)
        if len(records) < TARGET_PER_DISCIPLINE:
            raise RuntimeError(
                f"{discipline}: only {len(records)} qualified records; "
                f"need {TARGET_PER_DISCIPLINE}"
            )
        snapshot["disciplines"][discipline] = records[:TARGET_PER_DISCIPLINE]
        print(
            f"[{discipline}] {len(candidates)} linked candidates -> "
            f"{len(records)} qualified -> {TARGET_PER_DISCIPLINE} saved",
            flush=True,
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
