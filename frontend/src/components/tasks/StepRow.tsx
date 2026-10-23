/**
 * Agent 步骤时间线 — 单行渲染（plan/thought/review/subagent/tool/observation/error）
 *
 * 从 TasksView 抽出的纯展示组件；final 不在这里渲染（由详情区单独成稿展示）。
 */

import { useState } from 'react';
import { Icon } from '@components/ui/Icon';
import type { AgentStep } from '@services/agent';

export const STATUS_LABEL: Record<string, string> = {
  running: '运行中', cancelling: '取消中', completed: '已完成', failed: '失败', cancelled: '已取消',
  waiting_confirm: '待确认计划', waiting_evidence: '等待证据裁决',
};
export const STATUS_COLOR: Record<string, string> = {
  running: 'var(--warning)', cancelling: 'var(--warning)', completed: 'var(--success)',
  failed: 'var(--danger)', cancelled: 'var(--text-muted)', waiting_confirm: 'var(--accent)',
  waiting_evidence: 'var(--accent)',
};
const TOOL_LABEL: Record<string, string> = {
  search_library: '检索文献库', list_references: '列出文献', project_context: '读取项目概况', list_evidence: '读取证据链',
  save_evidence: '落证据卡', list_pending_evidence: '查看待裁决证据', ask_expert: '委托专家',
  write_note: '写入笔记', export_artifact: '导出工件', list_notes: '读取笔记列表', read_note: '读取笔记',
  read_memory: '读取记忆', write_memory: '写入记忆',
};

function formatToolData(value: unknown, missing: string): string {
  if (value === undefined) return missing;
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? missing;
}

function ToolStepRow({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);
  const isObservation = step.kind === 'observation';
  const result = step.result !== null && typeof step.result === 'object' && !Array.isArray(step.result)
    ? step.result as Record<string, unknown> : undefined;
  const failed = Boolean(step.error || result?.error || result?.saved === false || result?.success === false || result?.isError === true);
  const count = typeof result?.count === 'number' && Number.isFinite(result.count)
    ? result.count : Array.isArray(step.result) ? step.result.length : undefined;
  const resultSummary = [
    failed ? (result?.saved === false ? '保存失败' : '工具错误') : result?.saved === true ? '已保存' : '',
    count !== undefined ? `${count} 条结果` : '',
    typeof result?.error === 'string' ? result.error : '',
    typeof result?.message === 'string' ? result.message : step.message,
  ].filter(Boolean).join(' · ') || '已返回结果';
  const summary = isObservation || failed ? resultSummary
    : typeof step.args?.query === 'string' ? `查询：${step.args.query}` : '查看调用参数';
  const toolLabel = TOOL_LABEL[step.tool ?? ''] ?? step.tool ?? '未知工具';

  return (
    <li className={`agent-step ${failed ? 'is-error' : isObservation ? 'is-observation' : 'is-tool'}`}>
      <details className="agent-tool-disclosure" onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          <Icon name={failed ? 'warning' : isObservation ? 'list' : 'blueprint'} size={13} />
          <span className="agent-tool-title">{isObservation ? '工具返回' : '调用工具'} {toolLabel}</span>
          <span className="agent-tool-summary">{summary}</span>
          <span className="agent-tool-action">详情</span>
        </summary>
        {expanded && (
          <div className="agent-tool-body">
            {(!isObservation || step.args !== undefined) && (
              <>
                <b>调用参数</b>
                <pre>{formatToolData(step.args, '未记录参数')}</pre>
              </>
            )}
            {(isObservation || step.result !== undefined) && (
              <>
                <b>返回结果</b>
                <pre>{formatToolData(step.result, '未记录结果')}</pre>
              </>
            )}
          </div>
        )}
      </details>
    </li>
  );
}

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
  if (step.kind === 'tool' || step.kind === 'observation') {
    return <ToolStepRow step={step} />;
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
  if (step.kind === 'evidence_wait') {
    const count = step.ids?.length ?? 0;
    return (
      <li className="agent-step is-waiting">
        <Icon name="clock" size={13} />
        <span>成稿引用了 {count} 条待裁决证据，等待你接受或驳回后继续。</span>
      </li>
    );
  }
  if (step.kind === 'evidence_resume') {
    return (
      <li className="agent-step is-observation">
        <Icon name="check" size={13} />
        <span>证据裁决已返回，继续校验成稿引用。</span>
      </li>
    );
  }
  if (step.kind === 'error') {
    return <li className="agent-step is-error"><Icon name="warning" size={13} /><span>{step.message}</span></li>;
  }
  return null; // final 单独渲染
}
