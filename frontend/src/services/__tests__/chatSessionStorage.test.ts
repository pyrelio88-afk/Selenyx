import { describe, expect, it } from 'vitest';
import { persistChatSessions } from '../chatSessionStorage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('project-scoped chat storage', () => {
  it('never writes the previous project state into the newly selected project', () => {
    const storage = memoryStorage();
    storage.values.set('selenyx_chat_sessions_project-b', '["project-b"]');

    const wrote = persistChatSessions(storage, 'project-a', 'project-b', ['project-a'], 'session-a');

    expect(wrote).toBe(false);
    expect(storage.values.get('selenyx_chat_sessions_project-b')).toBe('["project-b"]');
    expect(storage.values.has('selenyx_chat_active_project-b')).toBe(false);
  });

  it('writes only the loaded scope and removes an obsolete active-session key', () => {
    const storage = memoryStorage();
    storage.values.set('selenyx_chat_active_project-a', 'old');

    const wrote = persistChatSessions(storage, 'project-a', 'project-a', [{ id: 'a' }], null);

    expect(wrote).toBe(true);
    expect(storage.values.get('selenyx_chat_sessions_project-a')).toBe('[{"id":"a"}]');
    expect(storage.values.has('selenyx_chat_active_project-a')).toBe(false);
  });
});
