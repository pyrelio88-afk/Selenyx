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
  writeQueue = writeQueue
    .then(async () => {
      await projectApi.delete(projectId);
    })
    .catch(() => {
      // Offline / backend down: local Zustand already dropped the project.
      // Startup reconcile may reintroduce it until DELETE succeeds later.
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
      const workspace = reconcileWorkspace(localProjects, localTasks, remoteProjects, remoteTasks);
      if (workspace.projects.length || workspace.tasks.length) {
        await projectApi.bulkUpsertWorkspace(workspace.projects, workspace.tasks);
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
