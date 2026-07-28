/**
 * Native Selenyx adapter for Yuan1z0825/nature-skills.
 *
 * This file intentionally adapts workflows instead of bundling upstream
 * browser automation, login helpers, Python/R environments or demo assets.
 * Capabilities that need those runtimes are reported honestly to the UI.
 */

const NATURE_UPSTREAM = Object.freeze({
  repository: 'https://github.com/Yuan1z0825/nature-skills',
  commit: 'ca9f57e80e8bc100eb06ebfbfff406c126e5b256',
  license: 'Apache-2.0',
  adapted: true,
});

const NATURE_SKILLS = Object.freeze([
  { id: 'nature-academic-search', name: 'Nature 学术搜索', category: '文献', mode: 'route', route: 'research', desc: '接入 Selenyx 真实文献检索与逐来源状态，不伪造搜索结果。', requirements: ['网络连接'] },
  { id: 'nature-citation', name: 'Nature 引文追踪', category: '文献', mode: 'route', route: 'research', desc: '从真实检索结果进入引文与来源核验流程。', requirements: ['可解析的 DOI、PMID 或标题'] },
  { id: 'nature-data', name: 'Nature 数据可用性', category: '写作', mode: 'l2', desc: '审查数据、代码与材料可用性声明，区分事实、缺口和待确认项。' },
  { id: 'nature-downloader', name: 'Nature 合法全文获取', category: '文献', mode: 'route', route: 'browser', desc: '优先开放获取与出版社入口；登录墙只给出合法绕行方案。', requirements: ['网络连接；部分来源需机构权限'] },
  { id: 'nature-experiment-log', name: 'Nature 实验日志', category: '实验', mode: 'l1', offline: true, desc: '将原始实验记录整理为可追溯的 Markdown 日志，不补造缺失数据。' },
  { id: 'nature-figure', name: 'Nature 科研绘图', category: '产物', mode: 'external', desc: '规划科研图表与可视编码；实际绘图需 Python/R 和对应数据环境。', requirements: ['Python 或 R', '本地数据文件'] },
  { id: 'nature-literature-pipeline', name: 'Nature 文献流水线', category: '文献', mode: 'route', route: 'research', desc: '连接检索、收藏、阅读、批注与证据链的本地工作流。' },
  { id: 'nature-paper-card', name: 'Nature 论文卡片', category: '阅读', mode: 'l1', offline: true, desc: '从粘贴文本生成 16 节来源约束论文卡片；缺失信息明确标注。' },
  { id: 'nature-paper-to-patent', name: '论文转专利交底', category: '产物', mode: 'external', desc: '生成证据映射的专利交底工作计划；正式文档需 Office/Python 环境和人工法律复核。', requirements: ['Office/Python 文档运行时', '专利代理人复核'] },
  { id: 'nature-paper2ppt', name: '论文转学术汇报', category: '产物', mode: 'external', desc: '设计证据驱动的论文汇报结构；PPTX 生成需演示文稿运行时。', requirements: ['PPTX 运行时', '原文与图表文件'] },
  { id: 'nature-polishing', name: 'Nature 学术润色', category: '写作', mode: 'l2', desc: '在不改变主张和数值的前提下润色学术文本，并列出实质改动。' },
  { id: 'nature-proposal-writer', name: 'Nature 研究计划书', category: '写作', mode: 'l2', desc: '以问题、证据、方法、风险和可证伪里程碑组织研究计划。' },
  { id: 'nature-reader', name: 'Nature 深度阅读', category: '阅读', mode: 'route', route: 'reader', desc: '接入本地阅读器、翻译、总结、批注与证据链；全文翻译不冒充离线能力。' },
  { id: 'nature-ref-verifier', name: 'Nature 参考文献核验', category: '核验', mode: 'l1', offline: true, desc: '离线检查引用条目的年份、DOI、重复项和待联网核验项。' },
  { id: 'nature-response', name: 'Nature 审稿回复', category: '写作', mode: 'l2', desc: '逐条生成“意见—行动—证据—定位”的回复草案，不虚构已完成实验。' },
  { id: 'nature-reviewer', name: 'Nature 模拟审稿', category: '核验', mode: 'l2', desc: '按证据强度、方法、统计和可复现性审阅稿件，区分致命与可修问题。' },
  { id: 'nature-statistics', name: 'Nature 统计报告', category: '核验', mode: 'external', desc: '规划统计分析与报告检查；数值计算必须交给经验证的 Python/R 环境。', requirements: ['Python 或 R', '原始数据与分析方案'] },
  { id: 'nature-writing', name: 'Nature 科学写作', category: '写作', mode: 'l2', desc: '基于用户给定事实和证据起草论文段落，未知内容保留占位符。' },
]);

const L2_INSTRUCTIONS = Object.freeze({
  'nature-data': '审查数据、代码与材料可用性声明。输出：可验证事实、缺失信息、访问条件、建议文本。不得编造仓库、DOI、许可证或开放状态。',
  'nature-polishing': '润色学术文本。保持数字、引用、因果强度和结论边界不变。输出润色稿、关键改动、需要作者确认的事实。',
  'nature-proposal-writer': '起草研究计划。输出研究问题、现有证据、假设、方法、里程碑、失败判据、伦理与资源风险。未知事实使用【待确认】。',
  'nature-response': '逐条起草审稿回复。每条包含审稿意见、响应、实际行动、证据/位置。不得声称完成用户未提供的实验或修改。',
  'nature-reviewer': '模拟严格同行评审。区分主要问题、次要问题和信息不足；每项指出关联主张、依据与可操作修复。',
  'nature-writing': '基于输入事实起草科学文本。不得生成不存在的引文、数据或实验；使用【需证据】标记没有来源支持的主张。',
});

