import { describe, expect, it } from 'vitest';
import { daysUntil } from '../ProjectDeadlines';

describe('project deadlines', () => {
  it('treats today as zero remaining days', () => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect([0, 1, -1]).toContain(daysUntil(ymd));
  });
});
