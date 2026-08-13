import { describe, expect, it } from 'vitest';
import { relativeTime } from '../RunningTasks';

describe('sidebar IA', () => {
  it('formats relative time without leaking project chrome', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime(new Date().toISOString())).toBe('刚刚');
  });
});
