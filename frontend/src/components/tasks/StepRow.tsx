/**
 * Agent 步骤时间线 — 单行渲染（plan/thought/review/subagent/tool/observation/error）
 *
 * 从 TasksView 抽出的纯展示组件；final 不在这里渲染（由详情区单独成稿展示）。
 */

import { Icon } from '@components/ui/Icon';
import type { AgentStep } from '@services/agent';

export const STATUS_LABEL: Record<string, string> = {
  running: '运行中', cancelling: '取消中', completed: '已完成', failed: '失败', cancelled: '已取消',
  waiting_confirm: '待确认计划',
};
export const STATUS_COLOR: Record<string, string> = {
  running: 'var(--warning)', cancelling: 'var(--warning)', completed: 'var(--success)',
  failed: 'var(--danger)', cancelled: 'var(--text-muted)', waiting_confirm: 'var(--accent)',
};
const TOOL_LABEL: Record<string, string> = {
  search_library: '检索文献库', list_references: '列出文献', project_context: '读取项目概况', list_evidence: '读取证据链',
  save_evidence: '落证据卡', list_pending_evidence: '查看待裁决证据', ask_expert: '委托专家',
  write_note: '写入笔记', export_artifact: '导出工件', list_notes: '读取笔记列表', read_note: '读取笔记',
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
    const result = step.result as { count?: number; error?: string; saved?: boolean; message?: string } | undefined;
    return (
      <li className="agent-step is-observation">
        <Icon name="check" size={13} />
        <span>{result?.error ? `工具返回：${result.error}` : result?.saved ? `已保存${result.message ? `：${result.message}` : ''}` : `观察到 ${result?.count ?? '若干'} 条结果`}</span>
      </li>
    );
  }
  if (step.kind === 'coverage') {
    const s = step as unknown as { sentences?: number; supported?: number; fullyAccepted?: number };
    return (
      <li className="agent-step is-observation">
        <Icon name="check" size={13} />
        <span>证据校验：{s.supported ?? 0}/{s.sentences ?? 0} 论断有据，其中 {s.fullyAccepted ?? 0} 条人工已接受</span>
      </li>
    );
  }
  if (step.kind === 'steer') {
    return (
      <li className="agent-step is-steer">
        <Icon name="editIn" size={13} />
        <span><b>你的插话</b>：{step.text}</span>
      </li>
    );
  }
  if (step.kind === 'waiting') {
    return (
      <li className="agent-step is-waiting">
        <Icon name="clock" size={13} />
        <span>{step.text ?? '等待人工确认'}</span>
      </li>
    );
  }
  if (step.kind === 'error') {
    return <li className="agent-step is-error"><Icon name="warning" size={13} /><span>{step.message}</span></li>;
  }
  return null; // final 单独渲染
}
