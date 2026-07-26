// Atom 单测：原语契约是核心
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atom, Provenance, CORE_ATOM_TYPES, ATOM_STATUSES } from '../src/core/atom.js';

test('atom: default construction yields valid proposed claim', () => {
  const a = new Atom({ type: 'claim', content: 'hello' });
  assert.equal(a.type, 'claim');
  assert.equal(a.content, 'hello');
  assert.equal(a.status, 'proposed');
  assert.equal(a.confidence, 0.5);
  assert.match(a.id, /^a_[a-f0-9]{8}$/);
  assert.ok(CORE_ATOM_TYPES.has('claim'));
  assert.ok(ATOM_STATUSES.has('proposed'));
});

test('atom: confidence out of range throws', () => {
  assert.throws(() => new Atom({ type: 'claim', content: 'x', confidence: 1.1 }));
  assert.throws(() => new Atom({ type: 'claim', content: 'x', confidence: -0.1 }));
});

test('atom: invalid status throws on construction', () => {
  assert.throws(() => new Atom({ type: 'claim', content: 'x', status: 'nope' }));
});

test('atom: state machine — legal transitions', () => {
  const a = new Atom({ type: 'claim', content: 'x' });
  a.transition('supported');
  assert.equal(a.status, 'supported');
  a.transition('contested');
  assert.equal(a.status, 'contested');
  a.transition('supported');
  a.transition('refuted');
  a.transition('archived');
  assert.equal(a.status, 'archived');
});

test('atom: state machine — illegal transition throws', () => {
  const a = new Atom({ type: 'claim', content: 'x' });
  assert.throws(() => a.transition('defensible'));
  a.transition('archived');
  assert.throws(() => a.transition('proposed'));
});

test('atom: toDict / fromDict roundtrip preserves all fields', () => {
  const a = new Atom({
    type: 'evidence', content: 'p < 0.01',
    confidence: 0.85, status: 'supported',
    provenance: new Provenance({ kind: 'pubmed', ref: 'PMID:12345', via: 'probe:x' }),
    meta: { effect_size: 0.4 },
  });
  const b = Atom.fromDict(a.toDict());
  assert.equal(b.type, 'evidence');
  assert.equal(b.confidence, 0.85);
  assert.equal(b.status, 'supported');
  assert.equal(b.provenance.ref, 'PMID:12345');
  assert.equal(b.meta.effect_size, 0.4);
});

test('provenance: default is user', () => {
  const p = new Provenance();
  assert.equal(p.kind, 'user');
  const back = Provenance.fromDict(p.toDict());
  assert.equal(back.kind, 'user');
});
