import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
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

const RESEARCH_TEMPLATES: {
  key: string;
  title: string;
  desc: string;
  icon: IconName;
  recipe?: string;
  prompt: string;
}[] = [
  {
    key: 'systematic-review',
    title: '系统综述与证据矩阵',
    desc: '制定检索策略、提取正反证据，经人工裁决后生成综述',
    icon: 'references',
    recipe: 'literature_review',
    prompt: '围绕【填写研究主题与人群/干预/结局】，检索近五年核心文献，提取关键结局证据卡并标注支持或反驳方向，汇总研究缺口与证据矩阵。',
  },
  {
    key: 'evidence-audit',
    title: '证据冲突与真实性核查',
    desc: '针对存疑结论逐条追溯本机文献页码锚点，并排对照矛盾发现',
    icon: 'stageEvidence',
    recipe: 'evidence_audit',
    prompt: '核查【填写待验证的核心学术主张】在当前文献库中的正反原文证据，指出样本局限、潜在偏倚及尚缺乏直接证据支撑的环节。',
  },
  {
    key: 'study-design',
    title: '研究方案与统计规划',
    desc: '明确操作化变量、纳排标准、偏倚控制措施及样本量估算逻辑',
    icon: 'statTools',
    recipe: 'study_design',
    prompt: '针对研究问题【填写研究问题】，设计可复现的研究方案：明确研究设计类型、纳入排除标准、主要与次要结局指标、混杂控制及统计检验方法。',
  },
  {
    key: 'deep-reading',
    title: '单篇/多篇文献精读提取',
    desc: '结构化拆解研究方法、核心效应量与方法学局限并沉淀证据卡',
    icon: 'stageReading',
    prompt: '精读当前关联文献（或附加材料），按研究背景、研究设计、样本特征、主要定量/定性发现与方法学局限提取结构化要点。',
  },
];

