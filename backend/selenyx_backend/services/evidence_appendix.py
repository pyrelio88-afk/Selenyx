"""成稿证据附录：引用标记 → 证据卡 + 裁决状态 + 时间。"""

from __future__ import annotations

import re
from sqlmodel import Session, select

from selenyx_backend.models import EvidenceItem
from selenyx_backend.services.citations import CitationReport, analyze_citations, rejection_message

_MARKER = re.compile(r"\[\^e:([A-Za-z0-9._-]+)\]")
_APPENDIX_HEADING = re.compile(r"^[ \t]*##\s+证据附录\s*$", re.M)


class EvidenceAppendixValidationError(ValueError):
    """Stops an export before it can expose unaccepted or foreign evidence."""

    def __init__(self, report: CitationReport) -> None:
        self.report = report
        super().__init__(rejection_message(report))


def cited_ids(markdown: str) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    for match in _MARKER.finditer(markdown or ""):
        ident = match.group(1)
        if ident in seen:
            continue
        seen.add(ident)
        ids.append(ident)
    return ids


def without_evidence_appendix(markdown: str) -> str:
    """Return author content before a user-supplied appendix section.

    The appendix is provenance metadata owned by the backend.  Treating a
    pre-existing heading as authoritative would let an agent omit or forge
    card details, so the first such section and everything after it is
    replaced on every write/export.
    """
    source = markdown or ""
    match = _APPENDIX_HEADING.search(source)
    return source[:match.start()].rstrip() if match else source


def build_evidence_appendix(
    session: Session,
    project_id: str | None,
    markdown: str,
    *,
    require_markers: bool = False,
) -> str:
    source = without_evidence_appendix(markdown)
    # Validate before the no-citation early return: [^none] is a valid,
    # explicit declaration, while a substantive unmarked research draft is
    # not allowed to silently bypass both coverage and appendix generation.
    report = analyze_citations(session, project_id, source, require_markers=require_markers)
    if not report.ok:
        raise EvidenceAppendixValidationError(report)
    ids = cited_ids(source)
    if not ids:
        return ""
    # A projectless export must not fall back to a library-wide lookup.  This
    # is intentionally the same accepted/project validator as final drafts.
    scope = (project_id or "").strip()
    rows = {
        item.id: item
        for item in session.exec(
            select(EvidenceItem).where(
                EvidenceItem.project_id == scope,
                EvidenceItem.status == "accepted",
                EvidenceItem.review == "accepted",
                EvidenceItem.id.in_(ids),
            )
        ).all()
    }
    lines = ["## 证据附录", "", "由本机后端根据当前项目已接受的证据卡生成。", ""]
    for index, ident in enumerate(ids, start=1):
        item = rows.get(ident)
        lines.append(f"### {index}. [^e:{ident}]")
        if item is None:
            # The validated query above makes this possible only if a row was
            # removed between the validation and rendering queries.
            raise EvidenceAppendixValidationError(
                CitationReport(referenced_ids=[ident], invalid_ids=[ident])
            )
        lines.append(f"- 论断：{item.claim or '（无）'}")
        lines.append(f"- 摘录：{item.excerpt or '（无）'}")
        if item.page is not None:
            lines.append(f"- 页码：p.{item.page}")
        lines.append(f"- 裁决：{item.review}")
        lines.append(f"- 时间：{item.updated_at or item.created_at or '（无）'}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def with_evidence_appendix(
    session: Session,
    project_id: str | None,
    markdown: str,
    *,
    require_markers: bool = False,
) -> str:
    source = without_evidence_appendix(markdown)
    appendix = build_evidence_appendix(session, project_id, source, require_markers=require_markers)
    if not appendix:
        return source
    return source.rstrip() + "\n\n" + appendix
