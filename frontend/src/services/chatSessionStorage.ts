/**
 * Storage boundary for project-scoped AI conversations.
 *
 * React renders once with the previous state when a project scope changes.
 * Guarding writes with the scope that loaded the state prevents that transient
 * render from overwriting another project's conversation history.
 */

export type ChatSessionStorage = Pick<Storage, 'setItem' | 'removeItem'>;

export function persistChatSessions(
  storage: ChatSessionStorage,
  stateScope: string,
  currentScope: string,
  sessions: unknown,
  activeId: string | null,
): boolean {
  if (stateScope !== currentScope) return false;

  storage.setItem(`selenyx_chat_sessions_${currentScope}`, JSON.stringify(sessions));
  if (activeId) {
    storage.setItem(`selenyx_chat_active_${currentScope}`, activeId);
  } else {
    storage.removeItem(`selenyx_chat_active_${currentScope}`);
  }
  return true;
}
