'use strict';

import { splitSentences } from './aigcCheck.js';

/**
 * summarize — 文献一键总结（科研结构化输出，非泛泛摘要）
 *
 * 输出固定六段式（对齐循证阅读动线）：
 *   problem / methods / results / limitations / takeaway / relevance
 * 其中 relevance 需要用户的研究画像（scholar profile），
 * 这是"和自己的项目的相关性"的落地钩子。
 *
 * 两级：
 *   L1 抽取级（离线）：按学术篇章信号词定位各段，抽取首句拼装
 *   L2 模型级（接 LLM provider）：六段式 prompt + 相关性分析
 */

const SECTION_SIGNALS = {
  problem: ['background', 'introduction', '研究背景', '引言', '研究问题'],
  methods: ['methods', 'methodology', 'materials and methods', '方法', '研究方法', '资料与方法'],
  results: ['results', 'findings', '结果', '研究结果'],
  limitations: ['limitations', 'limitation', '局限', '不足', '研究局限'],
  discussion: ['discussion', '讨论'],
  conclusion: ['conclusion', 'conclusions', '结论'],
};

/** 按标题信号切分学术文本（宽松匹配 markdown 标题与常见排版） */
function detectSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { name: 'preamble', lines: [] };
  for (const line of lines) {
    const stripped = line.replace(/^#+\s*/, '').replace(/^\d+\.?\s*/, '').trim().toLowerCase();
    let matched = null;
    for (const [name, signals] of Object.entries(SECTION_SIGNALS)) {
      if (signals.some((s) => stripped === s || stripped.startsWith(s))) { matched = name; break; }
    }
    if (matched) {
      if (current.lines.length) sections.push(current);
      current = { name: matched, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

function firstSentences(text, count = 2) {
  return splitSentences(text).slice(0, count).join(' ');
}

/** L1 抽取级总结（离线、确定性） */
function summarizeExtractive(text) {
  if (typeof text !== 'string' || text.trim().length < 100) {
    return { ok: false, error: '文本太短（<100 字符），不像一篇文献' };
  }
  const sections = detectSections(text);
  const byName = {};
  for (const s of sections) {
    const body = s.lines.join('\n').trim();
    if (body) byName[s.name] = (byName[s.name] ? byName[s.name] + '\n' : '') + body;
  }
  const grab = (name, fallbackFrom) => {
    if (byName[name]) return firstSentences(byName[name], 2);
    if (fallbackFrom) return firstSentences(fallbackFrom, 2);
    return null;
  };
  const preamble = byName.preamble || '';
  return {
    ok: true,
    level: 'L1（抽取式，未接 LLM）',
    summary: {
      problem: grab('problem', preamble),
      methods: grab('methods'),
      results: grab('results'),
      limitations: grab('limitations', byName.discussion),
      takeaway: grab('conclusion', byName.discussion),
      relevance: null, // L1 无画像不打相关性，保持诚实
    },
    sectionsFound: Object.keys(byName),
  };
}

/** L2 模型级六段式 + 与本人项目的相关性 */
async function summarizeDeep(text, provider, opts = {}) {
  const { profile = null, projectDesc = null } = opts;
  if (!provider || typeof provider.chat !== 'function') {
    return summarizeExtractive(text);
  }
  const interests =
    profile && Array.isArray(profile.interests)
      ? profile.interests.slice(0, 8).map((i) => i.topic).join('、')
      : null;
  const sys = [
    '你是循证阅读助手。用中文输出六段式文献总结，每段不超过 3 句，段落用【】标注：',
    '【problem】研究问题与背景；【methods】设计与方法（样本/干预/指标）；',
    '【results】关键结果（带数字）；【limitations】作者自述与你观察到的局限；',
    '【takeaway】一句话可带走的要点；【relevance】与用户研究方向的相关性与可借鉴处。',
    '硬约束：只依据所给文本，不得补充文中没有的数据或结论；没有的信息写"文中未报告"。',
    interests ? `用户研究方向：${interests}。` : '',
    projectDesc ? `用户在做的项目：${projectDesc}。` : '',
  ].filter(Boolean).join('');
  const res = await provider.chat(
    [
      { role: 'system', content: sys },
      { role: 'user', content: text.slice(0, 30000) },
    ],
    { temperature: 0.3, maxTokens: 2048 },
  );
  const raw = (res && res.content) || '';
  const parse = (tag) => {
    const m = raw.match(new RegExp(`【${tag}】([\\s\\S]*?)(?=【|$)`, 'i'));
    return m ? m[1].trim() : null;
  };
  return {
    ok: true,
    level: 'L2（LLM 六段式）',
    summary: {
      problem: parse('problem'), methods: parse('methods'), results: parse('results'),
      limitations: parse('limitations'), takeaway: parse('takeaway'), relevance: parse('relevance'),
    },
    raw,
  };
}

export { summarizeExtractive, summarizeDeep, detectSections, SECTION_SIGNALS };
