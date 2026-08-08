/**
 * Local-first reference persistence.
 *
 * Zustand remains the immediate/offline cache.  When the local FastAPI service
 * is reachable, every mutation is serialized into SQLite and its RAG index.
 * Startup reconciliation keeps frontend ids stable and uses updatedAt as the
 * conflict clock; equal timestamps prefer SQLite, the durable local source.
 */

import type { Reference } from '@apptypes/reference';
import { refApi } from './api';

export type ReferenceSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface ReferenceBootstrapResult {
  references: Reference[];
  status: ReferenceSyncStatus;
  message: string;
}

const DELETED_REFERENCE_KEY = 'selenyx-deleted-reference-ids';

function readDeletedReferenceIds(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(DELETED_REFERENCE_KEY);
    const decoded: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(decoded) ? decoded.filter((id): id is string => typeof id === 'string' && Boolean(id)) : [];
  } catch {
    return [];
  }
}

function writeDeletedReferenceIds(ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(DELETED_REFERENCE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // The in-memory deletion still succeeds when browser storage is disabled.
  }
}

function rememberDeletedReference(id: string): void {
  writeDeletedReferenceIds([...readDeletedReferenceIds(), id]);
}

function forgetDeletedReference(id: string): void {
  writeDeletedReferenceIds(readDeletedReferenceIds().filter((candidate) => candidate !== id));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

/** Makes legacy backend rows safe for every current ReferencesView access. */
export function normalizeBackendReference(value: Partial<Reference> & Record<string, unknown>): Reference {
  const now = new Date().toISOString();
  return {
    id: text(value.id) || `backend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    citeKey: text(value.citeKey ?? value.cite_key),
    type: (text(value.type) || 'journalArticle') as Reference['type'],
    title: text(value.title),
    shortTitle: text(value.shortTitle ?? value.short_title),
    abstract: text(value.abstract),
    creators: array<Reference['creators'][number]>(value.creators),
    publication: text(value.publication),
    volume: text(value.volume),
    issue: text(value.issue),
    pages: text(value.pages),
    publisher: text(value.publisher),
    place: text(value.place),
    year: text(value.year),
    date: text(value.date),
    accessionDate: text(value.accessionDate),
    doi: text(value.doi),
    isbn: text(value.isbn),
    issn: text(value.issn),
    pmid: text(value.pmid),
    pmcid: text(value.pmcid),
    arxivId: text(value.arxivId ?? value.arxiv_id),
    url: text(value.url),
    uri: text(value.uri),
    collections: array<string>(value.collections),
    tags: array<string>(value.tags),
    language: text(value.language),
    rights: text(value.rights),
    attachments: array<Reference['attachments'][number]>(value.attachments),
    annotations: array<Reference['annotations'][number]>(value.annotations),
    notes: text(value.notes),
    impactFactor: typeof value.impactFactor === 'number' ? value.impactFactor : null,
    jcrQuartile: ['Q1', 'Q2', 'Q3', 'Q4'].includes(text(value.jcrQuartile))
      ? text(value.jcrQuartile) as Reference['jcrQuartile'] : null,
    openAccess: value.openAccess === true,
    pageCharge: typeof value.pageCharge === 'number' ? value.pageCharge : null,
    reviewWeeks: typeof value.reviewWeeks === 'number' ? value.reviewWeeks : null,
    pipelineStage: text(value.pipelineStage) as Reference['pipelineStage'] || null,
    readStatus: ['unread', 'reading', 'read', 'archived'].includes(text(value.readStatus))
      ? text(value.readStatus) as Reference['readStatus'] : 'unread',
    importance: [1, 2, 3, 4, 5].includes(Number(value.importance))
      ? Number(value.importance) as Reference['importance'] : 3,
    pico: value.pico,
    createdAt: text(value.createdAt ?? value.created_at) || now,
    updatedAt: text(value.updatedAt ?? value.updated_at) || now,
    source: ['manual', 'import', 'api'].includes(text(value.source))
      ? text(value.source) as Reference['source'] : 'manual',
  };
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reconcileReferences(local: Reference[], remote: Reference[]): Reference[] {
  const merged = new Map<string, Reference>();
  for (const reference of local) merged.set(reference.id, reference);
  for (const reference of remote) {
    const cached = merged.get(reference.id);
    if (!cached || timestamp(reference.updatedAt) >= timestamp(cached.updatedAt)) {
      merged.set(reference.id, reference);
    }
  }
  return [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<unknown>): Promise<void> {
  writeQueue = writeQueue.then(async () => { await operation(); }).catch(() => {
    // Offline mutations remain durable in Zustand and are reconciled next time
    // the local service starts.  UI status is set by the periodic health probe.
  });
  return writeQueue;
}

export function mirrorReference(reference: Reference): void {
  enqueue(() => refApi.bulkUpsert([reference]));
}

export function mirrorReferences(references: Reference[]): void {
  if (references.length) enqueue(() => refApi.bulkUpsert(references));
}

export function removeMirroredReference(referenceId: string): Promise<void> {
  // The tombstone prevents a failed offline DELETE from being resurrected by
  // the next startup's union reconciliation.
  rememberDeletedReference(referenceId);
  return enqueue(async () => {
    await refApi.delete(referenceId);
    forgetDeletedReference(referenceId);
  });
}

let bootstrapPromise: Promise<ReferenceBootstrapResult> | null = null;

export function bootstrapReferenceRepository(local: Reference[]): Promise<ReferenceBootstrapResult> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const snapshot = await refApi.snapshot();
      const deletedIds = new Set(readDeletedReferenceIds());
      const remoteIds = new Set(snapshot.references.map((item) => item.id));
      for (const deletedId of deletedIds) {
        if (remoteIds.has(deletedId)) await refApi.delete(deletedId);
        forgetDeletedReference(deletedId);
      }
      const remote = snapshot.references
        .filter((item) => !deletedIds.has(item.id))
        .map((item) => normalizeBackendReference(item as Reference & Record<string, unknown>));
      const references = reconcileReferences(local, remote);
      if (references.length) await refApi.bulkUpsert(references);
      return {
        references,
        status: 'synced' as const,
        message: `SQLite 已同步 ${references.length} 条文献，RAG 元数据索引可用`,
      };
    } catch (error) {
      return {
        references: local,
        status: 'offline' as const,
        message: error instanceof Error ? error.message : '本地后端不可用，继续使用离线缓存',
      };
    }
  })();
  return bootstrapPromise;
}
