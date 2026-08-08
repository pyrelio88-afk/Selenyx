import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/project';
import type { PipelineStageKey } from '@apptypes/index';
import { Icon, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';
import { runPipelineStage } from '@services/pipeline';
import { LLMError } from '@services/llm';
import { evidenceApi, searchApi, type EvidenceRecord, type SemanticHit } from '@services/api';

const STAGE_ORDER: PipelineStageKey[] = PIPELINE_STAGES.map((s) => s.key);

function nextStage(key: PipelineStageKey): PipelineStageKey | null {
  const i = STAGE_ORDER.indexOf(key);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function PipelineView() {
  const {
    references, projects, currentProjectId, updateProject,
    llmConfig, pipelineRuns, setPipelineRun, stageConfigs, setStageConfig,
    addNote, setPendingNoteId, setView,
  } = useAppStore();
  const project = projects.find((p) => p.id === currentProjectId);
  const [runningStage, setRunningStage] = useState<PipelineStageKey | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [ragQuery, setRagQuery] = useState('');
  const [ragHits, setRagHits] = useState<SemanticHit[]>([]);
  const [ragStatus, setRagStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [ragMessage, setRagMessage] = useState('');
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [outline, setOutline] = useState<{ bullets: string[]; acceptedCount: number } | null>(null);

  const refreshEvidence = useCallback(async (projectId: string) => {
    setEvidenceLoading(true);
    try {
      setEvidence(await evidenceApi.list(projectId));
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '证据链读取失败');
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  useEffect(() => {
    setRagHits([]);
    setOutline(null);
    if (project?.id) void refreshEvidence(project.id);
  }, [project?.id, refreshEvidence]);

  if (!project) {
    return (
      <div>
        <div className="view-header"><h1 className="view-title">科研流水线</h1></div>
        <div className="empty-state" style={{ marginTop: 48 }}>
          <div className="icon"><Icon name="pipeline" size={44} strokeWidth={1.2} /></div>
          <p>先在「项目」页选择或创建一个科研项目，流水线才能执行。</p>
        </div>
      </div>
    );
  }

  function rk(stage: PipelineStageKey) { return `${project!.id}::${stage}`; }
  function getRun(stage: PipelineStageKey) {
    return pipelineRuns[rk(stage)] ?? { status: 'idle' as const, output: '', runAt: null, passed: false };
  }

  async function runStage(stage: PipelineStageKey) {
    if (!llmConfig || runningStage) return;
    const key = rk(stage);
    setRunningStage(stage);
    setPipelineRun(key, { status: 'running', output: '', runAt: null, passed: getRun(stage).passed });
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await runPipelineStage({
        config: llmConfig, project: project!, references,
        stageKey: stage,
        customInstruction: stageConfigs[key] ?? '',
        onDelta: (acc) => setPipelineRun(key, { status: 'running', output: acc, runAt: null, passed: getRun(stage).passed }),
        signal: abort.signal,
      });
      setPipelineRun(key, { status: 'done', output: getRun(stage).output, runAt: new Date().toISOString(), passed: getRun(stage).passed });
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const errText = isAbort ? '（已停止）' : e instanceof LLMError ? e.message : `出错了：${e instanceof Error ? e.message : String(e)}`;
      const prev = getRun(stage).output;
      setPipelineRun(key, { status: 'error', output: prev ? `${prev}\n\n${errText}` : errText, runAt: new Date().toISOString(), passed: false });
    } finally {
      setRunningStage(null);
      abortRef.current = null;
    }
  }

  function stopRun() { abortRef.current?.abort(); }

  async function runLocalRag() {
    const query = ragQuery.trim();
    if (!query || !project) return;
    setRagStatus('loading');
    setRagMessage('');
    try {
      const response = await searchApi.semantic(query, project.id);
      setRagHits(response.results);
      setRagStatus('done');
      setRagMessage(response.count
        ? `命中 ${response.count} 个本机原文片段；分数只用于排序，不代表证据质量。`
        : '本机索引没有命中。请先向文献库导入带摘要/笔记的文献，或检查后端是否在线。');
    } catch (error) {
      setRagStatus('error');
      setRagMessage(error instanceof Error ? error.message : '本机 RAG 检索失败');
    }
  }

  async function addHitToEvidence(hit: SemanticHit) {
    if (!project || !hit.excerpt?.trim()) return;
    try {
      await evidenceApi.create({
        projectId: project.id,
        referenceId: hit.referenceId,
        excerpt: hit.excerpt,
        claim: '',
        relation: 'supports',
        confidence: 'medium',
        page: hit.page ?? null,
        chunkId: hit.chunkId ?? null,
      });
      await refreshEvidence(project.id);
      setRagMessage('片段已进入待审证据链；必须人工“接受”后才能进入写作提纲。');
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '加入证据链失败');
    }
  }

  async function reviewEvidence(item: EvidenceRecord, review: 'accepted' | 'rejected') {
    if (!project) return;
    try {
      await evidenceApi.patch(item.id, { review });
      await refreshEvidence(project.id);
      setOutline(null);
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '证据审核失败');
    }
  }

  async function buildAcceptedOutline() {
    if (!project) return;
    try {
      setOutline(await evidenceApi.outline(project.id));
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '写作提纲读取失败');
    }
  }

  /** 标记该段通过门控并推进到下一段 */
  function passAndAdvance(stage: PipelineStageKey) {
    const key = rk(stage);
    setPipelineRun(key, { ...getRun(stage), passed: true });
    const next = nextStage(stage);
    if (next) updateProject(project!.id, { currentStage: next });
  }

  /** R109：在该段快速记一条笔记，关联当前阶段，跳转笔记区编辑 */
  function quickNote(stage: PipelineStageKey) {
    const stageLabel = PIPELINE_STAGES.find((s) => s.key === stage)?.label ?? stage;
    const id = addNote({
      title: `${stageLabel} · 随手记`,
      category: '文献批注',
      linkedStage: stage,
      body: `## ${stageLabel}\n\n`,
    });
    setPendingNoteId(id);
    setView('notes');
  }

  return (
    <div>
      <div className="view-header pipeline-view-header">
        <h1 className="view-title">科研流水线</h1>
        <span className="pipeline-project-context" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前项目:</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</span>
          <ProjectStatusChip status={project.status} />
          {!llmConfig && <span style={{ fontSize: 12, color: 'var(--danger)' }}>未配置 LLM，去「设置」配置后才能执行</span>}
        </span>
      </div>

      <section className="card" aria-label="本机 RAG 与证据门" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>本机 RAG · 原文片段 → 人工证据门</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>
              只检索你已导入并同步到 SQLite 的摘要、笔记或全文片段；不会把模型生成内容伪装成引文。
            </p>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            待审 {evidence.filter((item) => item.review === 'pending').length} · 已接受 {evidence.filter((item) => item.review === 'accepted').length}
          </span>
        </div>
        <div className="pipeline-rag-toolbar">
          <input
            className="input"
            value={ragQuery}
            onChange={(event) => setRagQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void runLocalRag(); }}
            placeholder="检索本机证据，例如：SBAR 交接培训对错误率的影响"
            aria-label="本机 RAG 查询"
          />
          <button className="btn btn-primary" onClick={() => void runLocalRag()} disabled={!ragQuery.trim() || ragStatus === 'loading'}>
            <Icon name="search" size={15} /> {ragStatus === 'loading' ? '检索中…' : '检索本机证据'}
          </button>
          <button className="btn" onClick={() => void buildAcceptedOutline()} disabled={evidenceLoading}>
            生成已接受证据提纲
          </button>
        </div>
        {ragMessage && (
          <div role="status" style={{ marginTop: 8, fontSize: 12, color: ragStatus === 'error' ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {ragMessage}
          </div>
        )}
        {ragHits.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {ragHits.map((hit) => (
              <article key={hit.chunkId ?? `${hit.referenceId}-${hit.charOffset?.start ?? 0}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{hit.title || references.find((item) => item.id === hit.referenceId)?.title || '本机文献'}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {hit.page ? `p.${hit.page} · ` : ''}score {Number(hit.score ?? 0).toFixed(3)}
                  </span>
                </div>
                <p style={{ margin: '6px 0 8px', fontSize: 12.5, lineHeight: 1.55 }}>{hit.excerpt}</p>
                <button className="btn btn-sm" onClick={() => void addHitToEvidence(hit)}>加入待审证据链</button>
              </article>
            ))}
          </div>
        )}
        {evidence.length > 0 && (
          <details style={{ marginTop: 12 }} open>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>证据链（{evidence.length}）</summary>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {evidence.map((item) => (
                <article key={item.id} style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 10, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{item.review === 'accepted' ? '✓ 已接受' : item.review === 'rejected' ? '× 已拒绝' : '○ 待审'} · {item.relation}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{item.page ? `p.${item.page}` : '无页码'} · {item.confidence}</span>
                  </div>
                  <p style={{ margin: '6px 0', lineHeight: 1.5 }}>{item.excerpt}</p>
                  {item.review === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => void reviewEvidence(item, 'accepted')}>人工接受</button>
                      <button className="btn btn-sm" onClick={() => void reviewEvidence(item, 'rejected')}>拒绝</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </details>
        )}
        {outline && (
          <div style={{ marginTop: 12, borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
            <strong style={{ fontSize: 13 }}>写作提纲 · 仅来自 {outline.acceptedCount} 条已接受证据</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
              {outline.bullets.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}
            </ul>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PIPELINE_STAGES.map((stage) => {
          const isActive = project.currentStage === stage.key;
          const stageRefs = references.filter((r) => r.pipelineStage === stage.key);
          const run = getRun(stage.key);
          const isRunning = runningStage === stage.key;
          const key = rk(stage.key);
          const next = nextStage(stage.key);
          return (
            <div key={stage.key} className={`pipeline-stage ${isActive ? 'active' : ''}`} style={{
              flexDirection: 'column', alignItems: 'stretch', gap: 10,
              opacity: isActive ? 1 : 0.92,
            }}>
              <div className="pipeline-stage-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div className="pipeline-stage-summary" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="stage-icon" style={{ display: 'flex', color: isActive ? 'var(--accent)' : run.passed ? 'var(--success)' : 'var(--text-secondary)' }}>
                    <Icon name={STAGE_ICONS[stage.key]} size={26} strokeWidth={1.4} />
                  </span>
                  <div>
                    <div className="stage-label" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {stage.order}. {stage.label}
                      {run.passed && <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ 已通过</span>}
                      {isActive && !run.passed && <span style={{ fontSize: 11, color: 'var(--accent)' }}>● 当前</span>}
                    </div>
                    <div className="stage-desc" style={{ fontSize: 12.5 }}>{stage.description}</div>
                  </div>
                </div>
                <div className="pipeline-stage-meta" style={{ textAlign: 'right', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                  <div style={{ color: 'var(--text-muted)' }}>关联文献: {stageRefs.length}</div>
                  <div style={{ color: 'var(--warning)' }}>门控: {stage.qualityGate}</div>
                  <div style={{ color: 'var(--text-muted)' }}>产出: {stage.outputs.join('、')}</div>
                </div>
              </div>

              {/* 自定义指令（可配置） */}
              <details style={{ fontSize: 13 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
                  自定义指令{stageConfigs[key] ? '（已编辑）' : '（用默认）'}
                </summary>
                <textarea
                  className="input"
                  style={{ marginTop: 8, fontSize: 13, resize: 'vertical' }}
                  rows={2}
                  placeholder={`给「${stage.label}」阶段的额外指令，如：侧重心衰患者电解质监测、目标期刊用《中华护理杂志》格式…`}
                  value={stageConfigs[key] ?? ''}
                  onChange={(e) => setStageConfig(key, e.target.value)}
                />
              </details>

              {/* 操作行 */}
              <div className="pipeline-stage-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isRunning ? (
                  <button className="btn" onClick={stopRun}>停止</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => runStage(stage.key)} disabled={!llmConfig || !!runningStage}>
                    <Icon name="aiChat" size={15} /> AI 执行
                  </button>
                )}
                {run.status === 'done' && !run.passed && (
                  <button className="btn" onClick={() => passAndAdvance(stage.key)} disabled={!next}>
                    {next ? `通过门控，推进到「${PIPELINE_STAGES.find((s) => s.key === next)?.label}」` : '通过门控（已到最后一段）'}
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => quickNote(stage.key)} title="为该段记一条笔记">
                  <Icon name="notes" size={14} /> 记笔记
                </button>
                {run.runAt && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>运行于 {new Date(run.runAt).toLocaleString('zh-CN')}</span>}
              </div>

              {/* 产出输出 */}
              {run.output && (
                <div style={{
                  background: 'var(--bg-surface)', border: `1px solid ${run.status === 'error' ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13.5, lineHeight: 1.65,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflowY: 'auto',
                  color: run.status === 'error' ? 'var(--danger)' : 'var(--text-primary)',
                }}>
                  {run.output}{isRunning && <span style={{ opacity: 0.6 }}>▍</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
