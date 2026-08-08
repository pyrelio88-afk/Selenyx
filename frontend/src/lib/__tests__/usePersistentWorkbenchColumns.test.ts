import { describe, expect, it } from 'vitest';
import { clampWorkbenchPaneSize } from '../usePersistentWorkbenchColumns';

describe('clampWorkbenchPaneSize', () => {
  it('keeps pane widths inside their usable range', () => {
    expect(clampWorkbenchPaneSize(216.6, 184, [152, 280])).toBe(217);
    expect(clampWorkbenchPaneSize(8, 184, [152, 280])).toBe(152);
    expect(clampWorkbenchPaneSize(999, 184, [152, 280])).toBe(280);
  });

  it('falls back safely for invalid persisted browser data', () => {
    expect(clampWorkbenchPaneSize('wide', 320, [260, 420])).toBe(320);
    expect(clampWorkbenchPaneSize(Number.NaN, 320, [260, 420])).toBe(320);
  });
});
