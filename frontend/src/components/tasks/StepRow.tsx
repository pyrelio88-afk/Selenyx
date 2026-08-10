/**
 * Agent 步骤时间线 — 单行渲染（plan/thought/review/subagent/tool/observation/error）
 *
 * 从 TasksView 抽出的纯展示组件；final 不在这里渲染（由详情区单独成稿展示）。
 */

import { Icon } from '@components/ui/Icon';
import type { AgentStep } from '@services/agent';

export const STATUS_LABEL: Record<string, string> = {
  running: '运行中', cancelling: '取消中', completed: '已完成', failed: '失败', cancelled: '已取消',
};
export const STATUS_COLOR: Record<string, string> = {
  running: 'var(--warning)', cancelling: 'var(--warning)', completed: 'var(--success)',
  failed: 'var(--danger)', cancelled: 'var(--text-muted)',
};
const TOOL_LABEL: Record<string, string> = {
  search_library: '检索文献库', list_references: '列出文献', project_context: '读取项目概况', list_evidence: '读取证据链',
};

export function StepRow({ step }: { step: AgentStep }) {
  if (step.kind === 'plan') {
    return (
      <li className="agent-step is-plan">
        <Icon name="blueprint" size={13} />
        <span>
          <b>执行计划</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
            {(step.items ?? []).map((item, i) => <li key={i}>{item}</li>)}
          </ol>
        </span>
      </li>
    );
  }
  if (step.kind === 'thought') {
    return <li className="agent-step is-thought"><Icon name="sparkles" size={13} /><span>{step.text}</span></li>;
  }
  if (step.kind === 'review') {
    return (
      <li className={`agent-step ${step.error ? 'is-error' : 'is-review'}`}>
        <Icon name="warning" size={13} />
        <span><b>{step.critic ?? '批评员'}审阅</b>{step.text ? `：${step.text}` : ''}</span>
      </li>
    );
  }
  if (step.kind === 'subagent') {
    return (
      <li className="agent-step is-subagent">
        <Icon name="chip" size={13} />
        <span>专家 <b>{step.expert}</b> {step.tool ? `调用 ${TOOL_LABEL[step.tool] ?? step.tool}` : '处理中'}</span>
      </li>
    );
  }
  if (step.kind === 'tool') {
    return (
      <li className="agent-step is-tool">
        <Icon name="blueprint" size={13} />
        <span>调用工具 <b>{TOOL_LABEL[step.tool ?? ''] ?? step.tool}</b>
          {step.tool === 'search_library' && typeof step.args?.query === 'string' ? <code>{step.args.query}</code> : null}
        </span>
      </li>
    );
  }
  if (step.kind === 'observation') {
    const result = step.result as { count?: number; error?: string } | undefined;
    return (
      <li className="agent-step is-observation">
        <Icon name="check" size={13} />
        <span>{result?.error ? `工具返回：${result.error}` : `观察到 ${result?.count ?? '若干'} 条结果`}</span>
      </li>
    );
  }
  if (step.kind === 'error') {
    return <li className="agent-step is-error"><Icon name="warning" size={13} /><span>{step.message}</span></li>;
  }
  return null; // final 单独渲染
}
