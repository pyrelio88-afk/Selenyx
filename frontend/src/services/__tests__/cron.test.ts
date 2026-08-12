import { describe, expect, it } from 'vitest';
import { validateCronExpression } from '../cron';

describe('validateCronExpression', () => {
  it('accepts the documented five-field fragments', () => {
    expect(validateCronExpression('0 8 * * 1-5')).toBeNull();
    expect(validateCronExpression('*/15 8-18/2 1,15 * 0,7')).toBeNull();
  });

  it('rejects invalid field count, range, and unsupported numeric step', () => {
    expect(validateCronExpression('0 8 * *')).not.toBeNull();
    expect(validateCronExpression('61 * * * *')).not.toBeNull();
    expect(validateCronExpression('1/5 * * * *')).not.toBeNull();
  });
});
