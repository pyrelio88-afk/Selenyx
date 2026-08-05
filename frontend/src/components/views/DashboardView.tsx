/**
 * Selenyx 总览 —— R84: 增强版 Dashboard
 * 新增：番茄钟、实时时钟、倒数日、横向时间线
 */

import { useState, useEffect } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import { Icon, NAV_ICONS, STAGE_ICONS, type IconName } from '@components/ui/Icon';
import { StatusChip, ProjectStatusChip } from '@components/ui/StatusChip';

// === 番茄钟组件 ===
function PomodoroTimer() {
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          // 切换模式
          const newMode = mode === 'work' ? 'break' : 'work';
          const newSeconds = newMode === 'work' ? 25 * 60 : 5 * 60;
          if (mode === 'work') setSessions((s) => s + 1);
          setMode(newMode);
          setRunning(false);
          return newSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, mode]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const totalSeconds = mode === 'work' ? 25 * 60 : 5 * 60;
  const progress = ((totalSeconds - seconds) / totalSeconds) * 100;

  function reset() {
    setRunning(false);
    setSeconds(mode === 'work' ? 25 * 60 : 5 * 60);
  }

  function switchMode(m: 'work' | 'break') {
    setRunning(false);
    setMode(m);
    setSeconds(m === 'work' ? 25 * 60 : 5 * 60);
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pipeline" size={18} /> 番茄钟
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已完成 {sessions} 轮</span>
      </div>

      {/* 模式切换 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          className={`btn btn-sm ${mode === 'work' ? 'btn-primary' : ''}`}
          onClick={() => switchMode('work')}
          style={{ flex: 1, fontSize: 12 }}
        >
          专注 25min
        </button>
        <button
          className={`btn btn-sm ${mode === 'break' ? 'btn-primary' : ''}`}
          onClick={() => switchMode('break')}
          style={{ flex: 1, fontSize: 12 }}
        >
          休息 5min
        </button>
      </div>

      {/* 计时显示 */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          fontSize: 42, fontWeight: 700, fontFamily: 'monospace',
          color: mode === 'work' ? 'var(--accent)' : '#2e7d32',
          lineHeight: 1,
        }}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {mode === 'work' ? '专注中...' : '休息中...'}
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: mode === 'work' ? 'var(--accent)' : '#2e7d32',
          transition: 'width 1s linear',
          borderRadius: 2,
        }} />
      </div>

      {/* 控制按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => setRunning(!running)} style={{ minWidth: 80 }}>
          {running ? '暂停' : '开始'}
        </button>
        <button className="btn" onClick={reset} style={{ minWidth: 60 }}>重置</button>
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

      {/* 左右布局：时钟+番茄钟 | 时间线 */}
      <div className="grid grid-2" style={{ gap: 16, marginBottom: 24, alignItems: 'flex-start' }}>
        <div>
          <ClockWidget />
          <PomodoroTimer />
        </div>
        <TimelineWidget />
      </div>

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
