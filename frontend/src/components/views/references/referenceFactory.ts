/**
 * 文献条目构造与引用文本的纯函数集（从 ReferencesView.tsx 抽离）。
 *
 * 不依赖 React，便于单测与复用；GB/T 7714 生成器同时供移动端/桌面端
 * 详情面板使用（消除原先的内联重复）。
 */

import type { Reference } from '@apptypes/reference';
import type { FetchedReference } from '@services/metadataFetch';
import type { ScholarlyCandidate } from '@services/api';
import { normalizeDoi, safeExternalUrl } from '@utils/referenceIntegrity';

export function createReferenceFromFetched(ref: FetchedReference): Reference {
  const timestamp = new Date().toISOString();
  const doi = normalizeDoi(ref.doi);
  const identifier = doi || ref.title;
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: ref.title,
    creators: ref.creators.map((creator, index) => ({ id: `c_${index}`, firstName: creator.firstName, lastName: creator.lastName, type: 'author' as const, order: index })),
    type: ref.type as Reference['type'],
    doi,
    publication: ref.publication,
    year: String(ref.year),
    volume: ref.volume,
    issue: ref.issue,
    pages: ref.pages,
    abstract: ref.abstract,
    tags: [],
    readStatus: 'unread',
    importance: 3,
    citeKey: identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'reference',
    openAccess: ref.openAccess,
    annotations: [],
    shortTitle: '',
    publisher: ref.publisher,
    place: '',
    date: '',
    accessionDate: '',
    isbn: '',
    issn: ref.issn,
    pmid: ref.pmid ?? '',
    pmcid: '',
    arxivId: ref.arxivId ?? '',
    url: safeExternalUrl(ref.url) ?? (doi ? `https://doi.org/${encodeURIComponent(doi)}` : ''),
    uri: '',
    collections: [],
    language: '',
    rights: '',
    attachments: [],
    notes: '',
    impactFactor: null,
    jcrQuartile: null,
    pageCharge: null,
    reviewWeeks: null,
    pipelineStage: null,
    source: 'api',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function scholarlyToFetched(candidate: ScholarlyCandidate): FetchedReference {
  const sourceType = candidate.source === 'arxiv' ? 'preprint' : 'journalArticle';
  return {
    title: candidate.title,
    creators: candidate.creators.map(({ firstName, lastName }) => ({ firstName, lastName })),
    type: sourceType,
    doi: candidate.doi,
    publication: candidate.publication,
    year: Number(candidate.year) || new Date().getFullYear(),
    volume: candidate.volume ?? '',
    issue: candidate.issue ?? '',
    pages: candidate.pages ?? '',
    abstract: candidate.abstract,
    issn: '',
    publisher: '',
    openAccess: candidate.openAccess,
    url: candidate.url,
    pmid: candidate.pmid,
    arxivId: candidate.arxivId,
    source: candidate.source,
  };
}

export interface ManualReferenceForm {
  title: string;
  authors: string;
  year: string;
  publication: string;
  doi: string;
  url: string;
  abstract: string;
}

export function emptyManualReferenceForm(): ManualReferenceForm {
  return { title: '', authors: '', year: String(new Date().getFullYear()), publication: '', doi: '', url: '', abstract: '' };
}

export function parseManualCreators(input: string): Reference['creators'] {
  return input.split(/[;；\n]+/).map((raw) => raw.trim()).filter(Boolean).map((name, index) => {
    const comma = name.indexOf(',');
    if (comma >= 0) {
      return { id: `c_${index}`, firstName: name.slice(comma + 1).trim(), lastName: name.slice(0, comma).trim(), type: 'author' as const, order: index };
    }
    const tokens = name.split(/\s+/);
    const lastName = tokens.length > 1 ? tokens.at(-1) ?? '' : name;
    return { id: `c_${index}`, firstName: tokens.length > 1 ? tokens.slice(0, -1).join(' ') : '', lastName, type: 'author' as const, order: index };
  });
}

export function createManualReference(form: ManualReferenceForm): Reference {
  const timestamp = new Date().toISOString();
  const doi = normalizeDoi(form.doi);
  const creators = parseManualCreators(form.authors);
  const identifier = doi || `${creators[0]?.lastName ?? 'reference'}${form.year}` || form.title;
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: form.title.trim(),
    creators,
    type: 'journalArticle',
    doi,
    publication: form.publication.trim(),
    year: form.year.trim(),
    volume: '', issue: '', pages: '', abstract: form.abstract.trim(), tags: [], readStatus: 'unread', importance: 3,
    citeKey: identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'reference',
    openAccess: false, annotations: [], shortTitle: '', publisher: '', place: '', date: '', accessionDate: '', isbn: '', issn: '', pmid: '', pmcid: '', arxivId: '',
    url: form.url.trim() || (doi ? `https://doi.org/${encodeURIComponent(doi)}` : ''), uri: '', collections: [], language: '', rights: '', attachments: [], notes: '',
    impactFactor: null, jcrQuartile: null, pageCharge: null, reviewWeeks: null, pipelineStage: null,
    source: 'manual', createdAt: timestamp, updatedAt: timestamp,
  };
}

/** GB/T 7714-2015 顺序编码制引用文本（覆盖常用类型，未知类型按期刊文章处理） */
export function generateGBT7714(r: Reference): string {
  const authors = r.creators.map((c) => `${c.lastName}${c.firstName}`).join(', ');
  const typeMap: Record<string, string> = {
    'journalArticle': '[J]', 'book': '[M]', 'bookSection': '[M]', 'conferencePaper': '[C]',
    'thesis': '[D]', 'report': '[R]', 'webpage': '[EB/OL]', 'preprint': '[J]',
  };
  const typeTag = typeMap[r.type] || '[J]';
  let citation = `${authors}. ${r.title}${typeTag}. `;
  if (r.publication) citation += `${r.publication}, `;
  if (r.year) citation += `${r.year}`;
  if (r.volume) citation += `, ${r.volume}`;
  if (r.issue) citation += `(${r.issue})`;
  if (r.pages) citation += `: ${r.pages}`;
  citation += '.';
  if (r.doi) citation += ` DOI: ${r.doi}.`;
  return citation;
}
