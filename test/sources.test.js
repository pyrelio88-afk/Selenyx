import test from 'node:test';
import assert from 'node:assert/strict';
import { searchArxiv, parseAtomEntries } from '../src/research/sources/arxiv.js';
import { searchCrossref } from '../src/research/sources/crossref.js';
import { searchEuropePmc } from '../src/research/sources/europepmc.js';
import { searchSemanticScholar } from '../src/research/sources/semantic.js';
import { searchUnpaywall, searchDoaj, searchCore } from '../src/research/sources/openaccess.js';
import { CHINA_SOURCES, getChinaSource, planChinaSearch, resolveMode } from '../src/research/sources/china.js';
import { listAllSources, listApiSources, listChinaSources, getSourceMeta, searchSource } from '../src/research/sourceRegistry.js';

function jsonFetch(payload, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload) });
}
function textFetch(text, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => text, json: async () => { throw new Error('not json'); } });
}

// ---------- arXiv ----------
const ATOM = `<?xml version="1.0"?><feed>
<opensearch:totalResults>1234</opensearch:totalResults>
<entry><id>http://arxiv.org/abs/2401.00001v1</id><title>Deep Learning for X</title>
<summary>We propose a method.</summary><published>2024-01-02T00:00:00Z</published>
<author><name>Alice Zhang</name></author><author><name>Bob Li</name></author>
<arxiv:journal_ref>Nature 2024</arxiv:journal_ref><arxiv:doi>10.1234/abc</arxiv:doi></entry>
</feed>`;

test('arxiv parse + normalize', async () => {
  const res = await searchArxiv('deep learning', { fetchImpl: textFetch(ATOM) });
  assert.equal(res.source, 'arxiv');
  assert.equal(res.total, 1234);
  assert.equal(res.records.length, 1);
  const r = res.records[0];
  assert.equal(r.title, 'Deep Learning for X');
  assert.deepEqual(r.authors, ['Alice Zhang', 'Bob Li']);
  assert.equal(r.year, 2024);
  assert.equal(r.externalIds.arxiv, '2401.00001v1');
  assert.equal(r.externalIds.doi, '10.1234/abc');
  assert.equal(r.sourceType, 'preprint');
});

test('arxiv network error', async () => {
  await assert.rejects(
    searchArxiv('x', { fetchImpl: async () => { throw new Error('boom'); } }),
    (e) => e.code === 'NETWORK_ERROR' && e.source === 'arxiv',
  );
});

// ---------- Crossref ----------
test('crossref normalize + total', async () => {
  const payload = { message: { 'total-results': 99, items: [{
    title: ['A Study'], DOI: '10.1/x', issued: { 'date-parts': [[2023]] },
    author: [{ given: 'A', family: 'B' }], 'container-title': ['J. Test'], URL: 'https://doi.org/10.1/x',
  }] } };
  const res = await searchCrossref('study', { fetchImpl: jsonFetch(payload) });
  assert.equal(res.total, 99);
  assert.equal(res.records[0].externalIds.doi, '10.1/x');
  assert.equal(res.records[0].year, 2023);
  assert.equal(res.records[0].venue, 'J. Test');
});

// ---------- Europe PMC ----------
test('europepmc maps pmid + journal', async () => {
  const payload = { hitCount: 5, resultList: { result: [{
    title: 'CRISPR Review', pmid: '38000001', doi: '10.5/y', pubYear: '2023',
    authorString: 'Chen L, Wang M', journalTitle: 'Cell',
  }] } };
  const res = await searchEuropePmc('crispr', { fetchImpl: jsonFetch(payload) });
  assert.equal(res.total, 5);
  assert.equal(res.records[0].externalIds.pmid, '38000001');
  assert.deepEqual(res.records[0].authors, ['Chen L', 'Wang M']);
});

// ---------- Semantic Scholar ----------
test('semantic scholar fields', async () => {
  const payload = { total: 7, data: [{
    paperId: 'p1', title: 'Graph Nets', year: 2022, venue: 'ICML',
    abstract: 'Abstract text', url: 'https://x', externalIds: { DOI: '10.9/z', PubMed: 123 },
    authors: [{ name: 'C' }],
  }] };
  const res = await searchSemanticScholar('graph', { fetchImpl: jsonFetch(payload) });
  assert.equal(res.total, 7);
  assert.equal(res.records[0].externalIds.semanticScholar, 'p1');
  assert.equal(res.records[0].externalIds.pmid, '123');
});

// ---------- Unpaywall / DOAJ / CORE ----------
test('unpaywall unwraps response', async () => {
  const payload = { results: [{ response: { title: 'OA Paper', doi: '10.2/o', year: 2021, journal_name: 'OA J', z_authors: [{ given: 'X', family: 'Y' }] } }] };
  const res = await searchUnpaywall('oa', { fetchImpl: jsonFetch(payload) });
  assert.equal(res.records[0].externalIds.doi, '10.2/o');
});

test('doaj maps bibjson', async () => {
  const payload = { total: 3, results: [{ id: 'd1', bibjson: { title: 'OA Article', year: '2020', author: [{ name: 'Q' }], journal: { title: 'OA Journal' }, identifier: [{ type: 'doi', id: '10.3/d' }] } }] };
  const res = await searchDoaj('oa', { fetchImpl: jsonFetch(payload) });
  assert.equal(res.records[0].externalIds.doi, '10.3/d');
});

test('core posts and maps', async () => {
  let body;
  const fetchImpl = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ totalHits: 2, results: [{ id: 'c1', title: 'Core Work', yearPublished: '2019', authors: [{ name: 'Z' }], doi: '10.4/c' }] }) }; };
  const res = await searchCore('core', { fetchImpl });
  assert.equal(body.q, 'core');
  assert.equal(res.records[0].externalIds.doi, '10.4/c');
});

// ---------- China sources ----------
test('china registry has 8 sources, all 4 modes declared', () => {
  assert.equal(CHINA_SOURCES.length, 8);
  for (const s of CHINA_SOURCES) {
    for (const m of ['native-api', 'search-link', 'embedded-browser', 'external-browser']) {
      assert.ok(s.integration[m], `${s.id} missing mode ${m}`);
    }
  }
});

test('china plan produces search-link with honesty note', () => {
  const plan = planChinaSearch('pubscholar', '心力衰竭');
  assert.equal(plan.mode, 'search-link');
  assert.ok(plan.url.includes('pubscholar.cn'));
  assert.ok(plan.honesty.length > 0);
  assert.equal(plan.requiresAccount, false);
});

test('cnki flagged requiresAccount', () => {
  const plan = planChinaSearch('cnki', 'test');
  assert.equal(plan.requiresAccount, true);
});

test('resolveMode never returns native-api for china sources', () => {
  for (const s of CHINA_SOURCES) assert.notEqual(resolveMode(s), 'native-api');
});

// ---------- Registry ----------
test('registry lists intl + china', () => {
  assert.equal(listApiSources().length, 7);
  assert.equal(listChinaSources().length, 8);
  assert.equal(listAllSources().length, 15);
  assert.equal(getSourceMeta('arxiv').kind, 'native-api');
  assert.equal(getSourceMeta('cnki').kind, 'link');
  assert.equal(getSourceMeta('nope'), null);
});

test('searchSource routes api vs link', async () => {
  const apiRes = await searchSource('crossref', 'x', { fetchImpl: jsonFetch({ message: { 'total-results': 0, items: [] } }) });
  assert.equal(apiRes.kind, 'native-api');
  const linkRes = await searchSource('wanfang', 'x');
  assert.equal(linkRes.kind, 'link');
  assert.ok(linkRes.url.includes('wanfangdata'));
});
