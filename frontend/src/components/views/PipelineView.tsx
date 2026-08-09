import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/project';
import type { PipelineStageKey } from '@apptypes/index';
import { Icon, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';
import { BottomSheet } from '@components/layout/BottomSheet';
import { ThreeColumnWorkbench } from '@components/layout/ThreeColumnWorkbench';
import { useIsMobile } from '@lib/useIsMobile';
import { runPipelineStage } from '@services/pipeline';
import { LLMError } from '@services/llm';
import { evidenceApi, searchApi, type EvidenceRecord, type SemanticHit } from '@services/api';
import '../../styles/pipeline-workbench.css';

const STAGE_ORDER: PipelineStageKey[] = PIPELINE_STAGES.map((stage) => stage.key);

function nextStage(key: PipelineStageKey): PipelineStageKey | null {
  const index = STAGE_ORDER.indexOf(key);
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
}

export function getEvidenceReviewMeta(review: EvidenceRecord['review']) {
  if (review === 'accepted') return { label: '已接受', symbol: '✓', className: 'is-accepted' } as const;
  if (review === 'rejected') return { label: '已拒绝', symbol: '×', className: 'is-rejected' } as const;
  return { label: '待审', symbol: '○', className: 'is-pending' } as const;
}

export function countEvidenceReviews(items: EvidenceRecord[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.review] += 1;
      return counts;
    },
    { pending: 0, accepted: 0, rejected: 0 },
  );
}

interface EvidenceInspectorProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  searchStatus: 'idle' | 'loading' | 'done' | 'error';
  message: string;
  hits: SemanticHit[];
  evidence: EvidenceRecord[];
  loading: boolean;
  outline: { bullets: string[]; acceptedCount: number } | null;
  referenceTitles: Map<string, string>;
  onAddHit: (hit: SemanticHit) => void;
  onReview: (item: EvidenceRecord, review: 'accepted' | 'rejected') => void;
  onBuildOutline: () => void;
}

