import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkAigc, humanizeRules, humanizeDeep,
  selfDuplicate, checkAgainstCorpus,
  translateTerms, translateText,
  summarizeExtractive, summarizeDeep,
  AnnotationStore, listSkills, getSkill,
} from '../src/skills/index.js';

const AI_FLAVORED = `综上所述，随着人工智能的不断发展，其在护理领域扮演着重要角色。值得注意的是，AI 不仅提高了效率，而且改善了质量。此外，研究表明该技术具有重要的意义。总而言之，这一趋势为临床实践提供了新的思路。由此可见，深入探索是必要的。`;

const HUMAN_FLAVORED = `心衰患者的血钾管理比教科书写得复杂。我科去年收了一位老太太，呋塞米 40mg 用了三天，血钾从 4.1 掉到 2.9——夜班护士凌晨两点发现室早，叫醒了整组人。事后我们复盘，问题出在交接班：白班没提利尿剂剂量，夜班就没盯电解质。后来科室改了规矩，凡用利尿剂的患者，交班必须口头报最近一次血钾值。三个月下来，类似险情一次没再发生。`;

// ---------- aigc-check ----------

test('aigc-check: AI 腔文本得分显著高于人味文本', () => {
  const ai = checkAigc(AI_FLAVORED);
  const human = checkAigc(HUMAN_FLAVORED);
  assert.equal(ai.ok, true);
  assert.equal(human.ok, true);
  assert.ok(ai.score > human.score, `AI ${ai.score} 应 > human ${human.score}`);
  assert.ok(ai.dimensions.connectives.score > 0.3, 'AI 文本套话维度应有分');
});

test('aigc-check: 输出包含五维度 + 高风险句 + 诚实声明', () => {
  const r = checkAigc(AI_FLAVORED);
  for (const k of ['burstiness', 'lexicon', 'connectives', 'uniformity', 'repetition']) {
    assert.ok(r.dimensions[k], `缺维度 ${k}`);
    assert.ok(typeof r.dimensions[k].score === 'number');
  }
  assert.ok(Array.isArray(r.flagged));
  assert.match(r.disclaimer, /知网|Turnitin/);
});

test('aigc-check: 短文本拒绝评分', () => {
  const r = checkAigc('太短了');
  assert.equal(r.ok, false);
});

// ---------- humanize ----------

test('humanize L1: 改写后 AI 疑似度下降且给出改动清单', () => {
  const r = humanizeRules(AI_FLAVORED);
  assert.equal(r.ok, true);
  assert.ok(r.changes.length > 0, '应有改动');
  assert.ok(r.delta > 0, `delta=${r.delta} 应为正（分数下降）`);
  assert.ok(r.after.score < r.before.score);
  assert.match(r.ethics, /原创/);
});

test('humanize L1: 人味文本不被过度改写', () => {
  const r = humanizeRules(HUMAN_FLAVORED);
  assert.equal(r.ok, true);
  // 人味文本套话少，改动应显著少于 AI 腔文本
  const aiChanges = humanizeRules(AI_FLAVORED).changes.length;
  assert.ok(r.changes.length < aiChanges);
});

test('humanize L2: 无 provider 时降级 L1', async () => {
  const r = await humanizeDeep(AI_FLAVORED, null);
  assert.match(r.level, /L1/);
});

test('humanize L2: mock provider 路径完整', async () => {
  const mock = { chat: async () => ({ content: '从这些结果来看，AI 在护理里的作用很关键。' }) };
  const r = await humanizeDeep(AI_FLAVORED, mock);
  assert.match(r.level, /L2/);
  assert.ok(r.text.length > 0);
});

// ---------- plagiarism ----------

test('plagiarism 自重复: 重复段落被识别', () => {
  const para = '循证护理要求护士在决策时整合最佳研究证据与患者价值观。';
  const r = selfDuplicate(para + para + para);
  assert.equal(r.ok, true);
  assert.ok(r.duplicateRatio > 30, `重复率 ${r.duplicateRatio}% 应 > 30%`);
  assert.ok(r.blocks.length > 0);
});

test('plagiarism 库内比对: 命中相似文档', () => {
  const mine = '循证护理要求护士在决策时整合最佳研究证据与患者价值观，这是现代护理的基石。';
  const corpus = [
    { id: 'paper-a', text: '本文讨论循证护理要求护士在决策时整合最佳研究证据与患者价值观的问题。' },
    { id: 'paper-b', text: '量子计算与护理没有任何关系的一段文字。' },
  ];
  const r = checkAgainstCorpus(mine, corpus);
  assert.equal(r.ok, true);
  assert.ok(r.hits.length >= 1);
  assert.equal(r.hits[0].docId, 'paper-a');
  assert.ok(r.hits[0].coverageOfMyText > 0);
});

// ---------- translate ----------

