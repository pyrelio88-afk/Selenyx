import { describe, expect, it } from 'vitest';
import { CORE_RESEARCH_FRAMEWORKS, RESEARCH_FRAMEWORKS, getFrameworksByDiscipline } from '../frameworks';

describe('research frameworks', () => {
  it('keeps unique ids and required fields', () => {
    const ids = RESEARCH_FRAMEWORKS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of RESEARCH_FRAMEWORKS) {
      expect(item.fields.length).toBeGreaterThan(2);
      expect(item.example.title.length).toBeGreaterThan(4);
    }
  });

  it('exposes the new content frameworks in the full library', () => {
    const ids = new Set(RESEARCH_FRAMEWORKS.map((item) => item.id));
    for (const id of ['spirit', 'grade', 'cimo', 'design-science', 'delphi', 'cipp', 'finer', 'realist', 'rdd']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('puts FINER and design-science on the create-project core list', () => {
    const ids = CORE_RESEARCH_FRAMEWORKS.map((item) => item.id);
    expect(ids[0]).toBe('finer');
    expect(ids).toContain('design-science');
    expect(ids).toContain('spirit');
  });

  it('recommends CIMO for management and SPIRIT for medicine', () => {
    expect(getFrameworksByDiscipline('管理学').map((item) => item.id)).toContain('cimo');
    expect(getFrameworksByDiscipline('医学').map((item) => item.id)[1]).toBe('spirit');
  });
});
