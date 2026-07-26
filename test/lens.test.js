// Lens 单测：3 个核心透镜
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atom } from '../src/core/atom.js';
import { AtomGraph } from '../src/core/graph.js';
import { GapAnalysisLens, ContradictionSetLens, ConfidenceMapLens } from '../src/core/lens.js';
import { GeneralCanon } from '../src/canons/general.js';

const canon = new GeneralCanon();

test('lens: gap-analysis flags unanswered critical questions', () => {
  const g = new AtomGraph(canon);
  const q1 = new Atom({ type: 'question', content: 'main', meta: { critical: true } });
  const q2 = new Atom({ type: 'question', content: 'sub' });
  g.addAtom(q1); g.addAtom(q2);
  const r = new GapAnalysisLens().fold(g);
  assert.equal(r.critical.length, 1);
  assert.equal(r.critical[0].atomId, q1.id);
  assert.equal(r.totalGaps, 2);
});

test('lens: gap-analysis counts unsupported claims as normal gaps', () => {
  const g = new AtomGraph(canon);
  g.addAtom(new Atom({ type: 'claim', content: 'c' }));
  const r = new GapAnalysisLens().fold(g);
  assert.equal(r.critical.length, 0);
  assert.equal(r.totalGaps, 1);
});

test('lens: contradiction-set detects unacknowledged contradictions only', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'a' });
  const b = new Atom({ type: 'claim', content: 'b' });
  g.addAtom(a); g.addAtom(b);
  g.addRelation({ type: 'contradicts', source_id: a.id, target_id: b.id, weight: 1, provenance: { acknowledged: false } });
  g.addRelation({ type: 'contradicts', source_id: a.id, target_id: b.id, weight: 1, provenance: { acknowledged: true } });
  const r = new ContradictionSetLens().fold(g);
  assert.equal(r.unacknowledged.length, 1);
  assert.equal(r.acknowledged.length, 1);
});

test('lens: contradiction-set ignores refuted endpoints', () => {
  const g = new AtomGraph(canon);
  const a = new Atom({ type: 'claim', content: 'a' });
  const b = new Atom({ type: 'claim', content: 'b' });
  g.addAtom(a); g.addAtom(b);
  a.transition('refuted');
  g.addRelation({ type: 'contradicts', source_id: a.id, target_id: b.id, weight: 1, provenance: { acknowledged: false } });
  const r = new ContradictionSetLens().fold(g);
  assert.equal(r.unacknowledged.length, 0);
});

test('lens: confidence-map adjusts by support/contra weights', () => {
  const g = new AtomGraph(canon);
  const claim = new Atom({ type: 'claim', content: 'c', confidence: 0.5 });
  const ev1 = new Atom({ type: 'evidence', content: 'e1' });
  const ev2 = new Atom({ type: 'evidence', content: 'e2' });
  g.addAtom(claim); g.addAtom(ev1); g.addAtom(ev2);
  g.addRelation({ type: 'supports', source_id: ev1.id, target_id: claim.id, weight: 1 });
  g.addRelation({ type: 'supports', source_id: ev2.id, target_id: claim.id, weight: 1 });
  const r = new ConfidenceMapLens().fold(g);
  assert.equal(r.entries.length, 1);
  assert.ok(r.entries[0].netConfidence > 0.5);
  assert.ok(r.entries[0].netConfidence <= 1);
});

test('lens: confidence-map reduces on contradict', () => {
  const g = new AtomGraph(canon);
  const claim = new Atom({ type: 'claim', content: 'c', confidence: 0.8 });
  const counter = new Atom({ type: 'claim', content: 'c!', confidence: 0.7 });
  g.addAtom(claim); g.addAtom(counter);
  g.addRelation({ type: 'contradicts', source_id: counter.id, target_id: claim.id, weight: 1 });
  const r = new ConfidenceMapLens().fold(g);
  const c1 = r.entries.find((e) => e.atomId === claim.id);
  const c2 = r.entries.find((e) => e.atomId === counter.id);
  // 受矛头冲击的是 target (claim)：降权
  assert.ok(c1.netConfidence < 0.8);
  // 矛头源 (counter) 没有 incoming contradicts：原置信度
  assert.equal(c2.netConfidence, 0.7);
});
