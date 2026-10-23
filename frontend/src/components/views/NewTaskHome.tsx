import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { Crane } from '@components/ui/Crane';
import { STATUS_COLOR, STATUS_LABEL } from '@components/tasks/StepRow';
import { agentApi, type AgentRunSummary } from '@services/agent';
import { skillsApi, resolveGoalSkill, type AgentSkill } from '@services/skills';
import { polishResearchPrompt, splitPolishInput } from '@services/promptPolish';
import { aiApi, evidenceApi } from '@services/api';
import { Composer } from '@components/assistant/Composer';
import { withReplyStyle } from '@components/assistant/chatShared';
import { TASK_RECIPE_OPTIONS, recipeOption } from '@lib/taskRecipes';
import { serviceErrorMessage } from '@lib/userFacingError';

const ADD_MENU_WIDTH = 328;
const ADD_MENU_WIDTH_WIDE = 600;

interface AddMenuPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function NewTaskHome({ onStarted }: {
  onStarted?: (runId: string, projectId: string | null) => void;
} = {}) {
  const { projects, currentProjectId, setView, setLibraryTab, customInstructions, replyStyle, settingsOpen, openSettings, requestRunFocus } = useAppStore();
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState(currentProjectId ?? '');
  const [review, setReview] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(true);
  const [backendModel, setBackendModel] = useState<{ configured: boolean; model: string } | null>(null);
  const [recipe, setRecipe] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [checkingBackend, setCheckingBackend] = useState(true);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<AgentRunSummary[]>([]);
  const [pendingEvidence, setPendingEvidence] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addPosition, setAddPosition] = useState<AddMenuPosition | null>(null);
  const [addAtEnd, setAddAtEnd] = useState(false);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [skillsState, setSkillsState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [prePolishGoal, setPrePolishGoal] = useState<string | null>(null);

  const attachInputRef = useRef<HTMLInputElement>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const preflightRef = useRef<AbortController | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addAnchorRef = useRef<HTMLDivElement>(null);
  const addPopoverRef = useRef<HTMLDivElement>(null);
  const addRestoreFocusRef = useRef(false);
  const polishAbortRef = useRef<AbortController | null>(null);
  const activeProjects = projects.filter((project) => project.status !== 'archived');
  const selectedProject = activeProjects.find((project) => project.id === projectId);
  const activeRecipe = recipeOption(recipe);
  const reviewForced = activeRecipe?.forcesReview ?? false;
  const addConfigured = Boolean(activeRecipe || selectedSkill || review || !confirmPlan);
  const polishTarget = splitPolishInput(goal).target;

  const loadRecent = useCallback(async () => {
    preflightRef.current?.abort();
    const request = new AbortController();
    preflightRef.current = request;
    setCheckingBackend(true);
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
      const [{ runs }, model] = await Promise.all([
        agentApi.list(signal),
        aiApi.config(signal).catch(() => null),
      ]);
      if (request.signal.aborted) return;
      setRecent(runs.slice(0, 4));
      setBackendModel(model);
      setBackendOffline(false);
    } catch {
      if (!request.signal.aborted) { setBackendOffline(true); setBackendModel(null); }
    } finally {
      if (!request.signal.aborted) setCheckingBackend(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsState('loading');
    try {
      const { skills: list } = await skillsApi.list(projectId || undefined);
      setSkills(list.filter((skill) => skill.enabled));
      setSkillsState('ready');
    } catch {
      setSkills([]);
      setSkillsState('offline');
    }
  }, [projectId]);

  useEffect(() => {
    if (!settingsOpen) void loadRecent();
    return () => { preflightRef.current?.abort(); };
  }, [loadRecent, settingsOpen]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (skillsState !== 'ready' || !selectedSkill) return;
    if (!skills.some((skill) => skill.name === selectedSkill)) setSelectedSkill(null);
  }, [selectedSkill, skills, skillsState]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const summary = await evidenceApi.summary();
        if (!cancelled) setPendingEvidence(Number(summary.pending ?? 0));
      } catch { /* Evidence counts are unavailable offline. */ }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => () => polishAbortRef.current?.abort(), []);

  const updateAddPosition = useCallback(() => {
    const rect = (addTriggerRef.current ?? addAnchorRef.current)?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 10;
    const preferredWidth = window.innerWidth >= 760 ? ADD_MENU_WIDTH_WIDE : ADD_MENU_WIDTH;
    const width = Math.min(preferredWidth, Math.max(0, window.innerWidth - gutter * 2));
    const left = Math.min(Math.max(rect.left, gutter), Math.max(gutter, window.innerWidth - width - gutter));
    const topbarBottom = document.querySelector('.workspace-topbar')?.getBoundingClientRect().bottom ?? 0;
    const maxHeight = Math.max(0, Math.min(480, rect.top - topbarBottom - gutter - 8));
    if (!maxHeight) return;
    setAddPosition({
      bottom: Math.round(window.innerHeight - rect.top + 8),
      left: Math.round(left),
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!addOpen) return;
    setAddAtEnd(false);
    updateAddPosition();
    window.addEventListener('resize', updateAddPosition);
    window.addEventListener('scroll', updateAddPosition, true);
    return () => {
      window.removeEventListener('resize', updateAddPosition);
      window.removeEventListener('scroll', updateAddPosition, true);
    };
  }, [addOpen, updateAddPosition, goal]);

  useEffect(() => {
    if (!addOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      addRestoreFocusRef.current = true;
      setAddOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (addTriggerRef.current?.contains(target) || addPopoverRef.current?.contains(target)) return;
      setAddOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    const frame = window.requestAnimationFrame(() => {
      addPopoverRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
      window.cancelAnimationFrame(frame);
    };
  }, [addOpen]);

  useEffect(() => {
    if (addOpen || !addRestoreFocusRef.current) return;
    addRestoreFocusRef.current = false;
    addTriggerRef.current?.focus();
  }, [addOpen]);

  const updateGoal = (nextGoal: string) => {
    setGoal(nextGoal);
    setPrePolishGoal(null);
  };

  const toggleAddMenu = () => {
    setAddOpen((open) => {
      if (!open && skillsState === 'offline') void loadSkills();
      return !open;
    });
  };

  const chooseRecipe = (key: string | undefined) => {
    setRecipe(key);
    if (key && recipeOption(key)?.forcesReview) setReview(true);
  };

  const chooseSkill = (name: string) => {
    const next = selectedSkill === name ? null : name;
    setSelectedSkill(next);
    if (next) {
      setAddOpen(false);
      goalRef.current?.focus();
    }
  };

  const manageSkills = () => {
    setAddOpen(false);
    setView('skills');
  };

  const attachFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const excerpt = raw.slice(0, 8000).trim();
      if (!excerpt) { setError(`「${file.name}」没有可读取的文本内容。`); return; }
      const block = `\n\n【附加材料：${file.name}】\n${excerpt}${raw.length > 8000 ? '\n…（材料较长，已截取前 8000 字）' : ''}`;
      setGoal((current) => `${current.trimEnd()}${block}`);
      setPrePolishGoal(null);
      setError('');
      goalRef.current?.focus();
    };
    reader.onerror = () => setError(`无法读取「${file.name}」，请选择文本文件。`);
    reader.readAsText(file);
  };

  const polishGoal = async () => {
    const text = goal.trim();
    if (!text || !splitPolishInput(text).target || polishing || submitting || backendOffline || checkingBackend) return;
    polishAbortRef.current?.abort();
    const request = new AbortController();
    polishAbortRef.current = request;
    setPolishing(true);
    setError('');
    try {
      const polished = await polishResearchPrompt(text, selectedProject?.id ?? null, request.signal);
      if (request.signal.aborted) return;
      setPrePolishGoal(goal);
      setGoal(polished);
      goalRef.current?.focus();
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(`提示词优化失败：${serviceErrorMessage(cause, '请稍后重试。')}`);
      }
    } finally {
      if (polishAbortRef.current === request) polishAbortRef.current = null;
      if (!request.signal.aborted) setPolishing(false);
    }
  };

  const undoPolish = () => {
    if (prePolishGoal === null) return;
    setGoal(prePolishGoal);
    setPrePolishGoal(null);
    goalRef.current?.focus();
  };

  const submit = async () => {
    const text = goal.trim();
    if (!text || submitting || backendOffline || checkingBackend) return;
    setSubmitting(true);
    setError('');
    try {
      const { goal: goalText, skill } = resolveGoalSkill(text, selectedSkill);
      const linkedProjectId = selectedProject?.id ?? null;
      const { runId } = await agentApi.start(goalText, linkedProjectId, {
        review, confirmPlan, recipe, skill,
        customInstructions: withReplyStyle(customInstructions, replyStyle),
      });
      setGoal('');
      setPrePolishGoal(null);
      if (onStarted) onStarted(runId, linkedProjectId);
      else requestRunFocus(runId);
    } catch (cause) {
      setError(`任务未能创建：${serviceErrorMessage(cause, '请稍后重试。')}`);
    } finally { setSubmitting(false); }
  };

  const addMenu = addOpen && addPosition ? createPortal((
    <div
      ref={addPopoverRef}
      id="newtask-add-menu"
      className="newtask-add-popover"
      role="dialog"
      aria-label="任务设置"
      style={{ position: 'fixed', ...addPosition }}
      onScroll={(event) => {
        const panel = event.currentTarget;
        setAddAtEnd(panel.scrollHeight - panel.scrollTop - panel.clientHeight <= 8);
      }}
    >
      <section className="newtask-add-section newtask-add-flows" aria-label="研究流程">
        <div className="newtask-add-heading">研究流程</div>
        <div role="radiogroup" aria-label="研究流程">
          <button type="button" role="radio" aria-checked={!recipe} className="newtask-add-option"
            onClick={() => chooseRecipe(undefined)}>
            <Icon name="sparkles" size={16} />
            <span className="newtask-add-copy"><strong>标准执行</strong><small>按当前目标直接执行，不追加流程指令</small></span>
            <Icon name="check" size={15} className="newtask-add-check" />
          </button>
          {TASK_RECIPE_OPTIONS.map((option) => (
            <button key={option.key} type="button" role="radio" aria-checked={recipe === option.key}
              className="newtask-add-option" onClick={() => chooseRecipe(option.key)}>
              <Icon name={option.icon} size={16} />
              <span className="newtask-add-copy"><strong>{option.name}</strong><small>{option.hint}</small></span>
              <Icon name="check" size={15} className="newtask-add-check" />
            </button>
          ))}
        </div>
      </section>

      <section className="newtask-add-section newtask-add-options" aria-label="执行选项">
        <div className="newtask-add-heading">执行选项</div>
        <button type="button" role="switch" aria-checked={confirmPlan} className="newtask-add-option"
          onClick={() => setConfirmPlan((value) => !value)}>
          <Icon name="target" size={16} />
          <span className="newtask-add-copy"><strong>执行前确认计划</strong><small>先审阅执行计划，再开始动手</small></span>
          <span className="newtask-add-switch" aria-hidden="true" />
        </button>
        <button type="button" role="switch" aria-checked={review} className="newtask-add-option"
          disabled={reviewForced} onClick={() => setReview((value) => !value)}>
          <Icon name="shield" size={16} />
          <span className="newtask-add-copy">
            <strong>成稿前批评审查</strong>
            <small>{reviewForced ? '综述流水线已强制开启' : '额外 1–2 次模型调用，先批评再成稿'}</small>
          </span>
          <span className="newtask-add-switch" aria-hidden="true" />
        </button>
      </section>

      <section className="newtask-add-section newtask-add-skills" aria-label="科研技能">
        <div className="newtask-add-heading">
          科研技能
          <button type="button" className="newtask-add-manage" onClick={manageSkills}>管理</button>
        </div>
        {skillsState === 'loading' && <p className="newtask-add-note">正在读取本机技能…</p>}
        {skillsState === 'offline' && (
          <p className="newtask-add-note">本机服务未连接，技能暂不可用。<button type="button" onClick={() => void loadSkills()}>重试</button></p>
        )}
        {skillsState === 'ready' && skills.length === 0 && (
          <p className="newtask-add-note">还没有技能。<button type="button" onClick={manageSkills}>新建技能</button></p>
        )}
        {skillsState === 'ready' && skills.map((skill) => (
          <button key={`${skill.scope}-${skill.name}`} type="button" className="newtask-add-option"
            aria-pressed={selectedSkill === skill.name} onClick={() => chooseSkill(skill.name)}
            title={skill.description || skill.name}>
            <Icon name="skills" size={16} />
            <span className="newtask-add-copy"><strong>/{skill.name}</strong><small>{skill.description || '本机研究技能'}</small></span>
            <Icon name="check" size={15} className="newtask-add-check" />
          </button>
        ))}
      </section>

      <div className={`newtask-add-scroll-hint${addAtEnd ? ' is-hidden' : ''}`} aria-hidden="true">
        <Icon name="chevronDown" size={13} /> 滚动查看更多
      </div>
    </div>
  ), document.body) : null;

  return (
    <div className={`newtask-home${addOpen ? ' has-add-menu' : ''}`}>
      <header className="newtask-hero">
        <Crane size={48} className="newtask-crane" />
        <div className="newtask-hero-copy">
          <h1>{selectedProject ? '继续这项研究' : '开始研究'}</h1>
          {selectedProject && <p>{selectedProject.name}</p>}
        </div>
      </header>

      <div className="newtask-composer-stage">
        <Composer value={goal} onChange={updateGoal} onSubmit={() => void submit()} textareaRef={goalRef}
          ariaLabel="任务目标" placeholder="你想研究什么？输入问题，或附上一份材料…" rows={3} autoResize maxHeight={220}
          className="newtask-composer" inputWrapClassName="newtask-composer-input-wrap"
          inputRowClassName="newtask-composer-input-row" textareaClassName="newtask-composer-textarea"
          controls={(
            <div ref={addAnchorRef} className="newtask-composer-controls" aria-label="任务配置">
              <div className="newtask-composer-settings">
                <button ref={addTriggerRef} type="button" className="newtask-attach newtask-add-trigger"
                  onClick={toggleAddMenu} aria-haspopup="dialog" aria-expanded={addOpen}
                  aria-controls={addOpen ? 'newtask-add-menu' : undefined}
                  aria-label="任务设置" title="研究流程、计划确认与科研技能">
                  <Icon name="plus" size={18} />
                  {addConfigured && <span className="newtask-add-dot" aria-hidden="true" />}
                </button>
                <button type="button" className="newtask-attach" onClick={() => attachInputRef.current?.click()}
                  aria-label="附加文本材料" title="添加文本材料（最多 8000 字，提交时发送给所选模型）"><Icon name="paperclip" size={18} /></button>
                <input ref={attachInputRef} type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json" hidden
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) attachFile(file); event.target.value = ''; }} />
                <label className="newtask-project-control" title={selectedProject?.name ?? '为任务关联一个研究项目'}>
                  <Icon name="projects" size={15} /><span>{selectedProject?.name ?? '选择项目'}</span><Icon name="chevronDown" size={12} />
                  <select value={selectedProject?.id ?? ''} onChange={(event) => setProjectId(event.target.value)} aria-label="选择项目">
                    <option value="">不关联项目</option>
                    {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="newtask-composer-actions">
                <button type="button" className="newtask-model-chip" onClick={() => openSettings('model')}
                  title={backendModel?.configured ? `研究后端当前模型：${backendModel.model}` : '查看研究后端实际使用的模型配置'}>
                  <span>{backendModel?.configured ? backendModel.model : '配置模型'}</span><Icon name="chevronDown" size={12} />
                </button>
                <button type="button" className="newtask-polish" onClick={() => void polishGoal()}
                  disabled={!polishTarget || polishing || submitting || backendOffline || checkingBackend}
                  aria-label="优化提示词" aria-busy={polishing}
                  title={!polishTarget && goal.trim() ? '先写研究目标再优化；技能名与附件原文会原样保留' : '优化提示词（调用一次模型，只改写法不补事实）'}>
                  <Icon name="polish" size={17} />
                </button>
                <button type="button" className="newtask-submit" onClick={() => void submit()}
                  disabled={!goal.trim() || submitting || backendOffline || checkingBackend}
                  aria-label={submitting ? '正在创建任务' : '开始研究'} title="开始研究（Enter）">
                  {submitting ? <Icon name="clock" size={18} /> : <Icon name="arrowRight" size={19} />}
                </button>
              </div>
            </div>
          )}
        />
        <div className="newtask-composer-meta">
          <div className="newtask-config-chips">
            {activeRecipe && <span className="newtask-config-chip">
              <Icon name={activeRecipe.icon} size={13} />{activeRecipe.name}
              <button type="button" onClick={() => setRecipe(undefined)} aria-label={`移除${activeRecipe.name}`}><Icon name="close" size={10} /></button>
            </span>}
            {review && <span className="newtask-config-chip">
              <Icon name="shield" size={13} />批评审查
              <button type="button" onClick={() => setReview(false)} aria-label="关闭成稿前批评审查"><Icon name="close" size={10} /></button>
            </span>}
            {selectedSkill && <span className="newtask-config-chip">
              <Icon name="skills" size={13} />/{selectedSkill}
              <button type="button" onClick={() => setSelectedSkill(null)} aria-label={`取消技能 ${selectedSkill}`}><Icon name="close" size={10} /></button>
            </span>}
            {prePolishGoal !== null && <span className="newtask-config-chip">
              <Icon name="polish" size={13} />已润色
              <button type="button" className="newtask-config-undo" onClick={undoPolish}>撤销</button>
            </span>}
          </div>
          <span className="newtask-keyboard-hint">Enter 开始研究 <span>·</span> Shift + Enter 换行</span>
        </div>
        {backendOffline && <div role="status" className="newtask-connection-note">
          <Icon name="warning" size={15} /><span>本机服务未连接，项目和文献仍可离线管理。</span>
          <button type="button" onClick={() => void loadRecent()} disabled={checkingBackend}>{checkingBackend ? '连接中…' : '重新连接'}</button>
        </div>}
        {error && <div role="alert" className="newtask-error"><span>{error}</span><button type="button" onClick={() => openSettings('model')}>检查模型配置</button></div>}
      </div>

      {(recent.length > 0 || pendingEvidence > 0) && <section className="newtask-recent" aria-label="最近研究">
        <div className="newtask-section-heading"><h2>最近研究</h2><button type="button" onClick={() => setView('tasks')}>查看全部 <Icon name="arrowRight" size={13} /></button></div>
        <div className="newtask-recent-list">
          {pendingEvidence > 0 && <button type="button" className="newtask-recent-item newtask-recent-review" onClick={() => { setLibraryTab('evidence'); setView('library'); }}>
            <Icon name="stageEvidence" size={16} /><span className="newtask-recent-goal">{pendingEvidence} 条证据等待审核</span><Icon name="chevronRight" size={13} />
          </button>}
          {recent.map((run) => (
            <button key={run.id} type="button" className="newtask-recent-item" onClick={() => requestRunFocus(run.id)} title={run.goal}>
              <Icon name="clock" size={15} /><span className="newtask-recent-goal">{run.goal}</span>
              <span className="newtask-recent-status" style={{ color: STATUS_COLOR[run.status] ?? 'var(--text-muted)' }}>{STATUS_LABEL[run.status] ?? run.status}</span>
              <Icon name="chevronRight" size={13} />
            </button>
          ))}
        </div>
      </section>}

      {addMenu}
    </div>
  );
}
