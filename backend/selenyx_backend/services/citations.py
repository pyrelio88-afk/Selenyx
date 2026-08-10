"""成稿证据标记的解析与后端真实性校验（V4 模块 C 地基）。

标记协议：agent 在 final 成稿中按句标注支撑——
- ``[^e:<evidenceId>]``  引用一张证据卡
- ``[^none]``            无据断言（agent 自检标出）

校验模式借鉴 Future-House/paper-qa：
1) paper-qa 用 ``used_contexts = {c.id for c in contexts if c.id in raw_answer}``
   计算答案实际引用了哪些证据；本模块同思路提取成稿里的证据 id。
2) paper-qa 把「答案里出现但不在已知集合的引用 key」判为幻觉并静默清除；
   Selenyx 证据门更严格：编造引用一律拒绝并打回修订（不静默）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlmodel import Session, select

from selenyx_backend.models import EvidenceItem

# [^e:xxx] 引用证据卡；[^none] 无据断言。id 允许字母数字/横线/下划线/点。
_EVIDENCE_REF_RE = re.compile(r"\[\^e:([A-Za-z0-9._-]+)\]")
_NONE_REF_RE = re.compile(r"\[\^none\]")
# 成稿按句染色：中文句号/问号/叹号/分号与英文句读都作断句；换行也算
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？；.!?;])\s*|\n+")


@dataclass
class CitationReport:
    """成稿证据校验与覆盖率统计结果。"""

    referenced_ids: list[str] = field(default_factory=list)  # 去重后、按出现顺序
    invalid_ids: list[str] = field(default_factory=list)  # 编造的 id（库中不存在）
    sentences: int = 0  # 含标记的论断句总数
    supported: int = 0  # 含 ≥1 有效引用的句数
    fully_accepted: int = 0  # 引用证据全部已人工接受的句数
    unsourced: int = 0  # 含 [^none] 的句数

    @property
    def ok(self) -> bool:
        """是否通过真实性校验（无编造引用）。"""
        return not self.invalid_ids

    @property
    def coverage(self) -> float:
        """证据覆盖率：有据论断句 / 论断句总数（无论断句时为 0）。"""
        return self.supported / self.sentences if self.sentences else 0.0


def extract_evidence_refs(text: str) -> list[str]:
    """按出现顺序提取全部 ``[^e:id]`` 引用（去重保序）。"""
    return list(dict.fromkeys(_EVIDENCE_REF_RE.findall(text)))


def _sentences(text: str) -> list[str]:
    return [seg.strip() for seg in _SENTENCE_SPLIT_RE.split(text) if seg and seg.strip()]


def analyze_citations(session: Session, project_id: str, text: str) -> CitationReport:
    """校验成稿引用真实性并统计覆盖率。

    - 引用 id 必须真实存在且属于该项目（防 agent 编造 ``[^e:xxx]``）；
    - 逐句统计支撑强度，供前端染色与覆盖率徽标使用。
    """
    referenced = extract_evidence_refs(text)
    known: dict[str, EvidenceItem] = {}
    if referenced:
        rows = session.exec(
            select(EvidenceItem).where(
                EvidenceItem.project_id == project_id,
                EvidenceItem.id.in_(referenced),
            )
        ).all()
        known = {item.id: item for item in rows}

    report = CitationReport(
        referenced_ids=referenced,
        invalid_ids=[ref for ref in referenced if ref not in known],
    )
    valid_ids = set(known)

    for sentence in _sentences(text):
        refs = [r for r in _EVIDENCE_REF_RE.findall(sentence) if r in valid_ids]
        unsourced = bool(_NONE_REF_RE.search(sentence))
        if not refs and not unsourced:
            continue  # 非论断句（无标记），不计入覆盖率分母
        report.sentences += 1
        if refs:
            report.supported += 1
            if all(known[r].review == "accepted" for r in refs):
                report.fully_accepted += 1
        if unsourced:
            report.unsourced += 1
    return report


def rejection_message(report: CitationReport) -> str:
    """生成打回修订的说明（回灌给 agent 的消息体）。"""
    fabricated = "、".join(f"[^e:{ref}]" for ref in report.invalid_ids)
    return (
        f"成稿包含不存在的证据引用：{fabricated}。"
        "这些 id 不在本项目证据库中。请只引用 save_evidence 返回的真实 evidenceId，"
        "无据论断改标 [^none]，修订后重新输出 final。"
    )
