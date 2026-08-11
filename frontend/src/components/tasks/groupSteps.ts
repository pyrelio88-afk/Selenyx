/**
 * 时间线 subagent 折叠分组（V4 模块 E）。
 *
 * 主 agent 委托专家时，专家的每步工具调用都以独立 subagent 条目流入
 * 审计时间线——长委托会把时间线冲得很散。这里把「同一专家的连续
 * subagent 条目」合并为一个可展开分组（专家名 + 步数 + 结论摘要）；
 * 紧随其后 ask_expert 的观察条目（专家的 final 答案）并入分组作摘要，
 * 不再单独渲染为「观察到若干条结果」。
 */

import type { AgentStep } from '@services/agent';

export interface SubagentGroup {
  kind: 'subagentGroup';
  expert: string;
  entries: AgentStep[];
  /** 专家 final 结论（来自 ask_expert 观察条目，可空） */
  answer?: string;
}

export type TimelineItem = AgentStep | SubagentGroup;

export function isSubagentGroup(item: TimelineItem): item is SubagentGroup {
  return (item as SubagentGroup).kind === 'subagentGroup';
}

export function groupSubagentSteps(steps: AgentStep[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.kind !== 'subagent') {
      out.push(step);
      i += 1;
      continue;
    }
    const expert = step.expert ?? '';
    const entries: AgentStep[] = [step];
    i += 1;
    while (i < steps.length && steps[i].kind === 'subagent' && (steps[i].expert ?? '') === expert) {
      entries.push(steps[i]);
      i += 1;
    }
    let answer: string | undefined;
    const next = steps[i];
    if (next && next.kind === 'observation' && next.tool === 'ask_expert') {
      const result = next.result as { answer?: string; error?: string } | undefined;
      answer = result?.answer ?? result?.error;
      if (answer) i += 1; // 有结论才并入；出错/无答案的观察保留原样渲染
    }
    out.push({ kind: 'subagentGroup', expert, entries, answer });
  }
  return out;
}
