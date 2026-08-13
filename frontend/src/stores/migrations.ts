/** Pure migrations for persisted application state. */

/** v4 IA 重排：旧导航 key → 新容器视图（侧边栏 7 项 + 设置弹窗） */
const V4_VIEW_MAP: Record<string, string> = {
  dashboard: 'newTask',
  aiChat: 'assistant',
  settings: 'newTask',
  references: 'library',
  notes: 'library',
  tables: 'library',
  clinicalData: 'library',
  experts: 'extensions',
  skills: 'extensions',
  connectors: 'extensions',
  statTools: 'more',
  tools: 'more',
};

export function migratePersistedAppState(persistedState: unknown): Record<string, unknown> {
  const state = persistedState && typeof persistedState === 'object' && !Array.isArray(persistedState)
    ? { ...(persistedState as Record<string, unknown>) }
    : {};

  if (!Array.isArray(state.projects)) {
    state.projects = [];
  } else {
    state.projects = state.projects.map((project) => {
      if (!project || typeof project !== 'object' || Array.isArray(project)) return project;
      const normalized = { ...(project as Record<string, unknown>) };
      if (!Array.isArray(normalized.referenceIds)) normalized.referenceIds = [];
      if (!Array.isArray(normalized.taskIds)) normalized.taskIds = [];
      return normalized;
    });
  }
  if (!Array.isArray(state.notes)) {
    state.notes = [];
  } else {
    state.notes = state.notes.map((note) => {
      if (!note || typeof note !== 'object' || Array.isArray(note)) return note;
      const normalized = { ...(note as Record<string, unknown>) };
      if (!Array.isArray(normalized.linkedReferenceIds)) normalized.linkedReferenceIds = [];
      return normalized;
    });
  }
  if (state.pendingNoteId !== null && typeof state.pendingNoteId !== 'string') state.pendingNoteId = null;
  // Deadlines predate project ownership. Preserve them as explicitly
  // unassigned rather than silently attaching them to an arbitrary project.
  if (!Array.isArray(state.customCountdowns)) {
    state.customCountdowns = [];
  } else {
    state.customCountdowns = state.customCountdowns
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        label: typeof item.label === 'string' ? item.label : '',
        date: typeof item.date === 'string' ? item.date : '',
        color: typeof item.color === 'string' ? item.color : '#c7483b',
        projectId: typeof item.projectId === 'string' ? item.projectId : null,
      }));
  }
  // v4：废弃视图的持久化 currentView 归一化（旧 key 落到新容器）
  if (typeof state.currentView === 'string' && V4_VIEW_MAP[state.currentView]) {
    state.currentView = V4_VIEW_MAP[state.currentView];
  }
  if (state.llmConfig && typeof state.llmConfig === 'object' && !Array.isArray(state.llmConfig)) {
    const llmConfig = { ...(state.llmConfig as Record<string, unknown>) };
    delete llmConfig.apiKey;
    state.llmConfig = llmConfig;
  }
  return state;
}
