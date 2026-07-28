import { randomUUID } from 'node:crypto';

const RESEARCH_STAGES = Object.freeze([
  'question',
  'discover',
  'screen',
  'read',
  'evidence',
  'synthesize',
  'write',
  'review',
]);

const CAPABILITIES = Object.freeze({
  discover: ['nature-academic-search', 'nature-literature-pipeline'],
  screen: ['nature-ref-verifier'],
  read: ['nature-reader', 'nature-paper-card'],
  evidence: ['nature-citation', 'nature-ref-verifier'],
  synthesize: ['nature-literature-pipeline', 'nature-reviewer'],
  experiment: ['nature-experiment-log', 'nature-statistics'],
  write: ['nature-writing', 'nature-polishing', 'nature-response'],
  review: ['nature-reviewer', 'nature-ref-verifier', 'nature-data'],
});

const INTENT_RULES = Object.freeze([
  ['evidence', /证据|主张|引用|引文|矛盾|核验|citation|evidence|claim|verify/i],
  ['read', /阅读|总结|摘要|翻译|批注|精读|解读|summari[sz]e|translate|annotat|read/i],
  ['synthesize', /综述|综合|研究空白|差异|比较|脉络|review|synthesi[sz]e|research gap|compare/i],
  ['experiment', /实验|方法|假设|统计|复现|protocol|experiment|method|hypothesis|statistic|reproduc/i],
  ['write', /写作|起草|润色|投稿|审稿|回复|rebuttal|draft|write|polish|reviewer response/i],
  ['discover', /文献|论文|检索|搜索|查找|调研|literature|paper|search|find|discover/i],
]);

