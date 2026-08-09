/**
 * Agent 任务 API — 本机后端 agent 自循环（plan→tool→observe→final）
 *
 * 运行记录持久化在后端 SQLite（AgentRun）；audit_log 每步增量落库，
 * 前端轮询详情即可看到实时步骤时间线。
 */

import { request } from './api';

export interface AgentRunSummary {
  id: string;
  goal: string;
  projectId: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentStep {
  step: number;
  kind: 'plan' | 'thought' | 'tool' | 'observation' | 'subagent' | 'review' | 'final' | 'error';
  ts: string;
  text?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  message?: string;
  items?: string[];
  critic?: string;
  expert?: string;
  error?: boolean;
}

export interface AgentRunDetail extends AgentRunSummary {
  outputText: string;
  auditLog: AgentStep[];
}

export const agentApi = {
  start: (goal: string, projectId: string | null, review = false) =>
    request<{ runId: string; status: string }>('/agent/runs', {
      method: 'POST',
      body: JSON.stringify({ goal, projectId, review }),
    }),
  list: () => request<{ runs: AgentRunSummary[] }>('/agent/runs'),
  get: (runId: string) => request<AgentRunDetail>(`/agent/runs/${runId}`),
  cancel: (runId: string) =>
    request<{ runId: string; status: string }>(`/agent/runs/${runId}/cancel`, { method: 'POST' }),
};
