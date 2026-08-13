import { describe, expect, it } from 'vitest';
import { hasCompleteCountdown, isProjectNameReady } from '../projectCreatePolicy';

describe('project creation policy', () => {
  it('requires only a non-blank project name', () => {
    expect(isProjectNameReady('  ')).toBe(false);
    expect(isProjectNameReady('护理交接研究')).toBe(true);
  });

  it('keeps an incomplete optional countdown out of a new project', () => {
    expect(hasCompleteCountdown('投稿截止', '')).toBe(false);
    expect(hasCompleteCountdown('', '2026-09-01')).toBe(false);
    expect(hasCompleteCountdown('投稿截止', '2026-09-01')).toBe(true);
  });
});
