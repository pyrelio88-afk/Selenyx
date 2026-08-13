import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResearchProject } from '@apptypes/project';
import { useAppStore } from '../appStore';

const project = (id: string): ResearchProject => ({
  id,
  name: id,
  description: '',
  currentStage: 'problem',
  tags: [],
  referenceIds: [],
  taskIds: [],
  status: 'planning',
  startDate: null,
  endDate: null,
  createdAt: '2026-08-12T00:00:00Z',
  updatedAt: '2026-08-12T00:00:00Z',
});

let savedCountdowns: ReturnType<typeof useAppStore.getState>['customCountdowns'];
let savedProjects: ReturnType<typeof useAppStore.getState>['projects'];

beforeEach(() => {
  const state = useAppStore.getState();
  savedCountdowns = state.customCountdowns;
  savedProjects = state.projects;
  useAppStore.setState({
    projects: [project('project-a'), project('project-b')],
    customCountdowns: [
      { label: '项目 A 截稿', date: '2026-09-01', color: '#c7483b', projectId: 'project-a' },
      { label: '旧数据', date: '2026-09-02', color: '#c7483b', projectId: null },
      { label: '项目 B 答辩', date: '2026-09-03', color: '#c7483b', projectId: 'project-b' },
    ],
  });
});

afterEach(() => {
  useAppStore.setState({ projects: savedProjects, customCountdowns: savedCountdowns });
});

describe('project-scoped countdowns', () => {
  it('removes only the deleted project’s dates and preserves legacy dates', () => {
    useAppStore.getState().deleteProject('project-a');

    expect(useAppStore.getState().customCountdowns.map((item) => item.label)).toEqual(['旧数据', '项目 B 答辩']);
  });
});
