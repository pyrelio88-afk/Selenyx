/**
 * 任务产出区（V4 模块 B+C）：成稿渲染 + 证据染色 + 覆盖率徽标 + 工件与操作。
 *
 * - 无染色标记的旧产出保持 MarkdownView 渲染（零回归）；
 * - 带 [^e:id]/[^none] 标记的成稿逐句染色（绿已接受/黄候选/红无据），
 *   标记渲染为证据芯片，hover 见论断与摘录，点击跳到知识库·证据卡；
 * - 覆盖率徽标取自后端审计的 coverage 条目（后端已校验防编造）；
 * - 操作：下载 .md / 复制 / 写入笔记（zustand addNote，知识库·文档立即可见）。
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { MarkdownView } from '@components/chat/MarkdownView';
import { evidenceApi, type EvidenceRecord } from '@services/api';
import type { AgentRunDetail } from '@services/agent';
import { coverageBadge, stainSentences, type CoverageInfo } from './staining';
import { acceptedEvidenceForExport, withoutEvidenceAppendix, withEvidenceAppendix } from './evidenceAppendix';

type EvidenceLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const EMPTY_EVIDENCE = new Map<string, EvidenceRecord>();

const STAIN_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  accepted: { bg: 'rgba(46, 125, 50, 0.12)', fg: '#2e7d32', label: '有据·已接受' },
  candidate: { bg: 'rgba(245, 166, 35, 0.14)', fg: '#9a6b00', label: '候选证据' },
  unsourced: { bg: 'rgba(199, 72, 59, 0.12)', fg: '#c7483b', label: '无据断言' },
};

export function RunOutput({ run }: { run: AgentRunDetail }) {
  const addNote = useAppStore((s) => s.addNote);
  const setPendingNoteId = useAppStore((s) => s.setPendingNoteId);
  const setView = useAppStore((s) => s.setView);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const [evidenceState, setEvidenceState] = useState<{
    runId: string;
    status: EvidenceLoadStatus;
    items: Map<string, EvidenceRecord>;
  }>({ runId: '', status: 'idle', items: EMPTY_EVIDENCE });
  const [evidenceRetry, setEvidenceRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // A run body must never inherit a prewritten appendix.  The verified one is
  // regenerated below from this run's current project evidence only.
  const output = withoutEvidenceAppendix(run.outputText);
  const hasMarkers = /\[\^(?:e:[A-Za-z0-9._-]+|none)\]/.test(output);
  const evidence = evidenceState.runId === run.id ? evidenceState.items : EMPTY_EVIDENCE;
  const evidenceReady = !hasMarkers || (evidenceState.runId === run.id && evidenceState.status === 'ready');

  useEffect(() => {
    let alive = true;
    if (!hasMarkers) {
      setEvidenceState({ runId: run.id, status: 'ready', items: EMPTY_EVIDENCE });
      return () => { alive = false; };
    }
    if (!run.projectId) {
      setEvidenceState({ runId: run.id, status: 'unavailable', items: EMPTY_EVIDENCE });
      return () => { alive = false; };
    }
    setEvidenceState({ runId: run.id, status: 'loading', items: EMPTY_EVIDENCE });
    void evidenceApi.list(run.projectId).then((records) => {
      if (!alive) return;
      const sameProject = records.filter((record) => record.project_id === run.projectId);
      setEvidenceState({ runId: run.id, status: 'ready', items: new Map(sameProject.map((record) => [record.id, record])) });
    }).catch(() => {
      if (!alive) return;
      // Never leave the previous run's map visible or imply that verification
      // is still progressing after a request failure.
      setEvidenceState({ runId: run.id, status: 'error', items: EMPTY_EVIDENCE });
    });
    return () => { alive = false; };
  }, [evidenceRetry, hasMarkers, run.id, run.projectId]);

  const coverage = useMemo<CoverageInfo | null>(() => {
    for (let i = run.auditLog.length - 1; i >= 0; i -= 1) {
      const step = run.auditLog[i] as unknown as Record<string, unknown>;
      if (step.kind === 'coverage') {
        return {
          sentences: Number(step.sentences) || 0,
          supported: Number(step.supported) || 0,
          fullyAccepted: Number(step.fullyAccepted) || 0,
          unsourced: Number(step.unsourced) || 0,
          coverage: Number(step.coverage) || 0,
        };
      }
    }
    return null;
  }, [run.auditLog]);

  const sentences = useMemo(
    () => (hasMarkers ? stainSentences(output, evidence) : []),
    [hasMarkers, output, evidence],
  );

  const acceptedEvidence = useMemo(
    () => acceptedEvidenceForExport(run.projectId, [...evidence.values()]),
    [evidence, run.projectId],
  );
  const verifiedBody = useMemo(
    () => withEvidenceAppendix(output, acceptedEvidence),
    [acceptedEvidence, output],
  );

  const download = () => {
    if (!evidenceReady) return;
    const blob = new Blob([verifiedBody], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selenyx-run-${run.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const retryEvidence = () => {
    setEvidenceRetry((attempt) => attempt + 1);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const saveAsNote = () => {
    if (!evidenceReady) return;
    const title = `${run.goal.slice(0, 24)}${run.goal.length > 24 ? '…' : ''} · 任务产出`;
    const id = addNote({ title, body: verifiedBody, category: '任务产出', tags: ['agent'] });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2500);
    setPendingNoteId(id);
  };

  const jumpToEvidence = () => {
    setLibraryTab('evidence');
    setView('library');
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>产出</h3>
        {coverage && coverage.sentences > 0 && (
          <span
            className="coverage-badge"
            title="后端已校验全部引用真实存在；编造引用会被打回修订"
            style={{
              fontSize: 11.5, padding: '2px 10px', borderRadius: 999,
              border: '1px solid var(--border)', color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
            }}
          >
            {coverageBadge(coverage)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" onClick={copy}><Icon name="copy" size={13} /> {copied ? '已复制' : '复制'}</button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={download}
          disabled={!evidenceReady}
          title={evidenceReady ? '仅附带当前项目已接受的证据' : '证据尚未完成核验，完成后才能下载'}
        >
          <Icon name="download" size={13} /> {evidenceReady ? '下载 .md' : evidenceState.status === 'error' ? '暂无法核验' : '核验证据中'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={saveAsNote}
          disabled={!evidenceReady}
          title={evidenceReady ? '以当前项目已接受证据附录写入笔记' : '证据尚未完成核验，暂不能写入笔记'}
        >
          <Icon name="notes" size={13} /> {noteSaved ? '已写入笔记 ✓' : evidenceState.status === 'error' ? '暂无法核验' : '写入笔记'}
        </button>
      </div>

      {hasMarkers ? (
        <div style={{ fontSize: 13.5, lineHeight: 1.9, color: 'var(--text-primary)' }}>
          {sentences.map((s, i) => {
            const style = STAIN_STYLE[s.stain];
            return (
              <span key={i}>
                <span
                  style={style ? { background: style.bg, borderRadius: 3, padding: '1px 2px' } : undefined}
                  title={style ? style.label : undefined}
                >
                  {s.text}
                </span>
                {s.refs.map((refId) => {
                  const ev = evidence.get(refId);
                  const invalid = s.invalidRefs.includes(refId);
                  return (
                    <button
                      key={refId}
                      type="button"
                      onClick={jumpToEvidence}
                      title={ev ? `${ev.claim}\n${ev.excerpt.slice(0, 140)}` : `未通过校验的引用：${refId}`}
                      style={{
                        fontSize: 10, verticalAlign: 'super', margin: '0 1px', cursor: 'pointer',
                        border: 'none', background: 'transparent', padding: 0,
                        color: invalid ? '#c7483b' : (style?.fg ?? 'var(--accent)'),
                        fontWeight: 700,
                      }}
                    >
                      [{invalid ? '✗' : '证'}]
                    </button>
                  );
                })}
                {' '}
              </span>
            );
          })}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: STAIN_STYLE.accepted.fg }}>■</span> 有据·已接受{' '}
            <span style={{ color: STAIN_STYLE.candidate.fg }}>■</span> 候选证据（待裁决）{' '}
            <span style={{ color: STAIN_STYLE.unsourced.fg }}>■</span> 无据/未过校验 —— 点击 [证] 芯片跳到证据卡
          </div>
        </div>
      ) : (
        <MarkdownView content={output} />
      )}

      {hasMarkers && !evidenceReady && (
        <p className="runoutput-evidence-status" role="status">
          {evidenceState.status === 'unavailable'
            ? '该任务未关联项目，无法确认可导出的证据。'
            : evidenceState.status === 'error'
              ? <><span>证据核验暂时失败，下载仍保持关闭。</span>{' '}<button type="button" className="btn btn-ghost btn-sm" onClick={retryEvidence}>重试核验</button></>
            : '正在核验当前项目的证据；下载将在核验完成后开放。'}
        </p>
      )}

      {run.artifacts && run.artifacts.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          工件：
          {run.artifacts.map((a, i) => (
            <span key={i} style={{ marginRight: 10 }}>
              <Icon name={a.kind === 'note' ? 'notes' : 'download'} size={12} /> {a.title || a.name}
              <span style={{ color: 'var(--text-faint, var(--text-muted))' }}>（{a.kind === 'note' ? `notes/${a.name}` : a.path}）</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
