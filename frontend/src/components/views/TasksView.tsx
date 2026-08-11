/**
 * 任务中心 — Selenyx agent 自循环（plan → tool → observe → final）
 *
 * 新建任务（可选项目）→ 本机后端 agent loop 执行 → 步骤时间线实时刷新。
 * 运行记录持久化在后端 SQLite；刷新页面后仍可回看。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { STATUS_COLOR, STATUS_LABEL, StepRow } from '@components/tasks/StepRow';
import { RunOutput } from '@components/tasks/RunOutput';
import { agentApi, type AgentRunDetail, type AgentRunSummary } from '@services/agent';

export function TasksView() {
  const projects = useAppStore((s) => s.projects);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const focusRunId = useAppStore((s) => s.focusRunId);
  const clearRunFocus = useAppStore((s) => s.clearRunFocus);
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState<string>(currentProjectId ?? '');
  const [review, setReview] = useState(false);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selected, setSelected] = useState<AgentRunDetail | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const activeProjects = projects.filter((p) => p.status !== 'archived');

  const refreshList = useCallback(async () => {
    try {
      const { runs: list } = await agentApi.list();
      setRuns(list);
      setBackendOffline(false);
      return list;
    } catch {
      setBackendOffline(true);
      return [] as AgentRunSummary[];
    }
  }, []);

  const refreshDetail = useCallback(async (runId: string) => {
    try {
      const detail = await agentApi.get(runId);
      setSelected(detail);
      return detail;
    } catch {
      return null;
    }
  }, []);

  /* 启动后轮询选中 run；列表在存在进行中 run 时同步刷新 */
  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  /* 外部聚焦（新建任务主页 / 侧边栏动态区）：选中指定 run 的详情 */
  useEffect(() => {
    if (!focusRunId) return;
    void refreshDetail(focusRunId);
    clearRunFocus();
  }, [focusRunId, refreshDetail, clearRunFocus]);

  const selectedId = selected?.id;
  const selectedStatus = selected?.status;
  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    if (!selectedId || (selectedStatus !== 'running' && selectedStatus !== 'cancelling')) return;
    pollRef.current = window.setInterval(() => {
      void (async () => {
        const detail = await refreshDetail(selectedId);
        if (detail && detail.status !== 'running' && detail.status !== 'cancelling') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          void refreshList();
        }
      })();
    }, 1500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [selectedId, selectedStatus, refreshDetail, refreshList]);

  const submit = async () => {
    const text = goal.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const { runId } = await agentApi.start(text, projectId || null, review);
      setGoal('');
      await refreshList();
      await refreshDetail(runId);
    } catch (error) {
      setBackendOffline(true);
      alert(`任务创建失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (runId: string) => {
    try {
      await agentApi.cancel(runId);
      await refreshDetail(runId);
    } catch { /* 忽略：下一次轮询会收敛状态 */ }
  };

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">任务</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            把研究目标交给 Selenyx agent：规划 → 检索 → 执行 → 成稿，全程步骤可审计。
          </p>
        </div>
      </div>

      {backendOffline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接：桌面版会自动启动；开发环境请运行 <code>npm run dev:local</code>。agent 任务依赖后端执行。
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>新建任务</h2>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="例如：帮我梳理这个项目文献库里关于「谵妄预防」的证据，产出一份结构化综述提纲…"
          rows={3}
          style={{ width: '100%', resize: 'vertical', marginBottom: 10 }}
          aria-label="任务目标"
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            项目
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ minHeight: 36 }}>
              <option value="">不关联项目</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
            成稿前批评审查（多 1-2 次模型调用）
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={!goal.trim() || submitting || backendOffline}>
            <Icon name="send" size={15} /> {submitting ? '创建中…' : '交给 Selenyx'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(240px, 320px) 1fr' : '1fr', gap: 12, alignItems: 'start' }}>
        <div className="card" style={{ padding: 12 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 15, padding: '0 4px' }}>运行记录</h2>
          {runs.length === 0 ? (
            <p style={{ margin: 0, padding: '0 4px', fontSize: 12.5, color: 'var(--text-muted)' }}>还没有任务。创建一个，让 Selenyx 开始工作。</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => void refreshDetail(run.id)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'grid', gap: 4, padding: '10px 12px',
                      border: `1px solid ${selected?.id === run.id ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)', background: 'transparent', cursor: 'pointer', font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{run.goal}</span>
                    <span style={{ fontSize: 11, color: STATUS_COLOR[run.status] ?? 'var(--text-muted)', fontWeight: 700 }}>
                      {STATUS_LABEL[run.status] ?? run.status}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' · '}{activeProjects.find((p) => p.id === run.projectId)?.name ?? '全局'}
                        {run.startedAt ? ` · ${new Date(run.startedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 15, overflowWrap: 'anywhere' }}>{selected.goal}</h2>
                <span style={{ fontSize: 11.5, color: STATUS_COLOR[selected.status] ?? 'var(--text-muted)', fontWeight: 700 }}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {(selected.status === 'running') && (
                  <button type="button" className="btn" onClick={() => void cancel(selected.id)} style={{ minHeight: 32, fontSize: 12, color: 'var(--danger)' }}>取消</button>
                )}
                <button type="button" className="btn" onClick={() => setSelected(null)} aria-label="关闭详情" style={{ minHeight: 32, fontSize: 12 }}>关闭</button>
              </div>
            </div>

            <ul className="agent-steps" style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {selected.auditLog.map((step, i) => <StepRow key={i} step={step} />)}
              {selected.status === 'running' && <li className="agent-step is-thought"><Icon name="clock" size={13} /><span>Selenyx 正在思考与检索…</span></li>}
            </ul>

            {selected.outputText && <RunOutput run={selected} />}
          </div>
        )}
      </div>

      <style>{`
        .agent-step { display: flex; gap: 7px; align-items: flex-start; font-size: 12px; line-height: 1.55; color: var(--text-secondary); }
        .agent-step svg { flex: 0 0 auto; margin-top: 2px; color: var(--text-muted); }
        .agent-step.is-thought svg { color: var(--accent); }
        .agent-step.is-tool b { color: var(--text-primary); }
        .agent-step.is-tool code { margin-left: 6px; font-size: 11px; color: var(--text-muted); }
        .agent-step.is-observation svg { color: var(--success); }
        .agent-step.is-error { color: var(--danger); }
        .agent-step.is-error svg { color: var(--danger); }
        .agent-step.is-plan b { color: var(--text-primary); }
        .agent-step.is-review svg { color: var(--warning); }
        .agent-step.is-subagent svg { color: var(--accent); }
      `}</style>
    </div>
  );
}
