/** 成稿证据染色逻辑测试（V4 模块 C 前端） */

import { describe, expect, it } from 'vitest';
import { coverageBadge, splitSentences, stainSentences, type EvidenceLite } from '../staining';

const ev = (id: string, review: string): EvidenceLite => ({ id, claim: `论断${id}`, excerpt: `摘录${id}`, review });

describe('stainSentences', () => {
  const evidence = new Map([
    ['e1', ev('e1', 'accepted')],
    ['e2', ev('e2', 'pending')],
  ]);

  it('全接受引用 → 绿', () => {
    const [s] = stainSentences('集束化护理有效[^e:e1]。', evidence);
    expect(s.stain).toBe('accepted');
    expect(s.text).toBe('集束化护理有效。');
    expect(s.refs).toEqual(['e1']);
  });

  it('含 pending 引用 → 黄', () => {
    const [s] = stainSentences('光照或相关[^e:e1][^e:e2]。', evidence);
    expect(s.stain).toBe('candidate');
  });

  it('无据断言与编造引用 → 红', () => {
    const [unsourced] = stainSentences('这是断言[^none]。', evidence);
    expect(unsourced.stain).toBe('unsourced');
    const [fabricated] = stainSentences('假引用[^e:ghost]。', evidence);
    expect(fabricated.stain).toBe('unsourced');
    expect(fabricated.invalidRefs).toEqual(['ghost']);
  });

  it('无标记句 → 中性不染色', () => {
    const [s] = stainSentences('本句没有标记。', evidence);
    expect(s.stain).toBe('neutral');
    expect(s.refs).toEqual([]);
  });

  it('多句混合与英文句读', () => {
    const out = stainSentences('第一句有据[^e:e1]. Second has none[^none].', evidence);
    expect(out.map((s) => s.stain)).toEqual(['accepted', 'unsourced']);
  });
});

describe('splitSentences / coverageBadge', () => {
  it('按中文句读与换行断句', () => {
    expect(splitSentences('甲。乙！\n丙；')).toEqual(['甲。', '乙！', '丙；']);
  });

  it('徽标文案', () => {
    expect(coverageBadge({ sentences: 15, supported: 13, fullyAccepted: 11, unsourced: 2, coverage: 13 / 15 }))
      .toBe('证据覆盖率 87%（13/15 论断有据，其中 11 条人工已接受）');
  });
});
