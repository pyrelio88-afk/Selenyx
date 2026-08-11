/**
 * 技能与记忆 API（V4 模块 F）— 本机 SKILL.md 技能包 + 两层记忆。
 *
 * 技能：用户级 ~/.selenyx/skills/ + 项目级，run 启动注入指令并裁剪工具白名单；
 * 记忆：全局 + 项目两层，run 启动注入摘要，永不外发。
 */

import { request } from './api';

export interface AgentSkill {
  name: string;
  description: string;
  allowedTools: string[];
  enabled: boolean;
  instructions: string;
  scope: 'user' | 'project';
  file?: string;
}

/** agent 可用工具的中文标签（技能白名单选择器用） */
export const AGENT_TOOL_LABELS: Record<string, string> = {
  search_library: '检索文献库',
  list_references: '列出文献',
  project_context: '读取项目概况',
  list_evidence: '读取证据链',
  save_evidence: '落证据卡',
  list_pending_evidence: '查看待裁决证据',
  ask_expert: '委托专家',
  write_note: '写入笔记',
  export_artifact: '导出工件',
  list_notes: '读取笔记列表',
  read_note: '读取笔记',
  read_memory: '读取记忆',
  write_memory: '写入记忆',
};

export const skillsApi = {
  list: (projectId?: string) =>
    request<{ skills: AgentSkill[] }>(`/skills${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  create: (body: { name: string; description: string; instructions: string; allowedTools: string[]; projectId?: string | null }) =>
    request<AgentSkill>('/skills', { method: 'POST', body: JSON.stringify(body) }),
  update: (name: string, body: { name: string; description: string; instructions: string; allowedTools: string[]; projectId?: string | null }) =>
    request<AgentSkill>(`/skills/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggle: (name: string, enabled: boolean, projectId?: string | null) =>
    request<AgentSkill>(`/skills/${encodeURIComponent(name)}/toggle`, { method: 'POST', body: JSON.stringify({ enabled, projectId: projectId ?? null }) }),
  remove: (name: string, projectId?: string | null) =>
    request<{ deleted: string }>(`/skills/${encodeURIComponent(name)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
};

export interface ProjectMemoryEntry {
  projectId: string;
  projectName: string;
  preview: string;
}

export const memoryApi = {
  getGlobal: () => request<{ content: string }>('/memory'),
  saveGlobal: (content: string) =>
    request<{ saved: boolean }>('/memory', { method: 'PUT', body: JSON.stringify({ content }) }),
  clearGlobal: () => request<{ cleared: boolean }>('/memory', { method: 'DELETE' }),
  listProjects: () => request<{ memories: ProjectMemoryEntry[] }>('/memory/projects'),
  getProject: (projectId: string) => request<{ content: string }>(`/memory/projects/${encodeURIComponent(projectId)}`),
  saveProject: (projectId: string, content: string) =>
    request<{ saved: boolean }>(`/memory/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  clearProject: (projectId: string) =>
    request<{ cleared: boolean }>(`/memory/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
};

/**
 * 解析输入框的 /技能名 前缀（V4 模块 F）。
 * 形如「/文献速读 帮我梳理…」→ { skill: '文献速读', goal: '帮我梳理…' }；
 * 不带前缀返回 { skill: null, goal: 原文 }。
 */
export function parseSkillPrefix(text: string): { skill: string | null; goal: string } {
  const match = /^\/([^\s/]{1,40})[\s]+([\s\S]+)$/.exec(text.trim());
  if (!match) return { skill: null, goal: text };
  return { skill: match[1], goal: match[2].trim() };
}
