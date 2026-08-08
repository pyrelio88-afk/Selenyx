/**
 * Selenyx 总览 —— R84: 增强版 Dashboard
 * 新增：番茄钟、实时时钟、倒数日、横向时间线
 */
import { useState, useEffect } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import { Icon, NAV_ICONS } from '@components/ui/Icon';
import { StatusChip } from '@components/ui/StatusChip';
import { versionedLoad, versionedSave, getOnboardingState, setOnboardingState } from '@lib/storage';
import { BottomSheet } from '@components/layout/BottomSheet';
import { useIsMobile } from '@lib/useIsMobile';
import { evidenceApi } from '@services/api';
import { orderProjectsForWorkspace, projectRoleLabel, selectPrimaryProject } from '@lib/projectPriority';
import './dashboard-workbench.css';

// === 番茄钟组件（R86: 自定义事件） ===

interface PomodoroEvent {
  id: string;
  name: string;
  minutes: number;
  kind: 'focus' | 'rest';
  builtin?: boolean;
}

const POMODORO_KEY = 'selenyx-pomodoro-events';
const DEFAULT_EVENTS: PomodoroEvent[] = [
  { id: 'focus-25', name: '专注', minutes: 25, kind: 'focus', builtin: true },
  { id: 'rest-5', name: '短休息', minutes: 5, kind: 'rest', builtin: true },
  { id: 'rest-15', name: '长休息', minutes: 15, kind: 'rest', builtin: true },
  { id: 'focus-50', name: '深度专注', minutes: 50, kind: 'focus', builtin: true },
];

