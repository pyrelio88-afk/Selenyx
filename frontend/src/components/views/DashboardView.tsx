/**
 * Selenyx 总览 —— R84: 增强版 Dashboard
 * 新增：番茄钟、实时时钟、倒数日、横向时间线
 */

import { useState, useEffect } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import { Icon, NAV_ICONS, STAGE_ICONS, type IconName } from '@components/ui/Icon';
import { StatusChip, ProjectStatusChip } from '@components/ui/StatusChip';

// === 番茄钟组件（R86: 自定义事件） ===
interface PomodoroEvent {
  id: string;
  name: string;
  minutes: number;
  kind: 'focus' | 'rest';
  builtin?: boolean;
}

const POMODORO_KEY = 'selenyx-pomodoro-events-v1';
const DEFAULT_EVENTS: PomodoroEvent[] = [
  { id: 'focus-25', name: '专注', minutes: 25, kind: 'focus', builtin: true },
  { id: 'rest-5', name: '短休息', minutes: 5, kind: 'rest', builtin: true },
  { id: 'rest-15', name: '长休息', minutes: 15, kind: 'rest', builtin: true },
  { id: 'focus-50', name: '深度专注', minutes: 50, kind: 'focus', builtin: true },
];

function loadPomodoroEvents(): PomodoroEvent[] {
  try {
    const raw = localStorage.getItem(POMODORO_KEY);
    if (!raw) return DEFAULT_EVENTS;
    const customs = JSON.parse(raw);
    if (!Array.isArray(customs)) return DEFAULT_EVENTS;
    return [...DEFAULT_EVENTS, ...customs.filter((c) => c && c.id && c.name && c.minutes > 0)];
  } catch {
    return DEFAULT_EVENTS;
  }
}

