/**
 * 自动化 — 定时 agent 任务（后端调度器驱动）
 *
 * 名称 + 任务描述 + 节奏（每天定时 / 按间隔）+ 可选项目。
 * 本机后端 asyncio 调度循环（30s tick）到期触发 agent 自循环，
 * 运行记录落在「任务」页；此处负责编排定义与手动触发。
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { automationsApi, type AutomationDef, type AutomationRunEntry } from '@services/extensions';
import { STATUS_COLOR, STATUS_LABEL } from '@components/tasks/StepRow';
import { validateCronExpression } from '@services/cron';

export function AutomationsView() {
  const projects = useAppStore((s) => s.projects);
  const setView = useAppStore((s) => s.setView);
  const requestRunFocus = useAppStore((s) => s.requestRunFocus);
  const [items, setItems] = useState<AutomationDef[]>([]);
  const [offline, setOffline] = useState(false);
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
  // Derived during render rather than synchronized through another effect.
  const cronError = scheduleType === 'cron' ? validateCronExpression(cronExpr) : null;

  const refresh = useCallback(async () => {
    try {
      const { automations } = await automationsApi.list();
      setItems(automations);
      setOffline(false);
    } catch {
      setOffline(true);
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

  /* 运行历史展开（V4 模块 G）：关联 run 可跳任务详情 */
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
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">自动化</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            让 Selenyx 按节奏自动运行任务：每日文献监测、定时综述更新。
          </p>
        </div>
      </div>

      {offline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接：自动化由后端调度器执行，离线时定义与触发均不可用。
        </div>
      )}

      <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{editingId ? '编辑自动化' : '新建自动化'}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称，如：每日 AI 文献动态" aria-label="自动化名称" style={{ minHeight: 40 }} />
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="触发时执行的任务描述…" rows={2} aria-label="任务描述" style={{ resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            节奏
            <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as 'interval' | 'daily' | 'cron')} style={{ minHeight: 36 }}>
              <option value="daily">每天定时</option>
              <option value="interval">按间隔</option>
              <option value="cron">cron 表达式</option>
            </select>
          </label>
          {scheduleType === 'daily' && (
            <input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} aria-label="每天时间" style={{ minHeight: 36 }} />
          )}
          {scheduleType === 'interval' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              每
              <input type="number" min={5} value={intervalMin} onChange={(e) => setIntervalMin(Math.max(5, Number(e.target.value) || 60))} aria-label="间隔分钟" style={{ width: 80, minHeight: 36 }} />
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
              style={{ minHeight: 36, width: 200, fontFamily: 'monospace' }}
            />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="停机/休眠期间错过的触发，开机后补跑一次">
            <input type="checkbox" checked={catchUp} onChange={(e) => setCatchUp(e.target.checked)} />
            错过补跑
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            项目
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ minHeight: 36 }}>
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
        {cronError && <p id="cron-expression-help" role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{cronError}</p>}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>已创建</h2>
        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>暂无自动化任务。</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {items.map((a) => (
              <li key={a.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Icon name="clock" size={15} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
                    </div>
                  </div>
                  <button type="button" className="btn" onClick={() => void toggleHistory(a)} aria-expanded={historyFor === a.id} style={{ minHeight: 32, fontSize: 12 }}>历史</button>
                  <button type="button" className="btn" onClick={() => void runNow(a)} style={{ minHeight: 32, fontSize: 12 }}>立即运行</button>
                  <button type="button" className="btn" onClick={() => startEdit(a)} style={{ minHeight: 32, fontSize: 12 }}>编辑</button>
                  <button type="button" className="btn" onClick={() => void toggle(a.id)} style={{ minHeight: 32, fontSize: 12 }}>{a.enabled ? '暂停' : '启用'}</button>
                  <button type="button" className="btn" onClick={() => void remove(a)} aria-label={`删除 ${a.name}`} style={{ minHeight: 32, fontSize: 12, color: 'var(--danger)' }}>删除</button>
                </div>
                {historyFor === a.id && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    {(history[a.id] ?? []).length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>还没有运行记录。</span>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                        {(history[a.id] ?? []).map((run) => (
                          <li key={run.runId}>
                            <button
                              type="button"
                              onClick={() => requestRunFocus(run.runId)}
                              title="跳转到任务详情"
                              style={{
                                width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                                background: 'transparent', cursor: 'pointer', font: 'inherit', padding: '6px 10px',
                                display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)',
                              }}
                            >
                              <span style={{ color: STATUS_COLOR[run.status] ?? 'var(--text-muted)', fontWeight: 700 }}>
                                {STATUS_LABEL[run.status] ?? run.status}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>
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
      </div>
    </div>
  );
}
