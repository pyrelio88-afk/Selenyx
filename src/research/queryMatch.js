function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function looksLikeTitleQuery(query) {
  const raw = String(query ?? '').trim();
  if (!raw || /\b10\.\d{4,9}\//i.test(raw)) return false;
  if (/^["“”'‘’].+["“”'‘’]$/.test(raw)) return true;
  const normalized = normalize(raw);
  const cjk = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const words = normalized.split(' ').filter(Boolean);
  return cjk >= 16 || (normalized.length >= 55 && words.length >= 7);
}

function grams(value) {
  const compact = normalize(value).replace(/\s+/g, '');
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  const output = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) output.add(compact.slice(index, index + 2));
  return output;
}

function titleSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const setA = grams(a);
  const setB = grams(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function filterSearchRecords(records, query, mode = 'broad') {
  const list = Array.isArray(records) ? records : [];
  const exact = mode === 'exact' || (mode === 'auto' && looksLikeTitleQuery(query));
  if (!exact) return { records: list, matchMode: 'broad', rawCount: list.length };
  return {
    records: list.filter((record) => titleSimilarity(record?.title, query) >= 0.68),
    matchMode: 'exact-title',
    rawCount: list.length,
  };
}

export { normalize, looksLikeTitleQuery, titleSimilarity, filterSearchRecords };
