/**
 * Selenyx 科研项目模型 — 八段流水线 + PICO + SBAR 课题 + 多维表格
 */

import type { PipelineStageKey, PICO } from './reference';

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  description: string;
  icon: string;
  order: number;
  entryCriteria: string;
  outputs: string[];
  qualityGate: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'problem', label: '问题', description: '从临床场景提炼可研究的结构化问题', icon: '❓', order: 1, entryCriteria: '有明确临床场景观察', outputs: ['PICO 结构化问题', '研究假设'], qualityGate: 'PICO 四要素完整' },
  { key: 'literature', label: '文献', description: '系统检索相关文献，建立文献库', icon: '📚', order: 2, entryCriteria: 'PICO 已确定', outputs: ['检索策略', '文献列表', 'PRISMA 流程图'], qualityGate: '检索策略可复现' },
  { key: 'fulltext', label: '全文', description: '获取全文，PDF 入库与标注', icon: '📄', order: 3, entryCriteria: '文献列表已筛选', outputs: ['全文 PDF', 'PDF 标注', '结构化摘要'], qualityGate: '全文获取率 ≥ 80%' },
  { key: 'screening', label: '筛选', description: '按纳排标准筛选文献', icon: '🔍', order: 4, entryCriteria: '全文已入库', outputs: ['纳入/排除列表', '筛选理由记录'], qualityGate: '双人筛选一致性 Kappa ≥ 0.8' },
  { key: 'reading', label: '精读', description: '深度阅读，提取关键信息', icon: '📖', order: 5, entryCriteria: '文献已纳入', outputs: ['精读笔记', '质量评价', '数据提取表'], qualityGate: '关键数据提取完整' },
  { key: 'evidence', label: '证据', description: '证据分级与综合', icon: '⚖️', order: 6, entryCriteria: '数据提取完成', outputs: ['证据摘要表', 'GRADE 分级', '效应量计算'], qualityGate: 'GRADE 分级完成' },
  { key: 'synthesis', label: '综合', description: '证据综合与推理', icon: '🧩', order: 7, entryCriteria: '证据分级完成', outputs: ['证据综合报告', '推理链', '结论'], qualityGate: '推理链逻辑完整' },
  { key: 'writing', label: '写作', description: '论文撰写与投稿', icon: '✍️', order: 8, entryCriteria: '综合报告完成', outputs: ['论文初稿', '参考文献格式化', '投稿材料'], qualityGate: '查重通过 + 格式合规' },
];

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  currentStage: PipelineStageKey;
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
