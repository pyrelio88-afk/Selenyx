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
} from '../src/research/domain.js';

function anchoredEvidence(overrides = {}) {
  return createEvidenceAtom({
    statement: 'Evidence statement',
    anchor: { sourceId: 'source-1', excerpt: 'Exact source excerpt' },
    ...overrides,
  });
}

for (const sensitivity of ['public', 'local', 'restricted']) {
  test(`research invariant: project supports sensitivity=${sensitivity}`, () => {
    assert.equal(createResearchProject({ title: 'Project', sensitivity }).sensitivity, sensitivity);
  });
}

test('research invariant: unknown sensitivity falls back to local', () => {
  assert.equal(createResearchProject({ title: 'Project', sensitivity: 'cloud' }).sensitivity, 'local');
});

test('research invariant: project trims title and description', () => {
  const item = createResearchProject({ title: '  Project  ', description: '  Detail  ' });
  assert.equal(item.title, 'Project');
  assert.equal(item.description, 'Detail');
});

test('research invariant: invalid project date is rejected', () => {
  assert.throws(() => createResearchProject({ title: 'P', createdAt: 'not-a-date' }), /invalid date/);
});

for (const review of ['unreviewed', 'accepted', 'rejected', 'needs-check']) {
  test(`research invariant: evidence supports review=${review}`, () => {
    assert.equal(anchoredEvidence({ review }).review, review);
  });
}

test('research invariant: invalid evidence review is rejected', () => {
  assert.throws(() => anchoredEvidence({ review: 'approved-by-model' }), /review state/);
});

for (const kind of ['finding', 'method', 'population', 'limitation']) {
  test(`research invariant: ${kind} requires an anchor and succeeds with one`, () => {
    assert.equal(anchoredEvidence({ kind }).kind, kind);
  });
}

test('research invariant: unknown evidence kind is rejected', () => {
  assert.throws(() => anchoredEvidence({ kind: 'opinion' }), /evidence kind/);
});

for (const locatorStatus of ['valid', 'drifted', 'unresolved']) {
  test(`research invariant: provenance supports locatorStatus=${locatorStatus}`, () => {
    const anchor = createProvenanceAnchor({
      sourceId: 'source-1',
      excerpt: 'Quote',
      locatorStatus,
    });
    assert.equal(anchor.locatorStatus, locatorStatus);
  });
}

test('research invariant: unknown locator status defaults to valid', () => {
  const anchor = createProvenanceAnchor({
    sourceId: 'source-1',
    excerpt: 'Quote',
    locatorStatus: 'guessed',
  });
  assert.equal(anchor.locatorStatus, 'valid');
});

test('research invariant: page numbers must be positive integers', () => {
  assert.equal(createProvenanceAnchor({ sourceId: 's', excerpt: 'q', page: 0 }).page, null);
  assert.equal(createProvenanceAnchor({ sourceId: 's', excerpt: 'q', page: 1 }).page, 1);
});

test('research invariant: paragraph numbers must be positive integers', () => {
  assert.equal(createProvenanceAnchor({ sourceId: 's', excerpt: 'q', paragraph: -1 }).paragraph, null);
  assert.equal(createProvenanceAnchor({ sourceId: 's', excerpt: 'q', paragraph: 3 }).paragraph, 3);
});

test('research invariant: duplicate claim evidence ids collapse', () => {
  const claim = createClaim({
    statement: 'Claim',
    supportingEvidenceIds: ['e1', 'e1', 'e2'],
  });
  assert.deepEqual(claim.supportingEvidenceIds, ['e1', 'e2']);
});

test('research invariant: claim statement is required', () => {
  assert.throws(() => createClaim({ statement: '' }), /statement/);
});

test('research invariant: invalid relation type is rejected', () => {
  assert.throws(() => createEvidenceRelation({
    type: 'agrees-a-bit',
    sourceId: 'e1',
    targetId: 'c1',
  }), /relation/);
});

for (const resolution of ['unresolved', 'conditional-coexistence', 'evidence-tilts', 'not-comparable']) {
  test(`research invariant: contradiction supports resolution=${resolution}`, () => {
    const item = createContradictionCase({ evidenceIds: ['e1', 'e2'], resolution });
    assert.equal(item.resolution, resolution);
  });
}

test('research invariant: duplicate contradiction ids cannot satisfy minimum', () => {
  assert.throws(() => createContradictionCase({ evidenceIds: ['e1', 'e1'] }), /at least two/);
});

for (const status of ['running', 'succeeded', 'failed', 'cancelled']) {
  test(`research invariant: run supports status=${status}`, () => {
    assert.equal(createRun({ operation: 'search', status }).status, status);
  });
}

test('research invariant: unknown run status defaults to running', () => {
  assert.equal(createRun({ operation: 'search', status: 'done-ish' }).status, 'running');
});

test('research invariant: run operation is required', () => {
  assert.throws(() => createRun({ operation: '' }), /operation/);
});

test('research invariant: invalid run level is rejected', () => {
  assert.throws(() => createRun({ operation: 'search', level: 'L3' }), /run level/);
});

test('research invariant: run input and output ids deduplicate', () => {
  const run = createRun({
    operation: 'search',
    inputIds: ['a', 'a', 'b'],
    outputIds: ['x', 'x'],
  });
  assert.deepEqual(run.inputIds, ['a', 'b']);
  assert.deepEqual(run.outputIds, ['x']);
});

test('research invariant: source author names deduplicate', () => {
  const source = createSourceRecord({ title: 'Paper', authors: ['A', 'A', 'B'] });
  assert.deepEqual(source.authors, ['A', 'B']);
});

test('research invariant: source title is required', () => {
  assert.throws(() => createSourceRecord({ title: ' ' }), /title/);
});

test('research invariant: source year remains unknown when not an integer', () => {
  assert.equal(createSourceRecord({ title: 'Paper', year: '2024' }).year, null);
});

test('research invariant: retraction flag is explicit boolean', () => {
  assert.equal(createSourceRecord({ title: 'Paper', isRetracted: true }).isRetracted, true);
  assert.equal(createSourceRecord({ title: 'Paper' }).isRetracted, false);
});
