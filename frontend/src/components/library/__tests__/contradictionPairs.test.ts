import { describe, expect, it } from 'vitest';
import { normalizeClaim, pairContradictions } from '../contradictionPairs';

function card(id: string, claim: string, relation: string) {
  return { id, claim, relation };
}

describe('pairContradictions', () => {
  it('pairs supports and contradicts of the same claim', () => {
    const pairs = pairContradictions([
      card('a', '集束化护理降低谵妄', 'supports'),
      card('b', '集束化护理降低谵妄。', 'contradicts'),
      card('c', '另一论断', 'supports'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].supports.map((item) => item.id)).toEqual(['a']);
    expect(pairs[0].contradicts.map((item) => item.id)).toEqual(['b']);
  });

  it('ignores qualifies-only or one-sided claims', () => {
    expect(pairContradictions([
      card('a', '同一句', 'supports'),
      card('b', '同一句', 'qualifies'),
    ])).toEqual([]);
  });

  it('normalizes punctuation and case before grouping', () => {
    expect(normalizeClaim('Hello，世界。')).toBe(normalizeClaim('hello 世界'));
  });
});
