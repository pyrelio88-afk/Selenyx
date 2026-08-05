import { useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/project';
import type { PipelineStageKey } from '@types/index';
import { Icon, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';
import { runPipelineStage } from '@services/pipeline';
import { LLMError } from '@services/llm';

const STAGE_ORDER: PipelineStageKey[] = PIPELINE_STAGES.map((s) => s.key);

function nextStage(key: PipelineStageKey): PipelineStageKey | null {
  const i = STAGE_ORDER.indexOf(key);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function PipelineView() {
  const {
    references, projects, currentProjectId, updateProject,
    llmConfig, pipelineRuns, setPipelineRun, stageConfigs, setStageConfig,
  } = useAppStore();
  const project = projects.find((p) => p.id === currentProjectId);
  const [runningStage, setRunningStage] = useState<PipelineStageKey | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  /** 标记该段通过门控并推进到下一段 */
  function passAndAdvance(stage: PipelineStageKey) {
    const key = rk(stage);
    setPipelineRun(key, { ...getRun(stage), passed: true });
    const next = nextStage(stage);
    if (next) updateProject(project!.id, { currentStage: next });
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">科研流水线</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前项目:</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</span>
          <ProjectStatusChip status={project.status} />
          {!llmConfig && <span style={{ fontSize: 12, color: 'var(--danger)' }}>未配置 LLM，去「设置」配置后才能执行</span>}
        </span>
      </div>

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                <div style={{ textAlign: 'right', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
