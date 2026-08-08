/**
 * Local-first project/task persistence.
 *
 * Zustand is the responsive offline cache. SQLite is a second durable local
 * copy when the sidecar is reachable. Projects and tasks are reconciled as one
 * unit so a task is never uploaded without its parent project.
 */

import type { KanbanTask, PipelineStageKey, ResearchProject } from '@apptypes/index';
import { projectApi } from './api';

export type WorkspaceSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface WorkspaceBootstrapResult {
  projects: ResearchProject[];
  tasks: KanbanTask[];
  status: WorkspaceSyncStatus;
  message: string;
}

// A local deletion must outlive an unavailable sidecar. Without this marker,
// startup's conservative union reconciliation would resurrect a project the
// user deleted while SQLite was offline.
const DELETED_PROJECT_KEY = 'selenyx-deleted-project-ids';
const RESTORED_PROJECT_IDS_KEY = 'selenyx-restored-project-ids';
const volatileStringSets = new Map<string, string[]>();

function readStringSet(key: string): string[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return volatileStringSets.get(key) ?? null;
    const decoded: unknown = JSON.parse(raw);
    return Array.isArray(decoded)
      ? [...new Set(decoded.filter((id): id is string => typeof id === 'string' && Boolean(id)))]
      : null;
  } catch {
    return volatileStringSets.get(key) ?? null;
  }
}

function writeStringSet(key: string, ids: string[]): void {
  const unique = [...new Set(ids)];
  volatileStringSets.set(key, unique);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(unique));
  } catch {
    // The current Zustand mutation remains correct even if browser storage is
    // disabled. The next online delete will still repair SQLite.
  }
}

function clearStringSet(key: string): void {
  volatileStringSets.delete(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Best effort only; retaining an intent is safer than losing it.
  }
}

function readDeletedProjectIds(): string[] {
  return readStringSet(DELETED_PROJECT_KEY) ?? [];
}

function rememberDeletedProject(id: string): void {
  writeStringSet(DELETED_PROJECT_KEY, [...readDeletedProjectIds(), id]);
}

function forgetDeletedProject(id: string): void {
  writeStringSet(DELETED_PROJECT_KEY, readDeletedProjectIds().filter((candidate) => candidate !== id));
}

