/** Browser-side mirror of the small backend five-field cron validator. */

const RANGES: readonly [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week; 0/7 are Sunday
];

function isIntegerInRange(value: string, lower: number, upper: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= lower && numeric <= upper;
}

function isValidPart(part: string, lower: number, upper: number): boolean {
  const [base, ...steps] = part.split('/');
  if (steps.length > 1 || (steps.length === 1 && !steps[0])) return false;
  if (steps.length === 1) {
    const step = Number(steps[0]);
    if (!/^\d+$/.test(steps[0]) || !Number.isInteger(step) || step < 1) return false;
    // Keep the UI and backend contract intentionally small: */n and a-b/n,
    // not the different semantics some cron variants give numeric/n.
    if (base !== '*' && !base.includes('-')) return false;
  }
  if (base === '*') return true;
  const range = base.match(/^(\d+)-(\d+)$/);
  if (range) {
    return isIntegerInRange(range[1], lower, upper)
      && isIntegerInRange(range[2], lower, upper)
      && Number(range[1]) <= Number(range[2]);
  }
  return steps.length === 0 && isIntegerInRange(base, lower, upper);
}

/** Returns a user-facing error, or null when a five-field expression is valid. */
export function validateCronExpression(expression: string): string | null {
  const fields = expression.trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 5) return 'cron 需要五个字段：分 时 日 月 星期。';
  const valid = fields.every((field, index) => RANGES[index] && field.split(',').every((part) => isValidPart(part, ...RANGES[index])));
  return valid ? null : '字段只支持 *、*/n、数字、a-b、a-b/n 和逗号列表。';
}
