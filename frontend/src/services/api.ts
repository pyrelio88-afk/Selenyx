/**
 * Selenyx API 服务层 — 前端与 Python 后端通信
 * 所有 API 调用经 /api 代理到 FastAPI 后端
 */

import type { Reference, ResearchProject, KanbanTask, RetrievalResult, ChatMessage } from '@apptypes/index';
import { isDesktopTauri, isMobileTauri } from './nativeRuntime';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
// Mobile pairing is intentionally not shipped yet. Never allow a compile-time
// address to turn an APK into an unauthenticated LAN client.
export const hasConfiguredCompanionBackend = !isMobileTauri() && Boolean(configuredApiBase);
const API_BASE = (isMobileTauri()
  ? ''
  : configuredApiBase || (isDesktopTauri() ? 'http://127.0.0.1:8770/api' : '/api')).replace(/\/$/, '');

/** 拼 API 绝对地址（EventSource 等裸连接用，request 之外的场景）。 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new Error('The mobile app is offline-first. A paired companion service is not available in this build.');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// === 文献 API ===
export const refApi = {
  list: (params?: { q?: string; collection?: string; tag?: string; stage?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Reference[]>(`/references${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<Reference>(`/references/${id}`),
  create: (ref: Partial<Reference>) => request<Reference>('/references', { method: 'POST', body: JSON.stringify(ref) }),
  update: (id: string, patch: Partial<Reference>) => request<Reference>(`/references/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delete: (id: string) => request<void>(`/references/${id}`, { method: 'DELETE' }),
  snapshot: () => request<{ references: Reference[]; count: number; payloadVersion: number }>('/references/snapshot'),
  bulkUpsert: (references: Reference[]) => request<{ stored: number; created: number; updated: number; indexedChunks: number }>(
    '/references/bulk-upsert',
    { method: 'POST', body: JSON.stringify({ references }) },
  ),
  import: (format: string, data: string) => request<{ imported: number }>('/references/import', { method: 'POST', body: JSON.stringify({ format, data }) }),
  export: (ids: string[], format: string) => request<{ data: string }>(`/references/export`, { method: 'POST', body: JSON.stringify({ ids, format }) }),
  deduplicate: () => request<{ merged: number }>('/references/deduplicate', { method: 'POST' }),
  searchByDOI: (doi: string) => request<Reference>(`/references/lookup/doi/${doi}`),
  searchByPMID: (pmid: string) => request<Reference>(`/references/lookup/pmid/${pmid}`),
};

/** A normalized, read-only item exposed by the user's local Zotero desktop API. */
export interface ZoteroReferenceCandidate {
  key: string;
  type: string;
  title: string;
  creators: { firstName: string; lastName: string; type: string }[];
  publication: string;
  year: string;
  date: string;
  doi: string;
  url: string;
  volume: string;
  issue: string;
  pages: string;
  abstract: string;
  publisher: string;
  place: string;
  isbn: string;
  issn: string;
  language: string;
  rights: string;
  collections: string[];
  tags: string[];
}

export const zoteroApi = {
  status: () => request<{ available: true; apiVersion: string }>('/zotero/status'),
  items: (limit = 250) => request<{ apiVersion: string; items: ZoteroReferenceCandidate[]; skipped: number }>(
    `/zotero/items?limit=${Math.min(Math.max(Math.floor(limit), 1), 500)}`,
  ),
};

// === 项目 API ===
export const projectApi = {
  list: () => request<ResearchProject[]>('/projects'),
  get: (id: string) => request<ResearchProject>(`/projects/${id}`),
  create: (p: Partial<ResearchProject>) => request<ResearchProject>('/projects', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: string, patch: Partial<ResearchProject>) => request<ResearchProject>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  advanceStage: (id: string) => request<ResearchProject>(`/projects/${id}/advance`, { method: 'POST' }),
  delete: (id: string) => request<{ deleted: string; deletedTasks: number; deletedEvidence: number }>(`/projects/${id}`, { method: 'DELETE' }),
  workspaceSnapshot: () => request<{
    projects: ResearchProject[];
    tasks: KanbanTask[];
    projectCount: number;
    taskCount: number;
    payloadVersion: number;
  }>('/projects/workspace/snapshot'),
  bulkUpsertWorkspace: (projects: ResearchProject[], tasks: KanbanTask[]) => request<{
    storedProjects: number;
    storedTasks: number;
    createdProjects: number;
    updatedProjects: number;
    createdTasks: number;
    updatedTasks: number;
  }>('/projects/workspace/bulk-upsert', {
    method: 'POST',
    body: JSON.stringify({ projects, tasks }),
  }),
};

// === 检索 API (extractive retrieval + scholarly connectors) ===
export interface SemanticHit extends RetrievalResult {
  title?: string;
  chunkId?: string;
  source?: string;
}

export interface ScholarlyCandidate {
  title: string;
  doi: string;
  year: string;
  publication: string;
  abstract: string;
  url: string;
  volume?: string;
  issue?: string;
  pages?: string;
  openAccess: boolean;
  source: 'openalex' | 'crossref' | 'pubmed' | 'arxiv' | string;
  creators: { firstName: string; lastName: string; type?: string }[];
  pmid: string;
  arxivId: string;
}

export interface ScholarlyDiagnostic {
  source: string;
  status: number;
  count?: number;
  error?: string;
}

