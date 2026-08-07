/**
 * Selenyx 总览 —— R84: 增强版 Dashboard
 * 新增：番茄钟、实时时钟、倒数日、横向时间线
 */

import { useState, useEffect } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import { Icon, NAV_ICONS, STAGE_ICONS, type IconName } from '@components/ui/Icon';
import { StatusChip, ProjectStatusChip } from '@components/ui/StatusChip';
import { versionedLoad, versionedSave, getOnboardingState, setOnboardingState } from '@lib/storage';
import { BottomSheet } from '@components/layout/BottomSheet';
import { useIsMobile } from '@lib/useIsMobile';

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
    <div className="card dashboard-time-card" style={{ padding: 16, height: '100%', minHeight: 370, boxSizing: 'border-box' }}>
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

// === P0-6 新手引导 Checklist ===
// D6：onboarding 状态走 storage.ts 统一收口（含旧 selenyx-onboarding-done 兼容）

function OnboardingChecklist() {
  const { projects, references, llmConfig, setView } = useAppStore();
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
          🚀 新手指南 · {completed}/4 完成
        </h3>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {steps.map((step, i) => (
          <div
            key={i}
            onClick={() => { if (!step.done) setView(step.view); }}
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

      {/* P0-6 新手引导 */}
      <OnboardingChecklist />

      {/* 统计卡片 */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div className="stat-card clickable" key={s.label} onClick={() => setView(s.view)} style={{ cursor: 'pointer', transition: 'all .15s' }}>
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name={s.icon} size={18} strokeWidth={1.8} /></span> {s.label}
            </span>
            <span className="value">{s.value}</span>
            <span className="delta" style={{ color: 'var(--text-muted)' }}>{s.delta}</span>
          </div>
        ))}
      </div>

      {/* ===== 区块一：今日（时钟 + 番茄钟） ===== */}
      <SectionTitle title="今日" subtitle="北京时间 · 专注节奏" />
      <div className="grid grid-2" style={{ gap: 16, alignItems: 'stretch' }}>
        <ClockWidget />
        <PomodoroTimer />
      </div>

      {/* ===== 区块二：项目进展（流水线时间线 + 当前项目） ===== */}
      <SectionTitle title="项目进展" subtitle="八段流水线 · 当前项目" />
      <TimelineWidget />

      {/* 当前项目进度 */}
      {currentProject && (
        <div className="card" style={{ marginTop: 16, cursor: 'pointer' }} onClick={() => setView('pipeline')}>
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

      {/* ===== 区块三：快捷操作 ===== */}
      <SectionTitle title="快捷操作" />
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setView('projects')}><Icon name="plus" size={16} /> 新建项目</button>
          <button className="btn" onClick={() => setView('references')}><Icon name={NAV_ICONS.references} size={16} /> 管理文献</button>
          <button className="btn" onClick={() => setView('tables')}><Icon name={NAV_ICONS.tables} size={16} /> 多维表格</button>
          <button className="btn" onClick={() => setView('pipeline')}><Icon name={NAV_ICONS.pipeline} size={16} /> 科研流水线</button>
          <button className="btn" onClick={() => setView('aiChat')}><Icon name={NAV_ICONS.aiChat} size={16} /> AI 对话</button>
          <button className="btn" onClick={() => setView('skills')}><Icon name={NAV_ICONS.skills} size={16} /> 科研技能</button>
          {useAppStore.getState().llmConfig == null && (
            <button className="btn btn-danger-ghost" onClick={() => setView('settings')}><Icon name="warning" size={16} /> 先配置 LLM</button>
          )}
        </div>
      </div>

      {/* ===== 区块四：最近动态（文献 / 项目 / 表格） ===== */}
      <SectionTitle title="最近动态" subtitle="文献 · 项目 · 表格" />
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
