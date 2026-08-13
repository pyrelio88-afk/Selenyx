/**
 * 自动化 — 定时 agent 任务（后端调度器驱动）
 *
 * 名称 + 任务描述 + 节奏（每天定时 / 按间隔）+ 可选项目。
 * 本机后端 asyncio 调度循环（30s tick）到期触发 agent 自循环。
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { EmptyGuide } from '@components/ui/EmptyGuide';
import { automationsApi, type AutomationDef, type AutomationRunEntry } from '@services/extensions';
import { STATUS_COLOR, STATUS_LABEL } from '@components/tasks/StepRow';
import { validateCronExpression } from '@services/cron';

type LoadState = 'loading' | 'ready' | 'error';

export function AutomationsView() {
  const projects = useAppStore((s) => s.projects);
  const setView = useAppStore((s) => s.setView);
  const requestRunFocus = useAppStore((s) => s.requestRunFocus);
  const [items, setItems] = useState<AutomationDef[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<'interval' | 'daily' | 'cron'>('daily');
  const [intervalMin, setIntervalMin] = useState(60);
  const [dailyTime, setDailyTime] = useState('08:00');
  const [cronExpr, setCronExpr] = useState('0 8 * * *');
  const [catchUp, setCatchUp] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, AutomationRunEntry[]>>({});

  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const offline = loadState === 'error';
  const cronError = scheduleType === 'cron' ? validateCronExpression(cronExpr) : null;

  const refresh = useCallback(async () => {
    setLoadState('loading');
    try {
      const { automations } = await automationsApi.list();
      setItems(automations);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    if (!name.trim() || !prompt.trim() || cronError) return;
    const body = {
      name: name.trim(), prompt: prompt.trim(), scheduleType,
      intervalMin, dailyHhmm: dailyTime, cronExpr: cronExpr.trim(), catchUp,
      projectId: projectId || null, enabled: true,
    };
    try {
      if (editingId) {
        const current = items.find((a) => a.id === editingId);
        await automationsApi.update(editingId, { ...body, enabled: current?.enabled ?? true });
      } else {
        await automationsApi.create(body);
      }
      setName(''); setPrompt(''); setEditingId(null);
      await refresh();
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startEdit = (item: AutomationDef) => {
    setEditingId(item.id);
    setName(item.name);
    setPrompt(item.prompt);
    setScheduleType(item.scheduleType);
    setIntervalMin(item.intervalMin);
    setDailyTime(item.dailyHhmm);
    setCronExpr(item.cronExpr || '0 8 * * *');
    setCatchUp(item.catchUp);
    setProjectId(item.projectId ?? '');
  };

  const toggleHistory = async (item: AutomationDef) => {
    const next = historyFor === item.id ? null : item.id;
    setHistoryFor(next);
    if (next && !history[next]) {
      try {
        const { runs } = await automationsApi.history(next);
        setHistory((prev) => ({ ...prev, [next]: runs }));
      } catch {
        setHistory((prev) => ({ ...prev, [next]: [] }));
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName(''); setPrompt('');
  };

  const toggle = async (id: string) => {
    try {
      await automationsApi.toggle(id);
      await refresh();
    } catch { /* 下次刷新收敛 */ }
  };

  const remove = async (item: AutomationDef) => {
    if (!window.confirm(`删除自动化「${item.name}」？`)) return;
    try {
      await automationsApi.remove(item.id);
      await refresh();
    } catch { /* 下次刷新收敛 */ }
  };

  const runNow = async (item: AutomationDef) => {
    try {
      await automationsApi.runNow(item.id);
      setView('tasks');
    } catch (error) {
      alert(`触发失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="auto-page">
      <header className="newtask-hero">
        <h1>定时任务</h1>
        <p>到点在这台电脑上跑一条任务，比如每天扫文献。建了就能删。</p>
      </header>

      {loadState === 'error' && (
        <div role="alert" className="auto-alert">
          <span>本机后端未连接：自动化由本机调度器执行，离线时无法创建或触发。</span>
          <button type="button" className="btn btn-sm" onClick={() => void refresh()}>重试</button>
        </div>
      )}

      <section className="auto-composer" aria-labelledby="auto-compose-heading">
        <h2 id="auto-compose-heading">{editingId ? '编辑自动化' : '新建自动化'}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称，如：每日 AI 文献动态" aria-label="自动化名称" />
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="触发时执行的任务描述…" rows={2} aria-label="任务描述" />
        <div className="auto-row">
          <label>
            节奏
            <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as 'interval' | 'daily' | 'cron')}>
              <option value="daily">每天定时</option>
              <option value="interval">按间隔</option>
              <option value="cron">cron 表达式</option>
            </select>
          </label>
          {scheduleType === 'daily' && (
            <input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} aria-label="每天时间" />
          )}
          {scheduleType === 'interval' && (
            <label>
              每
              <input type="number" min={5} value={intervalMin} onChange={(e) => setIntervalMin(Math.max(5, Number(e.target.value) || 60))} aria-label="间隔分钟" style={{ width: 80 }} />
              分钟
            </label>
          )}
          {scheduleType === 'cron' && (
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="分 时 日 月 星期，如 0 8 * * 1-5"
              aria-label="cron 表达式"
              aria-invalid={Boolean(cronError)}
              aria-describedby={cronError ? 'cron-expression-help' : undefined}
              style={{ width: 220, fontFamily: 'var(--font-mono)' }}
            />
          )}
          <label title="停机期间错过的触发，开机后补跑一次">
            <input type="checkbox" checked={catchUp} onChange={(e) => setCatchUp(e.target.checked)} />
            错过补跑
          </label>
          <label>
            项目
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">不关联项目</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={!name.trim() || !prompt.trim() || Boolean(cronError) || offline}>
            <Icon name="plus" size={15} /> {editingId ? '保存' : '创建'}
          </button>
          {editingId && (
            <button type="button" className="btn" onClick={cancelEdit}>取消编辑</button>
          )}
        </div>
        {cronError && <p id="cron-expression-help" role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--font-sm)' }}>{cronError}</p>}
      </section>

      <section className="auto-list" aria-labelledby="auto-list-heading">
        <h2 id="auto-list-heading">已创建</h2>
        {loadState === 'loading' ? (
          <div className="auto-load-state" role="status" aria-live="polite" aria-busy="true">
            <Icon name="retry" size={15} /> 正在读取自动化…
          </div>
        ) : loadState === 'error' ? null : items.length === 0 ? (
          <EmptyGuide title="还没有自动化">
            <p>写名称和要跑的任务，选每天或间隔。到点会在这台电脑上执行，不喜欢可以删。</p>
          </EmptyGuide>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {items.map((a) => (
              <li key={a.id} className="auto-item">
                <div className="auto-item-head">
                  <Icon name="clock" size={15} />
                  <div className="auto-item-copy">
                    <strong>{a.name}</strong>
                    <span>
                      {a.scheduleType === 'daily' ? `每天 ${a.dailyHhmm}` : a.scheduleType === 'cron' ? `cron: ${a.cronExpr}` : `每 ${a.intervalMin} 分钟`}
                      {!a.catchUp && ' · 不补跑'}
                      {' · '}{activeProjects.find((p) => p.id === a.projectId)?.name ?? '全局'}
                      {' · '}{a.enabled ? '已启用' : '已暂停'}
                      {a.lastRunAt ? ` · 上次 ${new Date(a.lastRunAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                      {a.nextRetryAt && (
                        <span style={{ color: 'var(--danger)' }}>
                          {' · '}第 {a.retryCount}/3 次重试将于 {new Date(a.nextRetryAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {!a.nextRetryAt && a.retryCount >= 3 && (
                        <span style={{ color: 'var(--danger)' }}>{' · '}已重试 3 次仍失败</span>
                      )}
                    </span>
                  </div>
                  <div className="auto-item-acts">
                    <button type="button" className="btn" onClick={() => void toggleHistory(a)} aria-expanded={historyFor === a.id}>历史</button>
                    <button type="button" className="btn" onClick={() => void runNow(a)}>立即运行</button>
                    <button type="button" className="btn" onClick={() => startEdit(a)}>编辑</button>
                    <button type="button" className="btn" onClick={() => void toggle(a.id)}>{a.enabled ? '暂停' : '启用'}</button>
                    <button type="button" className="btn" onClick={() => void remove(a)} aria-label={`删除 ${a.name}`} style={{ color: 'var(--danger)' }}>删除</button>
                  </div>
                </div>
                {historyFor === a.id && (
                  <div>
                    {(history[a.id] ?? []).length === 0 ? (
                      <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>还没有运行记录。</span>
                    ) : (
                      <ul className="auto-history">
                        {(history[a.id] ?? []).map((run) => (
                          <li key={run.runId}>
                            <button type="button" onClick={() => requestRunFocus(run.runId)} title="查看这次运行">
                              <span style={{ color: STATUS_COLOR[run.status] ?? 'var(--text-muted)', fontWeight: 700 }}>
                                {STATUS_LABEL[run.status] ?? run.status}
                              </span>
                              <span>
                                {run.startedAt ? new Date(run.startedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
