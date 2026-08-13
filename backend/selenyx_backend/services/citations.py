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
_CONTROL_ONLY_RE = re.compile(
    r"^(?:(?:完成|已完成|完成了|完毕|好的|收到|明白|了解|无法执行(?:该操作)?|操作已取消|已取消|暂停|继续|失败|不该到达)[。！？.!?]*|已达到最大步数.*)$",
    re.IGNORECASE,
)
_CHAT_GOAL_RE = re.compile(r"(?:随便聊|闲聊|聊天|打招呼|问候|寒暄|small\s*talk|chat)", re.IGNORECASE)
_CONVERSATIONAL_OUTPUT_RE = re.compile(
    r"^(?:你好|您好|嗨|哈喽|谢谢|感谢|不客气|很高兴认识你|有什么可以帮|我可以帮|请告诉我|当然可以|没问题|"
    r"hello|hi|thanks|thank you|you're welcome|how can i help).*$",
    re.IGNORECASE,
)
_RESEARCH_WRITING_RE = re.compile(
    r"(?:研究|综述|文献|证据|结论|分析|报告|论文|课题|方法|结果|比较|诊断|治疗|实验|数据|统计|成稿|草稿|"
    r"review|study|evidence|research|literature|analysis|report|paper|claim|finding)",
    re.IGNORECASE,
)


@dataclass
class CitationReport:
    """成稿证据校验与覆盖率统计结果。"""

    referenced_ids: list[str] = field(default_factory=list)  # 去重后、按出现顺序
    invalid_ids: list[str] = field(default_factory=list)  # 编造的 id（库中不存在）
    sentences: int = 0  # 含标记的论断句总数
    supported: int = 0  # 含 ≥1 有效引用的句数
    fully_accepted: int = 0  # 引用证据全部已人工接受的句数
    unsourced: int = 0  # 含 [^none] 的句数
    missing_markers: bool = False  # 研究写作没有任何 [^e:*] / [^none]

    @property
    def ok(self) -> bool:
        """是否通过真实性与完整性校验。"""
        return not self.invalid_ids and not self.missing_markers

    @property
    def coverage(self) -> float:
        """证据覆盖率：有据论断句 / 论断句总数（无论断句时为 0）。"""
        return self.supported / self.sentences if self.sentences else 0.0


def extract_evidence_refs(text: str) -> list[str]:
    """按出现顺序提取全部 ``[^e:id]`` 引用（去重保序）。"""
    return list(dict.fromkeys(_EVIDENCE_REF_RE.findall(text)))


def has_evidence_markers(text: str) -> bool:
    """文本是否含染色标记（``[^e:id]`` 或 ``[^none]``）——决定是否触发校验。"""
    return bool(_EVIDENCE_REF_RE.search(text) or _NONE_REF_RE.search(text))


def requires_evidence_markers(
    text: str,
    *,
    project_id: str | None = None,
    goal: str = "",
    writing_product: bool = False,
) -> bool:
    """Whether this output is research writing that must declare provenance.

    A project-scoped result is normally research work, while short operational
    acknowledgements and explicitly chatty goals remain free-form.  The write
    tools are writing-product boundaries, so any substantive content supplied
    to them must be marked even if it has no project id.
    """
    source = (text or "").strip()
    if not source or _CONTROL_ONLY_RE.fullmatch(source) or _CONVERSATIONAL_OUTPUT_RE.fullmatch(source):
        return False
    if writing_product:
        return True
    # A project-bound result is research work unless the user explicitly
    # asked for a chatty exchange.  Without project scope, use the request
    # intent—not an incidental word such as "结论"—to avoid gating ordinary
    # agent control/fallback output.
    if _RESEARCH_WRITING_RE.search(goal or ""):
        return True
    return bool((project_id or "").strip()) and not _CHAT_GOAL_RE.search(goal or "")


def _sentences(text: str) -> list[str]:
    return [seg.strip() for seg in _SENTENCE_SPLIT_RE.split(text) if seg and seg.strip()]


def analyze_citations(
    session: Session,
    project_id: str | None,
    text: str,
    *,
    require_markers: bool = False,
) -> CitationReport:
    """校验成稿引用真实性并统计覆盖率。

    - 引用 id 必须真实存在且属于该项目（防 agent 编造 ``[^e:xxx]``）；
    - 逐句统计支撑强度，供前端染色与覆盖率徽标使用。
    """
    referenced = extract_evidence_refs(text)
    accepted: dict[str, EvidenceItem] = {}
    scope = (project_id or "").strip()
    if referenced and scope:
        rows = session.exec(
            select(EvidenceItem).where(
                EvidenceItem.project_id == scope,
                EvidenceItem.status == "accepted",
                EvidenceItem.review == "accepted",
                EvidenceItem.id.in_(referenced),
            )
        ).all()
        accepted = {item.id: item for item in rows}

    report = CitationReport(
        referenced_ids=referenced,
        invalid_ids=[ref for ref in referenced if ref not in accepted],
        missing_markers=bool(require_markers and (text or "").strip() and not has_evidence_markers(text)),
    )
    accepted_ids = set(accepted)

    for sentence in _sentences(text):
        refs = _EVIDENCE_REF_RE.findall(sentence)
        unsourced = bool(_NONE_REF_RE.search(sentence))
        if not refs and not unsourced:
            continue  # 非论断句（无标记），不计入覆盖率分母
        report.sentences += 1
        if refs and all(ref in accepted_ids for ref in refs):
            report.supported += 1
            report.fully_accepted += 1
        if unsourced:
            report.unsourced += 1
    return report


def rejection_message(report: CitationReport) -> str:
    """生成打回修订的说明（回灌给 agent 的消息体）。"""
    if report.missing_markers:
        return (
            "研究写作内容缺少证据标记。每个事实性论断必须使用当前项目中已接受证据卡的 "
            "[^e:证据id]，或在无据论断后明确标记 [^none]；修订后重新输出。"
        )
    invalid = "、".join(f"[^e:{ref}]" for ref in report.invalid_ids)
    return (
        f"成稿包含未通过证据门的引用：{invalid}。"
        "只允许当前项目中 status 和 review 均为 accepted 的证据卡；"
        "未关联项目、跨项目、pending/rejected 或不存在的 id 都不可引用。"
        "无据论断改标 [^none]，修订后重新输出 final。"
    )
