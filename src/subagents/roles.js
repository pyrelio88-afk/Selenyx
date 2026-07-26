// 子代理角色目录 —— 恰好 10 个，映射到科研流水线各环节。
// 铁律（沿袭 kimi-code 先例）：
//  - 每个子代理持有隔离上下文
//  - 子代理不能再派生子代理
// MAX_SUBAGENTS = 10 是硬上限：注册表与 Manager 双层校验。
// 月相即进度：每个环节对应一轮月相，证据渐盈。

export const PIPELINE_STAGES = [
  'intake',
  'search',
  'extract',
  'appraise',
  'synthesize',
  'verify',
  'report',
];

export const MAX_SUBAGENTS = 10;

export const STAGE_MOON = {
  intake: '🌑',
  search: '🌒',
  extract: '🌓',
  appraise: '🌔',
  synthesize: '🌕',
  verify: '🌖',
  report: '🌗',
};

export class SubAgentRole {
  constructor({ name, stage, mission, missionEn, capabilities = [], maxTurns = 4 }) {
    if (!PIPELINE_STAGES.includes(stage)) {
      throw new Error(`unknown stage '${stage}'. Valid: ${PIPELINE_STAGES.join(', ')}`);
    }
    if (!name) throw new Error('role name must be non-empty');
    if (maxTurns < 1) throw new Error('maxTurns must be >= 1');
    this.name = name;
    this.stage = stage;
    this.mission = mission;
    this.missionEn = missionEn;
    this.capabilities = capabilities;
    this.maxTurns = maxTurns;
    this.moon = STAGE_MOON[stage];
  }
}

const ROLE_DEFS = [
  new SubAgentRole({
    name: 'intake-screener', stage: 'intake',
    mission: '筛查入题：判断研究问题是否值得进入检索环节',
    missionEn: 'Screen the question: is it worth entering the search stage',
    capabilities: ['lens'], maxTurns: 2,
  }),
  new SubAgentRole({
    name: 'query-planner', stage: 'search',
    mission: '把研究问题分解为可执行的检索式与子问题',
    missionEn: 'Decompose the question into executable queries and sub-questions',
    capabilities: ['lens'], maxTurns: 3,
  }),
  new SubAgentRole({
    name: 'search-specialist', stage: 'search',
    mission: '执行检索探针，回收候选证据 atoms',
    missionEn: 'Run search probes and collect candidate evidence atoms',
    capabilities: ['probe', 'atom_write'], maxTurns: 5,
  }),
  new SubAgentRole({
    name: 'extractor', stage: 'extract',
    mission: '从来源材料中抽取结构化 atoms（主张/证据/数据点）',
    missionEn: 'Extract structured atoms (claims/evidence/data points) from sources',
    capabilities: ['atom_write', 'relation_write'], maxTurns: 5,
  }),
  new SubAgentRole({
    name: 'appraiser', stage: 'appraise',
    mission: '用透镜评估证据质量、可信度与证据等级',
    missionEn: 'Appraise evidence quality, credibility and level via lenses',
    capabilities: ['lens'], maxTurns: 4,
  }),
  new SubAgentRole({
    name: 'contradiction-hunter', stage: 'appraise',
    mission: '专责发现冲突证据与反证关系',
    missionEn: 'Hunt conflicting evidence and contradiction relations',
    capabilities: ['lens', 'relation_write'], maxTurns: 4,
  }),
  new SubAgentRole({
    name: 'synthesizer', stage: 'synthesize',
    mission: '综合 atoms 形成连贯论证，推进 Commitment 状态',
    missionEn: 'Synthesize atoms into coherent argument, advance the Commitment',
    capabilities: ['lens', 'atom_write'], maxTurns: 5,
  }),
  new SubAgentRole({
    name: 'gap-analyst', stage: 'synthesize',
    mission: '识别知识缺口，生成下一轮探针任务建议',
    missionEn: 'Identify knowledge gaps, propose next-round probe tasks',
    capabilities: ['lens'], maxTurns: 3,
  }),
  new SubAgentRole({
    name: 'citation-verifier', stage: 'verify',
    mission: '核对引用链完整性，标记孤儿引用与断链',
    missionEn: 'Verify citation-chain integrity, flag orphan citations and broken links',
    capabilities: ['lens'], maxTurns: 3,
  }),
  new SubAgentRole({
    name: 'report-writer', stage: 'report',
    mission: '汇总调查成果，生成结构化研究报告',
    missionEn: 'Compile findings into a structured research report',
    capabilities: ['lens', 'atom_write'], maxTurns: 4,
  }),
];

if (ROLE_DEFS.length !== MAX_SUBAGENTS) {
  throw new Error(`role registry must hold exactly ${MAX_SUBAGENTS} roles`);
}

export const ROLE_REGISTRY = Object.fromEntries(ROLE_DEFS.map((r) => [r.name, r]));

export function getRole(name) {
  const role = ROLE_REGISTRY[String(name).trim().toLowerCase()];
  if (!role) {
    throw new Error(`unknown sub-agent role '${name}'. Registered: ${Object.keys(ROLE_REGISTRY).join(', ')}`);
  }
  return role;
}

export function rolesForStage(stage) {
  return ROLE_DEFS.filter((r) => r.stage === stage);
}

/** 环节 → 角色名列表。用于校验每个环节至少 1 个角色。 */
export function stageCoverage() {
  const coverage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []]));
  for (const r of ROLE_DEFS) coverage[r.stage].push(r.name);
  return coverage;
}

export function listRoles() {
  return [...ROLE_DEFS];
}
