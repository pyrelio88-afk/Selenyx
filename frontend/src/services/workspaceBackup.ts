import { useAppStore } from '@stores/appStore';
import type { KanbanTask, ResearchProject } from '@apptypes/index';
import { mergeMirroredWorkspace } from './workspaceRepository';

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 2;
export const WORKSPACE_BACKUP_SCOPE = 'JSON 仅包含前端工作区数据；不包含本机后端的证据、RAG 索引、运行记录或工件。';
const CHAT_PREFIX = 'selenyx_chat_';
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const DATA_KEYS = [
  'currentView', 'theme', 'mode', 'density', 'references', 'collections', 'tags',
  'projects', 'currentProjectId', 'tasks', 'tables', 'customCountdowns', 'llmConfig',
  'pipelineRuns', 'stageConfigs', 'searchQuery', 'notes', 'pendingNoteId',
] as const;

const ID_COLLECTION_KEYS = [
  'references', 'collections', 'tags', 'projects', 'tasks', 'tables', 'notes',
] as const;

const EMPTY_DATA: Record<(typeof DATA_KEYS)[number], unknown> = {
  currentView: 'dashboard',
  theme: 'mono',
  mode: 'light',
  density: 'comfortable',
  references: [],
  collections: [],
  tags: [],
  projects: [],
  currentProjectId: null,
  tasks: [],
  tables: [],
  customCountdowns: [],
  llmConfig: null,
  pipelineRuns: {},
  stageConfigs: {},
  searchQuery: '',
  notes: [],
  pendingNoteId: null,
};

export interface WorkspaceBackup {
  schemaVersion: 1 | 2;
  exportedAt: string | null;
  data: Record<string, unknown>;
  chat: Record<string, string>;
}

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneWithoutApiKey(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const next = { ...value };
  delete next.apiKey;
  return next;
}

function chatFromStorage(storage: StorageLike | null): Record<string, string> {
  const chat: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!storage) return chat;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(CHAT_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value != null) chat[key] = value;
  }
  return chat;
}

/** Creates a portable frontend-workspace snapshot without exposing an LLM secret. */
export function createWorkspaceBackupJson(
  state: Record<string, unknown> = useAppStore.getState() as unknown as Record<string, unknown>,
  storage: StorageLike | null = browserStorage(),
): string {
  const data: Record<string, unknown> = {};
  for (const key of DATA_KEYS) {
    data[key] = key === 'llmConfig' ? cloneWithoutApiKey(state[key]) : state[key];
  }
  return JSON.stringify({
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    chat: chatFromStorage(storage),
  }, null, 2);
}

