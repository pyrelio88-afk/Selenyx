import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, emptyWorkspace, normalizeWorkspace, upsertRecord, applyWorkspaceEvent,
} from '../src/research/workspace.js';
import { listAllSources, listApiSources, searchSource } from '../src/research/sourceRegistry.js';

const paper = (overrides = {}) => ({
  id: 'openalex:W1',
  title: 'A careful study',
  authors: ['Ada'],
  year: 2025,
  externalIds: { doi: '10.1000/example' },
  ...overrides,
});

test('workspace starts at schema version 1 with China search selected', () => {
  const state = emptyWorkspace();
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.sourcePreferences.searchTab, 'china');
  assert.deepEqual(state.sourcePreferences.international, ['openalex', 'pubmed', 'crossref']);
});

test('workspace merges duplicate literature by DOI', () => {
  const first = upsertRecord([], paper());
  const second = upsertRecord(first.library, paper({ id: 'crossref:x', abstract: 'New abstract' }));
  assert.equal(second.library.length, 1);
  assert.equal(second.merged, true);
  assert.equal(second.record.id, 'openalex:W1');
  assert.equal(second.record.abstract, 'New abstract');
});

test('workspace merges duplicate literature by normalized title and year', () => {
  const first = upsertRecord([], paper({ externalIds: {}, title: 'Evidence—Based Research' }));
  const second = upsertRecord(first.library, paper({ id: 'manual:2', externalIds: {}, title: ' evidence based research ' }));
  assert.equal(second.library.length, 1);
});

test('workspace persists anchored annotations and evidence', () => {
  let state = applyWorkspaceEvent(emptyWorkspace(), { type: 'library:save', record: paper() }).state;
  state = applyWorkspaceEvent(state, {
    type: 'annotation:add',
    annotation: { sourceId: 'openalex:W1', content: '关键限定', quote: 'careful', anchor: { start: 2, end: 9 }, style: 'highlight' },
  }).state;
  state = applyWorkspaceEvent(state, {
    type: 'evidence:add',
    evidence: { sourceId: 'openalex:W1', quote: 'careful study', anchor: { start: 2, end: 15 }, method: 'selection' },
  }).state;
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.annotations.length, 1);
  assert.equal(restored.evidence.length, 1);
  assert.deepEqual(restored.evidence[0].anchor, { start: 2, end: 15 });
});

test('source registry exposes nine native APIs with required defaults', () => {
  const ids = listApiSources().map((source) => source.id);
  assert.equal(ids.length, 9);
  for (const id of ['openalex', 'pubmed', 'crossref']) assert.ok(ids.includes(id));
});

test('source registry is China-first and PubScholar-first', () => {
  const sources = listAllSources();
  assert.equal(sources[0].id, 'pubscholar');
  const firstInternational = sources.findIndex((source) => source.region === 'intl');
  assert.ok(firstInternational >= 8);
});

test('Chinese search plans are clone-safe values, never Promise fields', async () => {
  const result = await searchSource('cnki', '现场编造标题');
  assert.equal(result.kind, 'link');
  assert.equal(typeof result.url, 'string');
  assert.equal(typeof structuredClone(result).url, 'string');
});

test('workspace can reset while keeping browser custom sites', () => {
  let state = emptyWorkspace();
  state = applyWorkspaceEvent(state, {
    type: 'ui:patch',
    patch: { browserSites: [{ id: 'custom:1', name: 'CNKI', url: 'https://www.cnki.net/', region: 'custom' }] },
  }).state;
  state = applyWorkspaceEvent(state, { type: 'library:save', record: paper() }).state;
  const reset = applyWorkspaceEvent(state, { type: 'workspace:reset', name: '新课题' });
  assert.equal(reset.state.meta.name, '新课题');
  assert.equal(reset.state.library.length, 0);
  assert.equal(reset.state.ui.browserSites.length, 1);
});

