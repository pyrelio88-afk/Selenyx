/**
 * RIS 解析器 / 生成器
 *
 * RIS（Research Information Systems）是 EndNote/Zotero/Mendeley 通用交换格式。
 * 格式：`TY  - JOUR` 起始、`ER  - ` 结束，两字母标签 + "  - " 分隔。
 * 处理：多行续行、重复标签（A1 作者多次出现）、CRLF/LF、空值跳过。
 *
 * 对齐：Zotero RIS translator + rispy 的标签约定。
 */

// ===== 类型 =====

export interface RISEntry {
  /** TY 值，如 JOUR / BOOK / CHAP / CONF / THES / RPRT / ELEC */
  type: string;
  /** 标签 → 值数组（重复标签保留全部，如多个 A1） */
  tags: Record<string, string[]>;
}

/** RIS TY → Selenyx ItemType */
export const RIS_TYPE_MAP: Record<string, string> = {
  JOUR: 'journalArticle',
  BOOK: 'book',
  CHAP: 'bookSection',
  CONF: 'conferencePaper',
  CPAPER: 'conferencePaper',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  GEN: 'webpage',
  UNPB: 'preprint',
  DATA: 'dataset',
  COMP: 'software',
  PAT: 'patent',
  STAND: 'standard',
  MGZN: 'magazineArticle',
  NEWS: 'newspaperArticle',
};

/** Selenyx ItemType → RIS TY（导出用） */
export const ITEMTYPE_TO_RIS: Record<string, string> = {
  journalArticle: 'JOUR',
  book: 'BOOK',
  bookSection: 'CHAP',
  conferencePaper: 'CONF',
  thesis: 'THES',
  report: 'RPRT',
  webpage: 'ELEC',
  preprint: 'UNPB',
  dataset: 'DATA',
  software: 'COMP',
  patent: 'PAT',
  standard: 'STAND',
  magazineArticle: 'MGZN',
  newspaperArticle: 'NEWS',
};

// ===== 解析 =====

/**
 * 解析 RIS 文本为条目数组。
 * 兼容：CRLF/LF、续行（以空格开头的行并入上一标签）、BOM。
 */
export function parseRIS(src: string): RISEntry[] {
  const entries: RISEntry[] = [];
  let cur: RISEntry | null = null;

  const text = src.replace(/^\uFEFF/, ''); // 去 BOM
  const lines = text.split(/\r\n|\r|\n/);
  let lastTag = '';

  for (const rawLine of lines) {
    // 续行：以空格/制表开头且非 "TAG  - " 格式 → 追加到上一标签
    const tagMatch = rawLine.match(/^([A-Z][A-Z0-9]) {2}- (.*)$/);
    if (!tagMatch) {
      if (cur && lastTag && rawLine.trim() !== '' && /^[\s\t]/.test(rawLine)) {
        const arr = cur.tags[lastTag];
        if (arr && arr.length > 0) arr[arr.length - 1] += ' ' + rawLine.trim();
      }
      continue;
    }
    const [, tag, value] = tagMatch;
    lastTag = tag;

    if (tag === 'TY') {
      cur = { type: value.trim().toUpperCase(), tags: {} };
      continue;
    }
    if (tag === 'ER') {
      if (cur) entries.push(cur);
      cur = null;
      lastTag = '';
      continue;
    }
    if (!cur) continue; // TY 之前的游离标签跳过

    if (!cur.tags[tag]) cur.tags[tag] = [];
    cur.tags[tag].push(value.trim());
  }
  // 文件末尾无 ER 的兜底
  if (cur && Object.keys(cur.tags).length > 0) entries.push(cur);
  return entries;
}

// ===== 生成 =====

/** 单条 RIS */
export function entryToRIS(type: string, tags: Record<string, string[]>): string {
  const lines: string[] = [`TY  - ${type}`];
  for (const [tag, values] of Object.entries(tags)) {
    for (const v of values) {
      if (v != null && v !== '') lines.push(`${tag}  - ${v}`);
    }
  }
  lines.push('ER  - ');
  return lines.join('\n');
}

/** 批量生成 RIS 文件 */
export function toRIS(entries: { type: string; tags: Record<string, string[]> }[]): string {
  return entries.map((e) => entryToRIS(e.type, e.tags)).join('\n\n') + '\n';
}

/** 取标签第一个值（便捷） */
export function firstTag(entry: RISEntry, tag: string): string {
  return entry.tags[tag]?.[0] ?? '';
}
