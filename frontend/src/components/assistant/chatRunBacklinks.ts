/**
 * Persisted bridge between an agent run and the browser-local chat session
 * that created it. Agent runs live in SQLite; chat sessions deliberately stay
 * local to the workspace, so the bridge records only opaque IDs and never
 * sends conversation text to the backend.
 */

import type { AgentRunDetail } from '@services/agent';
import type { Msg, Session } from './chatShared';
import type { PendingRunBacklink } from './StreamController';

const RUN_BACKLINKS_KEY = 'selenyx_chat_run_backlinks';

export type ChatBacklinkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isLink(value: unknown): value is PendingRunBacklink {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.runId === 'string'
    && typeof candidate.sessionId === 'string'
    && typeof candidate.scope === 'string';
}

export function loadPendingRunBacklinks(storage: Pick<Storage, 'getItem'>): PendingRunBacklink[] {
  try {
    const raw = storage.getItem(RUN_BACKLINKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLink) : [];
  } catch {
    return [];
  }
}

export function registerRunBacklink(storage: Pick<Storage, 'getItem' | 'setItem'>, link: PendingRunBacklink): void {
  const existing = loadPendingRunBacklinks(storage).filter((item) => item.runId !== link.runId);
  storage.setItem(RUN_BACKLINKS_KEY, JSON.stringify([...existing, link]));
}

export function removeRunBacklink(storage: ChatBacklinkStorage, runId: string): void {
  const remaining = loadPendingRunBacklinks(storage).filter((item) => item.runId !== runId);
  if (remaining.length) storage.setItem(RUN_BACKLINKS_KEY, JSON.stringify(remaining));
  else storage.removeItem(RUN_BACKLINKS_KEY);
}

export function runOutputMessage(run: AgentRunDetail): Msg {
  const terminalLabel = run.status === 'completed'
    ? '已完成'
    : run.status === 'cancelled'
      ? '已取消'
      : '执行失败';
  const body = run.outputText.trim() || (run.status === 'completed'
    ? '任务已经结束，但没有返回可回贴的正文。'
    : '任务没有生成可回贴的结果。可打开任务详情查看运行时间线。');
  return {
    role: 'assistant',
    content: `任务「${run.goal}」${terminalLabel}：\n\n${body}`,
    ts: run.completedAt ? Date.parse(run.completedAt) || Date.now() : Date.now(),
    model: 'agent',
    error: run.status !== 'completed',
    runId: run.id,
  };
}

export function appendRunOutputToSessions(
  sessions: Session[],
  sessionId: string,
  run: AgentRunDetail,
): { sessions: Session[]; message: Msg | null; status: 'appended' | 'duplicate' | 'missing' } {
  const source = sessions.find((session) => session.id === sessionId);
  if (!source) return { sessions, message: null, status: 'missing' };
  if (source.messages.some((message) => message.runId === run.id)) return { sessions, message: null, status: 'duplicate' };
  const message = runOutputMessage(run);
  return {
    sessions: sessions.map((session) => (
      session.id === sessionId
        ? { ...session, messages: [...session.messages, message], updatedAt: message.ts }
        : session
    )),
    message,
    status: 'appended',
  };
}

function loadSessions(storage: Pick<Storage, 'getItem'>, scope: string): Session[] | null {
  try {
    const raw = storage.getItem(`selenyx_chat_sessions_${scope}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Session[] : null;
  } catch {
    return null;
  }
}

/**
 * Writes a terminal run output into its source session. `fallbackSessions`
 * covers a newly-created session before React's persistence effect has had a
 * chance to flush it to localStorage.
 */
export function appendRunOutputToStorage(
  storage: ChatBacklinkStorage,
  link: PendingRunBacklink,
  run: AgentRunDetail,
  fallbackSessions: Session[] = [],
): { sessions: Session[]; message: Msg | null; status: 'appended' | 'duplicate' | 'missing' } {
  const persisted = loadSessions(storage, link.scope);
  // A run can finish before React's persistence effect flushes a just-created
  // session (or its most recent user message). Prefer the current in-memory
  // scope whenever it contains the source, then fall back to stored sessions
  // after a reload or project switch.
  const sourceSessions = fallbackSessions.some((session) => session.id === link.sessionId)
    ? fallbackSessions
    : (persisted ?? fallbackSessions);
  const result = appendRunOutputToSessions(sourceSessions, link.sessionId, run);
  if (result.message) {
    storage.setItem(`selenyx_chat_sessions_${link.scope}`, JSON.stringify(result.sessions));
  }
  return result;
}

/**
 * Resolve terminal links in parallel when the assistant page is reopened.
 * Active links are left intact so a later live watcher or subsequent visit
 * can continue tracking them.
 */
export async function resolveTerminalRunBacklinks(
  links: PendingRunBacklink[],
  getRun: (runId: string) => Promise<AgentRunDetail>,
): Promise<Array<{ link: PendingRunBacklink; run: AgentRunDetail }>> {
  const results = await Promise.all(links.map(async (link) => {
    try {
      const run = await getRun(link.runId);
      return isActiveRunStatus(run.status) ? null : { link, run };
    } catch {
      return null;
    }
  }));
  return results.filter((result): result is { link: PendingRunBacklink; run: AgentRunDetail } => result !== null);
}

function isActiveRunStatus(status: string): boolean {
  return status === 'running' || status === 'cancelling' || status === 'waiting_confirm';
}