function rememberAuthoritativeRestore(projects: ResearchProject[]): void {
  // An empty list is meaningful: restoring an empty backup must not bring
  // every old SQLite project back on the next online launch.
  writeStringSet(RESTORED_PROJECT_IDS_KEY, projects.map((project) => project.id));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBackendProject(value: Partial<ResearchProject> & Record<string, unknown>): ResearchProject {
  const now = new Date().toISOString();
  return {
    ...value,
    id: text(value.id),
    name: text(value.name),
    description: text(value.description),
    currentStage: (text(value.currentStage ?? value.current_stage) || 'problem') as PipelineStageKey,
    frameworkId: text(value.frameworkId) || undefined,
    pico: value.pico && typeof value.pico === 'object' ? value.pico : undefined,
    tags: array<string>(value.tags),
    sbar: value.sbar && typeof value.sbar === 'object' ? value.sbar : undefined,
    referenceIds: array<string>(value.referenceIds),
    taskIds: array<string>(value.taskIds),
    status: (text(value.status) || 'planning') as ResearchProject['status'],
    startDate: nullableText(value.startDate ?? value.start_date),
    endDate: nullableText(value.endDate ?? value.end_date),
    createdAt: text(value.createdAt ?? value.created_at) || now,
    updatedAt: text(value.updatedAt ?? value.updated_at) || now,
  };
}

export function normalizeBackendTask(value: Partial<KanbanTask> & Record<string, unknown>): KanbanTask {
  const now = new Date().toISOString();
  const order = value.order ?? value.sort_order;
  return {
    ...value,
    id: text(value.id),
    projectId: text(value.projectId ?? value.project_id),
    title: text(value.title),
    description: text(value.description),
    column: (text(value.column) || 'todo') as KanbanTask['column'],
    stage: (text(value.stage) || 'problem') as PipelineStageKey,
    assignee: text(value.assignee),
    priority: (text(value.priority) || 'medium') as KanbanTask['priority'],
    dueDate: nullableText(value.dueDate ?? value.due_date),
    tags: array<string>(value.tags),
    order: typeof order === 'number' && Number.isFinite(order) ? order : 0,
    createdAt: text(value.createdAt ?? value.created_at) || now,
    updatedAt: text(value.updatedAt ?? value.updated_at) || now,
  };
}

function reconcileById<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) {
    const cached = merged.get(item.id);
    if (!cached || timestamp(item.updatedAt) >= timestamp(cached.updatedAt)) merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

export function reconcileWorkspace(
  localProjects: ResearchProject[],
  localTasks: KanbanTask[],
  remoteProjects: ResearchProject[],
  remoteTasks: KanbanTask[],
): { projects: ResearchProject[]; tasks: KanbanTask[] } {
  const projects = reconcileById(localProjects, remoteProjects);
  const tasks = reconcileById(localTasks, remoteTasks);
  const projectIds = new Set(projects.map((project) => project.id));
  const dangling = tasks.find((task) => !projectIds.has(task.projectId));
  if (dangling) {
    throw new Error(`任务 ${dangling.title || dangling.id} 引用了不存在的项目；为避免静默丢失，工作区未同步。`);
  }
  return { projects, tasks };
}

let writeQueue: Promise<void> = Promise.resolve();

export function removeMirroredProject(projectId: string): Promise<void> {
  rememberDeletedProject(projectId);
  writeQueue = writeQueue
    .then(async () => {
      await projectApi.delete(projectId);
      forgetDeletedProject(projectId);
    })
    .catch(() => {
      // Keep the tombstone. It is replayed before reconciliation when the
      // local backend becomes available, so a deleted project cannot return.
    });
  return writeQueue;
}

export function mirrorWorkspace(
  projects: ResearchProject[],
  tasks: KanbanTask[],
  report?: (status: WorkspaceSyncStatus, message: string) => void,
): Promise<void> {
  report?.('syncing', '正在同步本机 SQLite 项目与任务…');
  writeQueue = writeQueue
    .then(async () => {
      await projectApi.bulkUpsertWorkspace(projects, tasks);
      for (const project of projects) forgetDeletedProject(project.id);
      report?.('synced', `SQLite 已同步 ${projects.length} 个项目、${tasks.length} 个任务`);
    })
    .catch((error: unknown) => {
      // The complete mutation remains in persisted Zustand and is retried by
      // startup reconciliation. Never remove local data after a sidecar error.
      report?.(
        'offline',
        error instanceof Error ? error.message : '本地后端不可用，修改已保存在离线工作区',
      );
    });
  return writeQueue;
}

/**
 * Mirrors a user-selected backup as an authoritative workspace replacement.
 * Normal working copies are union-reconciled; an explicit restore is not.
 */
export function replaceMirroredWorkspace(
  projects: ResearchProject[],
  tasks: KanbanTask[],
  report?: (status: WorkspaceSyncStatus, message: string) => void,
): Promise<void> {
  rememberAuthoritativeRestore(projects);
  // A backup can intentionally restore a project id that was deleted in a
  // later local session. The user's explicit restore wins over that old
  // tombstone, even if the sidecar is currently offline.
  for (const project of projects) forgetDeletedProject(project.id);
  report?.('syncing', '正在将恢复的工作区写入本机 SQLite…');
  writeQueue = writeQueue
    .then(async () => {
      const snapshot = await projectApi.workspaceSnapshot();
      const desiredIds = new Set(projects.map((project) => project.id));
      for (const remoteProject of snapshot.projects) {
        if (!desiredIds.has(remoteProject.id)) {
          rememberDeletedProject(remoteProject.id);
          await projectApi.delete(remoteProject.id);
          forgetDeletedProject(remoteProject.id);
        }
      }
      await projectApi.bulkUpsertWorkspace(projects, tasks);
      for (const project of projects) forgetDeletedProject(project.id);
      clearStringSet(RESTORED_PROJECT_IDS_KEY);
      report?.('synced', `已恢复并同步 ${projects.length} 个项目、${tasks.length} 个任务`);
    })
    .catch((error: unknown) => {
      report?.('offline', error instanceof Error ? error.message : '本机后端不可用；恢复内容已保存在离线工作区');
    });
  return writeQueue;
}

let bootstrapPromise: Promise<WorkspaceBootstrapResult> | null = null;

export function bootstrapWorkspaceRepository(
  localProjects: ResearchProject[],
  localTasks: KanbanTask[],
): Promise<WorkspaceBootstrapResult> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const snapshot = await projectApi.workspaceSnapshot();
      const remoteProjects = snapshot.projects.map((project) => normalizeBackendProject(
        project as ResearchProject & Record<string, unknown>,
      ));
      const remoteTasks = snapshot.tasks.map((task) => normalizeBackendTask(
        task as KanbanTask & Record<string, unknown>,
      ));
      const restoredIds = readStringSet(RESTORED_PROJECT_IDS_KEY);
      const restoredIdSet = restoredIds ? new Set(restoredIds) : null;
      const deletedIds = new Set(
        readDeletedProjectIds().filter((id) => !restoredIdSet?.has(id)),
      );
      const projectsToDelete = remoteProjects.filter((project) => (
        deletedIds.has(project.id) || (restoredIdSet !== null && !restoredIdSet.has(project.id))
      ));
      for (const project of projectsToDelete) {
        await projectApi.delete(project.id);
        forgetDeletedProject(project.id);
      }
      if (restoredIdSet !== null) clearStringSet(RESTORED_PROJECT_IDS_KEY);
      const removedProjectIds = new Set(projectsToDelete.map((project) => project.id));
      const workspace = reconcileWorkspace(
        localProjects.filter((project) => !deletedIds.has(project.id)),
        localTasks.filter((task) => !deletedIds.has(task.projectId)),
        remoteProjects.filter((project) => !deletedIds.has(project.id) && !removedProjectIds.has(project.id)),
        remoteTasks.filter((task) => !deletedIds.has(task.projectId) && !removedProjectIds.has(task.projectId)),
      );
      if (workspace.projects.length || workspace.tasks.length) {
        await projectApi.bulkUpsertWorkspace(workspace.projects, workspace.tasks);
        for (const project of workspace.projects) forgetDeletedProject(project.id);
      }
      return {
        ...workspace,
        status: 'synced' as const,
        message: `SQLite 已同步 ${workspace.projects.length} 个项目、${workspace.tasks.length} 个任务`,
      };
    } catch (error) {
      return {
        projects: localProjects,
        tasks: localTasks,
        status: 'offline' as const,
        message: error instanceof Error ? error.message : '本地后端不可用，继续使用离线工作区',
      };
    }
  })();
  return bootstrapPromise;
}
