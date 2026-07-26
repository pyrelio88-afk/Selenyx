import test from 'node:test';
import assert from 'node:assert/strict';
import { StubSearchProbe, LLMInferProbe, parseJsonArray } from '../src/core/probe.js';
import { AtomGraph } from '../src/core/graph.js';
import { GeneralCanon } from '../src/canons/general.js';

test('probe: explicit example probe returns deterministic count + relations', async () => {
  const graph = new AtomGraph(new GeneralCanon());
  const probe = new StubSearchProbe('web');
  const result = await probe.run(graph, { query: 'hello world', count: 4, investigationId: 'inv1' });
  assert.equal(result.atoms.length, 8);
  assert.equal(result.relations.length, 4);
  assert.equal(result.mode, 'example');
  assert.match(result.notes, /EXAMPLE ONLY/);
});

test('probe: every synthetic atom is visibly marked example', async () => {
  const graph = new AtomGraph(new GeneralCanon());
  const result = await new StubSearchProbe('pubmed').run(graph, { query: 'X', count: 2 });
  for (const atom of result.atoms) {
    assert.equal(atom.meta.reality, 'example');
    assert.equal(atom.provenance.kind, 'example');
    assert.match(atom.content, /示例 \/ EXAMPLE/);
    assert.match(atom.provenance.ref, /^example:pubmed:/);
  }
});

test('probe: LLM failure returns no synthetic atom', async () => {
  const graph = new AtomGraph(new GeneralCanon());
  const provider = { complete: async () => { throw Object.assign(new Error('HTTP 401'), { status: 401 }); } };
  const probe = new LLMInferProbe(provider, { atomType: 'claim' });
  const result = await probe.run(graph, { query: 'q', investigationId: 'i' });
  assert.deepEqual(result.atoms, []);
  assert.equal(result.mode, 'failed');
  assert.equal(result.errors[0].status, 401);
  assert.match(result.notes, /HTTP 401/);
});

test('probe: missing provider returns structured unavailable result', async () => {
  const graph = new AtomGraph(new GeneralCanon());
  const result = await new LLMInferProbe(null).run(graph, { query: 'q' });
  assert.deepEqual(result.atoms, []);
  assert.equal(result.errors[0].code, 'NO_PROVIDER');
  assert.equal(result.mode, 'unavailable');
});

test('parseJsonArray: extracts JSON array from text with surrounding noise', () => {
  const text = 'data: [{"content":"a","confidence":0.7},{"content":"b","confidence":0.6}] end';
  const array = parseJsonArray(text);
  assert.equal(array.length, 2);
});

test('parseJsonArray: returns null for malformed input', () => {
  for (const value of ['hello world', '', null, '[invalid json]']) {
    assert.equal(parseJsonArray(value), null);
  }
});
