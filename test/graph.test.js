// Graph 单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atom } from '../src/core/atom.js';
import { Relation } from '../src/core/relation.js';
import { AtomGraph } from '../src/core/graph.js';
import { GeneralCanon } from '../src/canons/general.js';

const canon = new GeneralCanon();

test('graph: addAtom + atomsOfType', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'c1' });
  g.addAtom(a);
  assert.equal(g.atomsOfType('claim').length, 1);
  assert.equal(g.stats().atoms, 1);
});

test('graph: addAtom rejects unknown type with error severity', () => {
  const g = new AtomGraph(canon);
  assert.throws(() => g.addAtom(new Atom({ type: 'mystic', content: 'x' })), /atom rejected/);
});

test('graph: addRelation checks endpoints', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'c1' });
  const b = new Atom({ type: 'evidence', content: 'e1' });
  g.addAtom(a); g.addAtom(b);
  assert.throws(() => g.addRelation(new Relation({ type: 'supports', source_id: 'no', target_id: b.id })), /source not found/);
  assert.throws(() => g.addRelation(new Relation({ type: 'supports', source_id: a.id, target_id: 'no' })), /target not found/);
});

test('graph: addRelation rejects unknown relation type', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'c1' });
  g.addAtom(a);
  assert.throws(() => g.addRelation(new Relation({ type: 'hangs-out-with', source_id: a.id, target_id: a.id })), /unknown relation type/);
});

test('graph: outgoing/incoming filter by type', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'c' });
  const b = new Atom({ type: 'evidence', content: 'e' });
  g.addAtom(a); g.addAtom(b);
  g.addRelation(new Relation({ type: 'supports', source_id: b.id, target_id: a.id }));
  g.addRelation(new Relation({ type: 'derives-from', source_id: a.id, target_id: b.id }));
  assert.equal(g.incoming(a.id, 'supports').length, 1);
  assert.equal(g.outgoing(a.id, 'derives-from').length, 1);
  assert.equal(g.outgoing(a.id, 'supports').length, 0);
});

test('graph: primarySources requires non-empty provenance.ref', () => {
  const g = new AtomGraph(canon);
  g.addAtom(new Atom({ type: 'citation', content: 'no-ref' }));
  g.addAtom(new Atom({ type: 'citation', content: 'with-ref', provenance: { kind: 'pubmed', ref: 'PMID:1' } }));
  assert.equal(g.primarySources().length, 1);
});

test('graph: toDict / fromDict roundtrip', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'c' });
  g.addAtom(a);
  const dict = g.toDict();
  const g2 = AtomGraph.fromDict(dict, canon);
  assert.equal(g2.atoms.size, 1);
});
