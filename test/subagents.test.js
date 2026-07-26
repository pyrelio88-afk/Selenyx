import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PIPELINE_STAGES, MAX_SUBAGENTS, ROLE_REGISTRY, getRole, rolesForStage,
  stageCoverage, listRoles, STAGE_MOON,
} from '../src/subagents/roles.js';
import { SubAgentManager } from '../src/subagents/manager.js';
import { Engine } from '../src/core/engine.js';
import { StubProvider } from '../src/llm/base.js';
import { createSourceRecord } from '../src/research/domain.js';

function mockSearch(records = []) {
  return {
    search: async (query) => ({
      query,
      sources: ['openalex', 'pubmed'],
      total: records.length,
      records,
      sourceResults: [
        {
          source: 'openalex',
          total: records.length,
          returned: records.length,
          page: 1,
          audit: {
            provider: 'openalex',
            query,
            requestedAt: '2026-01-01T00:00:00.000Z',
            httpStatus: 200,
            responseHash: 'hash',
          },
        },
      ],
      errors: [],
      isPartial: false,
      isFailure: false,
    }),
  };
}

function realRecord(id = 'W1') {
  return createSourceRecord({
    id: `openalex:${id}`,
    title: `Real source ${id}`,
    reality: 'real',
    url: `https://openalex.org/${id}`,
    externalIds: { openAlex: id },
    retrieval: {
      provider: 'openalex',
      query: 'q',
      requestedAt: '2026-01-01T00:00:00.000Z',
      httpStatus: 200,
      responseHash: 'hash',
    },
  });
}

test('subagents: exactly 10 roles', () => {
  assert.equal(listRoles().length, 10);
  assert.equal(Object.keys(ROLE_REGISTRY).length, MAX_SUBAGENTS);
});

test('subagents: every pipeline stage has at least one role', () => {
  const coverage = stageCoverage();
  for (const stage of PIPELINE_STAGES) assert.ok(coverage[stage].length > 0);
});

test('subagents: some stages support same-stage collaboration', () => {
  const coverage = stageCoverage();
  assert.ok(PIPELINE_STAGES.some((stage) => coverage[stage].length > 1));
});

test('subagents: role lookup is case-insensitive', () => {
  assert.equal(getRole('INTAKE-SCREENER').name, 'intake-screener');
  assert.throws(() => getRole('mystic'));
});

test('subagents: every role maps to its stage moon', () => {
  for (const role of listRoles()) assert.equal(role.moon, STAGE_MOON[role.stage]);
});

test('subagents: no-key pipeline never becomes defensible from synthetic content', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const engine = new Engine({ canonName: 'general', homeDir: home });
  const manager = new SubAgentManager({
    engine,
    provider: new StubProvider(),
    lang: 'en',
    searchService: mockSearch([realRecord('W1'), realRecord('W2'), realRecord('W3')]),
  });
  const result = await manager.runPipeline('does X improve Y?', { searchCount: 3 });
  assert.equal(result.evaluation.defensible, false);
  assert.notEqual(result.status, 'defensible');
  assert.equal(engine.graph.atomsOfType('claim').length, 0);
  assert.equal(engine.graph.atomsOfType('synthesis').length, 0);
  assert.equal(engine.graph.atomsOfType('citation').length, 3);
});

test('subagents: true zero search yields zero citations', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const engine = new Engine({ homeDir: home });
  const manager = new SubAgentManager({
    engine,
    provider: new StubProvider(),
    searchService: mockSearch([]),
  });
  const result = await manager.runPipeline('invented paper title');
  assert.equal(result.search.total, 0);
  assert.equal(engine.graph.atomsOfType('citation').length, 0);
  assert.equal(result.evaluation.defensible, false);
});

test('subagents: real search provenance survives graph ingestion', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const engine = new Engine({ homeDir: home });
  const manager = new SubAgentManager({
    engine,
    provider: new StubProvider(),
    searchService: mockSearch([realRecord('W9')]),
  });
  await manager.runPipeline('q');
  const citation = engine.graph.atomsOfType('citation')[0];
  assert.equal(citation.provenance.kind, 'openalex');
  assert.equal(citation.provenance.ref, 'https://openalex.org/W9');
  assert.equal(citation.meta.reality, 'real');
});

test('subagents: contexts remain isolated per role', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const engine = new Engine({ homeDir: home });
  const manager = new SubAgentManager({
    engine,
    provider: new StubProvider(),
    searchService: mockSearch([realRecord()]),
  });
  await manager.runPipeline('q');
  const searchContext = manager.contextFor(getRole('search-specialist'));
  const extractContext = manager.contextFor(getRole('extractor'));
  assert.notEqual(searchContext, extractContext);
  assert.equal(searchContext[0].action, 'real-search-complete');
  assert.equal(extractContext[0].action, 'L2-unavailable-no-claims-created');
});

test('subagents: rolesForStage never exceeds total cap', () => {
  for (const stage of PIPELINE_STAGES) assert.ok(rolesForStage(stage).length <= MAX_SUBAGENTS);
});
