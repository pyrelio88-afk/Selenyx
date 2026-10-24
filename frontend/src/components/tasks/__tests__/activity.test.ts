import { describe, expect, it } from 'vitest';
import type { AgentStep } from '@services/agent';
import { formatAgentStepTime, summarizeAgentStep } from '../activity';

const step = (overrides: Partial<AgentStep> = {}): AgentStep => ({
  step: 4, ts: '2026-10-24T09:30:00Z', kind: 'tool', tool: 'search_library', ...overrides,
});

describe('persisted activity summaries', () => {
  it('summarizes the actual tool and query for the latest activity anchor', () => {
    expect(summarizeAgentStep(step({ args: { query: '研究范围', topK: 4 } })))
      .toBe('调用工具 检索文献库：查询 研究范围');
  });

  it('surfaces persisted observation errors and the run final as readable summaries', () => {
    expect(summarizeAgentStep(step({
      kind: 'observation', result: { error: '当前技能不允许使用工具 save_evidence' },
    }))).toBe('检索文献库：当前技能不允许使用工具 save_evidence');
    expect(summarizeAgentStep(step({ kind: 'final', text: '结论' }))).toBe('已生成最终成果');
  });

  it('formats valid timestamps and preserves an invalid timestamp rather than fabricating one', () => {
    expect(formatAgentStepTime('2026-10-24T09:30:00Z')).toMatch(/10\/24|24\/10/);
    expect(formatAgentStepTime('unknown-time')).toBe('unknown-time');
  });
});
