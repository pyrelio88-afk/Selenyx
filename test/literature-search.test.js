import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiteratureSearchError,
  LiteratureSearchService,
  clampLimit,
  normalizeDoi,
  reconstructOpenAlexAbstract,
  searchOpenAlex,
  searchPubMed,
  deduplicateRecords,
} from '../src/research/search.js';
import { createSourceRecord } from '../src/research/domain.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

for (const [value, expected] of [[undefined, 10], [0, 1], [3.8, 3], [1000, 50], ['7', 7]]) {
  test(`clampLimit(${String(value)}) -> ${expected}`, () => {
    assert.equal(clampLimit(value), expected);
  });
}

test('normalizeDoi removes doi.org prefix and lowercases', () => {
  assert.equal(normalizeDoi('HTTPS://doi.org/10.1234/ABC'), '10.1234/abc');
});

test('normalizeDoi returns null for missing input', () => {
  assert.equal(normalizeDoi(''), null);
});

test('OpenAlex abstract index is reconstructed in position order', () => {
  assert.equal(reconstructOpenAlexAbstract({ world: [1], Hello: [0] }), 'Hello world');
});

test('OpenAlex returns true zero without generated records', async () => {
  const result = await searchOpenAlex('A title that cannot exist', {
    fetchImpl: async () => json({ meta: { count: 0 }, results: [] }),
  });
  assert.equal(result.total, 0);
  assert.deepEqual(result.records, []);
  assert.equal(result.audit.provider, 'openalex');
  assert.equal(result.audit.httpStatus, 200);
});

test('OpenAlex maps a real API result to SourceRecord', async () => {
  const result = await searchOpenAlex('moon', {
    fetchImpl: async () => json({
      meta: { count: 1 },
      results: [{
        id: 'https://openalex.org/W1',
        title: 'Moon Evidence',
        publication_year: 2025,
        doi: 'https://doi.org/10.1/MOON',
        authorships: [{ author: { display_name: 'Selene' } }],
        primary_location: { source: { display_name: 'Journal' } },
        abstract_inverted_index: { Quiet: [0], evidence: [1] },
      }],
    }),
  });
  assert.equal(result.records[0].id, 'openalex:W1');
  assert.equal(result.records[0].reality, 'real');
  assert.equal(result.records[0].externalIds.doi, '10.1/moon');
  assert.equal(result.records[0].abstract, 'Quiet evidence');
});

for (const status of [400, 429, 500]) {
  test(`OpenAlex preserves HTTP ${status}`, async () => {
    await assert.rejects(
      searchOpenAlex('query', { fetchImpl: async () => json({ error: 'upstream' }, status) }),
      (error) => error instanceof LiteratureSearchError && error.status === status,
    );
  });
}

test('OpenAlex reports network failure', async () => {
  await assert.rejects(
    searchOpenAlex('query', { fetchImpl: async () => { throw new Error('offline'); } }),
    (error) => error.code === 'NETWORK_ERROR',
  );
});

test('PubMed zero results stops before summary request', async () => {
  let calls = 0;
  const result = await searchPubMed('invented title', {
    fetchImpl: async () => {
      calls += 1;
      return json({ esearchresult: { count: '0', idlist: [] } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.total, 0);
  assert.deepEqual(result.records, []);
});

test('PubMed maps search and summary responses', async () => {
  let calls = 0;
  const result = await searchPubMed('handoff', {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return json({ esearchresult: { count: '1', idlist: ['42'] } });
      return json({
        result: {
          42: {
            title: 'A PubMed paper',
            pubdate: '2024 Jan',
            fulljournalname: 'Medical Journal',
            authors: [{ name: 'Researcher A' }],
            articleids: [{ idtype: 'doi', value: '10.1000/XYZ' }],
          },
        },
      });
    },
  });
  assert.equal(result.records[0].id, 'pubmed:42');
  assert.equal(result.records[0].year, 2024);
  assert.equal(result.records[0].externalIds.doi, '10.1000/xyz');
});

test('PubMed reports invalid JSON', async () => {
  await assert.rejects(
    searchPubMed('query', {
      fetchImpl: async () => new Response('<html>bad</html>', { status: 200 }),
    }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});

test('deduplication prefers first record with the same DOI', () => {
  const a = createSourceRecord({ title: 'A', externalIds: { doi: '10.1/x' } });
  const b = createSourceRecord({ title: 'B', externalIds: { doi: '10.1/x' } });
  assert.deepEqual(deduplicateRecords([a, b]), [a]);
});

test('deduplication falls back to normalized title and year', () => {
  const a = createSourceRecord({ title: 'Same: title', year: 2024 });
  const b = createSourceRecord({ title: 'same title', year: 2024 });
  assert.equal(deduplicateRecords([a, b]).length, 1);
});

test('combined service exposes a partial upstream failure', async () => {
  const service = new LiteratureSearchService({
    fetchImpl: async (url) => {
      if (String(url).includes('openalex')) return json({ meta: { count: 0 }, results: [] });
      throw new Error('PubMed offline');
    },
  });
  const result = await service.search('query');
  assert.equal(result.isPartial, true);
  assert.equal(result.isFailure, false);
  assert.equal(result.errors[0].source, 'pubmed');
});

test('combined service exposes total failure without fake records', async () => {
  const service = new LiteratureSearchService({
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const result = await service.search('query');
  assert.equal(result.isFailure, true);
  assert.equal(result.total, 0);
  assert.deepEqual(result.records, []);
  assert.equal(result.errors.length, 2);
});

test('combined service reports unsupported sources structurally', async () => {
  const service = new LiteratureSearchService({ fetchImpl: async () => json({}) });
  const result = await service.search('query', { sources: ['unknown'] });
  assert.equal(result.isFailure, true);
  assert.equal(result.errors[0].code, 'UNSUPPORTED_SOURCE');
});
