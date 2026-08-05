/**
 * Selenyx API 服务层 — 前端与 Python 后端通信
 * 所有 API 调用经 /api 代理到 FastAPI 后端
 */

import type { Reference, ResearchProject, RetrievalResult, ChatMessage } from '@types/index';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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
  import: (format: string, data: string) => request<{ imported: number }>('/references/import', { method: 'POST', body: JSON.stringify({ format, data }) }),
  export: (ids: string[], format: string) => request<{ data: string }>(`/references/export`, { method: 'POST', body: JSON.stringify({ ids, format }) }),
  deduplicate: () => request<{ merged: number }>('/references/deduplicate', { method: 'POST' }),
  searchByDOI: (doi: string) => request<Reference>(`/references/lookup/doi/${doi}`),
  searchByPMID: (pmid: string) => request<Reference>(`/references/lookup/pmid/${pmid}`),
};

// === 项目 API ===
export const projectApi = {
  list: () => request<ResearchProject[]>('/projects'),
  get: (id: string) => request<ResearchProject>(`/projects/${id}`),
  create: (p: Partial<ResearchProject>) => request<ResearchProject>('/projects', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: string, patch: Partial<ResearchProject>) => request<ResearchProject>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  advanceStage: (id: string) => request<ResearchProject>(`/projects/${id}/advance`, { method: 'POST' }),
};

// === 检索 API (extractive retrieval, 借鉴 HydraLab) ===
export const searchApi = {
  semantic: (query: string, projectId?: string) => request<RetrievalResult[]>('/search/semantic', { method: 'POST', body: JSON.stringify({ query, projectId }) }),
  scholarly: (query: string, sources: string[]) => request<Reference[]>('/search/scholarly', { method: 'POST', body: JSON.stringify({ query, sources }) }),
};

// === AI / LLM API ===
export const aiApi = {
  chat: (messages: Omit<ChatMessage, 'id' | 'timestamp'>[], projectId?: string) =>
    request<ChatMessage>('/ai/chat', { method: 'POST', body: JSON.stringify({ messages, projectId }) }),
  runRecipe: (recipeId: string, input: string, projectId: string) =>
    request<{ runId: string; status: string }>('/ai/recipes/run', { method: 'POST', body: JSON.stringify({ recipeId, input, projectId }) }),
  testConnection: () => request<{ ok: boolean; model: string }>('/ai/test'),
};

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
