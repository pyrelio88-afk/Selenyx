/**
 * 专家与自动化 API — 后端 SQLite 持久化
 */

import { request } from './api';

export interface ExpertDef {
  id: string;
  key: string;
  name: string;
  tagline: string;
  systemPrompt: string;
  builtin: boolean;
  /** 被委托为 subagent 时的工具白名单（V4 模块 E 专家详情） */
  toolBoundary?: string[];
}

export interface ExpertDelegation {
  runId: string;
  goal: string;
  status: string;
  startedAt: string | null;
  steps: number;
}

export const expertsApi = {
  list: () => request<{ experts: ExpertDef[] }>('/experts'),
  create: (body: { name: string; tagline: string; systemPrompt: string }) =>
    request<ExpertDef>('/experts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name: string; tagline: string; systemPrompt: string }) =>
    request<ExpertDef>(`/experts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => request<{ deleted: string }>(`/experts/${id}`, { method: 'DELETE' }),
  /** 专家人格会话（V4 模块 E）：历史由前端自持回传 */
  chat: (id: string, message: string, history: Array<{ role: string; content: string }>) =>
    request<{ reply: string }>(`/experts/${id}/chat`, { method: 'POST', body: JSON.stringify({ message, history }) }),
  /** 被委托记录：该专家作为 subagent 出现的 run 列表 */
  delegations: (id: string) => request<{ delegations: ExpertDelegation[] }>(`/experts/${id}/delegations`),
};

/** 子代理工具边界的中文标签（专家详情展示用） */
export const TOOL_BOUNDARY_LABEL: Record<string, string> = {
  search_library: '检索文献库',
  list_references: '列出文献',
  project_context: '读取项目概况',
  list_evidence: '读取证据链',
  save_evidence: '落证据卡',
  list_pending_evidence: '查看待裁决证据',
  list_notes: '读取笔记列表',
  read_note: '读取笔记',
};

export interface AutomationDef {
  id: string;
  name: string;
  prompt: string;
  scheduleType: 'interval' | 'daily';
  intervalMin: number;
  dailyHhmm: string;
  projectId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface AutomationBody {
  name: string;
  prompt: string;
  scheduleType: 'interval' | 'daily';
  intervalMin: number;
  dailyHhmm: string;
  projectId: string | null;
  enabled: boolean;
}

export const automationsApi = {
  list: () => request<{ automations: AutomationDef[] }>('/automations'),
  create: (body: AutomationBody) =>
    request<AutomationDef>('/automations', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: AutomationBody) =>
    request<AutomationDef>(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggle: (id: string) => request<AutomationDef>(`/automations/${id}/toggle`, { method: 'POST' }),
  remove: (id: string) => request<{ deleted: string }>(`/automations/${id}`, { method: 'DELETE' }),
  runNow: (id: string) => request<{ runId: string; status: string }>(`/automations/${id}/run`, { method: 'POST' }),
};
