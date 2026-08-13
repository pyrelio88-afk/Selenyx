/** 同一 claim 下 supports / contradicts 并排，供裁决队列对照。 */

export interface RelatableCard {
  id: string;
  claim: string;
  relation: string;
}

export interface ContradictionPair<T extends RelatableCard> {
  key: string;
  claim: string;
  supports: T[];
  contradicts: T[];
}

export function normalizeClaim(claim: string): string {
  return claim
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。；、,.!！？?:：;'"“”‘’()（）【】]/g, '')
    .replaceAll('[', '')
    .replaceAll(']', '');
}

export function pairContradictions<T extends RelatableCard>(cards: T[]): ContradictionPair<T>[] {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const key = normalizeClaim(card.claim);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  const pairs: ContradictionPair<T>[] = [];
  for (const [key, group] of groups) {
    const supports = group.filter((card) => card.relation === 'supports');
    const contradicts = group.filter((card) => card.relation === 'contradicts');
    if (supports.length === 0 || contradicts.length === 0) continue;
    pairs.push({
      key,
      claim: supports[0]?.claim || contradicts[0]?.claim || '',
      supports,
      contradicts,
    });
  }
  return pairs;
}
