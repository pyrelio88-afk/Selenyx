// Engine 单测
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine, CANON_REGISTRY, createCanon } from '../src/core/engine.js';
import { StubSearchProbe } from '../src/core/probe.js';

test('engine: openInvestigation creates commitment + question atom', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ canonName: 'general', homeDir: home });
  const c = e.openInvestigation('does X improve Y?');
  assert.equal(c.question, 'does X improve Y?');
  assert.equal(c.canon_name, 'general');
  assert.equal(c.status, 'exploring');
  assert.ok(e.questionAtom);
  assert.equal(e.questionAtom.meta.critical, true);
  assert.equal(e.graph.atoms.size, 1);
});

test('engine: addAtom journals + validates', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ homeDir: home });
  e.openInvestigation('q');
  const { atom, issues } = e.addAtom({ type: 'claim', content: 'a claim', confidence: 0.6 });
  assert.equal(atom.status, 'proposed');
  assert.ok(issues.length === 0);
  // journal has 2 lines: commitment + atom
  const r = e.journal.replay();
  assert.equal(r.commitments.length, 1);
  assert.equal(r.atoms.length, 2); // 1 question + 1 claim
});

test('engine: absorb probe result atoms + relations', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ homeDir: home });
  e.openInvestigation('q');
  const probe = new StubSearchProbe('web');
  const res = await probe.run(e.graph, { query: 'hello', investigationId: e.commitment.id });
  e.absorbProbeResult(res);
  assert.ok(e.graph.primarySources().length >= 1);
});

test('engine: evaluate returns Evaluation', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ homeDir: home });
  e.openInvestigation('q');
  const ev = e.evaluate();
  assert.ok('defensible' in ev);
  assert.equal(typeof ev.critical_gaps_count, 'number');
});

test('engine: applyEvaluation only updates on legal transition', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ homeDir: home });
  e.openInvestigation('q');
  // exploring -> converging OK
  e.applyEvaluation({ status_recommendation: 'converging', defensible: false, reasons: [], gaps_count: 0, critical_gaps_count: 0, unacknowledged_contradictions: 0, primary_sources_count: 0, max_claim_confidence: 0 });
  assert.equal(e.commitment.status, 'converging');
  // converging -> defensible OK
  e.applyEvaluation({ status_recommendation: 'defensible', defensible: true, reasons: [], gaps_count: 0, critical_gaps_count: 0, unacknowledged_contradictions: 0, primary_sources_count: 3, max_claim_confidence: 0.8 });
  // defensible -> defensible is illegal; should be no-op
  e.applyEvaluation({ status_recommendation: 'defensible', defensible: true, reasons: [], gaps_count: 0, critical_gaps_count: 0, unacknowledged_contradictions: 0, primary_sources_count: 3, max_claim_confidence: 0.8 });
  assert.equal(e.commitment.status, 'defensible');
});

test('engine: canon registry has general/medical/computer_science', () => {
  assert.ok(CANON_REGISTRY.general);
  assert.ok(CANON_REGISTRY.medical);
  assert.ok(CANON_REGISTRY.computer_science);
  assert.throws(() => createCanon('mystic'));
});

test('engine: saveReport writes markdown to investigation dir', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-home-'));
  const e = new Engine({ homeDir: home });
  e.openInvestigation('q');
  const p = e.saveReport('# hi\n\n- a\n- b\n');
  assert.ok(fs.existsSync(p));
  assert.match(fs.readFileSync(p, 'utf8'), /^# hi/);
});
