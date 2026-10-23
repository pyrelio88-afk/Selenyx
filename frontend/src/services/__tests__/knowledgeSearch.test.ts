import { describe, expect, it } from 'vitest';
import type { Note, Reference, ResearchProject } from '@apptypes/index';
import {
  buildKnowledgeEntries,
  formatKnowledgeTime,
  knowledgeSnippet,
  searchKnowledge,
} from '../knowledgeSearch';

function reference(partial: Partial<Reference>): Reference {
  return {
    id: 'ref-1',
    title: '',
    abstract: '',
    creators: [],
    publication: '',
    year: '',
    tags: [],
    doi: '',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...partial,
  } as Reference;
}

function note(partial: Partial<Note>): Note {
  return {
    id: 'note-1',
    title: '',
    body: '',
    category: '心得',
    tags: [],
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...partial,
  } as Note;
}

function project(partial: Partial<ResearchProject>): ResearchProject {
  return {
    id: 'project-1',
    name: '',
    description: '',
    currentStage: 'literature',
    tags: [],
    referenceIds: [],
    taskIds: [],
    status: 'active',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...partial,
  } as ResearchProject;
}

describe('buildKnowledgeEntries', () => {
  it('composes readable metadata for all three local sources', () => {
    const entries = buildKnowledgeEntries({
      references: [reference({
        id: 'r1',
        title: '脓毒症早期识别',
        creators: [
          { lastName: '王', firstName: '一' },
          { lastName: '李', firstName: '二' },
          { lastName: '陈', firstName: '三' },
        ],
        year: '2024',
        publication: '中华医学杂志',
        abstract: '一项多中心队列研究',
      } as Partial<Reference>)],
      notes: [note({ id: 'n1', title: '', body: '液体复苏要点', tags: ['复苏'] })],
      projects: [project({ id: 'p1', name: '脓毒症复苏路径', description: '院内路径' })],
    });

    expect(entries[0]).toMatchObject({
      id: 'r1',
      kind: 'reference',
      title: '脓毒症早期识别',
      subtitle: '王 一、李 二 等 · 2024 · 中华医学杂志',
    });
    expect(entries[0].body).toContain('一项多中心队列研究');
    expect(entries[1]).toMatchObject({ title: '无标题笔记', subtitle: '心得 · #复苏' });
    expect(entries[2]).toMatchObject({ title: '脓毒症复苏路径', subtitle: '进行中 · 检索' });
  });
});

describe('searchKnowledge', () => {
  const entries = buildKnowledgeEntries({
    references: [
      reference({
        id: 'ref-title',
        title: '脓毒症早期识别：一项队列研究',
        abstract: '讨论液体复苏与预后',
        updatedAt: '2026-10-21T08:00:00.000Z',
      }),
      reference({
        id: 'ref-body',
        title: '急诊感染综述',
        abstract: '脓毒症的筛查工具',
        updatedAt: '2026-10-22T08:00:00.000Z',
      }),
    ],
    notes: [note({
      id: 'note-body',
      title: '读片记录',
      body: '脓毒症患者的液体复苏需要动态评估',
      updatedAt: '2026-10-23T08:00:00.000Z',
    })],
    projects: [project({
      id: 'project-title',
      name: '脓毒症复苏路径研究',
      description: '院内路径',
      updatedAt: '2026-10-19T08:00:00.000Z',
    })],
  });

  it('ranks title matches above metadata and body matches', () => {
    const hits = searchKnowledge(entries, '脓毒症');
    expect(hits.map((hit) => hit.entry.id)).toEqual([
      'ref-title', 'project-title', 'note-body', 'ref-body',
    ]);
  });

  it('requires every query token to appear', () => {
    const hits = searchKnowledge(entries, '脓毒症 液体 动态');
    expect(hits.map((hit) => hit.entry.id)).toEqual(['note-body']);
  });

  it('returns recent entries for an empty query', () => {
    const hits = searchKnowledge(entries, '   ', 3);
    expect(hits.map((hit) => hit.entry.id)).toEqual(['note-body', 'ref-body', 'ref-title']);
    expect(hits[0].score).toBe(0);
  });

  it('returns a snippet around the matching text', () => {
    const hits = searchKnowledge(entries, '动态');
    expect(hits[0].snippet).toContain('动态');
    expect(hits[0].snippet).toContain('液体复苏');
  });
});

describe('snippet and time formatting', () => {
  it('strips markdown markers and truncates long text', () => {
    const snippet = knowledgeSnippet(`## 标题\n\n${'前'.repeat(120)}关键发现${'后'.repeat(40)}`, '关键发现', 60);
    expect(snippet).not.toContain('#');
    expect(snippet).toContain('关键发现');
    expect(snippet.length).toBeLessThanOrEqual(62);
  });

  it('formats today, this year and older dates', () => {
    const now = new Date(2026, 9, 23, 15, 4);
    const today = new Date(2026, 9, 23, 9, 8).toISOString();
    const thisYear = new Date(2026, 2, 5, 10, 0).toISOString();
    const older = new Date(2024, 11, 31, 10, 0).toISOString();
    expect(formatKnowledgeTime(today, now)).toBe('09:08');
    expect(formatKnowledgeTime(thisYear, now)).toBe('3月5日');
    expect(formatKnowledgeTime(older, now)).toBe('2024-12-31');
    expect(formatKnowledgeTime('not-a-date', now)).toBe('');
  });
});
