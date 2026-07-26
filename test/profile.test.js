import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyProfile, applyEvent, foldEvents, relevanceScore, describe, extractKeywords } from '../src/scholar/profile.js';

test('profile: 空画像诚实自述', () => {
  const p = emptyProfile();
  assert.match(describe(p), /还在认识你/);
  const r = relevanceScore(p, '任何文本');
  assert.equal(r.score, null);
});

test('profile: 阅读事件累积兴趣', () => {
  const p = foldEvents([
    { type: 'read', title: 'SBAR 结构化交接对心衰患者的影响', abstract: '低钾血症 利尿剂 交接质量' },
    { type: 'read', title: '循证护理中的 SBAR 应用', abstract: '交接 安全 心衰' },
  ]);
  assert.equal(p.habits.reads, 2);
  assert.ok(p.interests.length > 0);
  const topics = p.interests.map((i) => i.topic);
  assert.ok(topics.includes('SBAR'));
});

test('profile: 标红批注权重高于普通高亮', () => {
  const red = foldEvents([{ type: 'annotate', color: 'red', text: '不良事件 发生率 风险', comment: '' }]);
  const yellow = foldEvents([{ type: 'annotate', color: 'yellow', text: '不良事件 发生率 风险', comment: '' }]);
  const w = (p, t) => (p.interests.find((i) => i.topic === t) || { weight: 0 }).weight;
  assert.ok(w(red, '不良事件') > w(yellow, '不良事件'));
});

test('profile: 兴趣列表有 50 条上限', () => {
  const events = [];
  for (let i = 0; i < 80; i++) events.push({ type: 'search', query: `主题词${i} 独特词${i}` });
  const p = foldEvents(events);
  assert.ok(p.interests.length <= 50);
});

test('profile: 相关性打分随画像成熟而工作', () => {
  const p = foldEvents([
    { type: 'search', query: 'SBAR 心衰 交接' },
    { type: 'search', query: 'SBAR 临床推理' },
    { type: 'annotate', color: 'red', text: 'SBAR 交接质量' },
  ]);
  const r = relevanceScore(p, '本研究探讨 SBAR 结构化交接在心力衰竭患者中的应用');
  assert.ok(r.score > 0);
  assert.ok(r.matched.includes('SBAR'));
});

test('profile: 意图统计与偏好设置', () => {
  const p = foldEvents([
    { type: 'chat', intent: 'translate' },
    { type: 'chat', intent: 'translate' },
    { type: 'chat', intent: 'summarize' },
    { type: 'preference', key: 'theme', value: 'selene' },
  ]);
  assert.equal(p.habits.intents.translate, 2);
  assert.equal(p.preferences.theme, 'selene');
  assert.match(describe(p), /translate/);
});

test('profile: 关键词提取过滤停用词', () => {
  const kws = extractKeywords('基于研究的方法分析影响 the study of effects');
  assert.ok(!kws.includes('研究'));
  assert.ok(!kws.includes('study'));
});

test('profile: 未知事件类型安全忽略', () => {
  const p = applyEvent(emptyProfile(), { type: 'unknown-type', foo: 1 });
  assert.equal(p.habits.reads, 0);
});
