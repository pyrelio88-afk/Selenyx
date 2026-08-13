import { describe, expect, it } from 'vitest';
import { listRecentConversations } from '../recentConversations';

describe('listRecentConversations', () => {
  it('returns titled sessions with messages, newest first', () => {
    const storage = {
      getItem: () => JSON.stringify([
        { id: 'old', title: '旧对话', messages: [{ role: 'user', content: 'a' }], createdAt: 1, updatedAt: 10 },
        { id: 'new', title: '新对话', messages: [{ role: 'user', content: 'b' }], createdAt: 2, updatedAt: 20 },
      ]),
    };
    const listed = listRecentConversations(['selenyx_chat_sessions_global'], storage);
    expect(listed.map((item) => item.title)).toEqual(['新对话', '旧对话']);
  });
});
