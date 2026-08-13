/**
 * 新建任务主页（v4 · ClawsGO 式）
 *
 * 时段问候语 + 任务模板卡（点击填入输入框）+ 底部任务输入框。
 * 提交即创建 agent run 并跳任务详情；下方保留最近运行动态。
 * 侧边栏不再设「任务」一级项——本页即任务入口。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { STATUS_COLOR, STATUS_LABEL } from '@components/tasks/StepRow';
import { agentApi, type AgentRunSummary } from '@services/agent';
import { parseSkillPrefix } from '@services/skills';
import { evidenceApi } from '@services/api';
import { Composer } from '@components/assistant/Composer';
import { handoffNewTaskToAssistant } from '@components/assistant/handoffNewTask';
import { withReplyStyle } from '@components/assistant/chatShared';

interface TaskTemplate {
  icon: IconName;
  title: string;
  desc: string;
  prompt: string;
  review: boolean;
  /** 内置流水线（V4 模块 E）：综述流水线 = 综述员起草→批评员审→修订→染色成稿 */
  recipe?: string;
}

const TEMPLATES: TaskTemplate[] = [
  {
    icon: 'stageLiterature',
    title: '文献综述',
    desc: '系统检索与评估，梳理领域研究现状与证据。',
    prompt: '帮我梳理这个项目文献库的核心证据，产出一份结构化综述提纲（含研究缺口）。',
    review: true,
    recipe: 'review-pipeline',
  },
  {
    icon: 'stageEvidence',
    title: '证据梳理',
    desc: '提取关键证据，建立结构化证据表格。',
    prompt: '盘点当前项目的证据链：哪些主张证据充分，哪些还缺支撑？给出补强建议。',
    review: false,
  },
  {
    icon: 'stageWriting',
    title: '论文提纲',
    desc: '构建论文结构与论点，形成写作提纲。',
    prompt: '基于项目资料生成论文提纲：背景、方法、结果、讨论，每节列出要点与所需证据。',
    review: true,
  },
  {
    icon: 'chart',
    title: '数据解读',
    desc: '分析数据与可视化，提炼结论与洞察。',
    prompt: '解读项目数据表中的关键结果：主要发现、异常值、可以写进论文的结论。',
    review: false,
  },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function NewTaskHome({
  onStarted,
}: {
  onStarted?: (goal: string, projectId: string | null, runId: string) => void;
} = {}) {
  const { projects, currentProjectId, nickname, setView, setLibraryTab, customInstructions, replyStyle, llmConfig, openSettings, requestRunFocus } = useAppStore();
  const [goal, setGoal] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>(currentProjectId ?? '');
  const [review, setReview] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [recipe, setRecipe] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [recent, setRecent] = useState<AgentRunSummary[]>([]);
  const [pendingEvidence, setPendingEvidence] = useState(0);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const activeProjects = projects.filter((p) => p.status !== 'archived');

  const loadRecent = useCallback(async () => {
    try {
      const { runs } = await agentApi.list();
      setRecent(runs.slice(0, 6));
      setBackendOffline(false);
    } catch {
      setBackendOffline(true);
    }
  }, []);

  useEffect(() => { void loadRecent(); }, [loadRecent]);

  /* 证据门角标：待裁决证据卡计数（朱砂点睛） */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const summary = await evidenceApi.summary();
        if (!cancelled) setPendingEvidence(Number(summary.pending ?? 0));
      } catch { /* 后端离线时不显示角标 */ }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const openEvidenceQueue = () => {
    setLibraryTab('evidence');
    setView('library');
  };

  const applyTemplate = (template: TaskTemplate) => {
    setGoal(template.prompt);
    setSelectedTemplate(template.title);
    setReview(template.review);
    setRecipe(template.recipe);
  };

  const updateGoal = (nextGoal: string) => {
    setGoal(nextGoal);
    if (selectedTemplate && nextGoal !== TEMPLATES.find((template) => template.title === selectedTemplate)?.prompt) {
      setSelectedTemplate(null);
    }
  };

  /* 附件（设计稿 📎）：文本类材料读入本地并附进任务目标，不出本机 */
  const ATTACH_MAX_CHARS = 8000;
  const attachFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const truncated = raw.length > ATTACH_MAX_CHARS;
      const excerpt = raw.slice(0, ATTACH_MAX_CHARS).trim();
      if (!excerpt) {
        alert(`「${file.name}」没有可读取的文本内容。`);
        return;
      }
      const block = `\n\n【附加材料：${file.name}】\n${excerpt}${truncated ? '\n…（材料较长，已截取前 8000 字）' : ''}`;
      updateGoal(`${goal.trimEnd()}${block}`);
    };
    reader.onerror = () => alert(`读取「${file.name}」失败，请确认是可读文本文件。`);
    reader.readAsText(file);
  };

  const submit = async () => {
    const text = goal.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      // 输入框 /技能名 前缀（模块 F）：解析后随 run 注入指令并裁剪工具白名单
      const parsed = parseSkillPrefix(text);
      const { runId } = await agentApi.start(parsed.goal, projectId || null, {
        review,
        confirmPlan,
        recipe,
        skill: parsed.skill,
        customInstructions: withReplyStyle(customInstructions, replyStyle),
      });
      setGoal('');
      if (onStarted) {
        onStarted(parsed.goal, projectId || null, runId);
      } else {
        handoffNewTaskToAssistant(parsed.goal, projectId || null, runId);
      }
    } catch (error) {
      setBackendOffline(true);
      alert(`任务创建失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="newtask-home">
      {pendingEvidence > 0 && (
        <button
          type="button"
          className="evidence-pending-badge"
          onClick={openEvidenceQueue}
          title="前往证据卡队列裁决"
        >
          <span className="dot" aria-hidden="true" /> 待证据梳理 {pendingEvidence}
          <Icon name="chevronRight" size={13} />
        </button>
      )}

      <header className="newtask-hero">
        <h1>{greeting()}，{nickname || '研究者'}</h1>
        <p>从一个可信的研究问题开始，让每个结论都能回到证据。</p>
      </header>

      {backendOffline && (
        <div role="alert" className="local-offline-alert">
          本机后端还没连上。桌面版会自动拉起；开发时在本机启动后端即可。
        </div>
      )}

      <section className="newtask-workflow" aria-labelledby="newtask-workflow-heading">
        <h2 id="newtask-workflow-heading">从常用研究任务开始</h2>
        <div className="newtask-templates">
          {TEMPLATES.map((template) => (
            <button
              key={template.title}
              type="button"
              className={`newtask-template ${selectedTemplate === template.title ? 'is-selected' : ''}`}
              onClick={() => applyTemplate(template)}
              aria-pressed={selectedTemplate === template.title}
            >
              <span className="newtask-template-icon"><Icon name={template.icon} size={28} /></span>
              <span className="newtask-template-title">{template.title}</span>
              <span className="newtask-template-desc">{template.desc}</span>
              <span className="newtask-template-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} /></span>
            </button>
          ))}
        </div>
      </section>

      <div className="newtask-composer-stage">
        <Composer
          value={goal}
          onChange={updateGoal}
          onSubmit={() => void submit()}
          ariaLabel="任务目标"
          placeholder="一句话开始干活，例如：帮我梳理这个项目文献库里关于谵妄预防的证据"
          rows={3}
          className="newtask-composer"
          inputWrapClassName="newtask-composer-input-wrap"
          inputRowClassName="newtask-composer-input-row"
          textareaClassName="newtask-composer-textarea"
          controls={(
            <div className="newtask-composer-controls" aria-label="任务配置">
              <div className="newtask-composer-settings">
                <label className="newtask-project-control">
                  <Icon name="projects" size={16} />
                  <span>选择项目</span>
                  <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="选择项目">
                    <option value="">不关联项目</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`newtask-chip ${review ? 'is-on' : ''}`}
                  onClick={() => setReview(!review)}
                  aria-pressed={review}
                  title="成稿前由批评员审查（多 1-2 次模型调用）"
                >
                  {review && <Icon name="check" size={13} />}
                  <span>成稿前批评审查</span>
                </button>
                <button
                  type="button"
                  className={`newtask-chip ${confirmPlan ? 'is-on' : ''}`}
                  onClick={() => setConfirmPlan(!confirmPlan)}
                  aria-pressed={confirmPlan}
                  title="计划产出后先给你确认，再开始执行"
                >
                  {confirmPlan && <Icon name="check" size={13} />}
                  <span>计划先给我确认</span>
                </button>
                {recipe ? (
                  <span className="newtask-recipe-chip">
                    <Icon name="stageLiterature" size={14} /> 流水线：综述流水线
                    <button type="button" onClick={() => setRecipe(undefined)} aria-label="移除流水线">×</button>
                  </span>
                ) : null}
              </div>
              <div className="newtask-composer-actions">
                <button
                  type="button"
                  className="newtask-model-chip"
                  onClick={() => openSettings('model')}
                  title={llmConfig ? `当前模型 ${llmConfig.provider} / ${llmConfig.model}，前往设置调整` : '尚未配置模型，前往设置（BYOK）'}
                >
                  <span>{llmConfig?.model || '未配置模型'}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                <button
                  type="button"
                  className="newtask-attach"
                  onClick={() => attachInputRef.current?.click()}
                  aria-label="附加文本材料"
                  title="附加文本材料（.txt/.md/.csv，截取前 8000 字，不离开本机）"
                >
                  <Icon name="paperclip" size={16} />
                </button>
                <input
                  ref={attachInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) attachFile(file);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="newtask-submit"
                  onClick={() => void submit()}
                  disabled={!goal.trim() || submitting || backendOffline}
                >
                  <Icon name="send" size={17} /> {submitting ? '创建中…' : '交给 Selenyx'}
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {recent.length > 0 && (
        <section className="newtask-recent" aria-label="最近运行">
          <h2>最近运行</h2>
          <div className="newtask-recent-list">
            {recent.map((run) => (
              <button
                key={run.id}
                type="button"
                className="newtask-recent-item"
                onClick={() => requestRunFocus(run.id)}
                title={run.goal}
              >
                <span
                  className="newtask-recent-status"
                  style={{ color: STATUS_COLOR[run.status] ?? 'var(--text-muted)' }}
                >
                  {STATUS_LABEL[run.status] ?? run.status}
                </span>
                <span className="newtask-recent-goal">{run.goal}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
