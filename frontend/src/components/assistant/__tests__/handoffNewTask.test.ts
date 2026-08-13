import { describe, expect, it, beforeEach } from 'vitest';
import { handoffNewTaskToAssistant } from '../handoffNewTask';
import { loadSessions } from '../chatShared';
import { loadPendingRunBacklinks } from '../chatRunBacklinks';

function makeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

describe('handoffNewTaskToAssistant', () => {
  beforeEach(() => {
    // @ts-expect-error node 测试无 DOM
    globalThis.localStorage = makeStore();
  });

  it('creates a scoped session and run backlink without sending chat text to the backend', () => {
    handoffNewTaskToAssistant('盘点当前项目的证据链', 'proj-1', 'run-9');
    const loaded = loadSessions('proj-1');
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].messages[0].content).toBe('盘点当前项目的证据链');
    expect(loaded.activeId).toBe(loaded.sessions[0].id);
    const links = loadPendingRunBacklinks(localStorage);
    expect(links).toEqual([{ runId: 'run-9', sessionId: loaded.sessions[0].id, scope: 'proj-1' }]);
  });
});
