/** 新建任务提交后交接到助理：本机会话 + run 回贴，不把对话正文送后端。 */

import { persistChatSessions } from '@services/chatSessionStorage';
import { registerRunBacklink } from './chatRunBacklinks';
import { loadSessions, titleFrom, uid, type Msg, type Session } from './chatShared';

export function handoffNewTaskToAssistant(goal: string, projectId: string | null, runId: string): void {
  const scope = projectId || 'global';
  const now = Date.now();
  const userMessage: Msg = { role: 'user', content: goal, ts: now };
  const session: Session = {
    id: uid(),
    title: titleFrom(goal),
    messages: [userMessage],
    createdAt: now,
    updatedAt: now,
  };
  const loaded = loadSessions(scope);
  persistChatSessions(localStorage, scope, scope, [session, ...loaded.sessions], session.id);
  registerRunBacklink(localStorage, { runId, sessionId: session.id, scope });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('selenyx-chat-changed'));
}
