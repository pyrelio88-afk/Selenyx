import { describe, expect, it } from 'vitest';
import { CINNABAR, LEADING, MOTION_MS, SPACE_PT, TYPE_SCALE, isOnGrid, space } from '../designScale';

describe('v0.03 design scale', () => {
  it('locks the 8pt grid and published type ladder', () => {
    expect(SPACE_PT).toBe(8);
    expect(Object.values(TYPE_SCALE)).toEqual([11, 12, 13.5, 16, 20, 26, 32]);
    expect(LEADING).toEqual({ normal: 1.5, reading: 1.65, relaxed: 1.7 });
  });

  it('keeps motion under 300ms and cinnabar as the only accent red', () => {
    expect(Math.max(...Object.values(MOTION_MS))).toBeLessThanOrEqual(300);
    expect(CINNABAR).toBe('#c7483b');
  });

  it('treats half-steps of the 8pt grid as on-grid', () => {
    expect(space(2)).toBe(16);
    expect(isOnGrid(8)).toBe(true);
    expect(isOnGrid(12)).toBe(true);
    expect(isOnGrid(13)).toBe(false);
  });
});
