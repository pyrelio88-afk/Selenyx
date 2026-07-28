import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESEARCH_STAGES,
  classifyResearchIntent,
  buildResearchPlan,
  updateResearchPlan,
  listAssistantCapabilities,
} from '../src/research/assistant.js';
import { applyWorkspaceEvent, emptyWorkspace, normalizeWorkspace } from '../src/research/workspace.js';

test('research assistant exposes the complete research lifecycle', () => {
  assert.deepEqual(RESEARCH_STAGES, [
    'question', 'discover', 'screen', 'read', 'evidence', 'synthesize', 'write', 'review',
  ]);
});

test('research assistant classifies evidence work before generic discovery', () => {
  const result = classifyResearchIntent('检索文献并核验主张与引用证据');
  assert.equal(result.intent, 'evidence');
  assert.ok(result.intents.includes('discover'));
  assert.ok(result.confidence > 0.7);
});

test('research assistant rejects an empty research question', () => {
  assert.throws(() => classifyResearchIntent('  '), /不能为空/);
});

test('research plan connects real search, reading, evidence and synthesis', () => {
  const plan = buildResearchPlan('比较 CRISPR 不同递送路径的有效性与风险', {
    libraryCount: 3,
    evidenceCount: 2,
    selectedSourceId: 'openalex:W1',
  });
  assert.equal(plan.localContext.libraryCount, 3);
  assert.equal(plan.tasks.filter((item) => item.status === 'active').length, 1);
  for (const stage of ['discover', 'screen', 'read', 'evidence', 'synthesize']) {
    assert.ok(plan.tasks.some((item) => item.stage === stage), `missing ${stage}`);
  }
  assert.ok(plan.tasks.some((item) => item.route === 'research'));
  assert.ok(plan.tasks.every((item) => item.evidenceGate));
  assert.match(plan.boundaries.model, /BYOK/);
});

test('experiment intent adds a falsifiable experiment task', () => {
  const plan = buildResearchPlan('为这个假设设计可复现实验和统计方法');
  assert.ok(plan.tasks.some((item) => item.capability === 'nature-experiment-log'));
});

test('writing intent remains L2-gated and evidence-gated', () => {
  const plan = buildResearchPlan('根据证据链起草论文并准备审稿回复');
  const writing = plan.tasks.find((item) => item.stage === 'write');
  assert.equal(writing.level, 'L2');
  assert.match(writing.evidenceGate, /证据|核验/);
});

test('completing an active task advances the workflow', () => {
  const plan = buildResearchPlan('检索量子传感相关论文');
  const active = plan.tasks.find((item) => item.status === 'active');
  const next = updateResearchPlan(plan, active.id, 'done');
  assert.equal(next.tasks.find((item) => item.id === active.id).status, 'done');
  assert.equal(next.tasks.filter((item) => item.status === 'active').length, 1);
});

test('assistant capabilities are internal stage mappings, not a flat card registry', () => {
  const capabilities = listAssistantCapabilities();
  assert.ok(capabilities.length >= 7);
  assert.ok(capabilities.every((item) => item.stage && item.ids.length));
});

test('workspace persists and normalizes the assistant plan', () => {
  const plan = buildResearchPlan('整理当前文献的矛盾证据');
  const applied = applyWorkspaceEvent(emptyWorkspace(), { type: 'assistant:set', plan });
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(applied.state)));
  assert.equal(restored.assistant.plan.question, plan.question);
  assert.equal(restored.assistant.plan.tasks.length, plan.tasks.length);
  assert.equal(restored.assistant.history.at(-1).action, 'plan:set');
});

test('workspace can clear a plan without erasing its local audit history', () => {
  const plan = buildResearchPlan('检索神经符号推理论文');
  const withPlan = applyWorkspaceEvent(emptyWorkspace(), { type: 'assistant:set', plan }).state;
  const cleared = applyWorkspaceEvent(withPlan, { type: 'assistant:clear' }).state;
  assert.equal(cleared.assistant.plan, null);
  assert.equal(cleared.assistant.history.at(-1).action, 'plan:clear');
});
