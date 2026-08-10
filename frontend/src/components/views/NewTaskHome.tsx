/**
 * 新建任务主页（v4 · ClawsGO 式）
 *
 * 时段问候语 + 任务模板卡（点击填入输入框）+ 底部任务输入框。
 * 提交即创建 agent run 并跳任务详情；下方保留最近运行动态。
 * 侧边栏不再设「任务」一级项——本页即任务入口。
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { STATUS_COLOR, STATUS_LABEL } from '@components/tasks/StepRow';
import { agentApi, type AgentRunSummary } from '@services/agent';

interface TaskTemplate {
  icon: IconName;
  title: string;
  desc: string;
  prompt: string;
  review: boolean;
}

const TEMPLATES: TaskTemplate[] = [
  {
    icon: 'stageLiterature',
    title: '文献综述',
    desc: '梳理文献库证据，产出结构化综述提纲',
    prompt: '帮我梳理这个项目文献库的核心证据，产出一份结构化综述提纲（含研究缺口）。',
    review: true,
  },
  {
    icon: 'stageEvidence',
    title: '证据梳理',
    desc: '盘点证据链，找出支撑不足的主张',
    prompt: '盘点当前项目的证据链：哪些主张证据充分，哪些还缺支撑？给出补强建议。',
    review: false,
  },
  {
    icon: 'stageWriting',
    title: '论文提纲',
    desc: '按标准结构生成章节提纲与要点',
    prompt: '基于项目资料生成论文提纲：背景、方法、结果、讨论，每节列出要点与所需证据。',
    review: true,
  },
  {
    icon: 'chart',
    title: '数据解读',
    desc: '提炼可写进结果部分的发现',
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

export function NewTaskHome() {
  const { projects, currentProjectId, nickname, requestRunFocus } = useAppStore();
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState<string>(currentProjectId ?? '');
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [recent, setRecent] = useState<AgentRunSummary[]>([]);

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

  const applyTemplate = (template: TaskTemplate) => {
    setGoal(template.prompt);
    setReview(template.review);
  };

  const submit = async () => {
    const text = goal.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const { runId } = await agentApi.start(text, projectId || null, review);
      setGoal('');
      requestRunFocus(runId); // 跳任务详情（任务视图）
    } catch (error) {
      setBackendOffline(true);
      alert(`任务创建失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="newtask-home">
      <header className="newtask-hero">
        <h1>{greeting()}，{nickname || '研究者'}</h1>
        <p>把研究目标交给 Selenyx：规划 → 检索 → 执行 → 成稿，全程步骤可审计。</p>
      </header>

      {backendOffline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接：桌面版会自动启动；开发环境请运行 <code>npm run dev:local</code>。agent 任务依赖后端执行。
        </div>
      )}

      <div className="newtask-templates">
        {TEMPLATES.map((template) => (
          <button
            key={template.title}
            type="button"
            className="newtask-template"
            onClick={() => applyTemplate(template)}
          >
            <span className="newtask-template-icon"><Icon name={template.icon} size={18} /></span>
            <span className="newtask-template-title">{template.title}</span>
            <span className="newtask-template-desc">{template.desc}</span>
          </button>
        ))}
      </div>

      <div className="card newtask-composer">
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="一句话开始干活，例如：帮我梳理这个项目文献库里关于「谵妄预防」的证据…"
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
          aria-label="任务目标"
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            项目
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ minHeight: 36 }}>
              <option value="">不关联项目</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={review} onChange={(event) => setReview(event.target.checked)} />
            成稿前批评审查（多 1-2 次模型调用）
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={!goal.trim() || submitting || backendOffline}
            style={{ marginLeft: 'auto' }}
          >
            <Icon name="send" size={15} /> {submitting ? '创建中…' : '交给 Selenyx'}
          </button>
        </div>
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
