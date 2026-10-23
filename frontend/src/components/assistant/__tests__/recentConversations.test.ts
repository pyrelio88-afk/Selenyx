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

  it.each(['{broken', 'null', '{}', '42', 'true', '"text"'])('ignores malformed or non-array JSON: %s', (raw) => {
    const data = new Map([
      ['selenyx_chat_sessions_bad', raw],
      ['selenyx_chat_sessions_global', JSON.stringify([{ id: 'valid', messages: [{}] }])],
    ]);
    const before = [...data];
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    };

    expect(listRecentConversations([...data.keys()], storage)).toEqual([
      { scope: 'global', sessionId: 'valid', title: '未命名对话', updatedAt: 0 },
    ]);
    expect([...data]).toEqual(before);
  });

  it.each([
    null, false, 42, 'row', [], {},
    ...[undefined, null, {}, [], 42, true, '', ' \t'].map((id) => ({ id, messages: [{}] })),
    ...[undefined, null, {}, { length: 1 }, 'message', 42, []].map((messages) => ({ id: 'bad', messages })),
  ].map((row) => [row] as const))('skips invalid rows without losing valid neighbors: %j', (row) => {
    const raw = JSON.stringify([
      { id: 'before', title: '前', messages: [{}], updatedAt: 10 },
      row,
      { id: 'after', title: '后', messages: [{}], updatedAt: 20 },
    ]);
    expect(listRecentConversations(['selenyx_chat_sessions_proj-1'], { getItem: () => raw })).toEqual([
      { scope: 'proj-1', sessionId: 'after', title: '后', updatedAt: 20 },
      { scope: 'proj-1', sessionId: 'before', title: '前', updatedAt: 10 },
    ]);
  });

  it.each([undefined, null, {}, [], 42, true, '', ' \n\t'].map((title) => [title] as const))('uses a safe fallback for title %j', (title) => {
    const raw = JSON.stringify([{ id: 'valid', title, messages: [{}] }]);
    expect(listRecentConversations(['selenyx_chat_sessions_global'], { getItem: () => raw })).toEqual([
      { scope: 'global', sessionId: 'valid', title: '未命名对话', updatedAt: 0 },
    ]);
  });

  it.each([
    ['"updatedAt": 20, "createdAt": 10', 20],
    ['"createdAt": 10', 10],
    ['"updatedAt": 0, "createdAt": 10', 10],
    ['"updatedAt": -2.5, "createdAt": 10', -2.5],
    ['"updatedAt": "20", "createdAt": 10', 10],
    ['"updatedAt": {}, "createdAt": 10', 10],
    ['"updatedAt": [], "createdAt": 10', 10],
    ['"updatedAt": true, "createdAt": 10', 10],
    ['"updatedAt": null, "createdAt": 10', 10],
    ['"updatedAt": 1e400, "createdAt": 10', 10],
    ['"updatedAt": -1e400, "createdAt": 10', 10],
    ['"createdAt": "10"', 0],
    ['"createdAt": {}', 0],
    ['"createdAt": []', 0],
    ['"createdAt": true', 0],
    ['"createdAt": null', 0],
    ['"createdAt": 1e400', 0],
    ['"createdAt": -1e400', 0],
    ['"updatedAt": 1e400, "createdAt": -1e400', 0],
    ['"updatedAt": 0, "createdAt": 0', 0],
  ])('uses only finite numeric timestamps: %s', (fields, expected) => {
    // Overflowing JSON numbers parse as Infinity; JSON.stringify would turn them into null.
    const raw = `[{"id":"valid","messages":[{}],${fields}}]`;
    expect(listRecentConversations(['selenyx_chat_sessions_global'], { getItem: () => raw })[0]?.updatedAt).toBe(expected);
  });

  it('preserves valid strings, key filtering, stable ordering and the limit across scopes', () => {
    const data: Record<string, string> = {
      unrelated: JSON.stringify([{ id: 'ignored', messages: [{}], updatedAt: 100 }]),
      selenyx_chat_sessions_global: JSON.stringify([
        { id: ' spaced-id ', title: ' 保留标题 ', messages: [{}], updatedAt: 30 },
        { id: 'empty', messages: [], updatedAt: 100 },
        { id: 'old', messages: [{}], createdAt: 1 },
      ]),
      selenyx_chat_sessions_project: JSON.stringify([
        { id: 'tied', title: '同一时间', messages: [{}], updatedAt: 30 },
        { id: 'newest', title: '最新', messages: [{}], updatedAt: 40 },
      ]),
    };
    expect(listRecentConversations(Object.keys(data), { getItem: (key) => data[key] }, 3)).toEqual([
      { scope: 'project', sessionId: 'newest', title: '最新', updatedAt: 40 },
      { scope: 'global', sessionId: ' spaced-id ', title: ' 保留标题 ', updatedAt: 30 },
      { scope: 'project', sessionId: 'tied', title: '同一时间', updatedAt: 30 },
    ]);
  });
});
