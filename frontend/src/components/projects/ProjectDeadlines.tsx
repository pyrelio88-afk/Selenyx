/** 挂在具体项目卡片里的倒数日：截稿 / 答辩 / 伦理。 */

import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';

export function daysUntil(date: string): number {
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86_400_000);
}

function formatRemain(days: number): string {
  if (days < 0) return `已过 ${-days} 天`;
  if (days === 0) return '今天';
  return `还有 ${days} 天`;
}

/**
 * Countdown entries created before deadlines became project-scoped remain
 * visible instead of being guessed onto the first project during migration.
 */
export function UnassignedProjectCountdowns() {
  const { customCountdowns, removeCountdown } = useAppStore();
  const items = customCountdowns
    .map((item, index) => ({ ...item, index }))
    .filter((item) => !item.projectId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (items.length === 0) return null;

  return (
    <section className="project-unassigned-countdowns" aria-labelledby="unassigned-countdowns-title">
      <div>
        <h2 id="unassigned-countdowns-title">未归属项目的倒数日</h2>
        <p>这是旧工作区保留的数据；未自动归属，避免把日期误放进项目。</p>
      </div>
      <ul className="project-countdown-list">
        {items.map((item) => {
          const days = daysUntil(item.date);
          return (
            <li key={`${item.label}-${item.index}`}>
              <span className="project-countdown-label">{item.label}</span>
              <span className="project-countdown-date">{item.date}</span>
              <b className={days <= 7 && days >= 0 ? 'is-soon' : ''}>{formatRemain(days)}</b>
              <button type="button" className="icon-btn" onClick={() => removeCountdown(item.index)} aria-label={`删除倒数日 ${item.label}`}>
                <Icon name="trash" size={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProjectCountdown({ projectId }: { projectId: string }) {
  const { customCountdowns, addCountdown, removeCountdown } = useAppStore();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');

  const items = customCountdowns
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const add = () => {
    if (!label.trim() || !date) return;
    addCountdown({ label: label.trim(), date, color: '#c7483b', projectId });
    setLabel('');
    setDate('');
    setOpen(false);
  };

  return (
    <div className="project-countdown">
      {items.length === 0 && !open ? (
        <button type="button" className="project-countdown-add" onClick={() => setOpen(true)}>
          <Icon name="calendar" size={13} /> 添加倒数日
        </button>
      ) : (
        <ul className="project-countdown-list">
          {items.map((item) => {
            const days = daysUntil(item.date);
            return (
              <li key={`${item.label}-${item.index}`}>
                <span className="project-countdown-label">{item.label}</span>
                <span className="project-countdown-date">{item.date}</span>
                <b className={days <= 7 && days >= 0 ? 'is-soon' : ''}>{formatRemain(days)}</b>
                <button type="button" className="icon-btn" onClick={() => removeCountdown(item.index)} aria-label={`删除倒数日 ${item.label}`}>
                  <Icon name="trash" size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(open || items.length > 0) && (
        <div className="project-countdown-form">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="投稿截止" aria-label="倒数日事项" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="倒数日日期" />
          <button type="button" className="btn btn-sm" onClick={add} disabled={!label.trim() || !date}>记下</button>
        </div>
      )}
    </div>
  );
}
