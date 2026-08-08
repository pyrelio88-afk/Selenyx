import { describe, expect, it } from 'vitest';
import type { Note, ResearchProject } from '@apptypes/index';
import { filterAndSortNotes, inferLinkedProjects, noteHasUnsavedChanges, noteSnippet } from '../NotesView';

function note(patch: Partial<Note> = {}): Note {
  return { id: 'n1', title: '护理交接', body: '## 原文\n证据判断', category: '心得', tags: ['SBAR'], linkedReferenceIds: [], linkedStage: null, mood: '', pinned: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...patch };
}

describe('Notes workbench data helpers', () => {
  it('finds notes through content and keeps pinned notes first', () => {
    const regular = note({ id: 'regular', title: '普通', updatedAt: '2026-03-01T00:00:00Z' });
    const pinned = note({ id: 'pinned', title: '关键', body: 'SBAR 证据', pinned: true, updatedAt: '2026-01-01T00:00:00Z' });
    expect(filterAndSortNotes([regular, pinned], 'SBAR 证据', '', '', 'updated').map((item) => item.id)).toEqual(['pinned']);
    expect(filterAndSortNotes([regular, pinned], '', '', '', 'updated')[0].id).toBe('pinned');
  });

  it('detects only persisted-field draft changes', () => {
    const saved = note();
    expect(noteHasUnsavedChanges({ ...saved }, saved)).toBe(false);
    expect(noteHasUnsavedChanges({ ...saved, body: `${saved.body}\n新判断` }, saved)).toBe(true);
    expect(noteHasUnsavedChanges({ ...saved, updatedAt: '2030-01-01T00:00:00Z' }, saved)).toBe(false);
  });

  it('links projects only through real reference relationships', () => {
    const projects = [{ id: 'p1', referenceIds: ['r1'] }, { id: 'p2', referenceIds: ['r2'] }] as ResearchProject[];
    expect(inferLinkedProjects(note({ linkedReferenceIds: ['r2'] }), projects).map((project) => project.id)).toEqual(['p2']);
    expect(inferLinkedProjects(note(), projects)).toEqual([]);
  });

  it('builds a plain-text list snippet', () => {
    expect(noteSnippet('## 标题\n- **结论**')).toBe('标题 结论');
  });
});
