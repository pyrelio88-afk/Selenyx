import { describe, expect, it } from 'vitest';
import { THEME_KEYS, THEME_OPTIONS, normalizeTheme } from '../themes';

describe('theme catalog', () => {
  it('offers four themes with exactly two-character names', () => {
    expect(THEME_OPTIONS.map((option) => option.key)).toEqual([...THEME_KEYS]);
    expect(THEME_OPTIONS).toHaveLength(4);
    for (const option of THEME_OPTIONS) {
      expect([...option.name]).toHaveLength(2);
      expect(option.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('drops the removed paper-green theme and unknown values', () => {
    expect(THEME_KEYS).not.toContain('paper-green');
    expect(normalizeTheme('paper-green')).toBe('forest');
    expect(normalizeTheme('not-a-theme')).toBe('forest');
    expect(normalizeTheme(undefined)).toBe('forest');
    expect(normalizeTheme('mono')).toBe('mono');
  });
});
