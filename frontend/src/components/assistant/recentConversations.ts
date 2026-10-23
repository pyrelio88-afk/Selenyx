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
      const parsed: unknown = JSON.parse(storage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return;
      parsed.forEach((row: unknown) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        const session = row as Record<string, unknown>;
        if (typeof session.id !== 'string' || !session.id.trim()) return;
        if (!Array.isArray(session.messages) || session.messages.length === 0) return;
        const updatedAt = typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt) ? session.updatedAt : 0;
        const createdAt = typeof session.createdAt === 'number' && Number.isFinite(session.createdAt) ? session.createdAt : 0;
        items.push({
          scope,
          sessionId: session.id,
          title: typeof session.title === 'string' && session.title.trim() ? session.title : '未命名对话',
          updatedAt: updatedAt || createdAt || 0,
        });
      });
    } catch { /* skip bad keys */ }
  });
  return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export const CHAT_CHANGED_EVENT = 'selenyx-chat-changed';