function loadPomodoroEvents(): PomodoroEvent[] {
  // D6：走 versionedLoad，自动迁移旧 -v1 裸数组格式 + 损坏回退默认
  const { items } = versionedLoad<{ items: PomodoroEvent[] }>(POMODORO_KEY, { items: [] });
  if (!Array.isArray(items)) return DEFAULT_EVENTS;
  return [...DEFAULT_EVENTS, ...items.filter((c) => c && c.id && c.name && c.minutes > 0)];
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
  const isMobile = useIsMobile();
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
    versionedSave(POMODORO_KEY, { items: next.filter((e) => !e.builtin) });
    setNewName('');
    setShowAdd(false);
    selectEvent(ev.id);
  }
  function removeEvent(id: string) {
    const next = events.filter((e) => e.id !== id);
    setEvents(next);
    versionedSave(POMODORO_KEY, { items: next.filter((e) => !e.builtin) });
    if (activeId === id) selectEvent('focus-25');
  }
  return (
    <div className="card dashboard-focus-card" style={{ padding: 16, height: '100%', minHeight: 370, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pipeline" size={18} /> 番茄钟
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已完成 {sessions} 轮专注</span>
      </div>
      {/* 事件选择（预设 + 自定义）— D4: 按时长降序排列（深度专注→专注→长休息→短休息） */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[...events].sort((a, b) => b.minutes - a.minutes).map((ev) => (
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
      {/* 添加自定义事件：桌面内联 / 移动端 BottomSheet 大输入框 48px（R90 P1） */}
      {showAdd && (isMobile ? (
        <BottomSheet open onClose={() => setShowAdd(false)} title="自定义番茄钟">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="input pomo-field" placeholder="事件名（如：读文献）" value={newName}
              onChange={(e) => setNewName(e.target.value)} style={{ fontSize: 14 }}
            />
            <input
              className="input pomo-field" type="number" inputMode="numeric" min={1} max={480} placeholder="分钟" value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)} style={{ fontSize: 14 }}
            />
            <select className="input pomo-field" value={newKind} onChange={(e) => setNewKind(e.target.value as 'focus' | 'rest')} style={{ fontSize: 14 }}>
              <option value="focus">专注</option>
              <option value="rest">休息</option>
            </select>
            <button className="btn btn-primary" onClick={addEvent} style={{ minHeight: 48 }}>添加</button>
          </div>
        </BottomSheet>
      ) : (
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
      ))}
      {/* 计时显示 */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          fontSize: 42, fontWeight: 700, fontFamily: 'monospace',
          color: isFocus ? 'var(--accent)' : 'var(--success)',
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
          background: isFocus ? 'var(--accent)' : 'var(--success)',
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

interface BeijingDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/**
 * 不能把 toLocaleString 再喂给 Date：后者会按设备时区重新解释字符串，
 * 在非东八区设备上会让倒数日跨天。这里显式读取北京时间的日历字段。
 */

function getBeijingDateParts(date: Date): BeijingDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function ClockWidget() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  // 锁定北京时间（UTC+8），不跟随系统时区——倒数日按北京日历计算。
  const nowBJ = getBeijingDateParts(now);
  // 倒数日 — 从 store 读取用户自定义，空态显示引导
  const countdowns = useAppStore((s) => s.customCountdowns);
  const addCountdown = useAppStore((s) => s.addCountdown);
  const removeCountdown = useAppStore((s) => s.removeCountdown);
  const [showAddCountdown, setShowAddCountdown] = useState(false);
  const [newCountdownLabel, setNewCountdownLabel] = useState('');
  const [newCountdownDate, setNewCountdownDate] = useState('');
  function daysLeft(dateStr: string): number {
    const target = parseDateOnly(dateStr);
    if (!target) return 0;
    const currentCalendarDay = Date.UTC(nowBJ.year, nowBJ.month - 1, nowBJ.day);
    const targetCalendarDay = Date.UTC(target.year, target.month - 1, target.day);
    return Math.round((targetCalendarDay - currentCalendarDay) / (24 * 60 * 60 * 1000));
  }
  function hoursLeft(dateStr: string): number {
    const target = parseDateOnly(dateStr);
    if (!target) return 0;
    // 日期型截止日解释为北京时间当天 00:00，避免浏览器把 YYYY-MM-DD 当成设备本地零点。
    const targetTimestamp = Date.UTC(target.year, target.month - 1, target.day) - 8 * 60 * 60 * 1000;
    const remaining = targetTimestamp - now.getTime();
    return remaining > 0 ? Math.floor((remaining / (60 * 60 * 1000)) % 24) : 0;
  }
  function getUrgencyColor(days: number, baseColor: string): string {
    if (days < 0) return '#9e9e9e'; // 已过期
    if (days <= 7) return '#c62828'; // 紧急
    if (days <= 30) return '#ef6c00'; // 临近
    if (days <= 90) return '#1565c0'; // 中期
    return baseColor; // 远期
  }
  // 快速预设
  const QUICK_PRESETS = [
    { label: '考研初试', date: '2027-12-25', color: '#c62828' },
    { label: '科研基金截止', date: '', color: '#1565c0' },
    { label: '期末考试', date: '', color: '#2e7d32' },
    { label: '论文提交', date: '', color: '#f57f17' },
  ];
  return (
    <div className="card dashboard-time-card research-rail-card" style={{ padding: 16, height: '100%', minHeight: 370, boxSizing: 'border-box' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {timeStr}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{dateStr} · 北京时间</div>
      </div>
      {/* 倒数日 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {countdowns.length === 0 && !showAddCountdown && (
          <div style={{
            flex: 1, textAlign: 'center', padding: '12px 8px',
            borderRadius: 8, border: '1px dashed var(--border)',
            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
          }} onClick={() => setShowAddCountdown(true)}>
            + 添加你的第一个倒数日（如：科研基金申报截止）
          </div>
        )}
        {countdowns.map((c, idx) => {
          const days = daysLeft(c.date);
          const hours = hoursLeft(c.date);
          const urgencyColor = getUrgencyColor(days, c.color);
          return (
            <div key={idx} style={{
              flex: '1 1 0', minWidth: 85, textAlign: 'center', padding: '10px 6px',
              borderRadius: 8, background: urgencyColor + '0d',
              border: `1px solid ${urgencyColor}30`,
              position: 'relative',
              transition: 'all .2s',
            }}>
              <button
                onClick={() => removeCountdown(idx)}
                style={{
                  position: 'absolute', top: 2, right: 4, border: 'none',
                  background: 'transparent', cursor: 'pointer', fontSize: 12,
                  color: 'var(--text-muted)', lineHeight: 1, padding: 0,
                }}
                title="删除"
              >×</button>
              <div style={{ fontSize: 24, fontWeight: 700, color: urgencyColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
                {days > 0 ? days : days === 0 ? '今天' : '已过'}
              </div>
              {days > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {days}天 {hours}时
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>{c.label}</div>
              {days > 0 && days <= 7 && (
                <div style={{ fontSize: 9, color: '#c62828', marginTop: 2, fontWeight: 600 }}>紧急</div>
              )}
            </div>
          );
        })}
        {showAddCountdown && (
          <div style={{
            flex: 1, padding: 12, borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
          }}>
            {/* 快速预设 */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {QUICK_PRESETS.filter(p => p.date).map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setNewCountdownLabel(p.label); setNewCountdownDate(p.date); }}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${p.color}40`, background: p.color + '0d', color: p.color }}
                >{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text" placeholder="事件名" value={newCountdownLabel}
                onChange={(e) => setNewCountdownLabel(e.target.value)}
                style={{ flex: '1 1 100px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13 }}
              />
              <input
                type="date" value={newCountdownDate}
                onChange={(e) => setNewCountdownDate(e.target.value)}
                style={{ flex: '0 1 auto', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13 }}
              />
              <button
                onClick={() => {
                  if (newCountdownLabel.trim() && newCountdownDate) {
                    const colors = ['#c62828', '#1565c0', '#2e7d32', '#f57f17', '#6a1b9a'];
                    addCountdown({
                      label: newCountdownLabel.trim(),
                      date: newCountdownDate,
                      color: colors[countdowns.length % colors.length],
                    });
                    setNewCountdownLabel('');
                    setNewCountdownDate('');
                    setShowAddCountdown(false);
                  }
                }}
                style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >添加</button>
              <button
                onClick={() => { setShowAddCountdown(false); setNewCountdownLabel(''); setNewCountdownDate(''); }}
                style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              >取消</button>
            </div>
          </div>
        )}
        {countdowns.length > 0 && !showAddCountdown && (
          <button
            onClick={() => setShowAddCountdown(true)}
            style={{
              flex: '0 0 auto', padding: '8px 12px', borderRadius: 8,
              border: '1px dashed var(--border)', background: 'transparent',
              cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
            }}
          >+ 添加</button>
        )}
      </div>
    </div>
  );
}

// === P0-6 新手引导 Checklist ===
// D6：onboarding 状态走 storage.ts 统一收口（含旧 selenyx-onboarding-done 兼容）

function OnboardingChecklist() {
  const { projects, references, llmConfig, setView, requestCreateProject } = useAppStore();
  const [dismissed, setDismissed] = useState(() => !!getOnboardingState());
  const visitedPipeline = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('visited-pipeline') === 'true';
  const steps: { label: string; done: boolean; view: ViewKey; tip: string }[] = [
    { label: '创建项目', done: projects.length > 0, view: 'projects', tip: '选择适合你研究类型的设计框架（如 PICO 适合临床试验、PRISMA 适合系统综述），系统会自动生成对应项目字段' },
    { label: '导入文献', done: references.length > 0, view: 'references', tip: '输入论文 DOI 自动抓取标题、作者、期刊等元数据，也可上传 PDF' },
    { label: '配置 AI', done: !!llmConfig, view: 'settings', tip: '在本机配置大模型服务，让 AI 帮你精读文献、起草报告' },
    { label: '进入流水线', done: visitedPipeline, view: 'pipeline', tip: '八段流水线（问题→文献→全文→筛选→精读→证据→综合→写作）帮你管理从选题到成稿的全流程' },
  ];
  const completed = steps.filter((s) => s.done).length;
  useEffect(() => {
    if (completed === 4 && !dismissed) {
      setOnboardingState('true');
      setDismissed(true);
    }
  }, [completed, dismissed]);
  if (dismissed) return null;
  function skip() {
    setOnboardingState('skipped');
    setDismissed(true);
  }
  return (
    <div className="card" style={{ marginBottom: 24, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>
          开始使用 · {completed}/4 完成
        </h3>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {steps.map((step, i) => (
          <div
            key={i}
            onClick={() => {
              if (step.done) return;
              if (step.label === '创建项目') requestCreateProject();
              else setView(step.view);
            }}
            style={{
              flex: '1 1 0', minWidth: 120, cursor: step.done ? 'default' : 'pointer',
              padding: '8px 12px', borderRadius: 8,
              background: step.done ? 'var(--accent-light)' : 'var(--bg-hover)',
              border: `1px solid ${step.done ? 'var(--accent)' : 'var(--border)'}`,
              transition: 'all .2s',
            }}
            title={step.tip}
          >
            <div style={{
              fontSize: 13, fontWeight: 500,
              color: step.done ? 'var(--accent)' : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {step.done ? '✅' : `${i + 1}.`} {step.label}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn btn-sm" onClick={skip} style={{ fontSize: 12 }}>跳过引导</button>
      </div>
    </div>
  );
}

/** R108 R7: 区块标题——强化信息层级（用户反馈"排版看不懂"） */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '34px 0 14px' }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0, alignSelf: 'center' }} />
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>{title}</h2>
      {subtitle && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</span>}
    </div>
  );
}

export function DashboardView() {
  const {
    references, projects, tasks, tables, setView, setCurrentProject, currentProjectId,
    setPrimaryProject, workspaceSyncStatus, requestCreateProject,
  } = useAppStore();
  const orderedProjects = orderProjectsForWorkspace(projects);
  const primaryProject = selectPrimaryProject(projects);
  const focusedProject = orderedProjects.find((project) => project.id === currentProjectId)
    ?? primaryProject
    ?? orderedProjects[0]
    ?? null;
  const [evidenceSummary, setEvidenceSummary] = useState<{ total: number; accepted: number; pending: number } | null>(null);
  const [evidenceAvailable, setEvidenceAvailable] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [dashSearch, setDashSearch] = useState('');
  const unread = references.filter((r) => r.readStatus === 'unread').length;
  const reading = references.filter((r) => r.readStatus === 'reading').length;
  const todoTasks = tasks.filter((t) => t.column === 'todo').length;
  const doingTasks = tasks.filter((t) => t.column === 'doing').length;
  const otherProjects = orderedProjects.filter((project) => project.id !== focusedProject?.id && project.status !== 'archived');
  const otherLeadProjects = otherProjects.filter((project) => project.ownerRole !== 'participant');
  const otherParticipantProjects = otherProjects.filter((project) => project.ownerRole === 'participant');
  const activeProjectCount = projects.filter((project) => project.status !== 'archived').length;
  const focusedTasks = focusedProject ? tasks.filter((task) => task.projectId === focusedProject.id) : [];
  const nextTask = focusedTasks.find((task) => task.column === 'doing')
    ?? focusedTasks.find((task) => task.column === 'todo')
    ?? null;
  const stageIndex = focusedProject
    ? PIPELINE_STAGES.findIndex((stage) => stage.key === focusedProject.currentStage)
    : -1;
  const stage = stageIndex >= 0 ? PIPELINE_STAGES[stageIndex] : null;
  const focusedProjectId = focusedProject?.id ?? null;
  useEffect(() => {
    let active = true;
    setEvidenceSummary(null);
    setEvidenceAvailable(false);
    if (!focusedProjectId) return () => { active = false; };
    void evidenceApi.summary(focusedProjectId).then((summary) => {
      if (!active) return;
      setEvidenceSummary({
        total: Number(summary.total ?? 0),
        accepted: Number(summary.accepted ?? 0),
        pending: Number(summary.pending ?? 0),
      });
      setEvidenceAvailable(true);
    }).catch(() => {
      if (active) setEvidenceAvailable(false);
    });
    return () => { active = false; };
  }, [focusedProjectId]);
  function switchProject(projectId: string) {
    setCurrentProject(projectId);
    setSwitcherOpen(false);
  }
  function continueFocusedProject() {
    if (!focusedProject) return;
    setCurrentProject(focusedProject.id);
    setView('pipeline');
  }
  const q = dashSearch.trim().toLowerCase();
  const searchHits = q ? {
    projects: projects.filter((project) => project.name.toLowerCase().includes(q) || project.description.toLowerCase().includes(q)).slice(0, 5),
    references: references.filter((reference) =>
      reference.title.toLowerCase().includes(q)
      || (reference.creators || []).map((c) => `${c.firstName || ''} ${c.lastName || ''}`).join(' ').toLowerCase().includes(q)
      || (reference.publication || '').toLowerCase().includes(q)
    ).slice(0, 5),
  } : null;
  return (
    <div className="research-dashboard is-command">
      <header className="research-dashboard-header">
        <div>
          <h1>总览</h1>
          <p>主线课题优先；右侧固定显示北京时间、倒数日与专注计时。</p>
        </div>
        <div className="research-header-tools">
          <label className="research-global-search">
            <Icon name="search" size={15} />
            <input
              value={dashSearch}
              onChange={(event) => setDashSearch(event.target.value)}
              placeholder="搜索项目、文献、笔记…"
              aria-label="搜索项目与文献"
            />
          </label>
          <div className={`research-local-pill is-${workspaceSyncStatus}`} role="status">
            <span aria-hidden="true" />
            {workspaceSyncStatus === 'synced' ? '本机数据已同步' : workspaceSyncStatus === 'syncing' ? '正在同步本机数据' : '离线缓存可用'}
          </div>
        </div>
      </header>
      {searchHits && (
        <section className="research-search-panel" aria-label="搜索结果">
          <div>
            <h3>项目</h3>
            {searchHits.projects.length === 0 ? <p>无匹配项目</p> : searchHits.projects.map((project) => (
              <button key={project.id} type="button" onClick={() => { switchProject(project.id); setDashSearch(''); }}>
                <strong>{project.name}</strong>
                <small>{projectRoleLabel(project)}</small>
              </button>
            ))}
          </div>
          <div>
            <h3>文献</h3>
            {searchHits.references.length === 0 ? <p>无匹配文献</p> : searchHits.references.map((reference) => (
              <button key={reference.id} type="button" onClick={() => { setDashSearch(''); setView('references'); }}>
                <strong>{reference.title}</strong>
                <small>{reference.year || '年份未知'}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="research-dashboard-layout">
        <div className="research-dashboard-main">
      {focusedProject ? (
        <section className="research-command" aria-labelledby="mainline-title">
          <div className="research-command-main">
            <div className="research-command-titleline">
              <div>
                <span className="research-section-kicker">当前课题</span>
                <div className="research-project-switcher">
                  <button
                    type="button"
                    className="research-project-switcher-trigger"
                    onClick={() => setSwitcherOpen((open) => !open)}
                    aria-expanded={switcherOpen}
                    aria-haspopup="listbox"
                    title="切换总览中的当前项目"
                  >
                    <h2 id="mainline-title">{focusedProject.name}</h2>
                    <Icon name="chevronDown" size={16} />
                  </button>
                  {switcherOpen && projects.length > 0 && (
                    <div className="research-project-switcher-menu" role="listbox" aria-label="选择项目">
                      {orderedProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          role="option"
                          aria-selected={project.id === focusedProject.id}
                          className={project.id === focusedProject.id ? 'is-active' : ''}
                          onClick={() => switchProject(project.id)}
                        >
                          <span>
                            <strong>{project.name}</strong>
                            <small>
                              {projectRoleLabel(project)}
                              {project.isPrimary ? ' · 主线' : ''}
                              {' · '}
                              {PIPELINE_STAGES.find((item) => item.key === project.currentStage)?.label || '未开始'}
                            </small>
                          </span>
                          {project.id === focusedProject.id && <Icon name="check" size={14} />}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="research-project-switcher-manage"
                        onClick={() => { setSwitcherOpen(false); setView('projects'); }}
                      >
                        管理全部项目
                      </button>
                    </div>
                  )}
                </div>
                <div className="research-project-meta">
                  <span className={`project-role-badge is-${focusedProject.ownerRole === 'participant' ? 'participant' : 'lead'}`}>
                    {projectRoleLabel(focusedProject)}
                  </span>
                  {focusedProject.isPrimary && <span className="project-primary-badge">首页主线</span>}
                  {focusedProject.id === currentProjectId && <span className="project-active-badge">当前</span>}
                  {focusedProject.frameworkId && <span>{focusedProject.frameworkId.toUpperCase()}</span>}
                </div>
              </div>
              <div className="research-command-actions">
                {!focusedProject.isPrimary && focusedProject.ownerRole !== 'participant' && (
                  <button type="button" className="btn" onClick={() => setPrimaryProject(focusedProject.id)}>
                    设为主线
                  </button>
                )}
                <button type="button" className="btn btn-primary research-continue" onClick={continueFocusedProject}>
                  继续流水线 <Icon name="chevronRight" size={16} />
                </button>
              </div>
            </div>
            <div className="research-stage-rail" aria-label="八段科研流水线进度">
              {PIPELINE_STAGES.map((item, index) => (
                <button
                  key={item.key}
                  className={index < stageIndex ? 'is-done' : index === stageIndex ? 'is-current' : ''}
                  onClick={continueFocusedProject}
                  aria-label={`${item.order}. ${item.label}${index === stageIndex ? '，当前阶段' : ''}`}
                >
                  <span>{index < stageIndex ? <Icon name="check" size={13} /> : item.order}</span>
                  <small>{item.label}</small>
                </button>
              ))}
            </div>
            <div className="research-gate-grid">
              <article>
                <span>当前阶段</span>
                <strong>{stage ? `${stage.order}. ${stage.label}` : '尚未开始'}</strong>
                <small>{stage?.description}</small>
              </article>
              <article>
                <span>本阶段质量门</span>
                <strong>{stage?.qualityGate ?? '先建立结构化研究问题'}</strong>
                <small>只有人工确认后才进入下一阶段</small>
              </article>
              <article>
                <span>下一步动作</span>
                <strong>{nextTask?.title ?? '为当前阶段创建一项可执行任务'}</strong>
                <small>{nextTask ? (nextTask.column === 'doing' ? '正在进行' : '待开始') : '进入流水线补充任务与产出'}</small>
              </article>
            </div>
          </div>
          <aside className="research-evidence-health" aria-label="主线证据健康">
            <div className="research-evidence-heading">
              <div>
                <span className="research-section-kicker">证据健康</span>
                <h3>本机证据门</h3>
              </div>
              <Icon name="shield" size={22} />
            </div>
            <dl>
              <div><dt><span className="evidence-dot is-accepted" /> 已接受</dt><dd>{evidenceSummary?.accepted ?? '—'}</dd></div>
              <div><dt><span className="evidence-dot is-pending" /> 待人工审核</dt><dd>{evidenceSummary?.pending ?? '—'}</dd></div>
              <div><dt><span className="evidence-dot is-total" /> 证据条目</dt><dd>{evidenceSummary?.total ?? '—'}</dd></div>
            </dl>
            <p>{evidenceAvailable ? '本机索引可用；AI 检索命中仍需你接受后才能写入提纲。' : '当前使用离线缓存；连接本地后端后显示证据审核统计。'}</p>
            <button className="btn" onClick={() => { setCurrentProject(focusedProject.id); setView('references'); }}>
              检查文献与证据
            </button>
          </aside>
        </section>
      ) : (
        <section className="research-command research-empty-mainline">
          <span className="research-section-kicker">先建立主线</span>
          <h2>从项目名称开始，研究框架完全可选</h2>
          <p>创建项目时标注“我主导”或“我参与”，首页只把主线课题放在第一位。</p>
          <button className="btn btn-primary" onClick={() => requestCreateProject()}><Icon name="plus" size={16} /> 新建项目</button>
        </section>
      )}
        <section className="research-metrics" aria-label="工作区概况">
          <button onClick={() => setView('references')}><span>文献</span><strong>{references.length}</strong><small>未读 {unread} · 阅读中 {reading}</small></button>
          <button onClick={() => setView('pipeline')}><span>任务</span><strong>{todoTasks + doingTasks}</strong><small>进行中 {doingTasks} · 待办 {todoTasks}</small></button>
          <button onClick={() => setView('projects')}><span>活跃项目</span><strong>{activeProjectCount}</strong><small>主线与协作项目分开管理</small></button>
          <button onClick={() => setView('tables')}><span>研究表格</span><strong>{tables.length}</strong><small>结构化数据与分析</small></button>
        </section>
        <OnboardingChecklist />
       {otherLeadProjects.length > 0 && (
         <>
           <SectionTitle title="我主导的其他项目" subtitle="点击即可切换当前课题" />
           <div className="research-project-cards">
             {otherLeadProjects.map((project) => {
              const projectStage = PIPELINE_STAGES.find((item) => item.key === project.currentStage);
              const projectStageIndex = PIPELINE_STAGES.findIndex((item) => item.key === project.currentStage);
              return (
                <button
                  key={project.id}
                  type="button"
                  className="research-project-card"
                  onClick={() => switchProject(project.id)}
                >
                  <div className="research-project-card-head">
                    <strong>{project.isPrimary ? '★ ' : ''}{project.name}</strong>
                    <span className={`project-role-badge is-${project.ownerRole === 'participant' ? 'participant' : 'lead'}`}>
                      {projectRoleLabel(project)}
                    </span>
                  </div>
                  <div className="research-mini-rail" aria-hidden="true">
                    {PIPELINE_STAGES.map((item, index) => (
                      <i
                        key={item.key}
                        className={index < projectStageIndex ? 'is-done' : index === projectStageIndex ? 'is-current' : ''}
                      />
                    ))}
                  </div>
                  <small>
                    {projectStage ? `当前阶段 ${projectStage.order}. ${projectStage.label}` : '尚未开始'}
                    {' · '}文献 {project.referenceIds.length}
                  </small>
                </button>
              );
            })}
          </div>
         </>
       )}
       {otherParticipantProjects.length > 0 && (
         <>
           <SectionTitle title="我参与的项目" subtitle="协作项目与主线分开，保留分工与方法入口" />
           <div className="research-project-cards is-participant">
             {otherParticipantProjects.map((project) => {
               const projectStage = PIPELINE_STAGES.find((item) => item.key === project.currentStage);
               const projectStageIndex = PIPELINE_STAGES.findIndex((item) => item.key === project.currentStage);
               return (
                 <button
                   key={project.id}
                   type="button"
                   className="research-project-card"
                   onClick={() => switchProject(project.id)}
                 >
                   <div className="research-project-card-head">
                     <strong>{project.name}</strong>
                     <span className="project-role-badge is-participant">{projectRoleLabel(project)}</span>
                   </div>
                   <div className="research-mini-rail" aria-hidden="true">
                     {PIPELINE_STAGES.map((item, index) => (
                       <i key={item.key} className={index < projectStageIndex ? 'is-done' : index === projectStageIndex ? 'is-current' : ''} />
                     ))}
                   </div>
                   <small>{projectStage ? `当前阶段 ${projectStage.order}. ${projectStage.label}` : '尚未开始'} · 文献 {project.referenceIds.length}</small>
                 </button>
               );
             })}
           </div>
         </>
       )}
      <SectionTitle title="最近工作" subtitle="文献与项目入口" />
      <div className="research-recent-grid">
        <section className="research-list-panel">
          <header><h2><Icon name={NAV_ICONS.references} size={18} /> 最近文献</h2><button onClick={() => setView('references')}>查看全部</button></header>
          {references.length === 0 ? <p className="research-list-empty">文献库为空，先导入真实来源再开始 RAG。</p> : references.slice(0, 5).map((reference) => (
            <button key={reference.id} className="research-list-row" onClick={() => setView('references')}>
              <span><strong>{reference.title}</strong><small>{reference.year || '年份未知'} · {reference.publication || '来源待补充'}</small></span>
              <StatusChip status={reference.readStatus} size="xs" />
            </button>
          ))}
        </section>
        <section className="research-list-panel">
          <header><h2><Icon name={NAV_ICONS.projects} size={18} /> 全部项目</h2><button onClick={() => setView('projects')}>管理</button></header>
           {projects.length === 0 ? <p className="research-list-empty">暂无项目。</p> : orderedProjects.slice(0, 5).map((project) => (
            <button
              key={project.id}
              className={`research-list-row ${project.id === focusedProject?.id ? 'is-active' : ''}`}
              onClick={() => switchProject(project.id)}
            >
              <span>
                <strong>{project.name}</strong>
                <small>
                  {PIPELINE_STAGES.find((item) => item.key === project.currentStage)?.label}
                  {' · '}文献 {project.referenceIds.length}
                  {project.isPrimary ? ' · 主线' : ''}
                </small>
              </span>
              <span className={`project-role-badge is-${project.ownerRole === 'participant' ? 'participant' : 'lead'}`}>
                {projectRoleLabel(project)}
              </span>
            </button>
          ))}
        </section>
      </div>
        </div>
        <aside className="research-dashboard-rail" aria-label="时间与专注">
          <ClockWidget />
          <PomodoroTimer />
        </aside>
      </div>
    </div>
  );
}