function cleanText(value, max = 20_000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function classifyResearchIntent(input) {
  const question = cleanText(input);
  if (!question) throw new TypeError('研究问题不能为空');
  const matches = INTENT_RULES.filter(([, pattern]) => pattern.test(question)).map(([intent]) => intent);
  const intent = matches[0] ?? 'discover';
  return {
    intent,
    intents: matches.length ? matches : ['discover'],
    stage: intent === 'experiment' ? 'question' : intent,
    confidence: matches.length ? Math.min(0.96, 0.72 + (matches.length - 1) * 0.08) : 0.55,
  };
}

function task(stage, title, description, {
  route = null,
  capability = null,
  level = 'L1',
  evidenceGate = null,
} = {}) {
  return {
    id: `task:${randomUUID()}`,
    stage,
    title,
    description,
    route,
    capability,
    level,
    evidenceGate,
    status: 'pending',
  };
}

function commonDiscoveryTasks(question) {
  return [
    task('question', '界定问题与检索边界', `把“${question}”拆成对象、变量、时间范围和排除条件。`, {
      capability: 'nature-literature-pipeline',
      evidenceGate: '用户确认问题边界后进入联网检索',
    }),
    task('discover', '从真实来源检索', '调用 OpenAlex、PubMed、Crossref 等原生 API；网页入口与 API 结果分开显示。', {
      route: 'research',
      capability: 'nature-academic-search',
      evidenceGate: '至少一个原生 API 返回，或明确记录全部失败原因',
    }),
    task('screen', '筛选并收藏候选文献', '按相关性、年份、来源和重复项筛选，保留排除理由。', {
      route: 'library',
      capability: 'nature-ref-verifier',
      evidenceGate: '候选文献必须带真实来源 ID 或标记为手工录入',
    }),
  ];
}

function buildResearchPlan(input, context = {}) {
  const question = cleanText(input);
  const classification = classifyResearchIntent(question);
  const libraryCount = Math.max(0, Number(context.libraryCount) || 0);
  const evidenceCount = Math.max(0, Number(context.evidenceCount) || 0);
  let tasks = commonDiscoveryTasks(question);

  tasks.push(
    task('read', '精读与结构化摘录', '在阅读页核对摘要/全文边界，离线完成批注、确定性摘要和术语翻译。', {
      route: 'reader',
      capability: 'nature-reader',
      evidenceGate: '每条摘录保留原文、来源与字符范围',
    }),
    task('evidence', '建立主张—证据链', '把支持、反驳和限定性证据分开，未审阅证据不得提升为结论。', {
      route: 'evidence',
      capability: 'nature-citation',
      evidenceGate: '关键主张至少有一条已审阅证据；矛盾不得静默丢弃',
    }),
    task('synthesize', '综合并标注不确定性', '先用本地结构生成综合框架；配置 BYOK 后才允许模型增强表述。', {
      route: 'skills',
      capability: 'nature-literature-pipeline',
      level: 'L1/L2',
      evidenceGate: '结论必须能回到证据记录；缺证据处保留待办',
    }),
  );

  if (classification.intents.includes('experiment')) {
    tasks.splice(5, 0, task('question', '形成可证伪假设与实验约束', '记录变量、对照、样本、停止条件和复现环境，不补造实验数据。', {
      capability: 'nature-experiment-log',
      evidenceGate: '假设、观察和结论必须分栏记录',
    }));
  }
  if (classification.intents.includes('write')) {
    tasks.push(task('write', '从证据链起草', '只使用已审阅证据生成写作提纲；模型润色不得改变数值与主张强度。', {
      capability: 'nature-writing',
      level: 'L2',
      evidenceGate: '未被证据支持的句子必须标为推测或待核验',
    }));
  }
  if (classification.intents.includes('evidence') || classification.intents.includes('synthesize')) {
    tasks.push(task('review', '反向审阅与引用核验', '检查反例、矛盾、引用错配、过度外推和数据可用性。', {
      capability: 'nature-reviewer',
      level: 'L1/L2',
      evidenceGate: '所有阻断项均解决或显式接受风险',
    }));
  }

  const activeIndex = Math.max(0, tasks.findIndex((item) => item.stage === classification.stage));
  tasks = tasks.map((item, index) => ({ ...item, status: index === activeIndex ? 'active' : 'pending' }));
  return {
    id: `plan:${randomUUID()}`,
    question,
    intent: classification.intent,
    intents: classification.intents,
    stage: tasks[activeIndex]?.stage ?? 'question',
    confidence: classification.confidence,
    localContext: { libraryCount, evidenceCount, selectedSourceId: cleanText(context.selectedSourceId, 300) || null },
    tasks: tasks.slice(0, 8),
    boundaries: {
      offline: '问题拆解、批注、确定性摘要、证据组织和计划持久化可离线使用。',
      network: '新文献检索需要真实网络与来源 API；站点跳转不计作 API 成功。',
      model: '写作、综合与审稿的 L2 增强需要用户配置 BYOK；无 Key 时不会生成伪模型回答。',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function updateResearchPlan(plan, taskId, status) {
  if (!plan || !Array.isArray(plan.tasks)) throw new TypeError('研究计划无效');
  if (!['pending', 'active', 'done', 'blocked'].includes(status)) throw new TypeError('任务状态无效');
  const index = plan.tasks.findIndex((item) => item.id === taskId);
  if (index < 0) throw new TypeError('研究任务不存在');
  const tasks = plan.tasks.map((item, taskIndex) => ({
    ...item,
    status: taskIndex === index ? status : status === 'active' && item.status === 'active' ? 'pending' : item.status,
  }));
  if (status === 'done') {
    const next = tasks.findIndex((item, taskIndex) => taskIndex > index && item.status === 'pending');
    if (next >= 0) tasks[next] = { ...tasks[next], status: 'active' };
  }
  const active = tasks.find((item) => item.status === 'active');
  return { ...plan, tasks, stage: active?.stage ?? plan.stage, updatedAt: new Date().toISOString() };
}

function listAssistantCapabilities() {
  return Object.entries(CAPABILITIES).map(([stage, ids]) => ({ stage, ids: [...ids] }));
}

export {
  RESEARCH_STAGES,
  CAPABILITIES,
  classifyResearchIntent,
  buildResearchPlan,
  updateResearchPlan,
  listAssistantCapabilities,
};
