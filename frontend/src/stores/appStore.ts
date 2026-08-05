/**
 * Selenyx 全局状态管理 (Zustand)
 * 从 JS 版 localStorage 迁移为 Zustand store + persist 中间件
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Reference, ResearchProject, RefCollection, RefTag,
  KanbanTask, LLMConfig, MultiDimTable, PipelineStageKey,
} from '@types/index';

export type ThemeName = 'paper-green' | 'minimal-white' | 'ink-classic';
export type ThemeMode = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'spacious';

/** R79：流水线单段运行结果 */
export interface PipelineRun {
  status: 'idle' | 'running' | 'done' | 'error';
  output: string;
  runAt: string | null;
  passed: boolean; // 是否已标记通过门控
}

interface AppState {
  // === 主题 ===
  theme: ThemeName;
  mode: ThemeMode;
  density: Density;
  setTheme: (t: ThemeName) => void;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setDensity: (d: Density) => void;

  // === 文献 ===
  references: Reference[];
  collections: RefCollection[];
  tags: RefTag[];
  addReference: (ref: Reference) => void;
  addReferences: (refs: Reference[]) => void;
  updateReference: (id: string, patch: Partial<Reference>) => void;
  deleteReference: (id: string) => void;

  // === 项目 ===
  projects: ResearchProject[];
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;
  addProject: (p: ResearchProject) => void;
  updateProject: (id: string, patch: Partial<ResearchProject>) => void;

  // === 任务看板 ===
  tasks: KanbanTask[];
  addTask: (t: KanbanTask) => void;
  updateTask: (id: string, patch: Partial<KanbanTask>) => void;
  moveTask: (id: string, column: KanbanTask['column']) => void;

  // === 多维表格 ===
  tables: MultiDimTable[];

  // === AI 配置 ===
  llmConfig: LLMConfig | null;
  setLLMConfig: (c: LLMConfig) => void;

  // === R79：八段流水线执行态 ===
  // key = `${projectId}::${stageKey}`
  pipelineRuns: Record<string, PipelineRun>;
  setPipelineRun: (key: string, run: PipelineRun) => void;
  stageConfigs: Record<string, string>; // 每段自定义指令（同 key）
  setStageConfig: (key: string, instruction: string) => void;

  // === 检索 ===
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'paper-green',
      mode: 'light',
      density: 'comfortable',
      setTheme: (t) => set({ theme: t }),
      setMode: (m) => set({ mode: m }),
      toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
      setDensity: (d) => set({ density: d }),

      references: [],
      collections: [],
      tags: [],
      addReference: (ref) => set((s) => ({ references: [...s.references, ref] })),
      addReferences: (refs) => set((s) => ({ references: [...s.references, ...refs] })),
      updateReference: (id, patch) => set((s) => ({
        references: s.references.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)),
      })),
      deleteReference: (id) => set((s) => ({
        references: s.references.filter((r) => r.id !== id),
      })),

      projects: [],
      currentProjectId: null,
      setCurrentProject: (id) => set({ currentProjectId: id }),
      addProject: (p) => set((s) => ({ projects: [...s.projects, p] })),
      updateProject: (id, patch) => set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
      })),

      tasks: [],
      addTask: (t) => set((s) => ({ tasks: [...s.tasks, t] })),
      updateTask: (id, patch) => set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
      })),
      moveTask: (id, column) => set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, column, updatedAt: new Date().toISOString() } : t)),
      })),

      tables: [],

      llmConfig: null,
      setLLMConfig: (c) => set({ llmConfig: c }),

      pipelineRuns: {},
      setPipelineRun: (key, run) => set((s) => ({ pipelineRuns: { ...s.pipelineRuns, [key]: run } })),
      stageConfigs: {},
      setStageConfig: (key, instruction) => set((s) => ({ stageConfigs: { ...s.stageConfigs, [key]: instruction } })),

      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: 'selenyx-v2',
      version: 2,
    },
  ),
);
