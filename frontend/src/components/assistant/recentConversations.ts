/** 列出本机各项目范围里的近期对话，给侧栏用。 */

export interface RecentConversation {
  scope: string;
  sessionId: string;
  title: string;
  updatedAt: number;
}

export function listRecentConversations(
  keys: string[],
  storage: { getItem: (key: string) => string | null },
  limit = 12,
): RecentConversation[] {
  const items: RecentConversation[] = [];
  keys.filter((key) => key.indexOf('selenyx_chat_sessions_') === 0).forEach((key) => {
    const scope = key.slice('selenyx_chat_sessions_'.length);
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]') as Array<{
        id?: string;
        title?: string;
        messages?: unknown[];
        createdAt?: number;
        updatedAt?: number;
      }>;
      if (!Array.isArray(parsed)) return;
      parsed.forEach((session) => {
        if (!session.id || !session.messages || session.messages.length === 0) return;
        items.push({
          scope,
          sessionId: session.id,
          title: session.title || '未命名对话',
          updatedAt: session.updatedAt || session.createdAt || 0,
        });
      });
    } catch { /* skip bad keys */ }
  });
  return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export const CHAT_CHANGED_EVENT = 'selenyx-chat-changed';