function validateIdCollection(name: string, value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`Backup field ${name} must be an array`);
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`Backup field ${name} contains an item without a valid id`);
    }
    if (ids.has(item.id)) throw new Error(`Backup field ${name} contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
  return value;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeCreator(value: Record<string, unknown>, index: number, referenceId: string): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id, `${referenceId}-creator-${index}`),
    firstName: stringValue(value.firstName),
    lastName: stringValue(value.lastName),
    type: stringValue(value.type, 'author'),
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : index,
  };
}

function normalizeAttachment(value: Record<string, unknown>, index: number, referenceId: string): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id, `${referenceId}-attachment-${index}`),
    filename: stringValue(value.filename),
    mimeType: stringValue(value.mimeType),
    path: stringValue(value.path),
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : 0,
    ...(typeof value.md5 === 'string' ? { md5: value.md5 } : {}),
  };
}

function normalizeAnnotation(value: Record<string, unknown>, index: number, referenceId: string): Record<string, unknown> {
  const rect = Array.isArray(value.rect) && value.rect.length === 4 && value.rect.every((entry) => typeof entry === 'number')
    ? value.rect
    : [0, 0, 0, 0];
  return {
    ...value,
    id: stringValue(value.id, `${referenceId}-annotation-${index}`),
    page: typeof value.page === 'number' && Number.isFinite(value.page) ? value.page : 0,
    type: stringValue(value.type, 'highlight'),
    rect,
    text: stringValue(value.text),
    note: stringValue(value.note),
    color: stringValue(value.color),
    createdAt: stringValue(value.createdAt),
  };
}

/**
 * Backups may predate fields added to the reference reader.  Normalize every
 * field the UI reads directly so a valid old snapshot cannot turn a later
 * render into a TypeError (for example, `creators.some` or `doi.toLowerCase`).
 */
function normalizeReference(value: Record<string, unknown>): Record<string, unknown> {
  const id = stringValue(value.id);
  return {
    ...value,
    id,
    citeKey: stringValue(value.citeKey),
    type: stringValue(value.type, 'journalArticle'),
    title: stringValue(value.title),
    shortTitle: stringValue(value.shortTitle),
    abstract: stringValue(value.abstract),
    creators: objectArray(value.creators).map((creator, index) => normalizeCreator(creator, index, id)),
    publication: stringValue(value.publication),
    volume: stringValue(value.volume),
    issue: stringValue(value.issue),
    pages: stringValue(value.pages),
    publisher: stringValue(value.publisher),
    place: stringValue(value.place),
    year: stringValue(value.year),
    date: stringValue(value.date),
    accessionDate: stringValue(value.accessionDate),
    doi: stringValue(value.doi),
    isbn: stringValue(value.isbn),
    issn: stringValue(value.issn),
    pmid: stringValue(value.pmid),
    pmcid: stringValue(value.pmcid),
    arxivId: stringValue(value.arxivId),
    url: stringValue(value.url),
    uri: stringValue(value.uri),
    collections: stringArray(value.collections),
    tags: stringArray(value.tags),
    language: stringValue(value.language),
    rights: stringValue(value.rights),
    attachments: objectArray(value.attachments).map((attachment, index) => normalizeAttachment(attachment, index, id)),
    annotations: objectArray(value.annotations).map((annotation, index) => normalizeAnnotation(annotation, index, id)),
    notes: stringValue(value.notes),
    impactFactor: nullableNumber(value.impactFactor),
    jcrQuartile: ['Q1', 'Q2', 'Q3', 'Q4'].includes(stringValue(value.jcrQuartile)) ? value.jcrQuartile : null,
    openAccess: value.openAccess === true,
    pageCharge: nullableNumber(value.pageCharge),
    reviewWeeks: nullableNumber(value.reviewWeeks),
    pipelineStage: nullableString(value.pipelineStage),
    readStatus: ['unread', 'reading', 'read', 'archived'].includes(stringValue(value.readStatus)) ? value.readStatus : 'unread',
    importance: [1, 2, 3, 4, 5].includes(value.importance as number) ? value.importance : 3,
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
    source: ['manual', 'import', 'api'].includes(stringValue(value.source)) ? value.source : 'import',
  };
}

function normalizeProject(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id),
    name: stringValue(value.name),
    description: stringValue(value.description),
    currentStage: stringValue(value.currentStage, 'problem'),
    ...(typeof value.frameworkId === 'string' ? { frameworkId: value.frameworkId } : {}),
    tags: stringArray(value.tags),
    referenceIds: stringArray(value.referenceIds),
    taskIds: stringArray(value.taskIds),
    status: ['planning', 'active', 'paused', 'completed', 'archived'].includes(stringValue(value.status)) ? value.status : 'planning',
    startDate: nullableString(value.startDate),
    endDate: nullableString(value.endDate),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizeTask(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id),
    projectId: stringValue(value.projectId),
    title: stringValue(value.title),
    description: stringValue(value.description),
    column: ['todo', 'doing', 'done', 'blocked'].includes(stringValue(value.column)) ? value.column : 'todo',
    stage: stringValue(value.stage, 'problem'),
    assignee: stringValue(value.assignee),
    priority: ['low', 'medium', 'high', 'urgent'].includes(stringValue(value.priority)) ? value.priority : 'medium',
    dueDate: nullableString(value.dueDate),
    tags: stringArray(value.tags),
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 0,
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizeTable(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id),
    projectId: stringValue(value.projectId),
    name: stringValue(value.name),
    fields: objectArray(value.fields),
    views: objectArray(value.views),
    records: objectArray(value.records),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizeNote(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: stringValue(value.id),
    title: stringValue(value.title),
    body: stringValue(value.body),
    category: stringValue(value.category),
    tags: stringArray(value.tags),
    linkedReferenceIds: stringArray(value.linkedReferenceIds),
    linkedStage: nullableString(value.linkedStage),
    mood: stringValue(value.mood),
    pinned: value.pinned === true,
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizeWorkspaceEntities(data: Record<string, unknown>): void {
  data.references = (data.references as Record<string, unknown>[]).map(normalizeReference);
  data.collections = (data.collections as Record<string, unknown>[]).map((value) => ({
    ...value,
    id: stringValue(value.id),
    name: stringValue(value.name),
    parentId: nullableString(value.parentId),
    color: stringValue(value.color),
    createdAt: stringValue(value.createdAt),
  }));
  data.tags = (data.tags as Record<string, unknown>[]).map((value) => ({
    ...value,
    id: stringValue(value.id),
    name: stringValue(value.name),
    color: stringValue(value.color),
    createdAt: stringValue(value.createdAt),
  }));
  data.projects = (data.projects as Record<string, unknown>[]).map(normalizeProject);
  data.tasks = (data.tasks as Record<string, unknown>[]).map(normalizeTask);
  data.tables = (data.tables as Record<string, unknown>[]).map(normalizeTable);
  data.notes = (data.notes as Record<string, unknown>[]).map(normalizeNote);
  data.customCountdowns = objectArray(data.customCountdowns).map((value) => ({
    label: stringValue(value.label),
    date: stringValue(value.date),
    color: stringValue(value.color),
    projectId: nullableString(value.projectId),
  }));
}

function validateChat(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error('Backup chat must be an object');
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, item] of Object.entries(value)) {
    if (!key.startsWith(CHAT_PREFIX) || typeof item !== 'string') {
      throw new Error('Backup contains an invalid chat entry');
    }
    result[key] = item;
  }
  return result;
}

/**
 * Parses a v1/v2 Selenyx backup without mutating application state.  Validation
 * happens before restore so a malformed file cannot leave a half-restored UI.
 */
export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('Backup is too large');
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error('Backup is not valid JSON');
  }
  if (!isRecord(root)) throw new Error('Backup root must be an object');

  const rawVersion = root.schemaVersion;
  const schemaVersion = rawVersion === undefined ? 1 : rawVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error('Unsupported backup schema');
  const rawData = isRecord(root.data) ? root.data : root;
  if (!DATA_KEYS.some((key) => key in rawData)) throw new Error('Backup contains no Selenyx workspace data');
  const data: Record<string, unknown> = { ...EMPTY_DATA };
  for (const key of DATA_KEYS) {
    if (key in rawData) data[key] = rawData[key];
  }

  for (const key of ID_COLLECTION_KEYS) data[key] = validateIdCollection(key, data[key]);
  if (!Array.isArray(data.customCountdowns) || !data.customCountdowns.every(isRecord)) {
    throw new Error('Backup field customCountdowns must be an array of objects');
  }
  if (!isRecord(data.pipelineRuns) || !isRecord(data.stageConfigs)) {
    throw new Error('Backup pipeline state must be an object');
  }
  if (typeof data.currentView !== 'string' || typeof data.theme !== 'string'
    || typeof data.mode !== 'string' || typeof data.density !== 'string'
    || typeof data.searchQuery !== 'string') {
    throw new Error('Backup contains invalid display state');
  }
  if (data.llmConfig !== null && !isRecord(data.llmConfig)) throw new Error('Backup LLM configuration is invalid');
  data.llmConfig = cloneWithoutApiKey(data.llmConfig);
  normalizeWorkspaceEntities(data);

  const projectIds = new Set((data.projects as Record<string, unknown>[]).map((project) => project.id as string));
  if (data.currentProjectId !== null && (typeof data.currentProjectId !== 'string' || !projectIds.has(data.currentProjectId))) {
    data.currentProjectId = null;
  }
  for (const task of data.tasks as Record<string, unknown>[]) {
    if (typeof task.projectId !== 'string' || !projectIds.has(task.projectId)) {
      throw new Error('Backup contains a task for a missing project');
    }
  }
  const referenceIds = new Set((data.references as Record<string, unknown>[]).map((reference) => reference.id as string));
  const taskIds = new Set((data.tasks as Record<string, unknown>[]).map((task) => task.id as string));
  for (const project of data.projects as Record<string, unknown>[]) {
    project.referenceIds = stringArray(project.referenceIds).filter((referenceId) => referenceIds.has(referenceId));
    project.taskIds = stringArray(project.taskIds).filter((taskId) => taskIds.has(taskId));
  }
  const noteIds = new Set((data.notes as Record<string, unknown>[]).map((note) => note.id as string));
  if (data.pendingNoteId !== null && (typeof data.pendingNoteId !== 'string' || !noteIds.has(data.pendingNoteId))) {
    data.pendingNoteId = null;
  }
  for (const note of data.notes as Record<string, unknown>[]) {
    note.linkedReferenceIds = stringArray(note.linkedReferenceIds).filter((referenceId) => referenceIds.has(referenceId));
  }

  return {
    schemaVersion,
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : null,
    data,
    chat: validateChat(root.chat),
  };
}

function uniqueStrings(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(stringArray))];
}

function idRecords(value: unknown): Record<string, unknown>[] {
  return objectArray(value).filter((item) => typeof item.id === 'string' && item.id.trim().length > 0);
}

function mergeIdCollection(
  currentValue: unknown,
  importedValue: unknown,
  mergeRecord?: (current: Record<string, unknown>, imported: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const item of idRecords(currentValue)) merged.set(item.id as string, item);
  for (const item of idRecords(importedValue)) {
    const current = merged.get(item.id as string);
    // The current workspace is the live local source of truth. An older JSON
    // may supplement it with missing records, but it must not roll a matching
    // id back to an earlier title, body, status, or timestamp.
    merged.set(item.id as string, current ? (mergeRecord?.(current, item) ?? mergeRecordPreservingCurrent(current, item)) : item);
  }
  return [...merged.values()];
}

function mergeRecordPreservingCurrent(current: Record<string, unknown>, imported: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...imported, ...current };
  for (const [key, importedValue] of Object.entries(imported)) {
    const currentValue = current[key];
    if (Array.isArray(currentValue) && Array.isArray(importedValue)) {
      merged[key] = mergeUntypedCollection(currentValue, importedValue);
    }
  }
  return merged;
}

function mergeProjectRecord(current: Record<string, unknown>, imported: Record<string, unknown>): Record<string, unknown> {
  return {
    ...imported,
    ...current,
    // These links are ownership metadata. Preserve both sides during a merge
    // so importing an older JSON file cannot silently detach local work.
    tags: uniqueStrings(current.tags, imported.tags),
    referenceIds: uniqueStrings(current.referenceIds, imported.referenceIds),
    taskIds: uniqueStrings(current.taskIds, imported.taskIds),
  };
}

function mergeUntypedCollection(currentValue: unknown, importedValue: unknown): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const item of [...(Array.isArray(currentValue) ? currentValue : []), ...(Array.isArray(importedValue) ? importedValue : [])]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Produces a non-destructive frontend merge. Imported records win on a stable
 * id, while records not represented by the JSON remain in the local workspace.
 */
function mergeWorkspaceBackupData(
  current: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  // A merge restore is a supplement, not a rollback: preserve the user's
  // current view/settings and add only records absent from this workspace.
  const data: Record<string, unknown> = {};
  for (const key of DATA_KEYS) {
    data[key] = key in current ? current[key] : imported[key];
  }
  for (const key of ID_COLLECTION_KEYS) {
    data[key] = mergeIdCollection(
      current[key],
      imported[key],
      key === 'projects' ? mergeProjectRecord : undefined,
    );
  }
  data.customCountdowns = mergeUntypedCollection(current.customCountdowns, imported.customCountdowns);
  data.pipelineRuns = { ...(isRecord(imported.pipelineRuns) ? imported.pipelineRuns : {}), ...(isRecord(current.pipelineRuns) ? current.pipelineRuns : {}) };
  data.stageConfigs = { ...(isRecord(imported.stageConfigs) ? imported.stageConfigs : {}), ...(isRecord(current.stageConfigs) ? current.stageConfigs : {}) };

  const projectIds = new Set(idRecords(data.projects).map((project) => project.id as string));
  const importedProjectId = typeof imported.currentProjectId === 'string' ? imported.currentProjectId : null;
  const currentProjectId = typeof current.currentProjectId === 'string' ? current.currentProjectId : null;
  data.currentProjectId = currentProjectId && projectIds.has(currentProjectId)
    ? currentProjectId
    : importedProjectId && projectIds.has(importedProjectId) ? importedProjectId : null;

  const noteIds = new Set(idRecords(data.notes).map((note) => note.id as string));
  const importedNoteId = typeof imported.pendingNoteId === 'string' ? imported.pendingNoteId : null;
  const currentNoteId = typeof current.pendingNoteId === 'string' ? current.pendingNoteId : null;
  data.pendingNoteId = currentNoteId && noteIds.has(currentNoteId)
    ? currentNoteId
    : importedNoteId && noteIds.has(importedNoteId) ? importedNoteId : null;
  return data;
}

export async function restoreWorkspaceBackup(text: string, storage: StorageLike | null = browserStorage()): Promise<WorkspaceBackup> {
  const backup = parseWorkspaceBackup(text);
  if (storage) {
    const previousChat = chatFromStorage(storage);
    try {
      // Chat histories have no project sidecar equivalent, but they still
      // belong to the current workspace. Import only missing conversations;
      // an old JSON must not overwrite a newer local conversation with the
      // same stable storage key.
      for (const [key, value] of Object.entries(backup.chat)) {
        if (storage.getItem(key) === null) storage.setItem(key, value);
      }
    } catch {
      try {
        for (const key of Object.keys(backup.chat)) {
          const previous = previousChat[key];
          if (previous === undefined) storage.removeItem(key);
          else storage.setItem(key, previous);
        }
      } catch { /* Best-effort rollback. */ }
      throw new Error('Backup chat data could not be written to local storage');
    }
  }
  const current = useAppStore.getState() as unknown as Record<string, unknown>;
  const data = mergeWorkspaceBackupData(current, backup.data);
  useAppStore.setState(data as Partial<ReturnType<typeof useAppStore.getState>>);
  const projects = data.projects as ResearchProject[];
  const tasks = data.tasks as KanbanTask[];
  await mergeMirroredWorkspace(projects, tasks, (status, message) => {
    useAppStore.setState({ workspaceSyncStatus: status, workspaceSyncMessage: message });
  });
  return backup;
}

export function clearSelenyxBrowserStorage(storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (key === 'selenyx-v2' || key.startsWith('selenyx-') || key.startsWith('selenyx_'))) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
