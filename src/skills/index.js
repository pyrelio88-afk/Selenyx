/**
 * skills — Selenyx 内置科研技能总线（天生就有，开箱即用）
 *
 * 每个技能遵循统一接口约定：
 *   - 离线/确定性路径必须存在（L1），LLM 增强是可选装饰（L2）
 *   - 输出必须携带诚实边界声明（不夸大能力）
 */

import { checkAigc } from './aigcCheck.js';
import { humanizeRules, humanizeDeep } from './humanize.js';
import { selfDuplicate, checkAgainstCorpus } from './plagiarism.js';
import { translateText, translateTerms, GLOSSARY } from './translate.js';
import { summarizeExtractive, summarizeDeep } from './summarize.js';
import { AnnotationStore, COLORS } from './annotate.js';

const REGISTRY = [
  { id: 'aigc-check', name: 'AIGC 率检测', fn: checkAigc, offline: true, desc: '五维启发式评估 AI 疑似度并标红高风险句' },
  { id: 'humanize', name: '表达自然化（降 AIGC）', fn: humanizeRules, deepFn: humanizeDeep, offline: true, desc: '套话替换 + 句式去模板化，可选 LLM 深度改写' },
  { id: 'plagiarism-self', name: '自重复查重', fn: selfDuplicate, offline: true, desc: '文档内部 n-gram 重复块检测' },
  { id: 'plagiarism-corpus', name: '库内查重', fn: checkAgainstCorpus, offline: true, desc: '与本地语料库做指纹比对' },
  { id: 'translate', name: '学术翻译', fn: translateTerms, deepFn: translateText, offline: true, desc: '术语库离线对照 + LLM 整段翻译（引用保护）' },
  { id: 'summarize', name: '六段式总结', fn: summarizeExtractive, deepFn: summarizeDeep, offline: true, desc: 'problem/methods/results/limitations/takeaway/relevance' },
  { id: 'annotate', name: '文献批注', fn: null, store: AnnotationStore, offline: true, desc: '标红/高亮/笔记数据层，导出读书笔记' },
];

function listSkills() {
  return REGISTRY.map(({ id, name, offline, desc }) => ({ id, name, offline, desc }));
}

function getSkill(id) {
  return REGISTRY.find((s) => s.id === id) || null;
}

export {
  checkAigc, humanizeRules, humanizeDeep,
  selfDuplicate, checkAgainstCorpus,
  translateText, translateTerms, GLOSSARY,
  summarizeExtractive, summarizeDeep,
  AnnotationStore, COLORS,
  listSkills, getSkill,
};
