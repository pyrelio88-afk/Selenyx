import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../appStore';

let savedState: ReturnType<typeof useAppStore.getState>;

beforeEach(() => {
  savedState = useAppStore.getState();
  useAppStore.setState({
    currentView: 'library',
    currentProjectId: 'project-a',
    pendingChatOpen: null,
    chatStreamBusy: false,
  });
});

afterEach(() => {
  useAppStore.setState(savedState);
});

describe('recent-chat navigation while streaming', () => {
  it.each(['project-b', 'global'])('preserves project, view and an existing pending request when opening %s while busy', (scope) => {
    const pendingChatOpen = { scope: 'project-a', sessionId: 'already-pending' };
    useAppStore.setState({ pendingChatOpen });
    useAppStore.getState().setChatStreamBusy(true);
    const before = useAppStore.getState();

    before.requestChatOpen(scope, 'next-chat');

    expect(useAppStore.getState()).toBe(before);
    expect(useAppStore.getState()).toMatchObject({
      currentProjectId: 'project-a',
      currentView: 'library',
      pendingChatOpen,
    });

    useAppStore.getState().setChatStreamBusy(false);
    // Rejected requests are not queued for later navigation.
    expect(useAppStore.getState().pendingChatOpen).toBe(pendingChatOpen);
    expect(useAppStore.getState().currentView).toBe('library');
    expect(useAppStore.getState().currentProjectId).toBe('project-a');
    useAppStore.getState().requestChatOpen(scope, 'next-chat');
    expect(useAppStore.getState()).toMatchObject({
      currentProjectId: scope === 'global' ? null : scope,
      currentView: 'newTask',
      pendingChatOpen: { scope, sessionId: 'next-chat' },
    });
  });

  it('does not create a pending request when none existed', () => {
    useAppStore.getState().setChatStreamBusy(true);
    useAppStore.getState().requestChatOpen('project-b', 'next-chat');
    expect(useAppStore.getState().pendingChatOpen).toBeNull();
  });

  it('does not block ordinary navigation or project selection', () => {
    useAppStore.getState().setChatStreamBusy(true);
    useAppStore.getState().setView('projects');
    useAppStore.getState().setCurrentProject('project-b');
    expect(useAppStore.getState()).toMatchObject({
      currentView: 'projects',
      currentProjectId: 'project-b',
      chatStreamBusy: true,
    });
  });

  it('never persists the stream-busy flag', () => {
    useAppStore.getState().setChatStreamBusy(true);
    const persisted = useAppStore.persist.getOptions().partialize!(useAppStore.getState());
    expect(persisted).not.toHaveProperty('chatStreamBusy');
    expect(useAppStore.getInitialState().chatStreamBusy).toBe(false);
  });
});
