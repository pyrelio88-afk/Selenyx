/**
 * BibTeX/RIS ↔ Selenyx Reference 双向转换器
 *
 * 把 parseBibTeX / parseRIS 的输出映射为 57 字段 Reference；
 * 反向把 Reference 导出为 BibTeX / RIS 字符串。
 * 作者名解析对齐 Zotero：支持 "Last, First" 与 "First Last" 两种形态，
 * 多人用 " and "（BibTeX）或重复 A1/AU 标签（RIS）分隔。
 */

import type { Reference, Creator, ItemType } from '@apptypes/reference';
import { parseBibTeX, entryToBibTeX, BIBTEX_TYPE_MAP, ITEMTYPE_TO_BIBTEX, type BibEntry } from './bibtex';
import { parseRIS, entryToRIS, firstTag, RIS_TYPE_MAP, ITEMTYPE_TO_RIS, type RISEntry } from './ris';

/** 月份宏/缩写 → MM */
const MONTH_TO_MM: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06',
  jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
};
const MM_TO_MONTH: Record<string, string> = Object.fromEntries(
  Object.entries(MONTH_TO_MM).filter(([k]) => k.length === 3).map(([k, v]) => [v, k]),
);

// ===== 作者名解析 =====

/** 解析单个作者名："Last, First" 或 "First Last" 或 "Last, F. M." */
export function parseAuthorName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  if (trimmed.includes(',')) {
    // "Last, First Middle"
    const idx = trimmed.indexOf(',');
    const last = trimmed.slice(0, idx).trim();
    const first = trimmed.slice(idx + 1).trim();
    return { firstName: first, lastName: last };
  }
  // "First Middle Last" → 末词为姓
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return { firstName: first, lastName: last };
}

/** BibTeX 作者字段（"A and B and C"）→ Creator[] */
export function parseBibAuthors(authorField: string, type: Creator['type'] = 'author'): Creator[] {
  if (!authorField) return [];
  return authorField
    .split(/\s+and\s+/i)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n, i) => {
      const { firstName, lastName } = parseAuthorName(n);
      return { id: `c${i}`, firstName, lastName, type, order: i };
    });
}

/** Creator[] → BibTeX 作者字符串 "Last, First and Last2, First2" */
export function creatorsToBibAuthors(creators: Creator[]): string {
  return creators
    .map((c) => (c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName))
    .join(' and ');
}

// ===== 默认值工厂 =====

function emptyReference(partial: Partial<Reference>): Reference {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    citeKey: '',
    type: 'journalArticle',
    title: '',
    shortTitle: '',
    abstract: '',
    creators: [],
    publication: '',
    volume: '', issue: '', pages: '',
    publisher: '', place: '',
    year: '', date: '', accessionDate: '',
    doi: '', isbn: '', issn: '', pmid: '', pmcid: '', arxivId: '',
    url: '', uri: '',
    collections: [], tags: [],
    language: '', rights: '',
    attachments: [], annotations: [],
    notes: '',
    impactFactor: null, jcrQuartile: null,
    openAccess: false, pageCharge: null, reviewWeeks: null,
    pipelineStage: null,
    readStatus: 'unread',
    importance: 3,
    createdAt: now, updatedAt: now,
    source: 'import',
    ...partial,
  } as Reference;
}

// ===== BibTeX → Reference =====

