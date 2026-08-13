import { describe, expect, it } from 'vitest';
import { createEmptySession, prependFreshSession, type Session } from '../chatShared';

describe('new task conversation launch', () => {
  it('creates and selects a fresh empty session instead of restoring an older draft', () => {
    const oldDraft: Session = createEmptySession('旧草稿', 1, 'old-draft');
    const previous: Session = {
      id: 'previous',
      title: '已有对话',
      messages: [{ role: 'user', content: '保留既有内容', ts: 2 }],
      createdAt: 2,
      updatedAt: 2,
    };
    const fresh = createEmptySession('新对话', 3, 'fresh-launch');

    const next = prependFreshSession([oldDraft, previous], fresh);

    expect(next.activeId).toBe('fresh-launch');
    expect(next.sessions).toEqual([fresh, oldDraft, previous]);
    expect(next.sessions[0]?.messages).toEqual([]);
  });
});