test('workspace evidence relation can be updated after review', () => {
  let state = emptyWorkspace();
  state = applyWorkspaceEvent(state, { type: 'library:save', record: paper() }).state;
  const added = applyWorkspaceEvent(state, {
    type: 'evidence:add',
    evidence: { sourceId: state.library[0].id, quote: 'example quote', method: 'abstract' },
  });
  state = added.state;
  const id = added.result.id;
  state = applyWorkspaceEvent(state, { type: 'evidence:review', id, review: 'accepted' }).state;
  state = applyWorkspaceEvent(state, { type: 'evidence:relation', id, relation: 'contradicts' }).state;
  assert.equal(state.evidence[0].review, 'accepted');
  assert.equal(state.evidence[0].relation, 'contradicts');
});

test('workspace annotation:remove deletes a single annotation by id', () => {
  let state = applyWorkspaceEvent(emptyWorkspace(), { type: 'library:save', record: paper() }).state;
  state = applyWorkspaceEvent(state, {
    type: 'annotation:add',
    annotation: { sourceId: 'openalex:W1', content: '批注一', quote: 'careful study', style: 'note' },
  }).state;
  const firstId = state.annotations[0].id;
  state = applyWorkspaceEvent(state, {
    type: 'annotation:add',
    annotation: { sourceId: 'openalex:W1', content: '批注二', quote: 'study', style: 'highlight' },
  }).state;
  assert.equal(state.annotations.length, 2);
  state = applyWorkspaceEvent(state, { type: 'annotation:remove', id: firstId }).state;
  assert.equal(state.annotations.length, 1);
  assert.equal(state.annotations[0].content, '批注二');
});

test('workspace evidence:remove deletes a single evidence by id without reviving', () => {
  let state = applyWorkspaceEvent(emptyWorkspace(), { type: 'library:save', record: paper() }).state;
  state = applyWorkspaceEvent(state, {
    type: 'evidence:add',
    evidence: { sourceId: 'openalex:W1', quote: '证据一', method: 'selection' },
  }).state;
  const firstId = state.evidence[0].id;
  state = applyWorkspaceEvent(state, {
    type: 'evidence:add',
    evidence: { sourceId: 'openalex:W1', quote: '证据二', method: 'manual' },
  }).state;
  assert.equal(state.evidence.length, 2);
  const removed = applyWorkspaceEvent(state, { type: 'evidence:remove', id: firstId });
  state = removed.state;
  assert.equal(state.evidence.length, 1);
  assert.equal(state.evidence[0].quote, '证据二');
  // reconcile (normalize) must not revive the removed evidence
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.evidence.length, 1);
  assert.equal(restored.evidence[0].id, state.evidence[0].id);
});

test('workspace starts new research at the question view with per-document reader state', () => {
  const state = emptyWorkspace();
  assert.equal(state.ui.lastView, 'question');
  assert.deepEqual(state.ui.readerState, {});
});

test('workspace preserves PDF text-layer locators and evidence page across restart', () => {
  let state = applyWorkspaceEvent(emptyWorkspace(), { type: 'library:save', record: paper() }).state;
  state = applyWorkspaceEvent(state, {
    type: 'annotation:add',
    annotation: {
      sourceId: 'openalex:W1', content: '定位批注', quote: 'careful study', page: 3,
      anchor: { start: 0, end: 13, textItemStart: 4, textItemEnd: 6, startOffset: 2, endOffset: 5 },
      style: 'note',
    },
  }).state;
  state = applyWorkspaceEvent(state, {
    type: 'evidence:add',
    evidence: {
      sourceId: 'openalex:W1', quote: 'careful study', page: 3,
      anchor: { start: 0, end: 13, textItemStart: 4, textItemEnd: 6 }, method: 'selection',
    },
  }).state;
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.annotations[0].anchor.textItemStart, 4);
  assert.equal(restored.annotations[0].anchor.textItemEnd, 6);
  assert.equal(restored.evidence[0].anchor.textItemStart, 4);
  assert.equal(restored.evidence[0].page, 3);
});