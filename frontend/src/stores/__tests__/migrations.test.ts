import { describe, expect, it } from 'vitest';
import { migratePersistedAppState } from '../migrations';

describe('persisted app state migration', () => {
  it('preserves research data while removing a legacy browser API key', () => {
    const migrated = migratePersistedAppState({
      projects: [{ id: 'project-1', name: 'Retained project' }],
      notes: [{ id: 'note-1' }],
      llmConfig: { provider: 'openai', apiKey: 'secret-that-must-not-persist', model: 'test' },
    });

    expect(migrated.projects).toEqual([{ id: 'project-1', name: 'Retained project', referenceIds: [], taskIds: [] }]);
    expect(migrated.notes).toEqual([{ id: 'note-1', linkedReferenceIds: [] }]);
    expect(migrated.llmConfig).toEqual({ provider: 'openai', model: 'test' });
  });

  it('repairs invalid optional state without throwing', () => {
    expect(migratePersistedAppState({ notes: 'not-an-array', pendingNoteId: 42 })).toMatchObject({
      notes: [],
      pendingNoteId: null,
    });
  });
});