function PomodoroTimer() {
  const [events, setEvents] = useState<PomodoroEvent[]>(loadPomodoroEvents);
  const [activeId, setActiveId] = useState('focus-25');
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMinutes, setNewMinutes] = useState('30');
  const [newKind, setNewKind] = useState<'focus' | 'rest'>('focus');

  const active = events.find((e) => e.id === activeId) || events[0];

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          if (active.kind === 'focus') setSessions((s) => s + 1);
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, active.kind]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const totalSeconds = active.minutes * 60;
  const progress = totalSeconds > 0 ? ((totalSeconds - seconds) / totalSeconds) * 100 : 0;
  const isFocus = active.kind === 'focus';

  function selectEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    setRunning(false);
    setActiveId(id);
    setSeconds(ev.minutes * 60);
  }

  function addEvent() {
    const m = parseInt(newMinutes, 10);
    if (!newName.trim() || !m || m <= 0 || m > 480) return;
    const ev: PomodoroEvent = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      minutes: m,
      kind: newKind,
    };
    const next = [...events, ev];
    setEvents(next);
    localStorage.setItem(POMODORO_KEY, JSON.stringify(next.filter((e) => !e.builtin)));
    setNewName('');
    setShowAdd(false);
    selectEvent(ev.id);
  }

  function removeEvent(id: string) {
    const next = events.filter((e) => e.id !== id);
    setEvents(next);
    localStorage.setItem(POMODORO_KEY, JSON.stringify(next.filter((e) => !e.builtin)));
    if (activeId === id) selectEvent('focus-25');
  }

  return (
    <div className="card" style={{ padding: 16, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pipeline" size={18} /> 番茄钟
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已完成 {sessions} 轮专注</span>
      </div>

      {/* 事件选择（预设 + 自定义） */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {events.map((ev) => (
          <span key={ev.id} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className={`btn btn-sm ${activeId === ev.id ? 'btn-primary' : ''}`}
              onClick={() => selectEvent(ev.id)}
              style={{ fontSize: 12, paddingRight: ev.builtin ? undefined : 22 }}
            >
              {ev.name} {ev.minutes}m
            </button>
            {!ev.builtin && (
              <button
                onClick={() => removeEvent(ev.id)}
                title="删除此事件"
                style={{
                  position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: activeId === ev.id ? '#fff' : 'var(--text-muted)',
                  fontSize: 12, padding: '0 4px', lineHeight: 1,
                }}
              >×</button>
            )}
          </span>
        ))}
        <button className="btn btn-sm" onClick={() => setShowAdd(!showAdd)} title="添加自定义事件" style={{ fontSize: 12 }}>
          <Icon name="plus" size={12} /> 自定义
        </button>
      </div>

      {/* 添加自定义事件 */}
      {showAdd && (
        <div style={{
          display: 'flex', gap: 6, marginBottom: 12, padding: 10,
          background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap',
        }}>
          <input
            className="input" placeholder="事件名（如：读文献）" value={newName}
            onChange={(e) => setNewName(e.target.value)} style={{ flex: 2, minWidth: 110, fontSize: 12 }}
          />
          <input
            className="input" type="number" min={1} max={480} placeholder="分钟" value={newMinutes}
            onChange={(e) => setNewMinutes(e.target.value)} style={{ width: 64, fontSize: 12 }}
          />
          <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as 'focus' | 'rest')} style={{ width: 76, fontSize: 12 }}>
            <option value="focus">专注</option>
            <option value="rest">休息</option>
          </select>
          <button className="btn btn-sm btn-primary" onClick={addEvent}>添加</button>
        </div>
      )}

      {/* 计时显示 */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          fontSize: 42, fontWeight: 700, fontFamily: 'monospace',
          color: isFocus ? 'var(--accent)' : '#2e7d32',
          lineHeight: 1,
        }}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {active.name} · {seconds === 0 ? '时间到！' : running ? (isFocus ? '专注中…' : '休息中…') : '已暂停'}
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: isFocus ? 'var(--accent)' : '#2e7d32',
          transition: 'width 1s linear',
          borderRadius: 2,
        }} />
      </div>

      {/* 控制按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => { if (seconds === 0) setSeconds(active.minutes * 60); setRunning(!running); }} style={{ minWidth: 80 }}>
          {running ? '暂停' : seconds === 0 ? '再来一轮' : '开始'}
        </button>
        <button className="btn" onClick={() => { setRunning(false); setSeconds(active.minutes * 60); }} style={{ minWidth: 60 }}>重置</button>
      </div>
    </div>
  );
}

// === 实时时钟 + 倒数日 ===
function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // 倒数日
  const countdowns = [
    { label: '考研初试', date: '2027-12-25', color: '#c62828' },
    { label: '复试', date: '2028-03-15', color: '#1565c0' },
    { label: '入学', date: '2028-09-01', color: '#2e7d32' },
  ];

  function daysLeft(dateStr: string): number {
    const target = new Date(dateStr);
    const diff = target.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {timeStr}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{dateStr}</div>
      </div>

      {/* 倒数日 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {countdowns.map((c) => {
          const days = daysLeft(c.date);
          return (
            <div key={c.label} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px',
              borderRadius: 8, background: c.color + '0d',
              border: `1px solid ${c.color}20`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>
                {days > 0 ? days : 0}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>天后</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === 横向时间线 ===
function TimelineWidget() {
  const { projects, currentProjectId, setView } = useAppStore();
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];
  const stageIdx = currentProject ? PIPELINE_STAGES.findIndex((s) => s.key === currentProject.currentStage) : -1;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pipeline" size={18} /> 科研时间线
        </h3>
        {currentProject && (
          <button className="btn btn-sm" onClick={() => setView('pipeline')} style={{ fontSize: 12 }}>
            进入流水线 →
          </button>
        )}
      </div>

      {/* 横向时间线 */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', minWidth: 700, position: 'relative' }}>
          {/* 连接线 */}
          <div style={{
            position: 'absolute', top: 18, left: '4%', right: '4%', height: 2,
            background: 'var(--border)', zIndex: 0,
          }} />
          {PIPELINE_STAGES.map((stage, i) => {
            const isDone = currentProject && i < stageIdx;
            const isCurrent = currentProject && i === stageIdx;
            return (
              <div
                key={stage.key}
                style={{
                  flex: 1, textAlign: 'center', position: 'relative', zIndex: 1,
                  cursor: 'pointer',
                }}
                onClick={() => setView('pipeline')}
                title={stage.description}
              >
                {/* 节点圆 */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  margin: '0 auto 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDone ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--bg-surface)',
                  border: `2px solid ${isDone || isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                  color: isDone || isCurrent ? '#fff' : 'var(--text-muted)',
                  transition: 'all .2s',
                }}>
                  {isDone ? <Icon name="check" size={16} strokeWidth={2.5} /> : <Icon name={STAGE_ICONS[stage.key]} size={16} />}
                </div>
                {/* 标签 */}
                <div style={{
                  fontSize: 11, fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent ? 'var(--accent)' : 'var(--text-secondary)',
                  lineHeight: 1.3,
                }}>
                  {stage.order}. {stage.label}
                </div>
                {/* 门控 */}
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  {stage.qualityGate}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!currentProject && (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
          创建项目后，时间线将显示当前进度
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const { references, projects, tasks, tables, setView, currentProjectId } = useAppStore();

  const unread = references.filter((r) => r.readStatus === 'unread').length;
  const reading = references.filter((r) => r.readStatus === 'reading').length;
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning').length;
  const todoTasks = tasks.filter((t) => t.column === 'todo').length;
  const doingTasks = tasks.filter((t) => t.column === 'doing').length;

  const now = new Date();
  const thisMonth = references.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const stats: { label: string; value: number; delta: string; icon: IconName; view: ViewKey }[] = [
    { label: '文献总数', value: references.length, delta: `未读 ${unread} · 阅读中 ${reading}`, icon: NAV_ICONS.references, view: 'references' },
    { label: '活跃项目', value: activeProjects, delta: `共 ${projects.length} 个项目`, icon: NAV_ICONS.projects, view: 'projects' },
    { label: '待办任务', value: todoTasks, delta: `进行中 ${doingTasks}`, icon: NAV_ICONS.pipeline, view: 'pipeline' },
    { label: '本月新增', value: thisMonth, delta: `文献入库`, icon: NAV_ICONS.references, view: 'references' },
  ];

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">总览</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div className="stat-card clickable" key={s.label} onClick={() => setView(s.view)} style={{ cursor: 'pointer', transition: 'all .15s' }}>
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Icon name={s.icon} size={15} strokeWidth={1.5} /> {s.label}
            </span>
            <span className="value">{s.value}</span>
            <span className="delta" style={{ color: 'var(--text-muted)' }}>{s.delta}</span>
          </div>
        ))}
      </div>

      {/* 时钟 | 番茄钟 双列；时间线全宽一行（R86 修复右侧空白） */}
      <div className="grid grid-2" style={{ gap: 16, marginBottom: 24, alignItems: 'stretch' }}>
        <ClockWidget />
        <PomodoroTimer />
      </div>
      <TimelineWidget />

      {/* 快捷操作 */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>快捷操作</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setView('projects')}><Icon name="plus" size={16} /> 新建项目</button>
          <button className="btn" onClick={() => setView('references')}><Icon name={NAV_ICONS.references} size={16} /> 管理文献</button>
          <button className="btn" onClick={() => setView('tables')}><Icon name={NAV_ICONS.tables} size={16} /> 多维表格</button>
          <button className="btn" onClick={() => setView('pipeline')}><Icon name={NAV_ICONS.pipeline} size={16} /> 科研流水线</button>
          <button className="btn" onClick={() => setView('aiChat')}><Icon name={NAV_ICONS.aiChat} size={16} /> AI 对话</button>
          <button className="btn" onClick={() => setView('skills')}><Icon name={NAV_ICONS.skills} size={16} /> 科研技能</button>
          {useAppStore.getState().llmConfig == null && (
            <button className="btn btn-danger-ghost" onClick={() => setView('settings')}>⚠ 先配置 LLM</button>
          )}
        </div>
      </div>

      {/* 当前项目进度 */}
      {currentProject && (
        <div className="card" style={{ marginBottom: 24, cursor: 'pointer' }} onClick={() => setView('pipeline')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{currentProject.name}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>点击进入流水线 →</span>
          </div>
          <div className="pipeline-progress" style={{ marginBottom: 8 }}>
            {PIPELINE_STAGES.map((s, i) => {
              const stageIdx = PIPELINE_STAGES.findIndex((s) => s.key === currentProject.currentStage);
              return (
                <div key={s.key} className={`pp-segment ${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}`} title={s.label} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>当前：{PIPELINE_STAGES[PIPELINE_STAGES.findIndex((s) => s.key === currentProject.currentStage)]?.label}</span>
            <span>进度 {Math.round((PIPELINE_STAGES.findIndex((s) => s.key === currentProject.currentStage) / 8) * 100)}%</span>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.references} size={17} /> 最近文献</span>
            <button className="btn btn-sm" onClick={() => setView('references')}>查看全部</button>
          </h3>
          {references.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="references" size={40} strokeWidth={1.2} /></div>
              <p>文献库为空，去「文献库」页面导入或检索</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {references.slice(0, 5).map((r) => (
                <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.year} · {r.publication}</div>
                  </div>
                  <StatusChip status={r.readStatus} size="xs" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.projects} size={17} /> 活跃项目</span>
            <button className="btn btn-sm" onClick={() => setView('projects')}>查看全部</button>
          </h3>
          {projects.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={40} strokeWidth={1.2} /></div>
              <p>暂无项目，创建第一个科研项目开始</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.filter((p) => p.status === 'active' || p.status === 'planning').slice(0, 5).map((p) => (
                <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {PIPELINE_STAGES.find((s) => s.key === p.currentStage)?.label} · 文献 {p.referenceIds.length}
                    </div>
                  </div>
                  <ProjectStatusChip status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 多维表格预览 */}
      {tables.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.tables} size={17} /> 我的表格</span>
            <button className="btn btn-sm" onClick={() => setView('tables')}>管理</button>
          </h3>
          <div className="grid grid-3">
            {tables.slice(0, 3).map((t) => (
              <div key={t.id} className="card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => setView('tables')}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.records.length} 条 · {t.fields.length} 字段</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
