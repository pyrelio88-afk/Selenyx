import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createResearchProject,
  createSourceRecord,
  createProvenanceAnchor,
  createEvidenceAtom,
  createEvidenceRelation,
  createClaim,
  createContradictionCase,
  createRun,
  sha256,
  validateEvidenceChain,
} from '../src/research/domain.js';

const retrieval = {
  provider: 'openalex',
  query: 'evidence synthesis',
  requestedAt: '2026-01-01T00:00:00.000Z',
  httpStatus: 200,
  responseHash: 'abc',
};

function source(overrides = {}) {
  return createSourceRecord({
    id: 'source-1',
    title: 'A real paper',
    authors: ['Ada Lovelace'],
    reality: 'real',
    retrieval,
    ...overrides,
  });
}

test('research project defaults to local sensitivity', () => {
  const item = createResearchProject({ title: 'Moon study', createdAt: '2026-01-01T00:00:00Z' });
  assert.equal(item.sensitivity, 'local');
  assert.equal(item.schemaVersion, 1);
});

test('research project rejects a blank title', () => {
  assert.throws(() => createResearchProject({ title: ' ' }), /title/);
});

test('research project deduplicates allowed sources', () => {
  const item = createResearchProject({ title: 'X', allowedSources: ['pubmed', 'pubmed', 'openalex'] });
  assert.deepEqual(item.allowedSources, ['pubmed', 'openalex']);
});

test('source record is explicitly real by default', () => {
  assert.equal(source().reality, 'real');
});

for (const reality of ['real', 'example', 'user-provided']) {
  test(`source accepts reality=${reality}`, () => {
    assert.equal(source({ reality }).reality, reality);
  });
}

test('source rejects an unknown reality marker', () => {
  assert.throws(() => source({ reality: 'maybe' }), /reality/);
});

for (const sourceType of ['article', 'preprint', 'dataset', 'web', 'book', 'user-file']) {
  test(`source accepts sourceType=${sourceType}`, () => {
    assert.equal(source({ sourceType }).sourceType, sourceType);
  });
}

test('source record and nested values are immutable', () => {
  const item = source();
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.authors), true);
  assert.equal(Object.isFrozen(item.retrieval), true);
});

test('provenance computes a stable quote hash', () => {
  const anchor = createProvenanceAnchor({ sourceId: 'source-1', excerpt: 'Exact quote' });
  assert.equal(anchor.quoteHash, sha256('Exact quote'));
});

test('provenance requires excerpt or quote hash', () => {
  assert.throws(() => createProvenanceAnchor({ sourceId: 'source-1' }), /quoteHash/);
});

test('provenance keeps a valid character range', () => {
  const anchor = createProvenanceAnchor({ sourceId: 'source-1', excerpt: 'x', charRange: [4, 8] });
  assert.deepEqual(anchor.charRange, [4, 8]);
});

test('provenance drops an invalid character range', () => {
  const anchor = createProvenanceAnchor({ sourceId: 'source-1', excerpt: 'x', charRange: [8, 4] });
  assert.equal(anchor.charRange, null);
});

test('non-hypothesis evidence requires provenance', () => {
  assert.throws(() => createEvidenceAtom({ kind: 'finding', statement: 'Finding' }), /provenance/);
});

test('user hypothesis may exist without provenance', () => {
  const item = createEvidenceAtom({ kind: 'user-hypothesis', statement: 'Possible mechanism' });
  assert.equal(item.anchor, null);
});

for (const level of ['L1', 'L2', 'human']) {
  test(`evidence supports extraction level ${level}`, () => {
    const item = createEvidenceAtom({
      statement: 'Finding',
      anchor: { sourceId: 'source-1', excerpt: 'Quote' },
      extraction: { level, method: 'test' },
    });
    assert.equal(item.extraction.level, level);
  });
}

test('evidence rejects an invented extraction level', () => {
  assert.throws(() => createEvidenceAtom({
    statement: 'Finding',
    anchor: { sourceId: 'source-1', excerpt: 'Quote' },
    extraction: { level: 'magic', method: 'test' },
  }), /extraction level/);
});

for (const type of ['supports', 'contradicts', 'qualifies', 'duplicates', 'derived-from', 'not-comparable']) {
  test(`evidence relation supports ${type}`, () => {
    const item = createEvidenceRelation({ type, sourceId: 'e1', targetId: 'c1' });
    assert.equal(item.type, type);
  });
}

test('claim preserves supporting and contradicting evidence separately', () => {
  const item = createClaim({
    id: 'claim-1',
    statement: 'Claim',
    supportingEvidenceIds: ['e1'],
    contradictingEvidenceIds: ['e2'],
  });
  assert.deepEqual(item.supportingEvidenceIds, ['e1']);
  assert.deepEqual(item.contradictingEvidenceIds, ['e2']);
});

test('contradiction case requires at least two evidence ids', () => {
  assert.throws(() => createContradictionCase({ evidenceIds: ['e1'] }), /at least two/);
});

test('contradiction defaults to unresolved', () => {
  const item = createContradictionCase({ evidenceIds: ['e1', 'e2'] });
  assert.equal(item.resolution, 'unresolved');
});

test('run records L2 provider and model', () => {
  const item = createRun({
    operation: 'summarize',
    level: 'L2',
    provider: 'custom',
    model: 'model-x',
    status: 'succeeded',
  });
  assert.equal(item.level, 'L2');
  assert.equal(item.provider, 'custom');
  assert.equal(item.model, 'model-x');
});

test('valid evidence chain passes', () => {
  const sourceItem = source();
  const evidence = createEvidenceAtom({
    id: 'e1',
    statement: 'Finding',
    anchor: { sourceId: sourceItem.id, excerpt: 'Quote' },
  });
  const claim = createClaim({ id: 'c1', statement: 'Claim', supportingEvidenceIds: ['e1'] });
  const relation = createEvidenceRelation({ id: 'r1', type: 'supports', sourceId: 'e1', targetId: 'c1' });
  assert.deepEqual(validateEvidenceChain({
    sources: [sourceItem], evidence: [evidence], claims: [claim], relations: [relation],
  }), { ok: true, issues: [] });
});

test('evidence chain reports an unknown source', () => {
  const evidence = createEvidenceAtom({
    id: 'e1',
    statement: 'Finding',
    anchor: { sourceId: 'missing', excerpt: 'Quote' },
  });
  const result = validateEvidenceChain({ evidence: [evidence] });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'UNKNOWN_SOURCE');
});

test('evidence chain reports unknown claim evidence', () => {
  const claim = createClaim({ id: 'c1', statement: 'Claim', supportingEvidenceIds: ['missing'] });
  const result = validateEvidenceChain({ claims: [claim] });
  assert.equal(result.issues[0].code, 'UNKNOWN_EVIDENCE');
});

test('evidence chain reports unknown relation endpoints', () => {
  const relation = createEvidenceRelation({ id: 'r1', type: 'supports', sourceId: 'missing-a', targetId: 'missing-b' });
  const result = validateEvidenceChain({ relations: [relation] });
  assert.deepEqual(result.issues.map((issue) => issue.code), ['UNKNOWN_RELATION_SOURCE', 'UNKNOWN_RELATION_TARGET']);
});
