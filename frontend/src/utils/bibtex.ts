/**
 * BibTeX 解析器 / 生成器
 *
 * 对齐标准：citation-js (@citation-js/plugin-bibtex) + Zotero BibTeX translator。
 * 处理真实世界 BibTeX 的边界情况：
 * - 值三种形态：{braced} / "quoted" / 裸值（月份缩写 jan..dec、数字、宏名）
 * - 嵌套花括号（标题里 {RNA}-seq 这类保护大小写）
 * - 字符串拼接（field = jan # " 15"）
 * - @string / @preamble / @comment 特殊条目
 * - LaTeX 重音命令剥离（\"a → ä、{\'e} → é 等）
 * - 大小写不敏感的字段名（TITLE / Title / title 等价）
 */

// ===== 类型 =====

export interface BibEntry {
  /** 条目类型（小写），如 article / book / inproceedings */
  type: string;
  /** citation key */
  key: string;
  /** 字段名（小写）→ 值（已剥离外层括号、已解 LaTeX 重音） */
  fields: Record<string, string>;
}

/** BibTeX 条目类型 → Selenyx ItemType 映射 */
export const BIBTEX_TYPE_MAP: Record<string, string> = {
  article: 'journalArticle',
  book: 'book',
  booklet: 'book',
  inbook: 'bookSection',
  incollection: 'bookSection',
  inproceedings: 'conferencePaper',
  conference: 'conferencePaper',
  proceedings: 'conferencePaper',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  manual: 'report',
  misc: 'webpage',
  unpublished: 'preprint',
  patent: 'patent',
  online: 'webpage',
  dataset: 'dataset',
  software: 'software',
  standard: 'standard',
};

/** Selenyx ItemType → BibTeX 条目类型（导出用） */
export const ITEMTYPE_TO_BIBTEX: Record<string, string> = {
  journalArticle: 'article',
  book: 'book',
  bookSection: 'incollection',
  conferencePaper: 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  webpage: 'online',
  preprint: 'unpublished',
  dataset: 'dataset',
  software: 'software',
  patent: 'patent',
  standard: 'standard',
  magazineArticle: 'article',
  newspaperArticle: 'article',
};

// ===== LaTeX 重音 / 特殊字符剥离 =====

const LATEX_ACCENTS: Record<string, string> = {
  "\\'a": 'á', "\\'e": 'é', "\\'i": 'í', "\\'o": 'ó', "\\'u": 'ú', "\\'y": 'ý',
  '\\"a': 'ä', '\\"e': 'ë', '\\"i': 'ï', '\\"o': 'ö', '\\"u': 'ü', '\\"y': 'ÿ',
  '\\`a': 'à', '\\`e': 'è', '\\`i': 'ì', '\\`o': 'ò', '\\`u': 'ù',
  '\\^a': 'â', '\\^e': 'ê', '\\^i': 'î', '\\^o': 'ô', '\\^u': 'û',
  '\\~a': 'ã', '\\~n': 'ñ', '\\~o': 'õ',
  '\\c c': 'ç', '\\cc': 'ç',
  '\\ae': 'æ', '\\oe': 'œ', '\\o': 'ø', '\\l': 'ł', '\\ss': 'ß',
  '\\AE': 'Æ', '\\OE': 'Œ', '\\O': 'Ø', '\\L': 'Ł',
  '\\AA': 'Å', '\\aa': 'å',
  '\\&': '&', '\\%': '%', '\\$': '$', '\\#': '#', '\\_': '_',
  '\\textemdash': '—', '\\textendash': '–', '---': '—', '--': '–',
  "\\~{}": '~', "\\^{}": '^',
};

