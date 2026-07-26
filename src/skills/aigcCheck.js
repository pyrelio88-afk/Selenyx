/**
 * aigc-check — 本地启发式 AIGC 率检测（零依赖、离线、确定性）
 *
 * 方法论参照 GPTZero 开源实现（困惑度 + 突发性双指标）与
 * ICLR'24 Multiscale PU Detection 的思路，但不内置大模型，
 * 因此用可计算的语言学代理特征：
 *
 *   1. burstiness   句长突发性（人类写作起伏大，AI 平稳）
 *   2. lexicon      词汇丰富度（type-token ratio，AI 偏好高频安全词）
 *   3. connectives  连接词密度（"首先/其次/综上所述/moreover..."）
 *   4. uniformity   段落匀质性（AI 段落长度方差小、结构对称）
 *   5. repetition   短语重复率（AI 爱复用同一搭配）
 *
 * 输出 0-100 的 AI 疑似度评分 + 逐维度明细 + 高风险句标红。
 *
 * 诚实边界：启发式筛查工具，用于写作自检；不能替代
 * 知网 AIGC 检测 / Turnitin 等商用系统，结果不构成学术裁决。
 */

// 中英文 AI 高频套话（来自公开语料统计与 humanizer 类项目的共同清单）
const AI_PHRASES_ZH = [
  '综上所述', '总而言之', '值得注意的是', '需要指出的是', '由此可见',
  '毫无疑问', '众所周知', '总的来说', '换言之', '换句话说',
  '在很大程度上', '扮演着重要角色', '发挥着重要作用', '具有重要的意义',
  '随着.*的(不断)?发展', '在.*的推动下', '为.*提供了新的思路',
  '首先.*其次.*最后', '不仅.*而且', '一方面.*另一方面',
];
const AI_PHRASES_EN = [
  'in conclusion', 'it is worth noting', 'it is important to note',
  'furthermore', 'moreover', 'in addition', 'delve into',
  'plays a (crucial|vital|significant) role', 'in the realm of',
  'a testament to', 'navigate the complexities', 'in today.s (fast-paced|digital)',
  'it.s important to (note|understand|recognize)', 'on the other hand',
  'paves the way', 'a (game|paradigm) changer', 'the landscape of',
];
const CONNECTIVES_ZH = ['首先', '其次', '再次', '然后', '接着', '最后', '因此', '所以', '然而', '但是', '此外', '另外', '同时', '并且'];
const CONNECTIVES_EN = ['firstly', 'secondly', 'thirdly', 'then', 'next', 'finally', 'therefore', 'thus', 'however', 'but', 'additionally', 'also', 'meanwhile', 'and'];

function splitSentences(text) {
  // 中英通用断句：。！？；.!?; 后跟空白或结尾
  return text
    .split(/(?<=[。！？；.!?;])\s*|(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function splitParagraphs(text) {
  return text.split(/\n\s*\n|\r?\n\r?\n/).map((p) => p.trim()).filter(Boolean);
}

function tokenize(text) {
  // 中文按字（去标点），英文按词
  const zh = (text.match(/[一-鿿]/g) || []);
  const en = (text.toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  return { zh, en, total: zh.length + en.length };
}

function stdev(nums) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, n) => a + (n - mean) ** 2, 0) / nums.length);
}

/** 维度 1：句长突发性。AI 文本句长标准差通常偏低。返回 0-1 的 AI 疑似度 */
function burstinessScore(sentences) {
  if (sentences.length < 3) return { score: 0.5, detail: '句子太少，无法评估', raw: null };
  const lens = sentences.map((s) => tokenize(s).total);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return { score: 0.5, detail: '空文本', raw: null };
  const cv = stdev(lens) / mean; // 变异系数
  // 经验标定：人类学术写作 CV≈0.45-0.75；AI 常 < 0.35
  const score = Math.max(0, Math.min(1, (0.6 - cv) / 0.45));
  return {
    score: round2(score),
    detail: `句长变异系数 ${round2(cv)}（越低越像 AI，人类学术写作约 0.45-0.75）`,
    raw: { cv: round2(cv), sentenceCount: sentences.length },
  };
}

/** 维度 2：词汇丰富度（TTR）。AI 倾向于重复使用安全高频词 */
function lexiconScore(text) {
  const { zh, en, total } = tokenize(text);
  if (total < 50) return { score: 0.5, detail: '文本太短，无法评估', raw: null };
  const ttr = new Set([...zh, ...en]).size / total;
  // 中文按字 TTR 天然低（约 0.05-0.15），英文词 TTR 约 0.4-0.7；分开估计
  const zhTTR = zh.length ? new Set(zh).size / zh.length : null;
  const enTTR = en.length ? new Set(en).size / en.length : null;
  let score = 0.5;
  if (zh.length > en.length && zhTTR !== null) {
    // 中文：字 TTR < 0.10 偏低（重复多）
    score = Math.max(0, Math.min(1, (0.16 - zhTTR) / 0.12));
  } else if (enTTR !== null) {
    score = Math.max(0, Math.min(1, (0.55 - enTTR) / 0.35));
  }
  return {
    score: round2(score),
    detail: `词汇多样性 TTR ${round2(ttr)}（越低越像 AI 的安全重复用词）`,
    raw: { ttr: round2(ttr), tokens: total },
  };
}

