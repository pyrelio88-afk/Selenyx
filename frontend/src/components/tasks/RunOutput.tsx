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
import { evidenceApi } from '@services/api';
import type { AgentRunDetail } from '@services/agent';
import { coverageBadge, stainSentences, type CoverageInfo, type EvidenceLite } from './staining';

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
  const [evidence, setEvidence] = useState<Map<string, EvidenceLite>>(new Map());
  const [copied, setCopied] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const output = run.outputText;
  const hasMarkers = /\[\^(?:e:[A-Za-z0-9._-]+|none)\]/.test(output);

  useEffect(() => {
    if (!run.projectId || !hasMarkers) return;
    let alive = true;
    void evidenceApi.list(run.projectId).then((records) => {
      if (!alive) return;
      setEvidence(new Map(records.map((r) => [r.id, r as EvidenceLite])));
    }).catch(() => { /* 证据拉取失败时全部按未核验渲染 */ });
    return () => { alive = false; };
  }, [run.projectId, hasMarkers]);

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

  const download = () => {
    const blob = new Blob([output], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selenyx-run-${run.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const saveAsNote = () => {
    const title = `${run.goal.slice(0, 24)}${run.goal.length > 24 ? '…' : ''} · 任务产出`;
    const id = addNote({ title, body: output, category: '任务产出', tags: ['agent'] });
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
        <button type="button" className="btn btn-sm" onClick={download}><Icon name="download" size={13} /> 下载 .md</button>
        <button type="button" className="btn btn-sm" onClick={saveAsNote}><Icon name="notes" size={13} /> {noteSaved ? '已写入笔记 ✓' : '写入笔记'}</button>
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
