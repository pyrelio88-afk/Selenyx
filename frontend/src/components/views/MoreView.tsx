/**
 * 更多（v4）：统计工具 / 工具箱 / 小部件。
 * 旧「总览」页废弃后，倒数日等小部件收进这里。
 */

import { useState } from 'react';
import { useAppStore, type MoreTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { StatToolsView } from '@components/views/StatToolsView';
import { ToolsView } from '@components/views/ToolsView';

const TABS: { key: MoreTab; label: string; icon: IconName }[] = [
  { key: 'statTools', label: '统计工具', icon: 'statTools' },
  { key: 'tools', label: '工具箱', icon: 'blueprint' },
  { key: 'widgets', label: '小部件', icon: 'dashboard' },
];

function daysUntil(date: string): number {
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86_400_000);
}

/** 倒数日小部件（自旧总览页迁移，store 持久化） */
function CountdownWidget() {
  const { customCountdowns, addCountdown, removeCountdown } = useAppStore();
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');

  const add = () => {
    if (!label.trim() || !date) return;
    addCountdown({ label: label.trim(), date, color: '#c7483b' });
    setLabel('');
    setDate('');
  };

  return (
    <div className="card" style={{ padding: 16, maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>倒数日</h2>
      {customCountdowns.length === 0 ? (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>还没有倒数日。添加截稿、答辩、伦理审查截止等关键日期。</p>
      ) : (
        <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {customCountdowns.map((item, index) => {
            const days = daysUntil(item.date);
            return (
              <li key={`${item.label}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.date}</span>
                <b style={{ marginLeft: 'auto', fontSize: 13, color: days < 0 ? 'var(--text-muted)' : days <= 7 ? 'var(--danger)' : 'var(--accent)' }}>
                  {days < 0 ? `已过 ${-days} 天` : days === 0 ? '今天' : `${days} 天`}
                </b>
                <button type="button" className="icon-btn" onClick={() => removeCountdown(index)} aria-label={`删除倒数日 ${item.label}`}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="事项（如：投稿截止）" style={{ minHeight: 36, flex: 1, minWidth: 140 }} aria-label="倒数日事项" />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ minHeight: 36 }} aria-label="倒数日日期" />
        <button type="button" className="btn btn-primary" onClick={add} disabled={!label.trim() || !date} style={{ minHeight: 36 }}>
          <Icon name="plus" size={14} /> 添加
        </button>
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
        番茄钟等其余小部件正从旧总览页迁移，随后续模块补齐。
      </p>
    </div>
  );
}

export function MoreView() {
  const { moreTab, setMoreTab } = useAppStore();

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="更多">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={moreTab === tab.key}
            className={`tabbar-btn ${moreTab === tab.key ? 'active' : ''}`}
            onClick={() => setMoreTab(tab.key)}
          >
            <Icon name={tab.icon} size={15} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="tabbed-panel" role="tabpanel">
        {moreTab === 'statTools' && <StatToolsView />}
        {moreTab === 'tools' && <ToolsView />}
        {moreTab === 'widgets' && <CountdownWidget />}
      </div>
    </div>
  );
}
