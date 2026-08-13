import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KanbanTask, ResearchProject } from '@apptypes/index';
import { projectApi } from '../api';
import {
  bootstrapWorkspaceRepository,
  mergeMirroredWorkspace,
  mirrorWorkspace,
  normalizeBackendProject,
  normalizeBackendTask,
  reconcileWorkspace,
  removeMirroredProject,
} from '../workspaceRepository';

afterEach(() => {
  vi.restoreAllMocks();
});

function project(id: string, updatedAt: string, name: string): ResearchProject {
  return normalizeBackendProject({ id, updatedAt, name });
}

function task(id: string, projectId: string, updatedAt: string, title: string): KanbanTask {
  return normalizeBackendTask({ id, projectId, updatedAt, title });
}

describe('workspaceRepository', () => {
  it('normalizes legacy snake-case rows without changing stable ids', () => {
    const normalizedProject = normalizeBackendProject({
      id: 'project-1',
      name: 'Legacy project',
      current_stage: 'literature',
      updated_at: '2026-08-07T01:00:00Z',
    });
    const normalizedTask = normalizeBackendTask({
      id: 'task-1',
      project_id: 'project-1',
      due_date: '2026-08-10',
      sort_order: 7,
      updated_at: '2026-08-07T02:00:00Z',
    });

    expect(normalizedProject).toMatchObject({
      id: 'project-1', currentStage: 'literature', referenceIds: [], taskIds: [],
    });
    expect(normalizedTask).toMatchObject({
      id: 'task-1', projectId: 'project-1', dueDate: '2026-08-10', order: 7,
    });
  });

  it('merges projects and tasks by stable id, preferring SQLite on equal clocks', () => {
    const result = reconcileWorkspace(
      [project('project-1', '2026-08-07T03:00:00Z', 'new local')],
      [task('task-1', 'project-1', '2026-08-07T02:00:00Z', 'local tie')],
      [
        project('project-1', '2026-08-07T02:00:00Z', 'stale remote'),
        project('project-2', '2026-08-07T04:00:00Z', 'remote only'),
      ],
      [task('task-1', 'project-1', '2026-08-07T02:00:00Z', 'remote tie')],
    );

    expect(result.projects.find((item) => item.id === 'project-1')?.name).toBe('new local');
    expect(result.projects.find((item) => item.id === 'project-2')?.name).toBe('remote only');
    expect(result.tasks[0]?.title).toBe('remote tie');
  });

  it('refuses to hide a task whose project is absent', () => {
    expect(() => reconcileWorkspace(
      [],
      [task('task-1', 'missing', '2026-08-07T02:00:00Z', 'dangling')],
      [],
      [],
    )).toThrow('不存在的项目');
  });

  it('reports a degraded offline state when a queued mirror write fails', async () => {
    vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockRejectedValueOnce(new Error('sidecar offline'));
    const statuses: string[] = [];

    await mirrorWorkspace([], [], (status) => statuses.push(status));

    expect(statuses).toEqual(['syncing', 'offline']);
  });

  it('reports synced only after the backend acknowledges the mirror', async () => {
    vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockResolvedValueOnce({
      storedProjects: 0,
      storedTasks: 0,
      createdProjects: 0,
      updatedProjects: 0,
      createdTasks: 0,
      updatedTasks: 0,
    });
    const statuses: string[] = [];

    await mirrorWorkspace([], [], (status) => statuses.push(status));

    expect(statuses).toEqual(['syncing', 'synced']);
  });

  it('merges a JSON restore without deleting a project that can own evidence sidecars', async () => {
    const existingEvidenceProject = project('evidence-sidecar-project', '2026-08-08T01:00:00Z', 'Existing evidence');
    const importedProject = project('imported-project', '2026-08-08T02:00:00Z', 'Imported project');
    const deleteSpy = vi.spyOn(projectApi, 'delete').mockResolvedValue({
      deleted: '', deletedTasks: 0, deletedEvidence: 0,
    });
    const snapshotSpy = vi.spyOn(projectApi, 'workspaceSnapshot');
    const upsertSpy = vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockResolvedValue({
      storedProjects: 2, storedTasks: 0, createdProjects: 1, updatedProjects: 1, createdTasks: 0, updatedTasks: 0,
    });

    await mergeMirroredWorkspace([existingEvidenceProject, importedProject], []);

    // DELETE /projects/:id cascades evidence/runs/artifacts in the sidecar.
    // A JSON merge must only upsert and must not even inspect a snapshot to
    // decide which existing projects to remove.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledWith(
      [existingEvidenceProject, importedProject],
      [],
    );
  });

  it('replays an offline project deletion before startup reconciliation', async () => {
    const deleted = project('project-deleted', '2026-08-07T01:00:00Z', 'deleted offline');
    const deleteSpy = vi.spyOn(projectApi, 'delete').mockRejectedValueOnce(new Error('offline'));
    await removeMirroredProject(deleted.id);

    deleteSpy.mockResolvedValue({ deleted: deleted.id, deletedTasks: 0, deletedEvidence: 0 });
    vi.spyOn(projectApi, 'workspaceSnapshot').mockResolvedValue({
      projects: [deleted], tasks: [], projectCount: 1, taskCount: 0, payloadVersion: 1,
    });
    vi.spyOn(projectApi, 'bulkUpsertWorkspace').mockResolvedValue({
      storedProjects: 0, storedTasks: 0, createdProjects: 0, updatedProjects: 0, createdTasks: 0, updatedTasks: 0,
    });

    const result = await bootstrapWorkspaceRepository([], []);

    expect(deleteSpy).toHaveBeenCalledWith(deleted.id);
    expect(result.projects).toEqual([]);
  });
});
