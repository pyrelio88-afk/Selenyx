/**
 * 看板视图 — 按某字段分组的真拖拽看板
 *
 * 交互对齐 react-kanban-kit / pragmatic-drag-and-drop 模式（R72 调研）：
 * - 拖拽经过列时 drop-zone 高亮（.kanban-column.drag-over，虚线 + accent 底色）
 * - 拖拽中卡片半透明 ghost（.kanban-card.dragging）
 * - 原生 HTML5 DnD，零依赖；松手落到某列 → 更新该卡片的分组字段
 */

import { useState } from 'react';
import type { Reference } from '@apptypes/reference';
import { StatusChip } from '@components/ui/StatusChip';
import { Icon } from '@components/ui/Icon';

export type GroupField = 'readStatus' | 'type' | 'importance';

interface Column {
  key: string;
  label: string;
}

const GROUP_COLUMNS: Record<GroupField, Column[]> = {
  readStatus: [
    { key: 'unread', label: '未读' },
    { key: 'reading', label: '阅读中' },
    { key: 'read', label: '已读' },
    { key: 'archived', label: '已归档' },
  ],
  type: [
    { key: 'journalArticle', label: '期刊论文' },
    { key: 'conferencePaper', label: '会议论文' },
    { key: 'book', label: '书籍' },
    { key: 'preprint', label: '预印本' },
    { key: 'other', label: '其他' },
  ],
  importance: [
    { key: '5', label: '★★★★★' },
    { key: '4', label: '★★★★' },
    { key: '3', label: '★★★' },
    { key: '2', label: '★★' },
    { key: '1', label: '★' },
  ],
};

function groupKeyOf(ref: Reference, field: GroupField): string {
  if (field === 'readStatus') return ref.readStatus;
  if (field === 'importance') return String(ref.importance);
  if (field === 'type') {
    return ['journalArticle', 'conferencePaper', 'book', 'preprint'].includes(ref.type) ? ref.type : 'other';
  }
  return '';
}

interface KanbanViewProps {
  references: Reference[];
  groupBy: GroupField;
  onGroupChange: (id: string, patch: Partial<Reference>) => void;
  onSelect: (id: string) => void;
}

export function KanbanView({ references, groupBy, onGroupChange, onSelect }: KanbanViewProps) {
  const columns = GROUP_COLUMNS[groupBy];
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const applyDrop = (colKey: string) => {
    if (!draggingId) return;
    const patch: Partial<Reference> =
      groupBy === 'readStatus' ? { readStatus: colKey as Reference['readStatus'] }
      : groupBy === 'importance' ? { importance: Number(colKey) as Reference['importance'] }
      : { type: colKey as Reference['type'] };
    onGroupChange(draggingId, patch);
    setDraggingId(null);
    setOverCol(null);
  };

  return (
    <div className="kanban-board" role="list" aria-label={`按${groupBy}分组的看板`}>
      {columns.map((col) => {
        const items = references.filter((r) => groupKeyOf(r, groupBy) === col.key);
        return (
          <div
            key={col.key}
            className={`kanban-column ${overCol === col.key ? 'drag-over' : ''}`}
            role="listitem"
            aria-label={`${col.label}（${items.length} 条）`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverCol(col.key); }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => { e.preventDefault(); applyDrop(col.key); }}
          >
            <div className="kanban-col-header">
              <span className="kanban-col-title">{col.label}</span>
              <span className="kanban-col-count">{items.length}</span>
            </div>
            <div className="kanban-col-body">
              {items.map((r) => (
                <div
                  key={r.id}
                  className={`kanban-card ${draggingId === r.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDraggingId(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                  onDragEnd={() => { setDraggingId(null); setOverCol(null); }}
                  onClick={() => onSelect(r.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSelect(r.id); }}
                  aria-label={`${r.title}`}
                >
                  <div className="kanban-card-title">{r.title || '（无标题）'}</div>
                  <div className="kanban-card-meta">
                    <span>{r.year}</span>
                    <span className="kanban-card-authors">
                      {r.creators[0] ? `${r.creators[0].lastName}${r.creators.length > 1 ? ' 等' : ''}` : '—'}
                    </span>
                  </div>
                  <div className="kanban-card-footer">
                    <StatusChip status={r.readStatus} size="xs" />
                    {r.impactFactor != null && (
                      <span className="kanban-card-if">IF {r.impactFactor.toFixed(1)}</span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="kanban-empty">
                  <Icon name="empty" size={20} strokeWidth={1.4} />
                  <span>拖拽卡片到此处</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