function EvidenceInspector({
  query, onQueryChange, onSearch, searchStatus, message, hits, evidence, loading,
  outline, referenceTitles, onAddHit, onReview, onBuildOutline,
}: EvidenceInspectorProps) {
  const counts = countEvidenceReviews(evidence);

  return (
    <div className="pipeline-evidence-inspector">
      <header className="pipeline-evidence-header">
        <div>
          <h2>原文片段与人工证据门</h2>
        </div>
        <div className="pipeline-evidence-counts" aria-label={`待审 ${counts.pending} 条，已接受 ${counts.accepted} 条`}>
          <span className="is-pending"><b>{counts.pending}</b> 待审</span>
          <span className="is-accepted"><b>{counts.accepted}</b> 已接受</span>
        </div>
      </header>

      <p className="pipeline-evidence-policy">
        只检索已同步到本机 SQLite 的摘要、笔记与全文片段。检索分数只用于排序，模型生成内容不会自动成为证据。
      </p>

      <form className="pipeline-evidence-search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <label htmlFor="pipeline-rag-query">检索本机原文</label>
        <div>
          <input
            id="pipeline-rag-query"
            className="input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="例如：SBAR 培训对交接错误率的影响"
          />
          <button className="btn btn-primary" type="submit" disabled={!query.trim() || searchStatus === 'loading'}>
            <Icon name="search" size={15} /> {searchStatus === 'loading' ? '检索中…' : '检索'}
          </button>
        </div>
      </form>

      {message && <div className={`pipeline-rag-message ${searchStatus === 'error' ? 'is-error' : ''}`} role="status">{message}</div>}

      <section className="pipeline-inspector-section" aria-labelledby="pipeline-hit-heading">
        <div className="pipeline-inspector-section-head">
          <h3 id="pipeline-hit-heading">检索命中</h3>
          <span>{hits.length} 条</span>
        </div>
        {hits.length === 0 ? (
          <p className="pipeline-inspector-empty">输入研究问题，查找可回溯的本机原文片段。</p>
        ) : (
          <div className="pipeline-hit-list">
            {hits.map((hit) => (
              <article className="pipeline-hit" key={hit.chunkId ?? `${hit.referenceId}-${hit.charOffset?.start ?? 0}`}>
                <div className="pipeline-hit-source">
                  <strong>{hit.title || referenceTitles.get(hit.referenceId) || '本机文献'}</strong>
                  <span>{hit.page ? `p.${hit.page} · ` : ''}排序分 {Number(hit.score ?? 0).toFixed(3)}</span>
                </div>
                <p>{hit.excerpt}</p>
                <button className="btn btn-sm" onClick={() => onAddHit(hit)}>加入待审证据链</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="pipeline-inspector-section" aria-labelledby="pipeline-chain-heading">
        <div className="pipeline-inspector-section-head">
          <h3 id="pipeline-chain-heading">人工证据链</h3>
          <span>{loading ? '同步中…' : `${evidence.length} 条`}</span>
        </div>
        {evidence.length === 0 ? (
          <p className="pipeline-inspector-empty">命中片段加入后会先进入待审区；只有人工接受的证据可进入提纲。</p>
        ) : (
          <div className="pipeline-evidence-list">
            {evidence.map((item) => {
              const meta = getEvidenceReviewMeta(item.review);
              return (
                <article className={`pipeline-evidence-item ${meta.className}`} key={item.id}>
                  <div className="pipeline-evidence-state">
                    <span aria-hidden="true">{meta.symbol}</span>
                    <strong>{meta.label}</strong>
                    <small>{item.relation} · {item.page ? `p.${item.page}` : '无页码'} · {item.confidence}</small>
                  </div>
                  <p>{item.excerpt}</p>
                  {item.review === 'pending' && (
                    <div className="pipeline-evidence-actions">
                      <button className="btn btn-sm pipeline-accept" onClick={() => onReview(item, 'accepted')}>✓ 人工接受</button>
                      <button className="btn btn-sm pipeline-reject" onClick={() => onReview(item, 'rejected')}>× 拒绝</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="pipeline-inspector-section pipeline-outline" aria-labelledby="pipeline-outline-heading">
        <div className="pipeline-inspector-section-head">
          <h3 id="pipeline-outline-heading">已接受证据提纲</h3>
          <button className="btn btn-sm" onClick={onBuildOutline} disabled={loading || counts.accepted === 0}>生成提纲</button>
        </div>
        {counts.accepted === 0 && <p className="pipeline-inspector-empty">至少人工接受 1 条证据后才可生成。</p>}
        {outline && (
          <div className="pipeline-outline-result">
            <strong>仅来自 {outline.acceptedCount} 条已接受证据</strong>
            <ul>{outline.bullets.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}

export function PipelineView() {
  const {
    references, projects, currentProjectId, updateProject,
    llmConfig, pipelineRuns, setPipelineRun, stageConfigs, setStageConfig,
    addNote, setPendingNoteId, setView,
  } = useAppStore();
  const project = projects.find((item) => item.id === currentProjectId);
  const isMobile = useIsMobile();
  const [focusedStage, setFocusedStage] = useState<PipelineStageKey>(project?.currentStage ?? 'problem');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [runningStage, setRunningStage] = useState<PipelineStageKey | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [ragQuery, setRagQuery] = useState('');
  const [ragHits, setRagHits] = useState<SemanticHit[]>([]);
  const [ragStatus, setRagStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [ragMessage, setRagMessage] = useState('');
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [outline, setOutline] = useState<{ bullets: string[]; acceptedCount: number } | null>(null);

  const referenceTitles = useMemo(
    () => new Map(references.map((reference) => [reference.id, reference.title])),
    [references],
  );
  const evidenceCounts = countEvidenceReviews(evidence);

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
    setEvidenceOpen(false);
    if (project?.id) void refreshEvidence(project.id);
  }, [project?.id, refreshEvidence]);

  useEffect(() => {
    if (project?.currentStage) setFocusedStage(project.currentStage);
  }, [project?.id, project?.currentStage]);

  if (!project) {
    return (
      <div className="pipeline-workbench-empty">
        <div className="view-header"><h1 className="view-title">科研流水线</h1></div>
        <div className="empty-state">
          <div className="icon"><Icon name="pipeline" size={44} strokeWidth={1.2} /></div>
          <p>先在「项目」页选择或创建一个科研项目，流水线才能执行。</p>
          <button className="btn btn-primary" onClick={() => setView('projects')}>前往项目管理</button>
        </div>
      </div>
    );
  }

  const activeProject = project;

  function runKey(stage: PipelineStageKey) { return `${activeProject.id}::${stage}`; }
  function getRun(stage: PipelineStageKey) {
    return pipelineRuns[runKey(stage)] ?? { status: 'idle' as const, output: '', runAt: null, passed: false };
  }

  async function runStage(stage: PipelineStageKey) {
    if (!llmConfig || runningStage) return;
    const key = runKey(stage);
    setRunningStage(stage);
    setPipelineRun(key, { status: 'running', output: '', runAt: null, passed: getRun(stage).passed });
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await runPipelineStage({
        config: llmConfig, project: activeProject, references, stageKey: stage,
        customInstruction: stageConfigs[key] ?? '',
        onDelta: (acc) => setPipelineRun(key, { status: 'running', output: acc, runAt: null, passed: getRun(stage).passed }),
        signal: abort.signal,
      });
      setPipelineRun(key, { status: 'done', output: getRun(stage).output, runAt: new Date().toISOString(), passed: getRun(stage).passed });
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const errorText = isAbort ? '（已停止）' : error instanceof LLMError ? error.message : `出错了：${error instanceof Error ? error.message : String(error)}`;
      const previous = getRun(stage).output;
      setPipelineRun(key, { status: 'error', output: previous ? `${previous}\n\n${errorText}` : errorText, runAt: new Date().toISOString(), passed: false });
    } finally {
      setRunningStage(null);
      abortRef.current = null;
    }
  }

  async function runLocalRag() {
    const query = ragQuery.trim();
    if (!query) return;
    setRagStatus('loading');
    setRagMessage('');
    try {
      const response = await searchApi.semantic(query, activeProject.id);
      setRagHits(response.results);
      setRagStatus('done');
      setRagMessage(response.count
        ? `命中 ${response.count} 个本机原文片段；分数只用于排序，不代表证据质量。`
        : '本机索引没有命中。请先向文献库导入带摘要、笔记或全文片段的文献。');
    } catch (error) {
      setRagStatus('error');
      setRagMessage(error instanceof Error ? error.message : '本机 RAG 检索失败');
    }
  }

  async function addHitToEvidence(hit: SemanticHit) {
    if (!hit.excerpt?.trim()) return;
    try {
      await evidenceApi.create({
        projectId: activeProject.id, referenceId: hit.referenceId, excerpt: hit.excerpt,
        claim: '', relation: 'supports', confidence: 'medium', page: hit.page ?? null, chunkId: hit.chunkId ?? null,
      });
      await refreshEvidence(activeProject.id);
      setRagMessage('片段已进入待审证据链；必须人工“接受”后才能进入写作提纲。');
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '加入证据链失败');
    }
  }

  async function reviewEvidence(item: EvidenceRecord, review: 'accepted' | 'rejected') {
    try {
      await evidenceApi.patch(item.id, { review });
      await refreshEvidence(activeProject.id);
      setOutline(null);
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '证据审核失败');
    }
  }

  async function buildAcceptedOutline() {
    try {
      setOutline(await evidenceApi.outline(activeProject.id));
    } catch (error) {
      setRagMessage(error instanceof Error ? error.message : '写作提纲读取失败');
    }
  }

  function passAndAdvance(stage: PipelineStageKey) {
    const key = runKey(stage);
    setPipelineRun(key, { ...getRun(stage), passed: true });
    const following = nextStage(stage);
    if (following) {
      updateProject(activeProject.id, { currentStage: following });
      setFocusedStage(following);
    }
  }

  function quickNote(stage: PipelineStageKey) {
    const stageLabel = PIPELINE_STAGES.find((item) => item.key === stage)?.label ?? stage;
    const id = addNote({ title: `${stageLabel} · 随手记`, category: '文献批注', linkedStage: stage, body: `## ${stageLabel}\n\n` });
    setPendingNoteId(id);
    setView('notes');
  }

  const stage = PIPELINE_STAGES.find((item) => item.key === focusedStage) ?? PIPELINE_STAGES[0];
  const run = getRun(stage.key);
  const isRunning = runningStage === stage.key;
  const key = runKey(stage.key);
  const following = nextStage(stage.key);
  const stageReferences = references.filter((reference) => reference.pipelineStage === stage.key);

  const inspector = (
    <EvidenceInspector
      query={ragQuery}
      onQueryChange={setRagQuery}
      onSearch={() => void runLocalRag()}
      searchStatus={ragStatus}
      message={ragMessage}
      hits={ragHits}
      evidence={evidence}
      loading={evidenceLoading}
      outline={outline}
      referenceTitles={referenceTitles}
      onAddHit={(hit) => void addHitToEvidence(hit)}
      onReview={(item, review) => void reviewEvidence(item, review)}
      onBuildOutline={() => void buildAcceptedOutline()}
    />
  );

  return (
    <div className="pipeline-workbench">
      <header className="pipeline-workbench-header">
        <div>
          <h1>{project.name}</h1>
          <div className="pipeline-project-meta">
            {project.isPrimary && <span className="project-primary-badge">主线课题</span>}
            <span className={`project-role-badge ${project.ownerRole === 'participant' ? 'is-participant' : 'is-lead'}`}>
              {project.ownerRole === 'participant' ? '我参与' : '我主导'}
            </span>
            <ProjectStatusChip status={project.status} />
          </div>
        </div>
        <div className="pipeline-header-actions">
          {!llmConfig && <span className="pipeline-llm-warning"><Icon name="warning" size={14} /> 未配置 LLM</span>}
          <button className="btn pipeline-evidence-toggle" onClick={() => setEvidenceOpen(true)} aria-haspopup="dialog">
            <Icon name="references" size={16} /> 证据检查器
            <span>{evidenceCounts.pending} 待审</span>
          </button>
        </div>
      </header>

      <ThreeColumnWorkbench
        storageKey="selenyx.pipeline-workbench.columns"
        initial={{ left: 184, right: 328 }}
        limits={{ left: [152, 280], right: [260, 420] }}
        leftLabel="阶段轨"
        rightLabel="证据检查器"
        className="pipeline-workbench-grid"
        leftWidthVar="--pipeline-stage-width"
        rightWidthVar="--pipeline-evidence-width"
        centerMin={420}
        rightMin={260}
        left={(
        <nav className="pipeline-stage-rail" aria-label="八段流水线阶段">
          <div className="pipeline-stage-rail-title">研究阶段</div>
          {PIPELINE_STAGES.map((item) => {
            const itemRun = getRun(item.key);
            const isCurrent = project.currentStage === item.key;
            const isFocused = focusedStage === item.key;
            const stateLabel = itemRun.passed ? '已通过' : isCurrent ? '当前阶段' : '待进行';
            return (
              <button
                key={item.key}
                className={`pipeline-rail-item ${isFocused ? 'is-focused' : ''} ${isCurrent ? 'is-current' : ''} ${itemRun.passed ? 'is-passed' : ''}`}
                onClick={() => setFocusedStage(item.key)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-pressed={isFocused}
              >
                <span className="pipeline-rail-order">{itemRun.passed ? '✓' : item.order}</span>
                <span className="pipeline-rail-copy">
                  <strong>{item.label}</strong>
                  <small>{stateLabel}</small>
                </span>
                <Icon name={STAGE_ICONS[item.key]} size={17} strokeWidth={1.5} />
              </button>
            );
          })}
        </nav>
        )}
        center={(
        <main className="pipeline-stage-workspace" aria-labelledby="pipeline-stage-title">
          <div className="pipeline-stage-heading">
            <div className="pipeline-stage-heading-icon"><Icon name={STAGE_ICONS[stage.key]} size={25} strokeWidth={1.45} /></div>
            <div>
              <span>第 {stage.order} 阶段 · {project.currentStage === stage.key ? '当前阶段' : '查看阶段'}</span>
              <h2 id="pipeline-stage-title">{stage.label}</h2>
              <p>{stage.description}</p>
            </div>
          </div>

          <dl className="pipeline-stage-facts">
            <div><dt>进入条件</dt><dd>{stage.entryCriteria}</dd></div>
            <div><dt>质量门</dt><dd>{stage.qualityGate}</dd></div>
            <div><dt>关联文献</dt><dd>{stageReferences.length} 篇</dd></div>
          </dl>

          <section className="pipeline-output-plan" aria-labelledby="pipeline-output-heading">
            <div className="pipeline-section-heading">
              <h3 id="pipeline-output-heading">本阶段产出</h3>
              <span>{run.passed ? '✓ 已通过质量门' : run.status === 'done' ? '等待人工通过' : '尚未完成'}</span>
            </div>
            <div className="pipeline-output-list">{stage.outputs.map((output) => <span key={output}>{output}</span>)}</div>
          </section>

          <details className="pipeline-instruction-panel">
            <summary>自定义 AI 指令{stageConfigs[key] ? ' · 已编辑' : ' · 使用默认'}</summary>
            <label htmlFor={`pipeline-instruction-${stage.key}`}>补充本阶段的专业范围、目标期刊或特殊要求</label>
            <textarea
              id={`pipeline-instruction-${stage.key}`}
              className="input"
              rows={4}
              placeholder={`例如：侧重心衰患者电解质监测，目标期刊采用《中华护理杂志》格式…`}
              value={stageConfigs[key] ?? ''}
              onChange={(event) => setStageConfig(key, event.target.value)}
            />
          </details>

          <div className="pipeline-workspace-actions">
            {isRunning ? (
              <button className="btn" onClick={() => abortRef.current?.abort()}>停止执行</button>
            ) : (
              <button className="btn btn-primary" onClick={() => void runStage(stage.key)} disabled={!llmConfig || !!runningStage}>
                <Icon name="aiChat" size={16} /> AI 执行本阶段
              </button>
            )}
            {run.status === 'done' && !run.passed && (
              <button className="btn" onClick={() => passAndAdvance(stage.key)}>
                {following ? `通过门控并进入「${PIPELINE_STAGES.find((item) => item.key === following)?.label}」` : '通过最终质量门'}
              </button>
            )}
            <button className="btn" onClick={() => quickNote(stage.key)}><Icon name="notes" size={15} /> 记笔记</button>
            {run.runAt && <time dateTime={run.runAt}>运行于 {new Date(run.runAt).toLocaleString('zh-CN')}</time>}
          </div>

          <section className={`pipeline-stage-result ${run.status === 'error' ? 'is-error' : ''}`} aria-live="polite">
            <div className="pipeline-section-heading">
              <h3>阶段工作稿</h3>
              <span>{isRunning ? '生成中…' : run.output ? '已保存到本地工作区' : '等待执行'}</span>
            </div>
            {run.output ? (
              <div className="pipeline-stage-output">{run.output}{isRunning && <span className="pipeline-stream-cursor">▍</span>}</div>
            ) : (
              <div className="pipeline-stage-placeholder">
                <Icon name="blueprint" size={26} strokeWidth={1.3} />
                <p>执行后，结构化工作稿会显示在这里。先核对进入条件与质量门，再使用 AI 辅助。</p>
              </div>
            )}
          </section>
        </main>
        )}
        right={(
        <aside className="pipeline-evidence-column" aria-label="证据检查器">{inspector}</aside>
        )}
      />

      {isMobile && (
        <BottomSheet open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="证据检查器">
          {inspector}
        </BottomSheet>
      )}
    </div>
  );
}