test('translate 术语级: 医学术语命中', () => {
  const r = translateTerms('Patients with heart failure often develop hypokalemia when treated with diuretic.', 'medical');
  assert.equal(r.ok, true);
  const ens = r.hits.map((h) => h.en);
  assert.ok(ens.includes('heart failure'));
  assert.ok(ens.includes('hypokalemia'));
});

test('translate 引用保护: 引用标记不进翻译', async () => {
  const seen = [];
  const mock = {
    chat: async (msgs) => {
      seen.push(msgs[1].content);
      return { content: '译文保留 ‹‹P0›› 标记' };
    },
  };
  const r = await translateText('SBAR 交接可提升安全性 [1] (Smith, 2020)。', { provider: mock, domain: 'medical' });
  assert.equal(r.ok, true);
  assert.equal(r.level, 'llm');
  assert.ok(!seen[0].includes('[1]'), '保护后原文里的 [1] 应被掩码');
  assert.ok(r.translated.includes('[1]'), '译文应还原 [1]');
});

test('translate 无 provider 时给术语对照', async () => {
  const r = await translateText('heart failure management', { domain: 'medical' });
  assert.equal(r.ok, true);
  assert.equal(r.translated, null);
  assert.ok(r.terms.length > 0);
});

// ---------- summarize ----------

const PAPER = `# Background\n心力衰竭是常见的心血管疾病。本研究探讨 SBAR 交接的效果。\n\n# Methods\n采用随机对照试验，纳入 120 名患者，干预组用 SBAR，对照组常规交接。\n\n# Results\n干预组不良事件发生率显著降低（12% vs 28%，P=0.03）。\n\n# Limitations\n单中心研究，样本量有限，随访时间较短。\n\n# Conclusion\nSBAR 交接能改善心衰患者的交接质量。`;

test('summarize L1: 六段式结构 + 章节识别', () => {
  const r = summarizeExtractive(PAPER);
  assert.equal(r.ok, true);
  assert.ok(r.summary.problem);
  assert.ok(r.summary.methods);
  assert.ok(r.summary.results);
  assert.ok(r.summary.limitations);
  assert.equal(r.summary.relevance, null, 'L1 不打相关性');
  assert.ok(r.sectionsFound.includes('results'));
});

test('summarize L2: mock provider 解析六段标签', async () => {
  const mock = {
    chat: async () => ({
      content: '【problem】心衰交接问题【methods】RCT 120例【results】不良事件降低【limitations】单中心【takeaway】SBAR有效【relevance】与你的 SBAR 研究直接相关',
    }),
  };
  const r = await summarizeDeep(PAPER, mock, { profile: { interests: [{ topic: 'SBAR', weight: 5 }] } });
  assert.match(r.summary.relevance, /SBAR/);
  assert.equal(r.level.includes('L2'), true);
});

// ---------- annotate ----------

test('annotate: 增删改查 + 导出 markdown', () => {
  const store = new AnnotationStore();
  const a = store.add('doc1', { color: 'red', pageLabel: '3', text: '不良事件发生率 12% vs 28%', comment: '关键结果', tags: ['结果'] });
  store.add('doc1', { color: 'purple', pageLabel: '1', text: 'SBAR 交接', comment: '与我的研究相关' });
  assert.equal(store.list('doc1').length, 2);
  assert.equal(store.list('doc1', { color: 'red' }).length, 1);
  store.update('doc1', a.id, { comment: '核心数字，引用时带上 P 值' });
  const updated = store.list('doc1').find((x) => x.id === a.id);
  assert.match(updated.comment, /P 值/);
  const md = store.exportMarkdown('doc1', { docTitle: 'SBAR 研究' });
  assert.match(md, /关键\/风险/);
  assert.match(md, /与我相关/);
  assert.match(md, /p\.3/);
  assert.equal(store.remove('doc1', a.id), true);
  assert.equal(store.list('doc1').length, 1);
});

test('annotate: JSON 往返不丢数据', () => {
  const store = new AnnotationStore();
  store.add('doc1', { color: 'blue', text: '待查证的剂量', pageLabel: '5' });
  const json = store.toJSON();
  const store2 = AnnotationStore.fromJSON(JSON.parse(JSON.stringify(json)));
  assert.equal(store2.list('doc1').length, 1);
  assert.equal(store2.list('doc1')[0].color, 'blue');
});

// ---------- registry ----------

test('skills 注册表: 7 个 Selenyx 原生技能离线可用', () => {
  const skills = listSkills();
  const native = skills.filter((skill) => skill.family === 'selenyx');
  assert.equal(native.length, 7);
  for (const s of native) assert.equal(s.offline, true, `${s.id} 应离线可用`);
  assert.ok(getSkill('aigc-check'));
  assert.equal(getSkill('nonexistent'), null);
});
