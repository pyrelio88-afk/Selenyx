#!/usr/bin/env python3
"""R95 修正版 source 覆盖率审计脚本。

修复 R93–R94 的口径错配：旧脚本用「全文件 source 字段总数 / 仅 glossary 词条数」，
分子扫过 parameters/formulas/standards 段的 source，分母只算 glossary，导致
engineering.ts 出现 121% 的荒谬覆盖率。本脚本按条目类型分别统计，分子分母同口径。

用法: python3 scripts/audit_source_coverage.py
"""
import os
import re
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.normpath(os.path.join(HERE, "..", "frontend", "src", "data", "expansion"))

# (section_key, term_field_regex)
TYPES = [
    ("glossary", r"term:\s*'([^']+)'"),
    ("parameters", r"name:\s*'([^']+)'"),
    ("formulas", r"name:\s*'([^']+)'"),
    ("standards", r"code:\s*'([^']+)'"),
]


def split_section(text: str, key: str) -> str:
    """提取某个顶层数组段（glossary/parameters/formulas/standards）的内容。"""
    m = re.search(r"\b" + key + r"\s*:\s*\[", text)
    if not m:
        return ""
    rest = text[m.end():]
    depth, i = 1, 0
    while i < len(rest) and depth > 0:
        if rest[i] == "[":
            depth += 1
        elif rest[i] == "]":
            depth -= 1
        i += 1
    return rest[: i - 1]


def audit_file(path: str):
    text = open(path, encoding="utf-8").read()
    per_type = {}
    for key, term_re in TYPES:
        sec = split_section(text, key)
        if not sec:
            continue
        blocks = re.split(r"\n\s*\{", sec)
        total = with_src = 0
        for b in blocks:
            if not re.search(term_re, b):
                continue
            total += 1
            if re.search(r"source\s*:", b):
                with_src += 1
        per_type[key] = (total, with_src)
    return per_type


def pct(a: int, b: int) -> str:
    return f"{a / b * 100:.1f}%" if b else "-"


def main():
    files = sorted(
        f for f in glob.glob(os.path.join(EXP, "*.ts")) if not f.endswith("index.ts")
    )
    header = f"{'file':<22}" + "".join(f"{k + '':>14}" for k, _ in TYPES) + f"{'TOTAL':>14}"
    print(header)
    print("-" * len(header.expandtabs(4)))
    grand = {k: [0, 0] for k, _ in TYPES}
    for f in files:
        per_type = audit_file(f)
        row = f"{os.path.basename(f):<22}"
        ft = fs = 0
        for key, _ in TYPES:
            if key in per_type:
                t, s = per_type[key]
                grand[key][0] += t
                grand[key][1] += s
                ft += t
                fs += s
                row += f"{f'{s}/{t} {pct(s, t)}':>14}"
            else:
                row += f"{'—':>14}"
        row += f"{f'{fs}/{ft} {pct(fs, ft)}':>14}"
        print(row)
    print("-" * len(header.expandtabs(4)))
    row = f"{'TOTAL':<22}"
    gt = gs = 0
    for key, _ in TYPES:
        t, s = grand[key]
        gt += t
        gs += s
        row += f"{f'{s}/{t} {pct(s, t)}':>14}"
    row += f"{f'{gs}/{gt} {pct(gs, gt)}':>14}"
    print(row)


if __name__ == "__main__":
    main()