export function NewTaskHome({
  onStarted,
  onEnterChat,
}: {
  onStarted?: (runId: string, projectId: string | null) => void;
  onEnterChat?: () => void;
} = {}) {
  const {
    projects,
    references,
    currentProjectId,
    setView,
    setLibraryTab,
    requestCreateProject,
    customInstructions,
    replyStyle,
    settingsOpen,
    openSettings,
    requestRunFocus,
  } = useAppStore();
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

  useEffect(() => {
    setProjectId(currentProjectId ?? '');
  }, [currentProjectId]);

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
    const spaceAbove = rect.top - topbarBottom - gutter - 8;
    const spaceBelow = window.innerHeight - rect.bottom - gutter - 8;

    if (spaceAbove >= 220 || spaceAbove >= spaceBelow) {
      setAddPosition({
        bottom: Math.round(window.innerHeight - rect.top + 8),
        left: Math.round(left),
        width,
        maxHeight: Math.max(180, Math.min(460, spaceAbove)),
      });
    } else {
      setAddPosition({
        top: Math.round(rect.bottom + 8),
        left: Math.round(left),
        width,
        maxHeight: Math.max(180, Math.min(460, spaceBelow)),
      });
    }
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

  const applyTemplate = (tpl: (typeof RESEARCH_TEMPLATES)[number]) => {
    chooseRecipe(tpl.recipe);
    setGoal(tpl.prompt);
    setPrePolishGoal(null);
    goalRef.current?.focus();
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
    <div className="newtask-home">
      <header className="newtask-hero">
        <Crane size={52} className="newtask-crane" />
        <div className="newtask-hero-copy">
          <h1>{selectedProject ? `继续研究：${selectedProject.name}` : '开始一项研究'}</h1>
          <p>规划检索路径、提取可追溯原文片段，经人工证据门落锤后再行成稿。</p>
        </div>
        {onEnterChat && (
          <button type="button" className="btn newtask-chat-switch" onClick={onEnterChat} title="切换到自由多轮对话与严格证据问答">
            <Icon name="aiChat" size={15} /> 多轮对话
          </button>
        )}
      </header>

      <div className="newtask-workflow-bar" role="radiogroup" aria-label="快捷研究模式">
        <button
          type="button"
          role="radio"
          aria-checked={!recipe}
          className={`newtask-workflow-pill ${!recipe ? 'is-active' : ''}`}
          onClick={() => chooseRecipe(undefined)}
        >
          <Icon name="sparkles" size={14} /> 标准研究
        </button>
        {TASK_RECIPE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={recipe === option.key}
            className={`newtask-workflow-pill ${recipe === option.key ? 'is-active' : ''}`}
            onClick={() => chooseRecipe(option.key)}
            title={option.hint}
          >
            <Icon name={option.icon} size={14} /> {option.name}
          </button>
        ))}
      </div>

      <div className="newtask-composer-stage">
        <Composer value={goal} onChange={updateGoal} onSubmit={() => void submit()} textareaRef={goalRef}
          ariaLabel="任务目标" placeholder="描述你的研究问题、待查证假设，或附上一份文献摘录/数据材料…" rows={3} autoResize maxHeight={220}
          className="newtask-composer" inputWrapClassName="newtask-composer-input-wrap"
          inputRowClassName="newtask-composer-input-row" textareaClassName="newtask-composer-textarea"
          controls={(
            <div ref={addAnchorRef} className="newtask-composer-controls" aria-label="任务配置">
              <div className="newtask-composer-settings">
                <button ref={addTriggerRef} type="button" className="newtask-attach newtask-add-trigger"
                  onClick={toggleAddMenu} aria-haspopup="dialog" aria-expanded={addOpen}
                  aria-controls={addOpen ? 'newtask-add-menu' : undefined}
                  aria-label="任务设置" title="执行计划确认、批评审查与本机技能">
                  <Icon name="plus" size={17} />
                  {addConfigured && <span className="newtask-add-dot" aria-hidden="true" />}
                </button>
                <button type="button" className="newtask-attach" onClick={() => attachInputRef.current?.click()}
                  aria-label="附加文本材料" title="附加本地文本材料（.txt / .md / .csv / .json，上限 8000 字）">
                  <Icon name="paperclip" size={17} />
                </button>
                <input ref={attachInputRef} type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json" hidden
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) attachFile(file); event.target.value = ''; }} />
                <label className="newtask-project-control" title={selectedProject?.name ?? '为任务关联一个研究项目'}>
                  <Icon name="projects" size={14} /><span>{selectedProject?.name ?? '关联项目'}</span><Icon name="chevronDown" size={12} />
                  <select value={selectedProject?.id ?? ''} onChange={(event) => setProjectId(event.target.value)} aria-label="选择项目">
                    <option value="">不关联项目</option>
                    {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="newtask-composer-actions">
                <button type="button" className="newtask-model-chip" onClick={() => openSettings('model')}
                  title={backendModel?.configured ? `研究后端当前模型：${backendModel.model}` : '配置本机研究模型与 API 密钥'}>
                  <span className={`newtask-model-dot ${backendModel?.configured ? 'is-ok' : ''}`} aria-hidden="true" />
                  <span>{backendModel?.configured ? backendModel.model : '配置模型'}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                <button type="button" className="newtask-polish" onClick={() => void polishGoal()}
                  disabled={!polishTarget || polishing || submitting || backendOffline || checkingBackend}
                  aria-label="优化提示词" aria-busy={polishing}
                  title={!polishTarget && goal.trim() ? '先写研究目标再优化；技能名与附件原文会原样保留' : '重写研究目标使其更严谨清晰（不补事实、可撤销）'}>
                  <Icon name="polish" size={16} />
                </button>
                <button type="button" className="newtask-submit" onClick={() => void submit()}
                  disabled={!goal.trim() || submitting || backendOffline || checkingBackend}
                  aria-label={submitting ? '正在创建任务' : '开始研究'} title="开始研究（Enter）">
                  {submitting ? <Icon name="clock" size={17} /> : <Icon name="arrowRight" size={18} />}
                </button>
              </div>
            </div>
          )}
        />
        <div className="newtask-composer-meta">
          <div className="newtask-config-chips">
            <span className="newtask-config-chip is-muted">
              <Icon name="target" size={12} />{confirmPlan ? '先审阅计划' : '直接执行'}
            </span>
            {review && <span className="newtask-config-chip">
              <Icon name="shield" size={12} />成稿前批评审查
              {!reviewForced && <button type="button" onClick={() => setReview(false)} aria-label="关闭成稿前批评审查"><Icon name="close" size={10} /></button>}
            </span>}
            {selectedSkill && <span className="newtask-config-chip">
              <Icon name="skills" size={12} />/{selectedSkill}
              <button type="button" onClick={() => setSelectedSkill(null)} aria-label={`取消技能 ${selectedSkill}`}><Icon name="close" size={10} /></button>
            </span>}
            {prePolishGoal !== null && <span className="newtask-config-chip">
              <Icon name="polish" size={12} />已重写表述
              <button type="button" className="newtask-config-undo" onClick={undoPolish}>撤销</button>
            </span>}
          </div>
          <span className="newtask-keyboard-hint">Enter 提交任务 <span>·</span> Shift + Enter 换行</span>
        </div>
        {backendOffline && <div role="status" className="newtask-connection-note">
          <Icon name="warning" size={15} /><span>本机后端服务未连接，研究项目、文献库与统计工具仍可完整离线使用。</span>
          <button type="button" onClick={() => void loadRecent()} disabled={checkingBackend}>{checkingBackend ? '连接中…' : '重新检测'}</button>
        </div>}
        {error && <div role="alert" className="newtask-error"><span>{error}</span><button type="button" onClick={() => openSettings('model')}>检查模型配置</button></div>}
      </div>

      <section className="newtask-templates" aria-label="典型科研任务入口">
        <div className="newtask-section-heading">
          <h2>按研究场景填入结构</h2>
          <span>点击仅填入可编辑模板，不自动发送</span>
        </div>
        <div className="newtask-template-grid">
          {RESEARCH_TEMPLATES.map((tpl) => (
            <button key={tpl.key} type="button" className="newtask-template-card" onClick={() => applyTemplate(tpl)}>
              <span className="newtask-template-icon"><Icon name={tpl.icon} size={17} /></span>
              <span className="newtask-template-body">
                <strong>{tpl.title}</strong>
                <small>{tpl.desc}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="newtask-workspace-strip" aria-label="你的本机工作区">
        <div className="newtask-section-heading">
          <h2>本机工作区概览</h2>
          <button type="button" onClick={() => requestCreateProject()}><Icon name="plus" size={13} /> 新建课题</button>
        </div>
        <div className="newtask-overview-grid">
          <button type="button" className="newtask-overview-card" onClick={() => setView('projects')}>
            <span className="newtask-overview-icon"><Icon name="projects" size={17} /></span>
            <span className="newtask-overview-copy">
              <strong>研究项目</strong>
              <small>课题框架、进度与截止日</small>
            </span>
            <b className="newtask-overview-num">{activeProjects.length}</b>
          </button>
          <button type="button" className="newtask-overview-card" onClick={() => { setLibraryTab('references'); setView('library'); }}>
            <span className="newtask-overview-icon"><Icon name="references" size={17} /></span>
            <span className="newtask-overview-copy">
              <strong>文献与原文</strong>
              <small>管理题录、PDF 批注与索引</small>
            </span>
            <b className="newtask-overview-num">{references.length}</b>
          </button>
          <button type="button" className={`newtask-overview-card ${pendingEvidence > 0 ? 'has-pending' : ''}`} onClick={() => { setLibraryTab('evidence'); setView('library'); }}>
            <span className="newtask-overview-icon"><Icon name="stageEvidence" size={17} /></span>
            <span className="newtask-overview-copy">
              <strong>证据门待裁决</strong>
              <small>{pendingEvidence > 0 ? '点击进入人工落锤审核' : '暂无待审核候选证据'}</small>
            </span>
            <b className="newtask-overview-num">{pendingEvidence}</b>
          </button>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="newtask-recent" aria-label="最近研究">
          <div className="newtask-section-heading">
            <h2>最近研究记录</h2>
            <button type="button" onClick={() => setView('tasks')}>查看全部 <Icon name="arrowRight" size={13} /></button>
          </div>
          <div className="newtask-recent-list">
            {recent.map((run) => (
              <button key={run.id} type="button" className="newtask-recent-item" onClick={() => requestRunFocus(run.id)} title={run.goal}>
                <Icon name="clock" size={15} />
                <span className="newtask-recent-goal">{run.goal}</span>
                <span className="newtask-recent-status" style={{ color: STATUS_COLOR[run.status] ?? 'var(--text-muted)' }}>
                  {STATUS_LABEL[run.status] ?? run.status}
                </span>
                <Icon name="chevronRight" size={13} />
              </button>
            ))}
          </div>
        </section>
      )}

      {addMenu}
    </div>
  );
}
