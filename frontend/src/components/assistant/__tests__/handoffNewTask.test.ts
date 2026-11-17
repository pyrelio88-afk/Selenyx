import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, Fragment, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as appStore from '@stores/appStore';
import type { ResearchProject } from '@apptypes/project';
import { AIChatView } from '../../views/AIChatView';
import * as newTaskHome from '../../views/NewTaskHome';
import * as streamController from '../StreamController';
import { createEmptySession } from '../chatShared';
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

describe('AIChatView home and draft handoff', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStore());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens a global research run without manufacturing a chat or overwriting project drafts', () => {
    const project: ResearchProject = {
      id: 'proj-1', name: '原项目', description: '', currentStage: 'problem',
      tags: [], referenceIds: [], taskIds: [], status: 'active',
      startDate: null, endDate: null, createdAt: '', updatedAt: '',
    };
    const state = {
      ...appStore.useAppStore.getState(),
      projects: [project],
      currentProjectId: project.id as string | null,
      chatSurfaceMode: 'home' as const,
      pendingChatDraft: null,
    };
    state.setCurrentProject = vi.fn((projectId: string | null) => { state.currentProjectId = projectId; });
    state.requestRunFocus = vi.fn();
    vi.spyOn(appStore, 'useAppStore').mockImplementation(() => state);
    const watch = vi.spyOn(streamController, 'watchRunOutput').mockReturnValue(() => undefined);
    let onStarted: NonNullable<ComponentProps<typeof newTaskHome.NewTaskHome>>['onStarted'];
    const home = vi.spyOn(newTaskHome, 'NewTaskHome').mockImplementation((props) => {
      onStarted = props?.onStarted;
      return createElement(Fragment);
    });
    const projectSessions = JSON.stringify([createEmptySession('保留项目草稿', 1, 'project-draft')]);
    localStorage.setItem('selenyx_chat_sessions_proj-1', projectSessions);
    localStorage.setItem('selenyx_chat_active_proj-1', 'project-draft');

    renderToStaticMarkup(createElement(AIChatView));
    expect(onStarted).toBeTypeOf('function');
    onStarted!('run-global', null);

    expect(state.setCurrentProject).toHaveBeenCalledWith(null);
    expect(state.currentProjectId).toBeNull();
    expect(state.requestRunFocus).toHaveBeenCalledWith('run-global');
    expect(watch).not.toHaveBeenCalled();
    expect(loadPendingRunBacklinks(localStorage)).toEqual([]);
    expect(localStorage.getItem('selenyx_chat_sessions_global')).toBeNull();
    expect(home).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('selenyx_chat_sessions_proj-1')).toBe(projectSessions);
    expect(localStorage.getItem('selenyx_chat_active_proj-1')).toBe('project-draft');
  });

  it('switches into chat surface mode when requestChatDraft is invoked', () => {
    appStore.useAppStore.setState({ currentView: 'extensions', chatSurfaceMode: 'home', pendingChatDraft: null, chatStreamBusy: false });
    appStore.useAppStore.getState().requestChatDraft('请帮我审查方法学偏倚', '专家 · 论文批评员');

    const next = appStore.useAppStore.getState();
    expect(next.currentView).toBe('newTask');
    expect(next.chatSurfaceMode).toBe('chat');
    expect(next.pendingChatDraft).toEqual({
      prompt: '请帮我审查方法学偏倚',
      title: '专家 · 论文批评员',
    });
  });
});
