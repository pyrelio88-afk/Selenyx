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
}

export const expertsApi = {
  list: () => request<{ experts: ExpertDef[] }>('/experts'),
  create: (body: { name: string; tagline: string; systemPrompt: string }) =>
    request<ExpertDef>('/experts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name: string; tagline: string; systemPrompt: string }) =>
    request<ExpertDef>(`/experts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => request<{ deleted: string }>(`/experts/${id}`, { method: 'DELETE' }),
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
