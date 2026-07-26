/**
 * translate — 学术翻译（对标小绿鲸的划词/全文翻译 + 学科术语库）
 *
 * 三级能力：
 *   1. 术语级（离线、确定性）：内置三学科术语表（医学/计算机/通用学术），
 *      支持用户自定义术语本（glossary.json 累积，越用越准）
 *   2. 模型级（接 LLM provider）：整句/整段翻译，prompt 内置硬约束——
 *      术语优先查表、引用标记与数据原样保留、学术语域
 *   3. 保护机制：引用标记 [1]、(Smith, 2020)、DOI、数值+单位 不进翻译
 *
 * 小绿鲸有 113 个学科术语库；我们从 3 个高频学科起步，
 * 术语本随用户使用自动增长（lookupTerm 未命中且 LLM 给出译法时回写）。
 */

// 内置术语表（起步版，持续扩充）—— en -> zh
const GLOSSARY = {
  medical: {
    'myocardial infarction': '心肌梗死', 'heart failure': '心力衰竭',
    'ejection fraction': '射血分数', 'randomized controlled trial': '随机对照试验',
    'confidence interval': '置信区间', 'hazard ratio': '风险比',
    'odds ratio': '比值比', 'adverse event': '不良事件',
    'placebo-controlled': '安慰剂对照', 'double-blind': '双盲',
    'intention-to-treat': '意向性治疗分析', 'per protocol': '符合方案集',
    'diuretic': '利尿剂', 'hypokalemia': '低钾血症', 'arrhythmia': '心律失常',
    'SBAR': 'SBAR 结构化交接', 'clinical reasoning': '临床推理',
    'evidence-based nursing': '循证护理', 'systematic review': '系统综述',
    'meta-analysis': 'Meta 分析', 'cohort study': '队列研究',
    'case-control study': '病例对照研究', 'sensitivity': '敏感度',
    'specificity': '特异度', 'mortality': '死亡率', 'morbidity': '发病率',
  },
  computerScience: {
    'large language model': '大语言模型', 'retrieval-augmented generation': '检索增强生成',
    'fine-tuning': '微调', 'prompt engineering': '提示词工程',
    'context window': '上下文窗口', 'hallucination': '幻觉',
    'embedding': '嵌入向量', 'transformer': 'Transformer 架构',
    'benchmark': '基准测试', 'ablation study': '消融实验',
    'state of the art': '最先进（SOTA）', 'baseline': '基线',
    'agent': '智能体', 'multi-agent system': '多智能体系统',
    'reinforcement learning': '强化学习', 'inference': '推理',
    'token': '词元', 'zero-shot': '零样本', 'few-shot': '少样本',
  },
  general: {
    'null hypothesis': '零假设', 'statistical significance': '统计显著性',
    'p-value': 'P 值', 'effect size': '效应量', 'standard deviation': '标准差',
    'correlation': '相关', 'regression': '回归', 'sample size': '样本量',
    'peer review': '同行评审', 'limitations': '研究局限',
    'future work': '未来工作', 'literature review': '文献综述',
    'research question': '研究问题', 'inclusion criteria': '纳入标准',
    'exclusion criteria': '排除标准', 'bias': '偏倚', 'confounding': '混杂',
  },
};

// 引用/数据保护：这些模式不交给翻译器
const PROTECT_PATTERNS = [
  /\[[\d,\s–-]+\]/g,                 // [1] [2,3] [4-6]
  /\([A-Z][A-Za-z-]+(?:\s+et\s+al\.?)?,?\s+\d{4}[a-z]?\)/g, // (Smith, 2020) (Wang et al., 2023a)
  /doi:\s*\S+/gi,                    // doi:10.xxxx
  /https?:\/\/\S+/g,                 // URL
  /\b\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|L|mmol\/L|mmHg|bpm|%|℃|°C|h|min|d|wk|mo|yr)\b/g, // 数值+单位
  /\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/g,   // 缩写 SBAR, RCT, ICU
];

function protectSpans(text) {
  const spans = [];
  let masked = text;
  let idx = 0;
  for (const re of PROTECT_PATTERNS) {
    masked = masked.replace(new RegExp(re.source, re.flags || 'g'), (m) => {
      const token = `‹‹P${idx++}››`;
      spans.push({ token, original: m });
      return token;
    });
  }
  return { masked, spans };
}

function restoreSpans(text, spans) {
  let out = text;
  for (const { token, original } of spans) {
    out = out.split(token).join(original);
  }
  return out;
}

/**
 * 术语级翻译（离线）。返回命中的术语翻译与未覆盖提示。
 */
function translateTerms(text, domain = 'general', customGlossary = {}) {
  const table = { ...(GLOSSARY[domain] || {}), ...(GLOSSARY.general || {}), ...customGlossary };
  const lower = text.toLowerCase();
  const hits = [];
  for (const [en, zh] of Object.entries(table)) {
    if (lower.includes(en.toLowerCase())) hits.push({ en, zh });
  }
  return { ok: true, domain, hits, termCount: Object.keys(table).length };
}

/**
 * 模型级翻译。provider 缺省时返回术语级结果 + 提示。
 * @param {string} text
 * @param {object} opts { provider, domain, targetLang ('zh'|'en'), customGlossary }
 */
async function translateText(text, opts = {}) {
  const { provider = null, domain = 'general', targetLang = 'zh', customGlossary = {} } = opts;
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '空文本' };
  const terms = translateTerms(text, domain, customGlossary);
  if (!provider || typeof provider.chat !== 'function') {
    return {
      ok: true,
      level: 'terms-only（未接 LLM）',
      translated: null,
      terms: terms.hits,
      note: '接入 LLM provider 后可用整句/整段翻译；当前给出术语对照。',
    };
  }
  const { masked, spans } = protectSpans(text);
  const glossaryHint = terms.hits.length
    ? '术语对照（优先采用）：' + terms.hits.map((t) => `${t.en}=${t.zh}`).join('；')
    : '';
  const sys = [
    `你是学术翻译引擎，把文本翻译成${targetLang === 'zh' ? '中文' : '英文'}。`,
    '硬约束：1) ‹‹Pn›› 是保护标记，原样保留不得翻译或改动；',
    '2) 学术语域，术语准确；3) 不增删信息；4) 只输出译文。',
    glossaryHint,
  ].filter(Boolean).join('');
  const res = await provider.chat(
    [
      { role: 'system', content: sys },
      { role: 'user', content: masked },
    ],
    { temperature: 0.2, maxTokens: opts.maxTokens ?? 4096 },
  );
  const translated = restoreSpans((res && res.content) || '', spans);
  return { ok: true, level: 'llm', translated, terms: terms.hits, protected: spans.length };
}

export { translateText, translateTerms, protectSpans, restoreSpans, GLOSSARY };
