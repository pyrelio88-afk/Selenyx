/**
 * Agent 任务 API — 本机后端 agent 自循环（plan→tool→observe→final）
 *
 * 运行记录持久化在后端 SQLite（AgentRun）；audit_log 每步增量落库。
 * V4 模块 D：SSE 事件流优先（/runs/{id}/events），轮询兜底；
 * 运行中干预：steer 插话 / plan 确认门 / 取消即时化。
 */

import { apiUrl, request } from './api';

export interface AgentRunSummary {
  id: string;
  goal: string;
  projectId: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | 'waiting_confirm' | string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentStep {
  step: number;
  kind: 'plan' | 'thought' | 'tool' | 'observation' | 'subagent' | 'review' | 'final' | 'error' | 'coverage' | 'steer' | 'waiting';
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

export interface RunArtifact {
  kind: 'note' | 'artifact';
  name: string;
  title?: string;
  path?: string;
}

export interface AgentRunDetail extends AgentRunSummary {
  outputText: string;
  auditLog: AgentStep[];
  artifacts?: RunArtifact[];
}

/** run 是否还在活动态（轮询/SSE 是否继续的依据）。 */
export function isActiveRun(status: string): boolean {
  return status === 'running' || status === 'cancelling' || status === 'waiting_confirm';
}

export const agentApi = {
  start: (goal: string, projectId: string | null, review = false, confirmPlan = false) =>
    request<{ runId: string; status: string }>('/agent/runs', {
      method: 'POST',
      body: JSON.stringify({ goal, projectId, review, confirmPlan }),
    }),
  list: () => request<{ runs: AgentRunSummary[] }>('/agent/runs'),
  get: (runId: string) => request<AgentRunDetail>(`/agent/runs/${runId}`),
  cancel: (runId: string) =>
    request<{ runId: string; status: string }>(`/agent/runs/${runId}/cancel`, { method: 'POST' }),
  /** 运行中插话：下一步顶部被 loop 消费，时间线显示为用户插话。 */
  steer: (runId: string, text: string) =>
    request<{ runId: string; queued: boolean }>(`/agent/runs/${runId}/steer`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  /** plan 确认门放行：adjustment 为空 = 按计划执行，非空 = 调整后执行。 */
  confirm: (runId: string, adjustment?: string) =>
    request<{ runId: string; status: string }>(`/agent/runs/${runId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ adjustment: adjustment ?? null }),
    }),
};

export interface RunEventHandlers {
  /** 任一实时事件到达（thought/tool_call/tool_result/plan/review/final/error/coverage/steer/waiting）。 */
  onEvent?: (name: string, data: Record<string, unknown>) => void;
  /** run 终态（completed/failed/cancelled）。 */
  onStatus?: (status: string, output: string) => void;
  /** 连接层错误（EventSource 断线等）——调用方据此回退轮询。 */
  onError?: () => void;
}

const SSE_EVENT_NAMES = [
  'snapshot',
  'thought',
  'tool_call',
  'tool_result',
  'plan',
  'review',
  'final',
  'error',
  'coverage',
  'subagent',
  'steer',
  'waiting',
  'status',
];

/**
 * 订阅 run 的 SSE 事件流；返回关闭函数。
 * 事件到达即回调（数据仍需以 GET /runs/{id} 为真相源刷新），
 * 连接出错由 onError 通知调用方回退轮询。
 */
export function subscribeRunEvents(runId: string, handlers: RunEventHandlers): () => void {
  const source = new EventSource(apiUrl(`/agent/runs/${runId}/events`));
  const parse = (raw: string): Record<string, unknown> => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  for (const name of SSE_EVENT_NAMES) {
    source.addEventListener(name, (ev) => {
      const data = parse((ev as MessageEvent).data as string);
      if (name === 'status') {
        handlers.onStatus?.(String(data.status ?? ''), String(data.output ?? ''));
        source.close();
        return;
      }
      handlers.onEvent?.(name, data);
    });
  }
  source.onerror = () => {
    handlers.onError?.();
  };
  return () => source.close();
}
