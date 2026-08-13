import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/appStore';
import { createEmptyNote } from '@apptypes/index';
import { projectApi } from '../api';
import { normalizeBackendProject, normalizeBackendTask } from '../workspaceRepository';
import { createWorkspaceBackupJson, parseWorkspaceBackup, restoreWorkspaceBackup } from '../workspaceBackup';

const initialStore = useAppStore.getState();

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState(initialStore, true);
});

function workspaceData() {
  return {
    currentView: 'dashboard',
    theme: 'mono',
    mode: 'light',
    density: 'comfortable',
    references: [{ id: 'ref-1' }],
    collections: [],
    tags: [],
    projects: [{ id: 'project-1' }],
    currentProjectId: 'project-1',
    tasks: [{ id: 'task-1', projectId: 'project-1' }],
    tables: [],
    customCountdowns: [{ label: '投稿截止', date: '2026-09-01', color: '#c7483b', projectId: 'project-1' }],
    llmConfig: { provider: 'openai', model: 'local-model', apiKey: 'must-not-leak' },
    pipelineRuns: {},
    stageConfigs: {},
    searchQuery: '',
    notes: [{ id: 'note-1' }],
    pendingNoteId: 'note-1',
  };
}

describe('workspace backup format', () => {
  it('exports a versioned snapshot without the LLM key', () => {
    const json = createWorkspaceBackupJson(workspaceData(), null);
    const backup = parseWorkspaceBackup(json);

    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.llmConfig).toEqual({ provider: 'openai', model: 'local-model' });
    expect(json).not.toContain('must-not-leak');
  });

  it('keeps v1 backups readable while normalizing broken selections', () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      data: { ...workspaceData(), currentProjectId: 'removed-project', pendingNoteId: 'removed-note' },
      chat: { selenyx_chat_global: '[]' },
    });
    const backup = parseWorkspaceBackup(legacy);

    expect(backup.schemaVersion).toBe(1);
    expect(backup.data.currentProjectId).toBeNull();
    expect(backup.data.pendingNoteId).toBeNull();
    expect(backup.chat).toEqual({ selenyx_chat_global: '[]' });
  });

  it('normalizes sparse legacy entities before a reader view can access them', () => {
    const backup = parseWorkspaceBackup(JSON.stringify({ data: workspaceData() }));
    const reference = (backup.data.references as Array<Record<string, unknown>>)[0];
    const project = (backup.data.projects as Array<Record<string, unknown>>)[0];

    expect(reference).toMatchObject({ title: '', doi: '', creators: [], tags: [], annotations: [] });
    expect(project).toMatchObject({ name: '', referenceIds: [], taskIds: [] });
    expect(backup.data.customCountdowns).toEqual([{
      label: '投稿截止', date: '2026-09-01', color: '#c7483b', projectId: 'project-1',
    }]);
  });

  it('rejects duplicate ids and tasks whose project is absent before any restore', () => {
    const duplicate = JSON.stringify({ data: { ...workspaceData(), references: [{ id: 'ref-1' }, { id: 'ref-1' }] } });
    const danglingTask = JSON.stringify({ data: { ...workspaceData(), tasks: [{ id: 'task-1', projectId: 'missing' }] } });

    expect(() => parseWorkspaceBackup(duplicate)).toThrow(/duplicate/i);
    expect(() => parseWorkspaceBackup(danglingTask)).toThrow(/missing project/i);
    expect(() => parseWorkspaceBackup('{}')).toThrow(/no Selenyx workspace data/i);
  });

  it('merges JSON data without deleting the current project or its evidence sidecar', async () => {
    const currentEvidenceProject = normalizeBackendProject({
      id: 'evidence-sidecar-project', name: 'Existing evidence', updatedAt: '2026-08-08T01:00:00Z',
    });
    const currentTask = normalizeBackendTask({
      id: 'existing-task', projectId: currentEvidenceProject.id, title: 'Preserve this task', updatedAt: '2026-08-08T01:00:00Z',
    });
    useAppStore.setState({
      projects: [currentEvidenceProject],
      tasks: [currentTask],
      currentProjectId: currentEvidenceProject.id,
    });
    const deleteSpy = vi.spyOn(projectApi, 'delete').mockResolvedValue({
      deleted: '', deletedTasks: 0, deletedEvidence: 0,
    });
    const upsertSpy = vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockResolvedValue({
      storedProjects: 2, storedTasks: 2, createdProjects: 1, updatedProjects: 1, createdTasks: 1, updatedTasks: 1,
    });

    await restoreWorkspaceBackup(JSON.stringify({ schemaVersion: 2, data: workspaceData(), chat: {} }), null);

    expect(useAppStore.getState().projects.map((item) => item.id)).toEqual(expect.arrayContaining([
      currentEvidenceProject.id,
      'project-1',
    ]));
    expect(useAppStore.getState().tasks.map((item) => item.id)).toEqual(expect.arrayContaining([
      currentTask.id,
      'task-1',
    ]));
    // DELETE /projects/:id cascades evidence, runs, and artifacts. Restore is
    // constrained to an upsert-only merge and therefore cannot erase them.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: currentEvidenceProject.id })]),
      expect.arrayContaining([expect.objectContaining({ id: currentTask.id })]),
    );
  });

  it('only supplements missing records and never rolls back matching local ids', async () => {
    const currentProject = normalizeBackendProject({
      id: 'project-1',
      name: 'Current project title',
      description: 'Current local description',
      tags: ['current-tag'],
      updatedAt: '2026-08-12T08:00:00Z',
    });
    const currentTask = normalizeBackendTask({
      id: 'task-1',
      projectId: currentProject.id,
      title: 'Current local task',
      tags: ['current-task-tag'],
      updatedAt: '2026-08-12T08:00:00Z',
    });
    const currentNote = createEmptyNote({
      id: 'note-1',
      title: 'Current note title',
      body: 'Current local note body',
      tags: ['current-note-tag'],
      updatedAt: '2026-08-12T08:00:00Z',
    });
    useAppStore.setState({
      projects: [currentProject],
      tasks: [currentTask],
      notes: [currentNote],
      currentProjectId: currentProject.id,
      pendingNoteId: currentNote.id,
    });
    vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockResolvedValue({
      storedProjects: 1, storedTasks: 1, createdProjects: 0, updatedProjects: 1, createdTasks: 0, updatedTasks: 1,
    });
    const oldBackup = {
      ...workspaceData(),
      projects: [{ id: 'project-1', name: 'Old backup title', description: 'Old backup description', tags: ['backup-tag'] }],
      tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Old backup task', tags: ['backup-task-tag'] }],
      notes: [{ id: 'note-1', title: 'Old backup note', body: 'Old backup note body', tags: ['backup-note-tag'] }],
    };

    await restoreWorkspaceBackup(JSON.stringify({ schemaVersion: 2, data: oldBackup, chat: {} }), null);

    const state = useAppStore.getState();
    expect(state.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'project-1', name: 'Current project title', description: 'Current local description' }),
    ]));
    expect(state.projects.find((item) => item.id === 'project-1')?.tags).toEqual(expect.arrayContaining(['current-tag', 'backup-tag']));
    expect(state.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'task-1', title: 'Current local task' }),
    ]));
    expect(state.tasks.find((item) => item.id === 'task-1')?.tags).toEqual(expect.arrayContaining(['current-task-tag', 'backup-task-tag']));
    expect(state.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'note-1', title: 'Current note title', body: 'Current local note body' }),
    ]));
    expect(state.notes.find((item) => item.id === 'note-1')?.tags).toEqual(expect.arrayContaining(['current-note-tag', 'backup-note-tag']));
    expect(state.currentProjectId).toBe(currentProject.id);
    expect(state.pendingNoteId).toBe(currentNote.id);
  });
});
