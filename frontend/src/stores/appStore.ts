/**
 * Selenyx 全局状态管理 (Zustand)
 * 从 JS 版 localStorage 迁移为 Zustand store + persist 中间件
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Reference, ResearchProject, RefCollection, RefTag,
  KanbanTask, LLMConfig, MultiDimTable, TableField,
  Note,
} from '@apptypes/index';
import { createEmptyNote } from '@apptypes/index';

export type ViewKey =
  | 'dashboard' | 'projects' | 'references' | 'pipeline'
  | 'tables' | 'statTools' | 'clinicalData' | 'aiChat' | 'settings' | 'tools' | 'skills'
  | 'notes';

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
  // === 导航 ===
  currentView: ViewKey;
  setView: (v: ViewKey) => void;

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
  addTable: (t: MultiDimTable) => void;
  updateTable: (id: string, patch: Partial<MultiDimTable>) => void;
  deleteTable: (id: string) => void;
  addTableField: (tableId: string, field: TableField) => void;
  removeTableField: (tableId: string, fieldId: string) => void;
  addTableRecord: (tableId: string, record: Record<string, unknown>) => void;
  updateTableRecord: (tableId: string, recordIdx: number, patch: Record<string, unknown>) => void;
  deleteTableRecord: (tableId: string, recordIdx: number) => void;

  // === 自定义倒数日 ===
  customCountdowns: { label: string; date: string; color: string }[];
  addCountdown: (c: { label: string; date: string; color: string }) => void;
  removeCountdown: (idx: number) => void;

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

  // === R109：笔记区 ===
  notes: Note[];
  addNote: (partial?: Partial<Note>) => string; // 返回新笔记 id
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  toggleNotePin: (id: string) => void;
  /** 跨视图触发：从流水线/文献页快速记笔记后，记录待打开的笔记 id */
  pendingNoteId: string | null;
  setPendingNoteId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentView: 'dashboard' as ViewKey,
      setView: (v) => set({ currentView: v }),

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
      addTable: (t) => set((s) => ({ tables: [...s.tables, t] })),
      updateTable: (id, patch) => set((s) => ({
        tables: s.tables.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
      })),
      deleteTable: (id) => set((s) => ({
        tables: s.tables.filter((t) => t.id !== id),
      })),
      addTableField: (tableId, field) => set((s) => ({
        tables: s.tables.map((t) => (t.id === tableId ? { ...t, fields: [...t.fields, field], updatedAt: new Date().toISOString() } : t)),
      })),
      removeTableField: (tableId, fieldId) => set((s) => ({
        tables: s.tables.map((t) => (t.id === tableId ? { ...t, fields: t.fields.filter((f) => f.id !== fieldId), updatedAt: new Date().toISOString() } : t)),
      })),
      addTableRecord: (tableId, record) => set((s) => ({
        tables: s.tables.map((t) => (t.id === tableId ? { ...t, records: [...t.records, record], updatedAt: new Date().toISOString() } : t)),
      })),
      updateTableRecord: (tableId, recordIdx, patch) => set((s) => ({
        tables: s.tables.map((t) => (t.id === tableId
          ? { ...t, records: t.records.map((r, i) => (i === recordIdx ? { ...r, ...patch } : r)), updatedAt: new Date().toISOString() }
          : t)),
      })),
      deleteTableRecord: (tableId, recordIdx) => set((s) => ({
        tables: s.tables.map((t) => (t.id === tableId
          ? { ...t, records: t.records.filter((_, i) => i !== recordIdx), updatedAt: new Date().toISOString() }
          : t)),
      })),

      llmConfig: null,
      setLLMConfig: (c) => set({ llmConfig: c }),

      // 自定义倒数日
      customCountdowns: [],
      addCountdown: (c) => set((s) => ({ customCountdowns: [...s.customCountdowns, c] })),
      removeCountdown: (idx) => set((s) => ({ customCountdowns: s.customCountdowns.filter((_, i) => i !== idx) })),

      pipelineRuns: {},
      setPipelineRun: (key, run) => set((s) => ({ pipelineRuns: { ...s.pipelineRuns, [key]: run } })),
      stageConfigs: {},
      setStageConfig: (key, instruction) => set((s) => ({ stageConfigs: { ...s.stageConfigs, [key]: instruction } })),

      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // === R109：笔记区 ===
      notes: [],
      addNote: (partial) => {
        const note = createEmptyNote(partial);
        set((s) => ({ notes: [note, ...s.notes] }));
        return note.id;
      },
      updateNote: (id, patch) => set((s) => ({
        notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
      })),
      deleteNote: (id) => set((s) => ({
        notes: s.notes.filter((n) => n.id !== id),
        pendingNoteId: s.pendingNoteId === id ? null : s.pendingNoteId,
      })),
      toggleNotePin: (id) => set((s) => ({
        notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n)),
      })),
      pendingNoteId: null,
      setPendingNoteId: (id) => set({ pendingNoteId: id }),
    }),
    {
      name: 'selenyx-v2',
      version: 4,
      // D6：版本化迁移链（R102）。migrate 只做"补默认值 + 结构调整"，绝不整个 reset
      // ——reset 留给下方 storage.getItem 的 JSON 预校验兜底（数据真损坏读不出时才回退）。
      // 新增持久化字段时在此补默认（state.xxx ??= defaultValue），保持链路完整可追踪。
      migrate: (persistedState: unknown, _version: number) => {
        const state = (persistedState as Record<string, unknown>) ?? {};
        // v<2 → v2：R91.1 时代字段补默认（历史布局/配置缺字段类崩溃的正式迁移占位）
        // v2 → v3：本轮起占位，后续新增持久化字段在此补默认
        // v3 → v4（R109）：笔记区持久化字段补默认
        if (!Array.isArray(state.notes)) state.notes = [];
        if (state.pendingNoteId !== null && typeof state.pendingNoteId !== 'string') state.pendingNoteId = null;
        return state;
      },
      // C1 修复：自定义 storage 预校验 JSON，脏数据降级为初始状态而非白屏崩溃
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          try { JSON.parse(raw); return raw; } catch { return null; }
        },
        setItem: (name, value) => {
          try { localStorage.setItem(name, value); } catch { /* quota exceeded */ }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name); } catch { /* storage disabled */ }
        },
      })),
    },
  ),
);
