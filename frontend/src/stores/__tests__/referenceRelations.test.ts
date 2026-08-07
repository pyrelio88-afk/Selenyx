import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Note, Reference, ResearchProject } from '@apptypes/index';
import { useAppStore } from '../appStore';

type RelatedState = Pick<ReturnType<typeof useAppStore.getState>, 'references' | 'projects' | 'notes'>;

let savedState: RelatedState;

beforeEach(() => {
  const state = useAppStore.getState();
  savedState = {
    references: state.references,
    projects: state.projects,
    notes: state.notes,
  };
});

afterEach(() => {
  useAppStore.setState(savedState);
});

describe('reference relationship deletion', () => {
  it('removes the reference and cleans project and note links in one store action', () => {
    useAppStore.setState({
      references: [{ id: 'ref-remove' } as Reference, { id: 'ref-keep' } as Reference],
      projects: [{ id: 'project-1', referenceIds: ['ref-remove', 'ref-keep'] } as ResearchProject],
      notes: [{ id: 'note-1', linkedReferenceIds: ['ref-remove', 'ref-keep'] } as Note],
    });

    useAppStore.getState().deleteReferenceAndRelations('ref-remove');

    const state = useAppStore.getState();
    expect(state.references.map((reference) => reference.id)).toEqual(['ref-keep']);
    expect(state.projects[0]?.referenceIds).toEqual(['ref-keep']);
    expect(state.notes[0]?.linkedReferenceIds).toEqual(['ref-keep']);
  });

  it('tolerates legacy objects with no relationship arrays', () => {
    const legacyProject = { id: 'legacy-project' } as ResearchProject;
    const legacyNote = { id: 'legacy-note' } as Note;
    useAppStore.setState({
      references: [{ id: 'ref-remove' } as Reference],
      projects: [legacyProject],
      notes: [legacyNote],
    });

    expect(() => useAppStore.getState().deleteReferenceAndRelations('ref-remove')).not.toThrow();

    const state = useAppStore.getState();
    expect(state.references).toEqual([]);
    expect(state.projects[0]).toBe(legacyProject);
    expect(state.notes[0]).toBe(legacyNote);
  });
});
