#!/usr/bin/env python3
"""学科数据完整性校验（R86）
目标（每学科）：名词 >=500 · 数值参数 >=200 · 公式 >=300 · 标准规范 >=20
检查：计数缺口、重名、必填字段非空、释义长度阈值
"""
import re, sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
TARGETS = {"glossary": 500, "parameters": 200, "formulas": 300, "standards": 20}

def extract_array_items(text, field, start_pos=0):
    m = re.search(re.escape(field) + r"\s*:\s*\[", text[start_pos:])
    if not m:
        return [], start_pos
    arr_start = start_pos + m.end()
    items, i, n = [], arr_start, len(text)
    while i < n:
        j = text.find("{", i)
        close = text.find("]", i)
        if close != -1 and (j == -1 or close < j):
            return items, close
        if j == -1:
            return items, n
        depth, k = 0, j
        while k < n:
            c = text[k]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    items.append(text[j:k+1])
                    k += 1
                    break
            k += 1
        i = k
    return items, i

def unesc(s):
    try:
        return s.encode().decode("unicode_escape", errors="ignore")
    except Exception:
        return s

def get_field(obj, name):
    m = re.search(re.escape(name) + r"\s*:\s*[\"']((?:[^\"'\\]|\\.)*)[\"']", obj)
    return unesc(m.group(1)) if m else None

def count_block(block, did, seen, problems, totals):
    counts = {}
    for field in TARGETS:
        items, _ = extract_array_items(block, field)
        keyf = {"glossary": "term", "parameters": "name", "formulas": "name", "standards": "code"}[field]
        for it in items:
            nm = get_field(it, keyf)
            if not nm:
                problems.append(f"[{did}] {field} 条目缺 {keyf} 字段")
                continue
            if field == "glossary":
                if nm in seen:
                    problems.append(f"[{did}] 名词重复: {nm}")
                seen.add(nm)
                d = get_field(it, "definition") or ""
                if len(d) < 30:
                    problems.append(f"[{did}] 名词释义过短({len(d)}字): {nm}")
            if field == "parameters" and not get_field(it, "value"):
                problems.append(f"[{did}] 参数缺 value: {nm}")
            if field == "formulas" and not (get_field(it, "formula") or get_field(it, "expression")):
                problems.append(f"[{did}] 公式缺表达式: {nm}")
        counts[field] = counts.get(field, 0) + len(items)
        totals[field] += len(items)
    return counts

def main():
    main_text = (DATA / "disciplines.ts").read_text(encoding="utf-8")
    # expansion 文件按文件名（去掉扩展）归属学科
    expansions = {}
    for f in sorted((DATA / "expansion").glob("*.ts")):
        if f.stem != "index":
            expansions[f.stem] = f.read_text(encoding="utf-8")

    blocks = re.split(r'\{\s*id:\s*"', main_text)
    report, totals, problems = [], {"glossary":0,"parameters":0,"formulas":0,"standards":0}, []
    done_exp = set()
    for b in blocks[1:]:
        did = b.split('"', 1)[0]
        seen = set()
        counts = count_block(b, did, seen, problems, totals)
        if did in expansions:
            ext_counts = count_block(expansions[did], did, seen, problems, totals)
            for k in TARGETS:
                counts[k] = counts.get(k, 0) + ext_counts.get(k, 0)
            done_exp.add(did)
        gaps = {k: max(0, TARGETS[k] - counts.get(k, 0)) for k in TARGETS}
        status = "✓" if all(v == 0 for v in gaps.values()) else "✗"
        report.append((did, status, counts, gaps))
    # expansion 里有但主文件没有的学科（不应发生）
    for did in set(expansions) - done_exp:
        problems.append(f"[{did}] expansion 文件未匹配到主数据学科")

    print(f"{'学科':<14}{'名词':>6}{'参数':>6}{'公式':>6}{'标准':>6}  缺口(名/参/式/标)")
    print("-" * 72)
    for did, status, counts, gaps in report:
        print(f"{status} {did:<12}{counts.get('glossary',0):>6}{counts.get('parameters',0):>6}"
              f"{counts.get('formulas',0):>6}{counts.get('standards',0):>6}  "
              f"{gaps['glossary']}/{gaps['parameters']}/{gaps['formulas']}/{gaps['standards']}")
    print("-" * 72)
    print(f"合计: 名词 {totals['glossary']} / 参数 {totals['parameters']} / 公式 {totals['formulas']} / 标准 {totals['standards']}")
    reached = sum(1 for _, s, _, _ in report if s == "✓")
    print(f"达标学科: {reached}/{len(report)}")
    print(f"\n字段问题 {len(problems)} 条（前 30 条）:")
    for p in problems[:30]:
        print("  -", p)
    return 0

if __name__ == "__main__":
    sys.exit(main())
