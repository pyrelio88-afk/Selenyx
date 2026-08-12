import { describe, expect, it } from 'vitest';
import type { AgentRunDetail } from '@services/agent';
import {
  appendRunOutputToStorage,
  loadPendingRunBacklinks,
  registerRunBacklink,
  resolveTerminalRunBacklinks,
} from './chatRunBacklinks';
import type { PendingRunBacklink } from './StreamController';
import type { Session } from './chatShared';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function run(overrides: Partial<AgentRunDetail> = {}): AgentRunDetail {
  return {
    id: 'run-1',
    goal: '整理术后谵妄预防证据',
    projectId: 'project-a',
    status: 'completed',
    startedAt: '2026-08-11T10:00:00Z',
    completedAt: '2026-08-11T10:02:00Z',
    outputText: '已整理出可执行的检索与证据分级方案。',
    auditLog: [],
    artifacts: [],
    ...overrides,
  };
}

function session(): Session {
  return {
    id: 'session-a',
    title: '谵妄预防',
    createdAt: 1,
    updatedAt: 1,
    messages: [{ role: 'user', content: '请帮我整理术后谵妄预防证据', ts: 1 }],
  };
}

const link: PendingRunBacklink = { runId: 'run-1', sessionId: 'session-a', scope: 'project-a' };

describe('assistant run backlinks', () => {
  it('stores an opaque source link and appends the real terminal output once', () => {
    const storage = memoryStorage();
    storage.setItem('selenyx_chat_sessions_project-a', JSON.stringify([session()]));
    registerRunBacklink(storage, link);

    expect(loadPendingRunBacklinks(storage)).toEqual([link]);

    const appended = appendRunOutputToStorage(storage, link, run());
    expect(appended.status).toBe('appended');
    expect(appended.message?.runId).toBe('run-1');
    expect(appended.message?.content).toContain('可执行的检索与证据分级方案');

    const duplicate = appendRunOutputToStorage(storage, link, run());
    expect(duplicate.status).toBe('duplicate');
    const stored = JSON.parse(storage.getItem('selenyx_chat_sessions_project-a') ?? '[]') as Session[];
    expect(stored[0].messages).toHaveLength(2);
    expect(stored[0].messages[1].runId).toBe('run-1');
  });

  it('uses the current source session when persistence has not flushed it yet', () => {
    const storage = memoryStorage();
    storage.setItem('selenyx_chat_sessions_project-a', JSON.stringify([]));

    const appended = appendRunOutputToStorage(storage, link, run(), [session()]);

    expect(appended.status).toBe('appended');
    const stored = JSON.parse(storage.getItem('selenyx_chat_sessions_project-a') ?? '[]') as Session[];
    expect(stored[0].id).toBe('session-a');
    expect(stored[0].messages[1].runId).toBe('run-1');
  });

  it('resolves terminal links in parallel and leaves active runs for a watcher', async () => {
    const activeLink: PendingRunBacklink = { runId: 'run-active', sessionId: 'session-a', scope: 'project-a' };
    const resolved = await resolveTerminalRunBacklinks([link, activeLink], async (runId) => (
      runId === 'run-active' ? run({ id: runId, status: 'running', completedAt: null }) : run()
    ));

    expect(resolved).toHaveLength(1);
    expect(resolved[0].link).toEqual(link);
    expect(resolved[0].run.status).toBe('completed');
  });
});
