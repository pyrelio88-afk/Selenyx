/**
 * Selenyx 科研项目模型 — 八段流水线 + PICO + SBAR 课题 + 多维表格
 */

import type { PipelineStageKey, PICO } from './reference';

export type PipelineStageIcon =
  | 'stageProblem' | 'stageLiterature' | 'stageFulltext' | 'stageScreening'
  | 'stageReading' | 'stageEvidence' | 'stageSynthesis' | 'stageWriting';

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  description: string;
  icon: PipelineStageIcon;
  order: number;
  entryCriteria: string;
  outputs: string[];
  qualityGate: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'problem', label: '立题', description: '从临床场景提炼可研究的结构化问题', icon: 'stageProblem', order: 1, entryCriteria: '有明确临床场景观察', outputs: ['PICO 结构化问题', '研究假设'], qualityGate: 'PICO 四要素完整' },
  { key: 'literature', label: '检索', description: '系统检索相关文献，建立文献库', icon: 'stageLiterature', order: 2, entryCriteria: 'PICO 已确定', outputs: ['检索策略', '文献列表', 'PRISMA 流程图'], qualityGate: '检索策略可复现' },
  { key: 'fulltext', label: '评级', description: '文献质量评级与全文获取入库', icon: 'stageFulltext', order: 3, entryCriteria: '文献列表已筛选', outputs: ['全文 PDF', '质量评级', '结构化摘要'], qualityGate: '全文获取率 ≥ 80%' },
  { key: 'screening', label: '设计', description: '研究设计与纳排标准制定', icon: 'stageScreening', order: 4, entryCriteria: '全文已入库', outputs: ['研究设计方案', '纳入/排除标准', '样本量估算'], qualityGate: '设计方案通过伦理审查' },
  { key: 'reading', label: '数据', description: '数据提取与整理', icon: 'stageReading', order: 5, entryCriteria: '设计方案已定', outputs: ['数据提取表', '数据清洗记录', '编码手册'], qualityGate: '关键数据提取完整' },
  { key: 'evidence', label: '分析', description: '数据分析与证据分级', icon: 'stageEvidence', order: 6, entryCriteria: '数据提取完成', outputs: ['统计分析结果', 'GRADE 分级', '效应量计算'], qualityGate: 'GRADE 分级完成' },
  { key: 'synthesis', label: '写作', description: '论文撰写与证据综合', icon: 'stageSynthesis', order: 7, entryCriteria: '分析完成', outputs: ['论文初稿', '推理链', '结论'], qualityGate: '查重通过 + 逻辑完整' },
  { key: 'writing', label: '传播', description: '成果传播与投稿发表', icon: 'stageWriting', order: 8, entryCriteria: '论文初稿完成', outputs: ['投稿材料', '参考文献格式化', '传播计划'], qualityGate: '格式合规 + 投稿就绪' },
];

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  /** 用户在课题中的真实职责；用于区分主导课题与协作课题。 */
  ownerRole?: 'lead' | 'participant';
  /** 首页唯一主线。旧数据缺失时由用户确认；仅已知的旧 AI-SBAR 主线会兼容迁移。 */
  isPrimary?: boolean;
  currentStage: PipelineStageKey;
  frameworkId?: string;   // 研究框架 ID（对齐 RESEARCH_FRAMEWORKS），驱动 AI 助手技能推荐
  pico?: PICO;
  tags: string[];
  sbar?: SBARInfo;
  referenceIds: string[];
  taskIds: string[];
  status: 'planning' | 'active' | 'paused' | 'completed' | 'archived';
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SBARInfo {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export interface KanbanTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  column: 'todo' | 'doing' | 'done' | 'blocked';
  stage: PipelineStageKey;
  assignee: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type ViewType = 'table' | 'board' | 'gallery' | 'timeline' | 'calendar';
export type FieldType = 'text' | 'number' | 'select' | 'multiSelect' | 'date' | 'checkbox' | 'url' | 'email' | 'formula' | 'rating' | 'attachment';

export interface TableField {
  id: string;
  name: string;
  type: FieldType;
  options?: { label: string; color: string }[];
  formula?: string;
  required: boolean;
  defaultValue: string | number | boolean | null;
}

export interface TableView {
  id: string;
  name: string;
  type: ViewType;
  fieldIds: string[];
  filters: TableFilter[];
  sorts: { fieldId: string; direction: 'asc' | 'desc' }[];
  groupFieldId: string | null;
  freezeColumns: number;
}

export interface TableFilter {
  fieldId: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
  value: string | number | boolean;
}

export interface MultiDimTable {
  id: string;
  projectId: string;
  name: string;
  fields: TableField[];
  views: TableView[];
  records: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}
