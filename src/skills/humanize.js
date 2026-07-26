'use strict';

/**
 * humanize — 学术表达自然化（降 AIGC 率 / 辅助降重）
 *
 * 灵感来自 humanizer 类开源 skill（为 Claude Code 设计的去 AI 味技能），
 * 这里是零依赖、可测试的 JS 实现，内置在 Selenyx 里"天生就有"。
 *
 * 工作方式（两级）：
 *   L1 规则级（离线、确定性）：AI 套话替换词典 + 句式扰动建议 +
 *      连接词去模板化 + 改动清单（改了什么、为什么）
 *   L2 模型级（可选）：接入 Selenyx LLM provider 做深度改写，
 *      prompt 内置"保留引用与数据、只动表达"的硬约束
 *
 * 伦理边界（写死在输出里）：本工具用于把【你自己原创的内容】表达得更自然，
 * 不得用于代写、洗稿或规避学术诚信审查。
 */

import { checkAigc } from './aigcCheck.js';

// AI 套话 → 更自然的学术中文写法（按语境多选一，取第一个保证确定性）
const REWRITES_ZH = [
  [/综上所述[，,]?/g, '从这些结果来看，'],
  [/总而言之[，,]?/g, '总体来看，'],
  [/值得注意的是[，,]?/g, '有一点值得留意：'],
  [/需要指出的是[，,]?/g, '这里要说明一下，'],
  [/由此可见[，,]?/g, '据此可以看出，'],
  [/毫无疑问[，,]?/g, '可以比较确定的是，'],
  [/众所周知[，,]?/g, '已有研究普遍表明，'],
  [/总的来说[，,]?/g, '整体上，'],
  [/换句话说[，,]?/g, '也就是说，'],
  [/换言之[，,]?/g, '更具体地说，'],
  [/扮演着重要(的)?角色/g, '作用很关键'],
  [/发挥着重要作用/g, '起着实实在在的作用'],
  [/具有重要的意义/g, '意义在于'],
  [/随着(.{2,12}?)的不断发展[，,]?/g, '$1发展到现在，'],
  [/不仅(.{2,30}?)，而且/g, '既$1，也'],
  [/在很大(的)?程度上/g, '相当大程度上'],
];
const REWRITES_EN = [
  [/\bin conclusion\b[,:]?/gi, 'Taken together,'],
  [/\bit is worth noting that\b/gi, 'notably,'],
  [/\bit is important to note that\b/gi, 'note that'],
  [/\bfurthermore\b[,]?/gi, 'also'],
  [/\bmoreover\b[,]?/gi, 'beyond this'],
  [/\bdelve(s)? into\b/gi, 'examine$1'],
  [/\bplays? a (crucial|vital|significant) role in\b/gi, 'matters for'],
  [/\bin the realm of\b/gi, 'in'],
  [/\ba testament to\b/gi, 'evidence of'],
  [/\bpaves the way for\b/gi, 'opens up'],
];

// 连接词去模板化：同义替换池（确定性取第一个）
const CONNECTIVE_POOL_ZH = {
  首先: '第一步是', 其次: '接着', 再次: '随后', 最后: '收尾处',
  因此: '所以', 此外: '另外', 然而: '不过', 同时: '与此同时',
};

/**
 * L1 规则级自然化
 * @param {string} text
 * @returns {{ok:boolean, text:string, changes:Array, before:object, after:object, ethics:string}}
 */
function humanizeRules(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '空文本' };
  const before = checkAigc(text);
  let out = text;
  const changes = [];
  for (const [re, rep] of [...REWRITES_ZH, ...REWRITES_EN]) {
    const m = out.match(re);
    if (m) {
      out = out.replace(re, rep);
      changes.push({ from: m[0], to: typeof rep === 'string' ? rep : '(语境改写)', count: m.length });
    }
  }
  for (const [from, to] of Object.entries(CONNECTIVE_POOL_ZH)) {
    // 只在句首位置替换，避免误伤正常用法
    const re = new RegExp(`(^|[。！？\\n]\\s*)${from}[，,]`, 'g');
    const m = out.match(re);
    if (m) {
      out = out.replace(re, `$1${to}，`);
      changes.push({ from: `句首「${from}」`, to, count: m.length });
    }
  }
  const after = checkAigc(out);
  return {
    ok: true,
    text: out,
    changes,
    before: before.ok ? { score: before.score } : null,
    after: after.ok ? { score: after.score } : null,
    delta: before.ok && after.ok ? before.score - after.score : null,
    ethics: '本工具用于自然化你自己原创内容的表达；不得用于代写、洗稿或规避学术诚信审查。',
  };
}

/**
 * L2 模型级深度改写（可选，需要 LLM provider）
 * provider 遵循 Selenyx llm 层接口：{ chat(messages) => Promise<{content}> }
 * 没有 provider 时降级为 L1。
 */
async function humanizeDeep(text, provider, opts = {}) {
  if (!provider || typeof provider.chat !== 'function') {
    const l1 = humanizeRules(text);
    return { ...l1, level: 'L1（未接 LLM，规则级）' };
  }
  const sys = [
    '你是一名学术写作编辑。把用户给出的【作者本人原创】文字改写得更自然、更像人写，',
    '硬约束：1) 不得改变任何事实、数据、结论；2) 保留所有引用标记（[1]、(Smith, 2020)、DOI）；',
    '3) 保留专业术语，只调整句式与衔接；4) 不得新增观点或文献；5) 输出改写后的全文，不要解释。',
  ].join('');
  const res = await provider.chat([
    { role: 'system', content: sys },
    { role: 'user', content: text },
  ], { temperature: opts.temperature ?? 0.7, maxTokens: opts.maxTokens ?? 4096 });
  const rewritten = (res && res.content) || text;
  const before = checkAigc(text);
  const after = checkAigc(rewritten);
  return {
    ok: true,
    level: 'L2（LLM 深度改写）',
    text: rewritten,
    changes: [{ from: '全文', to: 'LLM 句式级改写', count: 1 }],
    before: before.ok ? { score: before.score } : null,
    after: after.ok ? { score: after.score } : null,
    delta: before.ok && after.ok ? before.score - after.score : null,
    ethics: '本工具用于自然化你自己原创内容的表达；不得用于代写、洗稿或规避学术诚信审查。',
  };
}

export { humanizeRules, humanizeDeep, REWRITES_ZH, REWRITES_EN };
