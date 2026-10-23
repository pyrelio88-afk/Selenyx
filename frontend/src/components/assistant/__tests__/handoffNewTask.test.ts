import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, Fragment, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as appStore from '@stores/appStore';
import type { ResearchProject } from '@apptypes/project';
import { AIChatView } from '../../views/AIChatView';
import * as newTaskHome from '../../views/NewTaskHome';
import * as streamController from '../StreamController';
import { handoffNewTaskToAssistant } from '../handoffNewTask';
import { createEmptySession, loadSessions } from '../chatShared';
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

describe('handoffNewTaskToAssistant', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStore());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a scoped session and run backlink without sending chat text to the backend', () => {
    handoffNewTaskToAssistant('盘点当前项目的证据链', 'proj-1', 'run-9');
    const loaded = loadSessions('proj-1');
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].messages[0].content).toBe('盘点当前项目的证据链');
    expect(loaded.activeId).toBe(loaded.sessions[0].id);
    const links = loadPendingRunBacklinks(localStorage);
    expect(links).toEqual([{ runId: 'run-9', sessionId: loaded.sessions[0].id, scope: 'proj-1' }]);
  });

  it('opens a global research run without manufacturing a chat or overwriting project drafts', () => {
    const project: ResearchProject = {
      id: 'proj-1', name: '原项目', description: '', currentStage: 'problem',
      tags: [], referenceIds: [], taskIds: [], status: 'active',
      startDate: null, endDate: null, createdAt: '', updatedAt: '',
    };
    const state = { ...appStore.useAppStore.getState(), projects: [project], currentProjectId: project.id as string | null };
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
});
