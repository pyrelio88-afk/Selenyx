import { describe, expect, it } from 'vitest';
import { DISCIPLINES } from '../disciplines';

describe('discipline runtime data integrity', () => {
  it('exposes all 13 curated academic disciplines without synthetic or Cartesian filler entries', () => {
    expect(DISCIPLINES.length).toBeGreaterThanOrEqual(13);
    const glossary = DISCIPLINES.flatMap((discipline) => discipline.glossary);
    const parameters = DISCIPLINES.flatMap((discipline) => discipline.parameters ?? []);
    const standards = DISCIPLINES.flatMap((discipline) => discipline.standards);

    expect(glossary.length).toBeGreaterThan(200);
    expect(glossary.some((entry) => /核心概念\d{2}$/.test(entry.term))).toBe(false);
    expect(glossary.some((entry) => /Comparative .* in /.test(entry.termEn ?? ''))).toBe(false);
    expect(glossary.some((entry) => entry.definition.includes('领域中，以比较取向讨论'))).toBe(false);
    expect(parameters.some((entry) => /关键参数\d{2}$/.test(entry.name))).toBe(false);
    expect(standards.some((entry) => /\bSEL-[A-Z]{3}-\d{2}\b/.test(entry.code))).toBe(false);
    expect(glossary.some((entry) => entry.source?.includes('Selenyx 学科扩充'))).toBe(false);
  });
});
