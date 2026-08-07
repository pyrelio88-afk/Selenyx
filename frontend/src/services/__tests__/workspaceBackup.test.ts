import { describe, expect, it } from 'vitest';
import { createWorkspaceBackupJson, parseWorkspaceBackup } from '../workspaceBackup';

function workspaceData() {
  return {
    currentView: 'dashboard',
    theme: 'paper-green',
    mode: 'light',
    density: 'comfortable',
    references: [{ id: 'ref-1' }],
    collections: [],
    tags: [],
    projects: [{ id: 'project-1' }],
    currentProjectId: 'project-1',
    tasks: [{ id: 'task-1', projectId: 'project-1' }],
    tables: [],
    customCountdowns: [],
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
  });

  it('rejects duplicate ids and tasks whose project is absent before any restore', () => {
    const duplicate = JSON.stringify({ data: { ...workspaceData(), references: [{ id: 'ref-1' }, { id: 'ref-1' }] } });
    const danglingTask = JSON.stringify({ data: { ...workspaceData(), tasks: [{ id: 'task-1', projectId: 'missing' }] } });

    expect(() => parseWorkspaceBackup(duplicate)).toThrow(/duplicate/i);
    expect(() => parseWorkspaceBackup(danglingTask)).toThrow(/missing project/i);
    expect(() => parseWorkspaceBackup('{}')).toThrow(/no Selenyx workspace data/i);
  });
});
