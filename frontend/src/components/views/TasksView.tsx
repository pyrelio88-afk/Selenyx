import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { STATUS_COLOR, STATUS_LABEL, StepRow } from '@components/tasks/StepRow';
import { groupSubagentSteps, isSubagentGroup } from '@components/tasks/groupSteps';
import { RunOutput } from '@components/tasks/RunOutput';
import { agentApi, isActiveRun, type AgentRunDetail, type AgentRunSummary } from '@services/agent';
import { observeRun, type RunConnectionMode } from '@services/runObserver';
import { evidenceApi, type EvidenceRecord } from '@services/api';
import { rawErrorText, serviceErrorMessage } from '@lib/userFacingError';

const CONNECTION_LABEL: Record<RunConnectionMode, string> = {
  connecting: '正在连接', live: '实时同步', polling: '定时同步',
};

function RunEvidence({ run, evidenceRef }: { run: AgentRunDetail; evidenceRef: React.RefObject<HTMLElement | null> }) {
  const references = useAppStore((s) => s.references);
  const requestPdfOpen = useAppStore((s) => s.requestPdfOpen);
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const savedCount = run.auditLog.filter((step) => step.kind === 'observation' && step.tool === 'save_evidence').length;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    if (!run.projectId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    void evidenceApi.list(run.projectId).then((records) => {
      if (current) setItems(records.filter((item) => item.project_id === run.projectId));
    }).catch(() => {
      if (current) setError('证据暂时无法读取，请重试。');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [run.projectId, savedCount, revision]);

  const decide = async (item: EvidenceRecord, review: 'accepted' | 'rejected') => {
    if (busy) return;
    setBusy(item.id);
    setError('');
    try {
      const updated = await evidenceApi.patch(item.id, { review });
      if (alive.current) {
        setItems((current) => current.map((record) => record.id === updated.id ? updated : record));
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      if (alive.current) setError(`审核未保存：${serviceErrorMessage(cause, '请稍后重试。')}`);
    } finally { if (alive.current) setBusy(null); }
  };

  return (
    <aside className="research-evidence" aria-label="项目证据" id="research-evidence-panel" ref={evidenceRef}>
      <div className="research-section-heading"><h2>项目证据</h2>
        {run.projectId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevision((value) => value + 1)} disabled={loading}>刷新</button>}
      </div>
      <p className="research-muted">原文、论断与人工裁决分开记录；接受证据不代表结论已经成立。</p>
      {!run.projectId ? <p className="research-empty">此研究未关联项目，不能保存项目证据。</p>
        : loading && items.length === 0 ? <p role="status">正在读取证据…</p>
        : !error && items.length === 0 ? <p className="research-empty">还没有证据。检索后保存的证据卡会出现在这里。</p> : null}
      {error && <p role="alert" className="research-error">{error}</p>}
      <ul className="research-evidence-list">
        {items.map((item) => (
          <li key={item.id} className="research-evidence-card">
            <div className="research-evidence-meta"><span>{item.review === 'accepted' ? '人工已接受' : item.review === 'rejected' ? '已驳回' : '待人工审核'}</span><code>{item.id.slice(0, 8)}</code></div>
            <h3>{item.claim || '未填写论断'}</h3>
            <blockquote>{item.excerpt}</blockquote>
            <p className="research-muted">{references.find((ref) => ref.id === item.reference_id)?.title ?? (item.reference_id ? '关联文献' : '未关联来源')}{item.page ? ` · 第 ${item.page} 页` : ''}</p>
            <div className="research-evidence-actions">
              {item.reference_id && item.page && <button type="button" className="btn btn-ghost btn-sm" onClick={() => requestPdfOpen(item.reference_id, item.page!)}>查看原文</button>}
              {item.review === 'pending' && <>
                <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void decide(item, 'rejected')}>驳回</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void decide(item, 'accepted')}>{busy === item.id ? '保存中…' : '接受'}</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function TasksView() {
  const projects = useAppStore((s) => s.projects);
  const focusRunId = useAppStore((s) => s.focusRunId);
  const clearRunFocus = useAppStore((s) => s.clearRunFocus);
  const requestNewTask = useAppStore((s) => s.requestNewTask);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusRunId);
  const [selected, setSelected] = useState<AgentRunDetail | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [detailError, setDetailError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [steerText, setSteerText] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [mode, setMode] = useState<RunConnectionMode>('connecting');
  const [showEvidence, setShowEvidence] = useState(true);
  const observerRef = useRef<ReturnType<typeof observeRun> | null>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const jumpToEvidenceRef = useRef(false);
  const selectionRef = useRef<string | null>(focusRunId);
  const listRequestRef = useRef<AbortController | null>(null);

  const revealEvidence = () => {
    if (showEvidence) evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else {
      jumpToEvidenceRef.current = true;
      setShowEvidence(true);
    }
  };

  useEffect(() => {
    if (showEvidence && jumpToEvidenceRef.current && evidenceRef.current) {
      evidenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      jumpToEvidenceRef.current = false;
    }
  }, [showEvidence]);

  const refreshList = useCallback(async () => {
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    setListLoading(true);
    try {
      const { runs: list } = await agentApi.list(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      if (controller.signal.aborted) return;
      setRuns(list);
      setBackendOffline(false);
    } catch {
      if (!controller.signal.aborted) setBackendOffline(true);
    } finally {
      if (!controller.signal.aborted) setListLoading(false);
    }
  }, []);

  const openRun = useCallback((runId: string | null) => {
    if (selectionRef.current === runId) { observerRef.current?.refresh(); return; }
    observerRef.current?.close();
    observerRef.current = null;
    selectionRef.current = runId;
    setSelectedId(runId);
    setSelected(null);
    setDetailError('');
    setActionError('');
    setActionBusy(false);
    setSteerText('');
    setAdjustment('');
    setMode('connecting');
  }, []);

  useEffect(() => {
    void refreshList();
    return () => { listRequestRef.current?.abort(); };
  }, [refreshList]);

  useEffect(() => {
    if (!focusRunId) return;
    openRun(focusRunId);
    clearRunFocus();
  }, [focusRunId, openRun, clearRunFocus]);

  useEffect(() => {
    if (!selectedId) return;
    const observer = observeRun(selectedId, {
      onUpdate: (run) => {
        setSelected(run);
        setDetailError('');
        setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
        if (!isActiveRun(run.status)) void refreshList();
      },
      onModeChange: setMode,
      onError: () => setDetailError('连接暂时中断，正在重新读取已保存的进度。不会重新执行任务。'),
    });
    observerRef.current = observer;
    return () => {
      observer.close();
      if (observerRef.current === observer) observerRef.current = null;
    };
  }, [selectedId, refreshList]);

  const applyAction = async (action: 'cancel' | 'steer' | 'confirm', changePlan = false) => {
    if (!selected || actionBusy) return;
    const observer = observerRef.current;
    const runId = selected.id;
    const text = action === 'steer' ? steerText.trim() : adjustment.trim();
    if (action === 'steer' && !text) return;
    setActionBusy(true);
    setActionError('');
    try {
      if (action === 'cancel') await agentApi.cancel(runId);
      else if (action === 'steer') await agentApi.steer(runId, text);
      else await agentApi.confirm(runId, changePlan ? text : undefined);
      if (observerRef.current !== observer) return;
      if (action === 'steer') setSteerText('');
      if (action === 'confirm') setAdjustment('');
      observer?.refresh();
    } catch (cause) {
      if (observerRef.current === observer) {
        if (action === 'confirm' && /^API 409:/.test(rawErrorText(cause))) {
          setActionError('确认请求与当前状态冲突，正在读取已保存的进度。');
          observer?.refresh();
        } else {
          setActionError(`操作未确认成功：${serviceErrorMessage(cause, '请核对进度后再试。')}`);
        }
      }
    } finally {
      if (observerRef.current === observer) setActionBusy(false);
    }
  };

  const latestPlan = useMemo(() => selected?.auditLog.slice().reverse().find((step) => step.kind === 'plan'), [selected]);
  const timeline = useMemo(() => groupSubagentSteps(selected?.auditLog ?? []), [selected]);
  const project = projects.find((item) => item.id === selected?.projectId);
  const active = selected ? isActiveRun(selected.status) : false;
  const emptyNoSelection = !selectedId && runs.length === 0 && !listLoading;

  return (
    <div className="research-workspace">
      <header className="view-header research-header">
        <div><h1 className="view-title">研究记录</h1><p>查看计划、执行进度、证据和成果。</p></div>
        <button type="button" className="btn btn-primary" onClick={requestNewTask}><Icon name="plus" size={15} /> 新研究</button>
      </header>
      <div className={`research-layout ${selectedId ? 'has-selection' : ''} ${emptyNoSelection ? 'is-empty' : ''}`}>
        {!emptyNoSelection && (
        <nav className="research-history" aria-label="研究历史">
          <div className="research-section-heading"><h2>运行记录</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshList()} disabled={listLoading}>刷新</button></div>
          {backendOffline && <p role="alert" className="research-error">本机服务未连接，暂时无法读取研究记录。</p>}
          {listLoading && runs.length === 0 ? <p role="status">正在读取记录…</p> : runs.length === 0 && !backendOffline ? <p className="research-empty">还没有研究记录。提出一个问题，让 Selenyx 开始。</p> : null}
          <ul>{runs.map((run) => (
            <li key={run.id}><button type="button" className={`research-history-item ${selectedId === run.id ? 'is-selected' : ''}`} aria-current={selectedId === run.id ? 'true' : undefined} onClick={() => openRun(run.id)}>
              <strong>{run.goal}</strong>
              <span><span style={{ color: STATUS_COLOR[run.status] }}>{STATUS_LABEL[run.status] ?? run.status}</span> · {projects.find((item) => item.id === run.projectId)?.name ?? '未关联项目'}</span>
              {run.startedAt && <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}
            </button></li>
          ))}</ul>
        </nav>
        )}

        {selectedId ? <div className={`research-run-layout ${showEvidence && selected ? 'with-evidence' : ''}`}>
          <section className="research-run" aria-label="研究运行详情" data-run-id={selectedId}>
            <div className="research-run-toolbar">
              <span className="research-muted">{project?.name ?? (selected?.projectId ? '关联项目' : '独立研究')}</span>
              <div>
                {selected && <>
                  <button type="button" className="btn btn-ghost btn-sm research-evidence-toggle" aria-pressed={showEvidence} aria-controls="research-evidence-panel" onClick={() => setShowEvidence((value) => !value)}>{showEvidence ? '隐藏证据' : '显示证据'}</button>
                  <button type="button" className="btn btn-ghost btn-sm research-evidence-jump" aria-controls="research-evidence-panel" onClick={revealEvidence}>查看证据</button>
                </>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openRun(null)} aria-label="关闭详情">关闭</button>
              </div>
            </div>
            {detailError && <div role="status" className="research-connection-error"><span>{detailError}</span><button type="button" className="btn btn-sm" onClick={() => observerRef.current?.refresh()}>重试同步</button></div>}
            {!selected ? <p role="status">{detailError ? '尚未取得运行详情。' : '正在读取研究进度…'}</p> : <>
              <header className="research-question"><h2>{selected.goal}</h2><div className="research-run-meta">
                <span style={{ color: STATUS_COLOR[selected.status] }}>{STATUS_LABEL[selected.status] ?? selected.status}</span>
                {active && <span>{CONNECTION_LABEL[mode]}</span>}
                <span>{selected.auditLog.filter((step) => step.kind === 'tool').length} 次工具调用</span>
                {active && <button type="button" className="btn btn-ghost btn-sm research-stop" disabled={actionBusy || selected.status === 'cancelling'} onClick={() => void applyAction('cancel')}>{selected.status === 'cancelling' ? '正在停止…' : '停止研究'}</button>}
              </div></header>
              {actionError && <p role="alert" className="research-error">{actionError}</p>}
              {selected.status === 'waiting_confirm' && <section className="research-approval" aria-label="计划确认">
                <h3>确认计划后再执行</h3>
                {latestPlan && <ol>{(latestPlan.items ?? []).map((item, index) => <li key={index}>{item}</li>)}</ol>}
                <label htmlFor="research-plan-adjustment">调整方向（可选）</label>
                <textarea id="research-plan-adjustment" className="input" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="补充研究范围、排除条件或输出要求…" rows={2} />
                <div className="research-approval-actions"><button type="button" className="btn" disabled={actionBusy || !adjustment.trim()} onClick={() => void applyAction('confirm', true)}>调整后执行</button><button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => void applyAction('confirm')}>按计划执行</button></div>
              </section>}
              {selected.status === 'waiting_evidence' && <section className="research-approval" aria-label="等待证据裁决">
                <h3>证据等待你的裁决</h3>
                <p>成稿引用了尚未人工接受的项目证据。请在证据卡上选择「接受」或「驳回」；裁决后研究会自动继续，无需重新运行。</p>
                <div className="research-approval-actions"><button type="button" className="btn btn-primary" onClick={revealEvidence}>查看证据卡</button></div>
              </section>}
              <section className="research-timeline" aria-label="执行过程">
                <h3>执行过程</h3>
                <ul className="agent-steps">{timeline.map((item, index) => isSubagentGroup(item) ? (
                  <li key={index} className="agent-step is-subagent research-subagent"><details><summary><Icon name="chip" size={13} /><span>专家 {item.expert} · {item.entries.length} 步</span>{item.answer && <span className="research-muted">{item.answer.slice(0, 60)}{item.answer.length > 60 ? '…' : ''}</span>}</summary><ul className="agent-steps">{item.entries.map((step, entryIndex) => <StepRow key={entryIndex} step={step} />)}</ul></details></li>
                ) : <StepRow key={index} step={item} />)}</ul>
                {selected.status === 'running' && <p className="research-live" role="status"><Icon name="clock" size={14} /> Selenyx 正在执行，进度将自动保存。</p>}
                {!active && selected.auditLog.length === 0 && <p className="research-empty">此记录没有保存执行步骤。</p>}
              </section>
              {selected.status === 'running' && <div className="research-steer">
                <input className="input" value={steerText} onChange={(event) => setSteerText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void applyAction('steer'); } }} placeholder="补充方向或纠正重点…" aria-label="运行中插话" />
                <button type="button" className="btn" disabled={actionBusy || !steerText.trim()} onClick={() => void applyAction('steer')}><Icon name="send" size={14} /> 插话</button>
              </div>}
              {selected.outputText && <RunOutput key={selected.id} run={selected} />}
            </>}
          </section>
          {selected && showEvidence && <RunEvidence key={selected.id} run={selected} evidenceRef={evidenceRef} />}
        </div> : emptyNoSelection ? (
          <section className="research-idle research-onboarding">
            <Icon name={backendOffline ? 'clock' : 'target'} size={32} />
            <h2>{backendOffline ? '研究记录暂时离线' : '让问题成为一项研究'}</h2>
            <p>{backendOffline
              ? '本机服务未连接。已有记录仍保存在本机，恢复连接后即可继续查看。'
              : '选择一条记录查看计划、来源与成果，或开始新的研究。'}</p>
            <div className="research-onboarding-actions">
              {backendOffline && <button type="button" className="btn" onClick={() => void refreshList()}>重试连接</button>}
              <button type="button" className="btn btn-primary" onClick={requestNewTask}>开始新研究</button>
            </div>
          </section>
        ) : (
          <section className="research-idle"><Icon name="target" size={32} /><h2>让问题成为一项研究</h2><p>选择一条记录查看计划、来源与成果，或开始新的研究。</p><button type="button" className="btn" onClick={requestNewTask}>开始新研究</button></section>
        )}
      </div>
    </div>
  );
}
