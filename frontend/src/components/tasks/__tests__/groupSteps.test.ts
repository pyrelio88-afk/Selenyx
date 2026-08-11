/**
 * subagent 时间线折叠分组（V4 模块 E）的纯函数测试。
 */

import { describe, expect, it } from 'vitest';
import { groupSubagentSteps, isSubagentGroup, type TimelineItem } from '../groupSteps';
import type { AgentStep } from '@services/agent';

function step(partial: Partial<AgentStep>): AgentStep {
  return { step: 1, kind: 'thought', ts: '2026-08-10T00:00:00', ...partial } as AgentStep;
}

function groups(items: TimelineItem[]) {
  return items.filter(isSubagentGroup);
}

describe('groupSubagentSteps', () => {
  it('同一专家的连续 subagent 条目合并为一组，尾随 ask_expert 观察并入作结论', () => {
    const items = groupSubagentSteps([
      step({ kind: 'thought', text: '想' }),
      step({ kind: 'subagent', expert: '文献综述员', tool: 'search_library' }),
      step({ kind: 'subagent', expert: '文献综述员', tool: 'list_evidence' }),
      step({ kind: 'observation', tool: 'ask_expert', result: { expert: '文献综述员', answer: '综述结论摘要' } }),
      step({ kind: 'final', text: '成稿' }),
    ]);
    expect(items).toHaveLength(3);
    const group = groups(items)[0];
    expect(group.expert).toBe('文献综述员');
    expect(group.entries).toHaveLength(2);
    expect(group.answer).toBe('综述结论摘要');
  });

  it('不同专家的相邻条目不合并', () => {
    const items = groupSubagentSteps([
      step({ kind: 'subagent', expert: '文献综述员', tool: 'search_library' }),
      step({ kind: 'subagent', expert: '论文批评员', tool: 'list_evidence' }),
    ]);
    expect(groups(items)).toHaveLength(2);
  });

  it('ask_expert 观察无答案时保留原观察条目', () => {
    const items = groupSubagentSteps([
      step({ kind: 'subagent', expert: '统计顾问', tool: 'project_context' }),
      step({ kind: 'observation', tool: 'ask_expert', result: { expert: '统计顾问' } }),
    ]);
    expect(items).toHaveLength(2);
    expect(groups(items)[0].answer).toBeUndefined();
    expect(items[1]).toMatchObject({ kind: 'observation' });
  });

  it('普通条目原样通过', () => {
    const items = groupSubagentSteps([step({ kind: 'plan', items: ['a'] }), step({ kind: 'tool', tool: 'search_library' })]);
    expect(items).toHaveLength(2);
    expect(groups(items)).toHaveLength(0);
  });
});
