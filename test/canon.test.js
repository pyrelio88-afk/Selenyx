// Canon 单测：领域插件的核心契约
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atom } from '../src/core/atom.js';
import { GeneralCanon } from '../src/canons/general.js';
import { MedicalCanon, CEBM_LEVELS, EvidenceHierarchyLens, ContraindicationCheckLens } from '../src/canons/medical.js';
import { ComputerScienceCanon } from '../src/canons/computerScience.js';
import { AtomGraph } from '../src/core/graph.js';

test('canon: general accepts all core atom types', () => {
  const c = new GeneralCanon();
  for (const t of ['claim', 'evidence', 'citation', 'question', 'hypothesis', 'method', 'synthesis', 'definition']) {
    assert.ok(c.allAtomTypes().has(t), `${t} should be valid in general canon`);
  }
  assert.ok(c.allRelationTypes().has('supports'));
});

test('canon: ceiling check warns when confidence exceeds ontology ceiling', () => {
  const c = new MedicalCanon();
  // level 5 = expert opinion = ceiling 0.20
  const a = new Atom({ type: 'claim', content: 'x', confidence: 0.95, meta: { evidence_level: '5' } });
  const issues = c.validateAtom(a);
  assert.ok(issues.some((i) => i.severity === 'warning' && /ceiling/.test(i.message)));
});

test('canon: ceiling check passes within ontology ceiling', () => {
  const c = new MedicalCanon();
  const a = new Atom({ type: 'claim', content: 'x', confidence: 0.18, meta: { evidence_level: '5' } });
  const issues = c.validateAtom(a);
  assert.equal(issues.filter((i) => i.severity === 'warning').length, 0);
});

test('canon: unknown atom type raises error', () => {
  const c = new MedicalCanon();
  const a = new Atom({ type: 'mystic', content: 'x' });
  const issues = c.validateAtom(a);
  assert.ok(issues.some((i) => i.severity === 'error'));
});

test('canon: ontology describe finds nearest level', () => {
  const c = new MedicalCanon();
  assert.match(c.confidence_ontology.describe(0.18), /5|2a/); // close to 0.20
  assert.match(c.confidence_ontology.describe(0.94), /1a|1b/); // close to 0.95
});

test('canon: CEBM levels are 1a-5 with descending ceilings', () => {
  assert.equal(CEBM_LEVELS['1a'], 0.95);
  assert.equal(CEBM_LEVELS['5'], 0.20);
  assert.ok(CEBM_LEVELS['1a'] > CEBM_LEVELS['1b']);
  assert.ok(CEBM_LEVELS['1b'] > CEBM_LEVELS['2a']);
});

test('canon: medical evidence-hierarchy lens sorts by level', () => {
  const c = new MedicalCanon();
  const g = new AtomGraph(c);
  g.addAtom(new Atom({ type: 'claim', content: 'expert', confidence: 0.2, meta: { evidence_level: '5' } }));
  g.addAtom(new Atom({ type: 'claim', content: 'rct', confidence: 0.9, meta: { evidence_level: '1b' } }));
  const h = new EvidenceHierarchyLens().fold(g);
  assert.equal(h.entries[0].evidence_level, '1b');
});

test('canon: contraindication lens detects treatment/diagnosis pairs', () => {
  const c = new MedicalCanon();
  const g = new AtomGraph(c);
  const t = new Atom({ type: 'treatment', content: 'aspirin' });
  const d = new Atom({ type: 'diagnosis', content: 'GI bleed' });
  const ci = new Atom({ type: 'contraindication', content: 'aspirin + GI bleed', meta: { treatment_id: t.id, diagnosis_id: d.id } });
  g.addAtom(t); g.addAtom(d); g.addAtom(ci);
  const report = new ContraindicationCheckLens().fold(g);
  assert.equal(report.alerts.length, 1);
});

test('canon: computer_science includes cs-only atom types', () => {
  const c = new ComputerScienceCanon();
  assert.ok(c.allAtomTypes().has('algorithm'));
  assert.ok(c.allAtomTypes().has('benchmark'));
  assert.ok(c.allAtomTypes().has('reproduction'));
  assert.ok(c.allRelationTypes().has('reproduces'));
});
