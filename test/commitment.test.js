// Commitment 单测：可辩护性由透镜算出，不能被模型自说自话
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atom, Provenance } from '../src/core/atom.js';
import { AtomGraph } from '../src/core/graph.js';
import { GeneralCanon } from '../src/canons/general.js';
import { Commitment, CommitmentCriteria } from '../src/core/commitment.js';

const canon = new GeneralCanon();

function buildGraph() {
  const g = new AtomGraph(canon);
  const q = new Atom({ type: 'question', content: 'main', meta: { critical: true } });
  const c1 = new Atom({ type: 'claim', content: 'c1', confidence: 0.8 });
  const c2 = new Atom({ type: 'claim', content: 'c2', confidence: 0.7 });
  const cite1 = new Atom({ type: 'citation', content: 'cite1', provenance: new Provenance({ kind: 'web', ref: 'u1' }) });
  const cite2 = new Atom({ type: 'citation', content: 'cite2', provenance: new Provenance({ kind: 'web', ref: 'u2' }) });
  const cite3 = new Atom({ type: 'citation', content: 'cite3', provenance: new Provenance({ kind: 'web', ref: 'u3' }) });
  const synth = new Atom({ type: 'synthesis', content: 'syn' });
  g.addAtom(q); g.addAtom(cite1); g.addAtom(cite2); g.addAtom(cite3);
  g.addAtom(c1); g.addAtom(c2); g.addAtom(synth);
  for (const a of [c1, c2]) {
    if (a.status === 'proposed') a.transition('supported');
  }
  g.addRelation({ type: 'answers', source_id: synth.id, target_id: q.id, weight: 0.9 });
  g.addRelation({ type: 'derives-from', source_id: c1.id, target_id: cite1.id, weight: 1 });
  g.addRelation({ type: 'derives-from', source_id: c2.id, target_id: cite2.id, weight: 1 });
  return g;
}

test('commitment: criteria validation', () => {
  assert.throws(() => new CommitmentCriteria({ minConfidence: 1.5 }));
  assert.throws(() => new CommitmentCriteria({ minPrimarySources: -1 }));
  assert.throws(() => new CommitmentCriteria({ maxCriticalGaps: -1 }));
});

test('commitment: status transition rules', () => {
  const c = new Commitment({ question: 'q' });
  c.transition('converging');
  c.transition('defensible');
  assert.throws(() => c.transition('exploring')); // defensible->exploring illegal
  c.transition('abandoned');
  assert.throws(() => c.transition('exploring')); // terminal
});

test('commitment: evaluate not defensible on empty graph', () => {
  const g = new AtomGraph(canon);
  g.addAtom(new Atom({ type: 'question', content: 'main', meta: { critical: true } }));
  const c = new Commitment({ question: 'main' });
  const ev = c.evaluate(g);
  assert.equal(ev.defensible, false);
  assert.ok(ev.critical_gaps_count >= 1);
  assert.equal(ev.primary_sources_count, 0);
});

test('commitment: evaluate defensible when criteria met', () => {
  const g = buildGraph();
  const c = new Commitment({ question: 'main' });
  const ev = c.evaluate(g);
  assert.equal(ev.defensible, true);
  assert.equal(ev.status_recommendation, 'defensible');
  assert.ok(ev.primary_sources_count >= 3);
  assert.ok(ev.max_claim_confidence >= 0.7);
  assert.equal(ev.unacknowledged_contradictions, 0);
});

test('commitment: evaluate not defensible when minPrimarySources not met', () => {
  const g = new AtomGraph(canon);
  g.addAtom(new Atom({ type: 'question', content: 'main', meta: { critical: true } }));
  g.addAtom(new Atom({ type: 'citation', content: 'c', provenance: new Provenance({ kind: 'web', ref: 'u' }) }));
  const c = new Commitment({ question: 'main' });
  const ev = c.evaluate(g);
  assert.equal(ev.defensible, false);
  assert.ok(/primary sources: 1 < 3/.test(ev.reasons.find((r) => /primary/.test(r))));
});

test('commitment: toDict / fromDict roundtrip', () => {
  const c = new Commitment({ question: 'q', canonName: 'medical' });
  const c2 = Commitment.fromDict(c.toDict());
  assert.equal(c2.question, 'q');
  assert.equal(c2.canon_name, 'medical');
});