export interface EvidenceRecord {
  id: string;
  project_id: string;
  reference_id: string;
  claim: string;
  excerpt: string;
  relation: 'supports' | 'contradicts' | 'qualifies';
  review: 'pending' | 'accepted' | 'rejected';
  /** Canonical provenance state.  Exports/strict mode require accepted here too. */
  status?: 'retrieved' | 'pending' | 'accepted' | 'rejected' | 'unresolved';
  confidence: 'high' | 'medium' | 'low';
  page: number | null;
  chunk_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** 证据门待裁决卡（/evidence/pending 富化返回） */
export interface PendingEvidenceCard {
  id: string;
  projectId: string;
  projectName: string;
  referenceId: string;
  referenceTitle: string;
  claim: string;
  excerpt: string;
  relation: 'supports' | 'contradicts' | 'qualifies';
  confidence: 'high' | 'medium' | 'low';
  page: number | null;
  notes: string;
  createdAt: string;
}

export const searchApi = {
  semantic: (query: string, projectId?: string) =>
    request<{ results: SemanticHit[]; count: number; query: string }>('/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, projectId, topK: 8 }),
    }),
  scholarly: (query: string, sources: string[]) =>
    request<{ results: ScholarlyCandidate[]; count: number; diagnostics: ScholarlyDiagnostic[] }>('/search/scholarly', {
      method: 'POST',
      body: JSON.stringify({ query, sources }),
    }),
  reindex: () => request<{ references: number; chunksTotal: number }>('/search/reindex', { method: 'POST' }),
  related: (payload: { pmid?: string; doi?: string }) =>
    request<{ results: unknown[]; count: number }>('/search/related', { method: 'POST', body: JSON.stringify(payload) }),
};

export const evidenceApi = {
  list: (projectId?: string) => request<EvidenceRecord[]>(`/evidence${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  summary: (projectId?: string) => request<Record<string, number>>(`/evidence/summary${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  pending: (projectId?: string) =>
    request<{ items: PendingEvidenceCard[]; count: number }>(`/evidence/pending${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  create: (body: Record<string, unknown>) => request<EvidenceRecord>('/evidence', { method: 'POST', body: JSON.stringify(body) }),
  patch: (id: string, body: Record<string, unknown>) => request<EvidenceRecord>(`/evidence/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ deleted: string }>(`/evidence/${id}`, { method: 'DELETE' }),
  outline: (projectId: string) => request<{ bullets: string[]; acceptedCount: number }>(`/evidence/writing-outline/${projectId}`),
};

// === AI / LLM API ===
export const aiApi = {
  config: () => request<{ configured: boolean; baseUrl: string; model: string }>('/ai/config'),
  chat: (messages: Omit<ChatMessage, 'id' | 'timestamp'>[], projectId?: string) =>
    request<ChatMessage>('/ai/chat', { method: 'POST', body: JSON.stringify({ messages, projectId }) }),
  testConnection: () => request<{ ok: boolean; model: string }>('/ai/test'),
};

/** Proxy a desktop-sidecar SSE stream without ever exposing the API key to JS. */
export async function streamLocalAI(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onDelta: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!API_BASE) {
    throw new Error('The local AI service is unavailable on this mobile build.');
  }
  const response = await fetch(`${API_BASE}/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!response.ok) throw new Error(`Local AI ${response.status}: ${await response.text()}`);
  if (!response.body) throw new Error('The local AI service returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let done = false;

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        done = true;
        break;
      }
      try {
        const event = JSON.parse(payload) as { delta?: unknown };
        if (typeof event.delta === 'string' && event.delta) {
          content += event.delta;
          onDelta(content);
        }
      } catch {
        // Ignore SSE keep-alives and malformed partial events.
      }
    }
  }

  return content;
}

// === 临床数据 API ===
export const clinicalApi = {
  nanda: (domain?: string) => request<{ code: string; name: string }[]>(`/clinical/nanda${domain ? `?domain=${domain}` : ''}`),
  labValues: (category?: string) => request<{ name: string; unit: string; refLow: number | null; refHigh: number | null }[]>(`/clinical/labs${category ? `?category=${category}` : ''}`),
  statTable: (type: string, df: number, alpha: number) => request<{ criticalValue: number }>(`/clinical/stat/${type}?df=${df}&alpha=${alpha}`),
  glossary: (q?: string) => request<{ term: string; definition: string }[]>(`/clinical/glossary${q ? `?q=${q}` : ''}`),
};

// === 引用格式化 API ===
export const citationApi = {
  format: (refIds: string[], style: string) => request<{ citations: string[] }>('/citations/format', { method: 'POST', body: JSON.stringify({ refIds, style }) }),
  styles: () => request<{ id: string; name: string }[]>('/citations/styles'),
};

export const localApi = {
  health: async (): Promise<{ status: 'ok'; version: string; storage: 'local-sqlite'; llmConfigured: boolean }> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await request<unknown>('/health', { signal: controller.signal });
      if (!response || typeof response !== 'object') throw new Error('Local backend health response is invalid.');
      const health = response as Record<string, unknown>;
      if (health.status !== 'ok' || health.storage !== 'local-sqlite'
        || typeof health.version !== 'string' || !health.version.trim()
        || typeof health.llmConfigured !== 'boolean') {
        throw new Error('The process on the local backend port is not a healthy Selenyx service.');
      }
      return health as { status: 'ok'; version: string; storage: 'local-sqlite'; llmConfigured: boolean };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The local backend health check timed out.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  },
};
