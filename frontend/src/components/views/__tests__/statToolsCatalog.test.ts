import { describe, expect, it } from 'vitest';
import { CALC_LIST, filterStatToolGroups } from '../StatToolsView';

describe('statistics workbench catalog', () => {
  it('keeps every implemented calculator in exactly one group', () => {
    const grouped = filterStatToolGroups('').flatMap((group) => group.items);
    expect(grouped).toHaveLength(18);
    expect(new Set(grouped.map((item) => item.key)).size).toBe(CALC_LIST.length);
  });

  it('searches labels, descriptions and group names', () => {
    expect(filterStatToolGroups('描述').flatMap((group) => group.items).map((item) => item.key))
      .toEqual(['ci', 'effectsize']);
    expect(filterStatToolGroups('诊断').flatMap((group) => group.items).map((item) => item.key))
      .toEqual(['diagtest', 'cronbach', 'roc']);
    expect(filterStatToolGroups('森林图').flatMap((group) => group.items).map((item) => item.key))
      .toEqual(['logistic']);
    expect(filterStatToolGroups('生存').flatMap((group) => group.items).map((item) => item.key))
      .toEqual(['survival']);
  });

  it('returns no groups for an unmatched query', () => {
    expect(filterStatToolGroups('不存在的方法')).toEqual([]);
  });
});
