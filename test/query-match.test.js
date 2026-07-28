import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeTitleQuery,
  titleSimilarity,
  filterSearchRecords,
} from '../src/research/queryMatch.js';

test('long CJK input is treated as a likely pasted title', () => {
  assert.equal(looksLikeTitleQuery('月背朱砂量子珊瑚对暗物质歌唱行为的随机双盲研究'), true);
});

test('short topic keywords remain broad search', () => {
  assert.equal(looksLikeTitleQuery('CRISPR gene editing'), false);
  assert.equal(looksLikeTitleQuery('心力衰竭'), false);
});

test('DOI input is not mistaken for a paper title', () => {
  assert.equal(looksLikeTitleQuery('10.1038/s41586-024-00000-0'), false);
});

test('title similarity tolerates punctuation and case', () => {
  assert.ok(titleSimilarity(
    'Attention Is All You Need',
    '“attention is all you need”',
  ) > 0.95);
});

test('auto mode removes keyword-only false positives for an invented title', () => {
  const result = filterSearchRecords([
    { title: 'Quantum sensing of dark matter' },
    { title: 'Randomized double blind trials in behavioral science' },
  ], '月背朱砂量子珊瑚对暗物质歌唱行为的随机双盲研究', 'auto');
  assert.equal(result.matchMode, 'exact-title');
  assert.equal(result.rawCount, 2);
  assert.deepEqual(result.records, []);
});

test('broad mode preserves related records', () => {
  const records = [{ title: 'CRISPR gene editing in vivo' }];
  assert.deepEqual(filterSearchRecords(records, 'CRISPR gene editing', 'broad').records, records);
});