function normalizeInput(input) {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') return String(input.text ?? input.content ?? '').trim();
  return '';
}

function sentences(text) {
  return text.split(/(?<=[。！？.!?])\s+|\r?\n+/u).map((item) => item.trim()).filter(Boolean);
}

function paperCard(text) {
  const lines = sentences(text);
  const first = lines[0] || '【缺失：请粘贴论文标题与正文/摘要】';
  const evidence = lines.slice(0, 5);
  const missing = '【源文本未明确，需作者或原文核验】';
  const sections = [
    ['01 文献定位', first], ['02 研究问题', evidence[1] || missing],
    ['03 背景路径', evidence[2] || missing], ['04 现有痛点', missing],
    ['05 核心洞见', evidence[3] || missing], ['06 方法总览', evidence[4] || missing],
    ['07 模块逻辑', missing], ['08 关键公式', missing], ['09 数据与样本', missing],
    ['10 实验—主张证据链', evidence.length ? evidence.map((item, i) => `${i + 1}. ${item}`).join('\n') : missing],
    ['11 结论边界', missing], ['12 作者声明的局限', missing], ['13 批判性分析', missing],
    ['14 学到的知识', missing], ['15 知识连接', missing], ['16 可检验研究想法', missing],
  ];
  return sections.map(([title, body]) => `## ${title}\n\n${body}`).join('\n\n');
}

function experimentLog(text) {
  const now = new Date().toISOString();
  return [
    '---', `created: ${now}`, 'status: draft', 'source: user-input',
    'integrity: missing-fields-kept-explicit', '---', '',
    '# 实验日志', '', '## 原始记录', '', text || '【缺失：请粘贴原始记录】', '',
    '## 目的', '', '【待补充】', '', '## 材料与条件', '', '【待补充】', '',
    '## 操作步骤', '', '【待补充】', '', '## 观察与原始数据', '', '【待补充】', '',
    '## 异常与偏差', '', '【待补充】', '', '## 下一步', '', '【待补充】',
  ].join('\n');
}

function referenceAudit(text) {
  const entries = text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
  const seen = new Map();
  const rows = entries.map((entry, index) => {
    const doi = entry.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0]?.replace(/[.,;]+$/, '') ?? null;
    const year = entry.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? null;
    const key = (doi || entry).toLowerCase().replace(/\s+/g, ' ');
    const duplicateOf = seen.get(key) ?? null;
    if (!seen.has(key)) seen.set(key, index + 1);
    return { index: index + 1, doi, year, duplicateOf, needsOnlineVerification: true };
  });
  const summary = [
    `条目：${rows.length}`,
    `缺少年份：${rows.filter((row) => !row.year).length}`,
    `缺少 DOI：${rows.filter((row) => !row.doi).length}`,
    `疑似重复：${rows.filter((row) => row.duplicateOf).length}`,
    '离线检查不证明文献真实存在；DOI、作者、题名和期刊仍需联网多源核验。',
  ].join('\n');
  return `${summary}\n\n${rows.map((row) => `${row.index}. 年份=${row.year || '缺失'}；DOI=${row.doi || '缺失'}${row.duplicateOf ? `；疑似重复于 #${row.duplicateOf}` : ''}`).join('\n')}`;
}

function listNatureSkills() {
  return NATURE_SKILLS.map((skill) => ({
    ...skill,
    family: 'nature',
    upstream: NATURE_UPSTREAM,
    offline: Boolean(skill.offline),
  }));
}

function getNatureSkill(id) {
  const skill = NATURE_SKILLS.find((item) => item.id === id);
  return skill ? { ...skill, offline: Boolean(skill.offline), upstream: NATURE_UPSTREAM } : null;
}

function executeNatureL1(id, input) {
  const text = normalizeInput(input);
  if (id === 'nature-paper-card') return paperCard(text);
  if (id === 'nature-experiment-log') return experimentLog(text);
  if (id === 'nature-ref-verifier') return referenceAudit(text);
  throw Object.assign(new Error(`${id} 不是离线执行技能`), { code: 'SKILL_RUNTIME_REQUIRED' });
}

function buildNatureMessages(id, input) {
  const instruction = L2_INSTRUCTIONS[id];
  if (!instruction) throw Object.assign(new Error(`${id} 不支持模型执行`), { code: 'SKILL_RUNTIME_REQUIRED' });
  const text = normalizeInput(input);
  if (!text) throw Object.assign(new Error('请输入需要处理的研究材料'), { code: 'EMPTY_SKILL_INPUT' });
  return [
    {
      role: 'system',
      content: `你是 Selenyx 本地优先科研助手的 Nature Skills 适配器。${instruction}\n所有输出必须区分原文事实、合理推断和未知信息；保留证据边界。`,
    },
    { role: 'user', content: text },
  ];
}

export {
  NATURE_UPSTREAM,
  NATURE_SKILLS,
  listNatureSkills,
  getNatureSkill,
  executeNatureL1,
  buildNatureMessages,
};
