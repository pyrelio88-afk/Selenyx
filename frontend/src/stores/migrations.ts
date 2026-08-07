/** Pure migrations for persisted application state. */
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
  if (state.llmConfig && typeof state.llmConfig === 'object' && !Array.isArray(state.llmConfig)) {
    const llmConfig = { ...(state.llmConfig as Record<string, unknown>) };
    delete llmConfig.apiKey;
    state.llmConfig = llmConfig;
  }
  return state;
}
