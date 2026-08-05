/**
 * Selenyx 八段流水线执行引擎（R79）
 *
 * 把只读看板升级为「可配置 + 可执行」：每段可写自定义指令，
 * 一键调 BYOK LLM 跑该段产出（PICO / 检索策略 / 精读摘要 / 证据综合 / 初稿…），
 * 输出流式回填，过门控后可推进到下一段。
 */

import { PIPELINE_STAGES } from '@apptypes/project';
import type { ResearchProject, Reference, PipelineStageKey } from '@apptypes/index';
import type { LLMConfig } from '@apptypes/index';
import { streamChat, type LLMMessage } from '@services/llm';

/** 每段的角色化系统提示（贴合该段产出物与门控） */
const STAGE_SYSTEM: Record<PipelineStageKey, string> = {
  problem: '你是科研问题结构化专家。基于用户给的临床场景，用 PICO 框架（Population/Intervention/Comparison/Outcome）提炼可研究问题，给出研究假设。输出 PICO 四要素 + 一句研究问题 + 一条假设。',
  literature: '你是系统检索策略专家。基于 PICO，构造 PubMed/CINAHL 检索策略（关键词+布尔逻辑+MeSH 词建议），并给出 PRISMA 四阶段（识别→筛选→纳入→综合）的数量预估。输出可直接粘贴的检索式 + 筛选流程要点。',
  fulltext: '你是全文获取与标注协调员。基于已筛文献清单，给出获取全文的优先级排序建议、合法获取途径（OA/机构库/馆际互借）、以及入库后应标注的关键字段清单。',
  screening: '你是文献筛选与偏倚评估专家。基于纳排标准，逐条给出筛选理由模板；对 RCT 推荐用 Cochrane RoB 2、对观察性研究推荐 MINORS，并给出评估维度清单。',
  reading: '你是循证精读与数据提取专家。对给定文献，按 PICO 提取人群/干预/对照/结局的关键数据，标注证据等级建议（GRADE 思路），并指出研究局限性与可引用要点。',
  evidence: '你是证据分级与综合专家。基于多篇文献的数据提取，用 GRADE 体系给出证据概要表（ outcomes × 质量 × 效应量方向），并计算或估算合并效应方向。输出证据摘要表骨架。',
  synthesis: '你是证据综合与推理链构建专家。把分散证据组织成「现象→机制→证据→结论」的推理链，明确标注哪些环节证据充分、哪些有缺口。输出结构化推理链 + 结论。',
  writing: '你是科研论文写作助手。基于综合结果，按目标期刊结构（IMRaD）起草指定章节初稿，严格区分「有文献支撑的陈述」与「作者推断」，不编造引用，引用处用占位符 [[待引]] 标记。',
};

/** 把项目上下文打包成提示上下文段 */
function projectContext(project: ResearchProject | undefined, references: Reference[], stageRefs: Reference[]): string {
  if (!project) return '（当前无选中项目）';
  const pico = project.pico;
  const picoText = [
    `项目：${project.name}`,
    project.description ? `描述：${project.description}` : '',
    pico?.population ? `P(人群)：${pico.population}` : '',
    pico?.intervention ? `I(干预)：${pico.intervention}` : '',
    pico?.comparison ? `C(对照)：${pico.comparison}` : '',
    pico?.outcome ? `O(结局)：${pico.outcome}` : '',
    project.sbar ? `SBAR.S：${project.sbar.situation}` : '',
    project.sbar ? `SBAR.B：${project.sbar.background}` : '',
    project.sbar ? `SBAR.A：${project.sbar.assessment}` : '',
    project.sbar ? `SBAR.R：${project.sbar.recommendation}` : '',
    `本段关联文献 ${stageRefs.length} 篇（共 ${references.length} 篇）：`,
    ...stageRefs.slice(0, 12).map((r, i) => `${i + 1}. ${r.title?.slice(0, 80) ?? '(无标题)'} — ${r.creators[0] ? `${r.creators[0].firstName} ${r.creators[0].lastName}` : '佚名'} ${r.year ?? ''} [${r.publication ?? ''}]`),
  ].filter(Boolean).join('\n');
  return picoText;
}

export interface RunStageParams {
  config: LLMConfig;
  project: ResearchProject | undefined;
  references: Reference[];
  stageKey: PipelineStageKey;
  customInstruction: string;
  onDelta: (acc: string) => void;
  signal?: AbortSignal;
}

/** 执行某一段：构造提示 → 流式调用 → 返回完整产出 */
export async function runPipelineStage({ config, project, references, stageKey, customInstruction, onDelta, signal }: RunStageParams) {
  const stage = PIPELINE_STAGES.find((s) => s.key === stageKey);
  const stageRefs = references.filter((r) => r.pipelineStage === stageKey);
  const ctx = projectContext(project, references, stageRefs);

  const messages: LLMMessage[] = [
    { role: 'system', content: STAGE_SYSTEM[stageKey] + '\n\n不编造文献、作者、年份、DOI 或数据。输出用中文，结构清晰。' },
    {
      role: 'user',
      content: [
        `# 科研上下文`,
        ctx,
        ``,
        `# 本阶段要求（${stage?.label ?? stageKey}）`,
        stage ? `产出物：${stage.outputs.join('、')}` : '',
        stage ? `门控标准：${stage.qualityGate}` : '',
        ``,
        `# 我的指令`,
        customInstruction.trim() || `请按本阶段产出要求，基于上述上下文生成产出。`,
      ].filter(Boolean).join('\n'),
    },
  ];

  const result = await streamChat(config, messages, onDelta, signal);
  return result;
}

export { STAGE_SYSTEM };