/** 维度 3：连接词/套话密度。AI 的模板化衔接显著高于人类 */
function connectiveScore(text, sentences) {
  if (!sentences.length) return { score: 0.5, detail: '无句子', raw: null };
  const lower = text.toLowerCase();
  let hits = 0;
  const hitList = [];
  for (const p of AI_PHRASES_ZH) {
    const m = lower.match(new RegExp(p, 'g'));
    if (m) { hits += m.length; hitList.push(`zh:${p.slice(0, 12)}×${m.length}`); }
  }
  for (const p of AI_PHRASES_EN) {
    const m = lower.match(new RegExp(p, 'gi'));
    if (m) { hits += m.length; hitList.push(`en:${p.slice(0, 16)}×${m.length}`); }
  }
  const density = hits / sentences.length;
  // 每句 > 0.5 个套话 → 高度疑似
  const score = Math.max(0, Math.min(1, density / 0.6));
  return {
    score: round2(score),
    detail: `AI 套话密度 ${round2(density)}/句，命中 ${hits} 处${hitList.length ? '：' + hitList.slice(0, 5).join('、') : ''}`,
    raw: { density: round2(density), hits, examples: hitList.slice(0, 10) },
  };
}

/** 维度 4：段落匀质性。AI 段落长度与结构过于对称 */
function uniformityScore(paragraphs) {
  if (paragraphs.length < 3) return { score: 0.3, detail: '段落少于 3，权重降低', raw: null };
  const lens = paragraphs.map((p) => tokenize(p).total);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return { score: 0.3, detail: '空段落', raw: null };
  const cv = stdev(lens) / mean;
  // 人类文章段落长短差异大（CV 常 > 0.5）；AI 均匀（CV 常 < 0.3）
  const score = Math.max(0, Math.min(1, (0.5 - cv) / 0.4));
  return {
    score: round2(score),
    detail: `段落长度变异系数 ${round2(cv)}（越低越匀质、越像 AI）`,
    raw: { cv: round2(cv), paragraphCount: paragraphs.length },
  };
}

/** 维度 5：短语重复率（4-gram 复用） */
function repetitionScore(text) {
  const { zh, en, total } = tokenize(text);
  if (total < 40) return { score: 0.5, detail: '文本太短', raw: null };
  const units = zh.length >= en.length ? zh : en;
  const n = 4;
  const grams = new Map();
  for (let i = 0; i + n <= units.length; i++) {
    const g = units.slice(i, i + n).join('');
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  const repeated = [...grams.values()].filter((c) => c >= 3).length;
  const ratio = grams.size ? repeated / grams.size : 0;
  const score = Math.max(0, Math.min(1, ratio / 0.02));
  return {
    score: round2(score),
    detail: `重复 4-gram ${repeated} 个（占比 ${(ratio * 100).toFixed(2)}%，AI 常复用固定搭配）`,
    raw: { repeated4grams: repeated, ratio: round2(ratio * 1000) / 1000 },
  };
}

/** 标出高风险句：命中套话或长度极端均匀的句子 */
function flagSentences(sentences) {
  const flagged = [];
  const lens = sentences.map((s) => tokenize(s).total);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  sentences.forEach((s, i) => {
    const lower = s.toLowerCase();
    const phraseHit =
      AI_PHRASES_ZH.some((p) => new RegExp(p).test(lower)) ||
      AI_PHRASES_EN.some((p) => new RegExp(p, 'i').test(lower));
    const uniformHit = mean > 0 && Math.abs(lens[i] - mean) / mean < 0.08 && lens[i] > 12;
    if (phraseHit || uniformHit) {
      flagged.push({ index: i, sentence: s.slice(0, 120), reason: phraseHit ? '命中 AI 高频套话' : '句长异常均匀' });
    }
  });
  return flagged;
}

const WEIGHTS = { burstiness: 0.25, lexicon: 0.2, connectives: 0.25, uniformity: 0.1, repetition: 0.2 };

/**
 * 主入口：检测一段文本的 AI 疑似度
 * @param {string} text
 * @returns {{score:number, verdict:string, dimensions:object, flagged:Array, disclaimer:string}}
 */
function checkAigc(text) {
  if (typeof text !== 'string' || text.trim().length < 30) {
    return { ok: false, error: '文本太短（<30 字符），无法给出有意义的估计' };
  }
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const dimensions = {
    burstiness: burstinessScore(sentences),
    lexicon: lexiconScore(text),
    connectives: connectiveScore(text, sentences),
    uniformity: uniformityScore(paragraphs),
    repetition: repetitionScore(text),
  };
  let score = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) score += dimensions[k].score * w;
  score = Math.round(score * 100);
  const verdict =
    score >= 70 ? '高度疑似 AI 生成，建议逐句重写高风险句' :
    score >= 45 ? '中等疑似，含较多模板化表达，建议局部润色' :
    score >= 25 ? '低度疑似，个别句式可再自然化' :
    '文本特征接近人类写作';
  return {
    ok: true,
    score,
    verdict,
    dimensions,
    flagged: flagSentences(sentences).slice(0, 20),
    sentenceCount: sentences.length,
    disclaimer: '启发式自检结果，仅供写作修改参考；正式提交前请以学校/期刊指定的检测系统（知网/Turnitin 等）为准。',
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

export { checkAigc, splitSentences, WEIGHTS, AI_PHRASES_ZH, AI_PHRASES_EN };