/** 剥离 LaTeX 命令，输出纯文本（保留花括号内的大小写保护结果） */
export function stripLatex(input: string): string {
  if (!input) return '';
  let s = input;
  // 先处理 \\'{a} 这种带花括号的形式
  s = s.replace(/\\(['"`^~c])\{([a-zA-Z])\}/g, (_m, acc, ch) => {
    const k = `\\${acc}${ch}`;
    return LATEX_ACCENTS[k] ?? ch;
  });
  // 再处理 \\'a 这种直接形式
  s = s.replace(/\\(['"`^~c])([a-zA-Z])/g, (_m, acc, ch) => {
    const k = `\\${acc}${ch}`;
    return LATEX_ACCENTS[k] ?? ch;
  });
  // 已知多字符命令
  for (const [cmd, ch] of Object.entries(LATEX_ACCENTS)) {
    if (cmd.length > 2) s = s.split(cmd).join(ch);
  }
  // 破折号：先 --- → em-dash，再 -- → en-dash（顺序重要，否则 --- 被拆成 –- ）
  s = s.replace(/---/g, '—').replace(/--/g, '–');
  // 去除其余花括号（大小写保护壳），保留内容
  s = s.replace(/[{}]/g, '');
  // 常见排版命令
  s = s.replace(/\\textit\{([^}]*)\}/g, '$1').replace(/\\textbf\{([^}]*)\}/g, '$1').replace(/\\emph\{([^}]*)\}/g, '$1');
  // 反斜杠空格等
  s = s.replace(/\\[ ,;]/g, ' ');
  return s.trim();
}

// ===== 解析器（手写递归下降，处理嵌套花括号） =====

interface ParseState { src: string; pos: number; strings: Record<string, string>; }

function skipWsAndComments(st: ParseState): void {
  const n = st.src.length;
  while (st.pos < n) {
    const c = st.src[st.pos];
    if (/\s/.test(c)) { st.pos++; continue; }
    // % 行注释
    if (c === '%') { while (st.pos < n && st.src[st.pos] !== '\n') st.pos++; continue; }
    break;
  }
}

/** 读取一个标识符（类型名 / 字段名 / key） */
function readIdentifier(st: ParseState, stopChars: string): string {
  const start = st.pos;
  const n = st.src.length;
  while (st.pos < n && !stopChars.includes(st.src[st.pos]) && !/\s/.test(st.src[st.pos])) {
    st.pos++;
  }
  return st.src.slice(start, st.pos);
}

/** 读取一个花括号界定的值（支持嵌套），pos 应在 '{' 上 */
function readBraced(st: ParseState): string {
  // 假设 st.src[st.pos] === '{'
  st.pos++; // 跳过 {
  let depth = 1;
  const n = st.src.length;
  let out = '';
  while (st.pos < n && depth > 0) {
    const c = st.src[st.pos];
    if (c === '{') { depth++; out += c; st.pos++; }
    else if (c === '}') {
      depth--;
      if (depth > 0) out += c; // 内层 } 保留
      st.pos++;
    } else if (c === '\\') {
      // 保留反斜杠命令（后续 stripLatex 处理）
      out += c;
      st.pos++;
      if (st.pos < n) { out += st.src[st.pos]; st.pos++; }
    } else { out += c; st.pos++; }
  }
  return out;
}

/** 读取一个双引号界定的值（内部 {} 嵌套保护引号） */
function readQuoted(st: ParseState): string {
  st.pos++; // 跳过 "
  let out = '';
  const n = st.src.length;
  let depth = 0;
  while (st.pos < n) {
    const c = st.src[st.pos];
    if (c === '{') { depth++; out += c; st.pos++; }
    else if (c === '}') { depth--; out += c; st.pos++; }
    else if (c === '"' && depth === 0) { st.pos++; break; }
    else if (c === '\\') { out += c; st.pos++; if (st.pos < n) { out += st.src[st.pos]; st.pos++; } }
    else { out += c; st.pos++; }
  }
  return out;
}

/** 读取单个值（braced / quoted / 裸 token），返回去括号后的字符串 */
function readValue(st: ParseState): string {
  skipWsAndComments(st);
  const parts: string[] = [];
  // 处理 # 拼接：value = part1 # part2 # part3
  for (;;) {
    skipWsAndComments(st);
    const c = st.src[st.pos];
    if (c === '{') { parts.push(readBraced(st)); }
    else if (c === '"') { parts.push(readQuoted(st)); }
    else {
      // 裸 token：数字 / 月份缩写 / @string 宏名
      const tok = readIdentifier(st, ',}#');
      parts.push(st.strings[tok.toLowerCase()] ?? tok);
    }
    skipWsAndComments(st);
    if (st.src[st.pos] === '#') { st.pos++; continue; }
    break;
  }
  return parts.join('');
}

