import { describe, expect, it } from 'vitest';
import { DISCIPLINES } from '../disciplines';

describe('discipline runtime data integrity', () => {
  it('does not expose numbered filler concepts or invented Selenyx standards', () => {
    const glossary = DISCIPLINES.flatMap((discipline) => discipline.glossary);
    const parameters = DISCIPLINES.flatMap((discipline) => discipline.parameters ?? []);
    const standards = DISCIPLINES.flatMap((discipline) => discipline.standards);

    expect(glossary.some((entry) => /核心概念\d{2}$/.test(entry.term))).toBe(false);
    expect(parameters.some((entry) => /关键参数\d{2}$/.test(entry.name))).toBe(false);
    expect(standards.some((entry) => /\bSEL-[A-Z]{3}-\d{2}\b/.test(entry.code))).toBe(false);
    expect(glossary.some((entry) => entry.source?.includes('Selenyx 学科扩充'))).toBe(false);
  });
});
