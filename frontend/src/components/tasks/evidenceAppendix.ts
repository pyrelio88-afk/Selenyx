/** 成稿导出时附「证据附录」：引用 → 证据卡 + 裁决状态 + 时间。 */

export interface AppendixEvidence {
  id: string;
  project_id?: string;
  claim: string;
  excerpt: string;
  review: string;
  status?: string;
  page?: number | null;
  updated_at?: string;
  created_at?: string;
  notes?: string;
}

const MARKER = /\[\^e:([A-Za-z0-9._-]+)\]/g;
const APPENDIX_HEADING = /^[ \t]*##\s+证据附录\s*$/m;

/**
 * The appendix is provenance metadata, never authored run output.  Remove an
 * old or fabricated section before rendering, downloading, or saving a run.
 */
export function withoutEvidenceAppendix(markdown: string): string {
  const match = APPENDIX_HEADING.exec(markdown || '');
  return match ? markdown.slice(0, match.index).trimEnd() : markdown;
}

export function citedEvidenceIds(markdown: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of markdown.matchAll(MARKER)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Evidence exports may only include cards accepted for the run's own project. */
export function acceptedEvidenceForExport<T extends AppendixEvidence>(
  projectId: string | null,
  evidence: T[],
): T[] {
  if (!projectId) return [];
  return evidence.filter((item) => (
    item.project_id === projectId
    && item.review === 'accepted'
    && item.status === 'accepted'
  ));
}

export function buildEvidenceAppendix(
  markdown: string,
  evidence: AppendixEvidence[],
): string {
  const ids = citedEvidenceIds(markdown);
  if (ids.length === 0) return '';
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const lines = ['## 证据附录', '', '每条引用对应一张证据卡。未找到的 id 如实标出，不补造。', ''];
  ids.forEach((id, index) => {
    const item = byId.get(id);
    lines.push(`### ${index + 1}. [^e:${id}]`);
    if (!item) {
      lines.push('- 状态：未找到对应证据卡（导出时库中无此 id）');
      lines.push('');
      return;
    }
    lines.push(`- 论断：${item.claim || '（无）'}`);
    lines.push(`- 摘录：${item.excerpt || '（无）'}`);
    if (item.page != null) lines.push(`- 页码：p.${item.page}`);
    lines.push(`- 裁决状态：${item.review}`);
    lines.push(`- 时间：${item.updated_at || item.created_at || '（无）'}`);
    if (item.notes) lines.push(`- 备注：${item.notes}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}

export function withEvidenceAppendix(
  markdown: string,
  evidence: AppendixEvidence[],
): string {
  const source = withoutEvidenceAppendix(markdown);
  const appendix = buildEvidenceAppendix(source, evidence);
  if (!appendix) return source;
  return `${source.replace(/\s*$/, '')}\n\n${appendix}`;
}