export function bibEntryToReference(e: BibEntry): Reference {
  const f = e.fields;
  const itemType = (BIBTEX_TYPE_MAP[e.type] ?? 'journalArticle') as ItemType;
  const creators = [
    ...parseBibAuthors(f.author ?? '', 'author'),
    ...parseBibAuthors(f.editor ?? '', 'editor'),
  ];
  return emptyReference({
    citeKey: e.key,
    type: itemType,
    title: f.title ?? '',
    abstract: f.abstract ?? '',
    creators,
    publication: f.journal ?? f.journaltitle ?? f.booktitle ?? '',
    volume: f.volume ?? '',
    issue: f.number ?? f.issue ?? '',
    pages: (f.pages ?? '').replace(/--/g, '–'),
    publisher: f.publisher ?? '',
    place: f.address ?? f.location ?? '',
    year: f.year ?? (f.date ? f.date.slice(0, 4) : ''),
    date: f.date ?? (f.month ? `${f.year ?? ''}-${MONTH_TO_MM[f.month.toLowerCase()] ?? ''}` : ''),
    doi: (f.doi ?? '').replace(/^https?:\/\/doi.org\//, ''),
    isbn: f.isbn ?? '',
    issn: f.issn ?? '',
    url: f.url ?? '',
    language: f.language ?? '',
    notes: f.note ?? f.annote ?? '',
    tags: (f.keywords ?? f.keyword ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean),
  });
}

export function importBibTeX(src: string): Reference[] {
  return parseBibTeX(src).map(bibEntryToReference);
}

// ===== RIS → Reference =====

export function risEntryToReference(e: RISEntry): Reference {
  const itemType = (RIS_TYPE_MAP[e.type] ?? 'journalArticle') as ItemType;
  const authors = (e.tags['A1'] ?? e.tags['AU'] ?? []).map((n, i) => {
    const { firstName, lastName } = parseAuthorName(n);
    return { id: `c${i}`, firstName, lastName, type: 'author' as const, order: i };
  });
  const editors = (e.tags['A2'] ?? e.tags['ED'] ?? []).map((n, i) => {
    const { firstName, lastName } = parseAuthorName(n);
    return { id: `e${i}`, firstName, lastName, type: 'editor' as const, order: authors.length + i };
  });
  const yearRaw = firstTag(e, 'PY') || firstTag(e, 'Y1') || firstTag(e, 'DA');
  const year = (yearRaw.match(/\d{4}/) ?? [''])[0];
  return emptyReference({
    type: itemType,
    title: firstTag(e, 'TI') || firstTag(e, 'T1'),
    abstract: firstTag(e, 'AB') || firstTag(e, 'N2'),
    creators: [...authors, ...editors],
    publication: firstTag(e, 'JO') || firstTag(e, 'JF') || firstTag(e, 'T2') || firstTag(e, 'BT'),
    volume: firstTag(e, 'VL'),
    issue: firstTag(e, 'IS'),
    pages: firstTag(e, 'SP') && firstTag(e, 'EP') ? `${firstTag(e, 'SP')}–${firstTag(e, 'EP')}` : (firstTag(e, 'SP') || firstTag(e, 'EP')),
    publisher: firstTag(e, 'PB'),
    place: firstTag(e, 'CY'),
    year,
    date: firstTag(e, 'Y1') || firstTag(e, 'DA'),
    doi: firstTag(e, 'DO').replace(/^https?:\/\/doi.org\//, ''),
    isbn: firstTag(e, 'SN') && firstTag(e, 'SN').includes('-') && firstTag(e, 'SN').length > 12 ? '' : '',
    issn: '',
    url: firstTag(e, 'UR'),
    language: firstTag(e, 'LA'),
    notes: firstTag(e, 'N1'),
    tags: (e.tags['KW'] ?? []).flatMap((k) => k.split(/[,;]/).map((t) => t.trim()).filter(Boolean)),
    accessionDate: firstTag(e, 'Y2'),
  });
}

export function importRIS(src: string): Reference[] {
  return parseRIS(src).map(risEntryToReference);
}

// ===== Reference → BibTeX =====

export function referenceToBibTeX(r: Reference): string {
  const type = ITEMTYPE_TO_BIBTEX[r.type] ?? 'misc';
  const key = r.citeKey || `${r.creators[0]?.lastName ?? 'ref'}${r.year ?? ''}`;
  const fields: Record<string, string> = {
    title: r.title,
    author: creatorsToBibAuthors(r.creators.filter((c) => c.type === 'author')),
    year: r.year,
  };
  if (r.type === 'journalArticle') fields.journal = r.publication;
  else if (r.type === 'conferencePaper') fields.booktitle = r.publication;
  else if (r.type === 'book' || r.type === 'bookSection') fields.publisher = r.publisher;
  else fields.journal = r.publication;
  if (r.volume) fields.volume = r.volume;
  if (r.issue) fields.number = r.issue;
  if (r.pages) fields.pages = r.pages.replace(/–/g, '--');
  // 月份：从 date "YYYY-MM" 反推 BibTeX 月份宏
  const mm = r.date?.match(/^\d{4}-(\d{2})$/)?.[1];
  if (mm && MM_TO_MONTH[mm]) fields.month = mm;
  if (r.doi) fields.doi = r.doi;
  if (r.url) fields.url = r.url;
  if (r.abstract) fields.abstract = r.abstract;
  if (r.publisher && r.type !== 'book' && r.type !== 'bookSection') fields.publisher = r.publisher;
  if (r.place) fields.address = r.place;
  if (r.isbn) fields.isbn = r.isbn;
  if (r.issn) fields.issn = r.issn;
  if (r.tags.length) fields.keywords = r.tags.join(', ');
  if (r.notes) fields.note = r.notes;
  return entryToBibTeX(type, key, fields);
}

export function exportBibTeX(refs: Reference[]): string {
  return refs.map(referenceToBibTeX).join('\n\n') + '\n';
}

// ===== Reference → RIS =====

export function referenceToRIS(r: Reference): string {
  const type = ITEMTYPE_TO_RIS[r.type] ?? 'GEN';
  const tags: Record<string, string[]> = {};
  const push = (tag: string, v: string) => { if (v) { (tags[tag] ??= []).push(v); } };

  push('TI', r.title);
  for (const c of r.creators.filter((x) => x.type === 'author')) {
    push('AU', c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName);
  }
  for (const c of r.creators.filter((x) => x.type === 'editor')) {
    push('ED', c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName);
  }
  push('PY', r.year);
  push('DA', r.date);
  push('JO', r.publication);
  push('VL', r.volume);
  push('IS', r.issue);
  if (r.pages.includes('–')) {
    const [sp, ep] = r.pages.split('–');
    push('SP', sp.trim()); push('EP', ep.trim());
  } else push('SP', r.pages);
  push('PB', r.publisher);
  push('CY', r.place);
  push('DO', r.doi);
  push('UR', r.url);
  push('AB', r.abstract);
  push('LA', r.language);
  push('N1', r.notes);
  for (const t of r.tags) push('KW', t);
  return entryToRIS(type, tags);
}

export function exportRIS(refs: Reference[]): string {
  return refs.map(referenceToRIS).join('\n\n') + '\n';
}

/** 统一导入入口：自动嗅探格式 */
export function importReferences(src: string): { format: 'bibtex' | 'ris'; refs: Reference[] } {
  const head = src.slice(0, 2000);
  if (/^TY  - /m.test(head)) return { format: 'ris', refs: importRIS(src) };
  return { format: 'bibtex', refs: importBibTeX(src) };
}