/** 主解析入口 */
export function parseBibTeX(src: string): BibEntry[] {
  const st: ParseState = { src, pos: 0, strings: {} };
  const entries: BibEntry[] = [];
  const n = src.length;

  while (st.pos < n) {
    skipWsAndComments(st);
    if (st.pos >= n) break;
    if (src[st.pos] !== '@') { st.pos++; continue; }
    st.pos++; // 跳过 @
    skipWsAndComments(st);
    const typeRaw = readIdentifier(st, '{(');
    const type = typeRaw.toLowerCase();
    skipWsAndComments(st);
    const open = src[st.pos];
    if (open !== '{' && open !== '(') { continue; }
    const close = open === '{' ? '}' : ')';
    st.pos++; // 跳过开括号

    if (type === 'comment' || type === 'preamble') {
      // 跳过整个块
      let depth = 1;
      while (st.pos < n && depth > 0) {
        if (src[st.pos] === open) depth++;
        else if (src[st.pos] === close) depth--;
        st.pos++;
      }
      continue;
    }
    if (type === 'string') {
      // @string{key = value}
      skipWsAndComments(st);
      const k = readIdentifier(st, '=').trim().toLowerCase();
      skipWsAndComments(st);
      if (src[st.pos] === '=') st.pos++;
      const v = readValue(st);
      st.strings[k] = v;
      // 跳到结束
      let depth = 1;
      while (st.pos < n && depth > 0) {
        if (src[st.pos] === open) depth++;
        else if (src[st.pos] === close) depth--;
        st.pos++;
      }
      continue;
    }

    // 常规条目：@type{key, field = value, ...}
    skipWsAndComments(st);
    const key = readIdentifier(st, ',').trim();
    if (src[st.pos] === ',') st.pos++;

    const fields: Record<string, string> = {};
    for (;;) {
      skipWsAndComments(st);
      if (st.pos >= n) break;
      if (src[st.pos] === close) { st.pos++; break; }
      if (src[st.pos] === ',') { st.pos++; continue; }
      // 读字段名
      const fname = readIdentifier(st, '=').trim().toLowerCase();
      if (!fname) { st.pos++; continue; }
      skipWsAndComments(st);
      if (src[st.pos] === '=') st.pos++;
      const fval = readValue(st);
      fields[fname] = stripLatex(fval);
      skipWsAndComments(st);
      if (src[st.pos] === ',') st.pos++;
    }
    if (key) entries.push({ type, key, fields });
  }
  return entries;
}

// ===== 生成器 =====

/** 月份数字 → BibTeX 月份宏 */
const MONTH_MACROS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/** 判断是否需要花括号保护大小写（标题含连续大写词时） */
function needsCaseProtection(value: string): boolean {
  return /\b[A-Z]{2,}\b/.test(value);
}

/** 生成单条 BibTeX */
export function entryToBibTeX(type: string, key: string, fields: Record<string, string>): string {
  const lines: string[] = [];
  const ordered = Object.entries(fields).filter(([, v]) => v != null && v !== '');
  for (const [k, v] of ordered) {
    let val = v;
    // 标题大小写保护：含全大写缩写时包一层 {}
    if ((k === 'title' || k === 'booktitle') && needsCaseProtection(val)) {
      val = val.replace(/\b([A-Z]{2,})\b/g, '{$1}');
    }
    // 月份字段用宏（BibTeX 惯例）
    if (k === 'month' && /^(0?[1-9]|1[0-2])$/.test(val)) {
      val = MONTH_MACROS[parseInt(val, 10) - 1];
      lines.push(`  ${k} = ${val},`);
      continue;
    }
    lines.push(`  ${k} = {${val}},`);
  }
  return `@${type}{${key},\n${lines.join('\n')}\n}`;
}

/** 批量生成 BibTeX 文件 */
export function toBibTeX(entries: { type: string; key: string; fields: Record<string, string> }[]): string {
  return entries.map((e) => entryToBibTeX(e.type, e.key, e.fields)).join('\n\n') + '\n';
}
