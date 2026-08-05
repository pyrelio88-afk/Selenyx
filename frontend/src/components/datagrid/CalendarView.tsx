/**
 * 日历视图 — 按出版年份/月份分组的文献时间线
 * 借鉴 Notion Calendar：按月聚合，年内按月倒序，便于看文献的发表时间分布。
 */

import { useMemo } from 'react';
import type { Reference } from '@apptypes/reference';
import { StatusChip } from '@components/ui/StatusChip';

interface CalendarViewProps {
  references: Reference[];
  onSelect: (id: string) => void;
}

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export function CalendarView({ references, onSelect }: CalendarViewProps) {
  // 按 年-月 聚合
  const groups = useMemo(() => {
    const map = new Map<string, Reference[]>();
    for (const r of references) {
      // 优先 date(YYYY-MM)，回退 year
      let key = '未注明日期';
      const m = r.date?.match(/^(\d{4})-(\d{2})/);
      if (m) key = `${m[1]}-${m[2]}`;
      else if (r.year) key = r.year;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // 倒序（新→旧），未注明日期排最后
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '未注明日期') return 1;
      if (b[0] === '未注明日期') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [references]);

  if (references.length === 0) {
    return <div className="empty-state"><p>暂无文献</p></div>;
  }

  return (
    <div className="calendar-timeline" role="list" aria-label="文献日历">
      {groups.map(([key, items]) => {
        const isMonth = /^\d{4}-\d{2}$/.test(key);
        const label = isMonth
          ? `${key.slice(0, 4)} 年 ${MONTH_NAMES[parseInt(key.slice(5, 7), 10) - 1]}`
          : key === '未注明日期' ? key : `${key} 年`;
        return (
          <div key={key} className="calendar-group" role="listitem">
            <div className="calendar-group-header">
              <span className="calendar-group-label">{label}</span>
              <span className="calendar-group-count">{items.length} 篇</span>
            </div>
            <div className="calendar-items">
              {items.map((r) => (
                <button key={r.id} className="calendar-item" onClick={() => onSelect(r.id)} aria-label={r.title}>
                  <span className="calendar-item-dot" />
                  <span className="calendar-item-title">{r.title || '（无标题）'}</span>
                  <span className="calendar-item-authors">{r.creators[0]?.lastName ?? ''}</span>
                  <StatusChip status={r.readStatus} size="xs" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
