/**
 * 状态徽章 —— 颜色 + 形状双编码
 *
 * 依据 ONES.com「color never alone」无障碍规则：
 * 状态不只靠颜色区分，同时用形状点（圆/方/三角）+ 文字标签，
 * 色弱用户也能识别（WCAG 1.4.1）。
 */

import type { ReactNode } from 'react';

export type RefStatus = 'unread' | 'reading' | 'read' | 'archived';

const STATUS_META: Record<RefStatus, { label: string; cls: string; shape: 'circle' | 'square' | 'diamond' | 'dash' }> = {
  unread:   { label: '未读',   cls: 'chip-unread',   shape: 'dash' },
  reading:  { label: '阅读中', cls: 'chip-reading',  shape: 'square' },
  read:     { label: '已读',   cls: 'chip-read',     shape: 'circle' },
  archived: { label: '已归档', cls: 'chip-archived', shape: 'diamond' },
};

function ShapeMark({ shape }: { shape: string }) {
  if (shape === 'circle') return <span className="chip-mark chip-mark-circle" />;
  if (shape === 'square') return <span className="chip-mark chip-mark-square" />;
  if (shape === 'diamond') return <span className="chip-mark chip-mark-diamond" />;
  return <span className="chip-mark chip-mark-dash" />; // unread: 短横
}

export function StatusChip({ status, size = 'sm' }: { status: RefStatus; size?: 'xs' | 'sm' }) {
  const meta = STATUS_META[status] ?? STATUS_META.unread;
  return (
    <span className={`status-chip ${meta.cls} chip-${size}`}>
      <ShapeMark shape={meta.shape} />
      <span>{meta.label}</span>
    </span>
  );
}

/** 通用项目状态徽章 */
const PROJECT_STATUS_META: Record<string, { label: string; cls: string; shape: 'circle' | 'square' | 'diamond' | 'dash' }> = {
  planning:  { label: '规划中', cls: 'chip-unread',   shape: 'dash' },
  active:    { label: '进行中', cls: 'chip-reading',  shape: 'circle' },
  paused:    { label: '已暂停', cls: 'chip-archived', shape: 'square' },
  completed: { label: '已完成', cls: 'chip-read',     shape: 'circle' },
  archived:  { label: '已归档', cls: 'chip-archived', shape: 'diamond' },
};

export function ProjectStatusChip({ status }: { status: string }) {
  const meta = PROJECT_STATUS_META[status] ?? PROJECT_STATUS_META.planning;
  return (
    <span className={`status-chip ${meta.cls} chip-sm`}>
      <ShapeMark shape={meta.shape} />
      <span>{meta.label}</span>
    </span>
  );
}

/** 密度切换器 */
export function DensityToggle({ density, onChange }: { density: string; onChange: (d: 'compact' | 'comfortable' | 'spacious') => void }) {
  const opts: { key: 'compact' | 'comfortable' | 'spacious'; label: string }[] = [
    { key: 'compact', label: '紧凑' },
    { key: 'comfortable', label: '舒适' },
    { key: 'spacious', label: '宽松' },
  ];
  return (
    <div className="density-toggle" role="radiogroup" aria-label="界面密度">
      {opts.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={density === o.key}
          className={`density-btn ${density === o.key ? 'active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="tip-wrap">
      {children}
      <span className="tip">{text}</span>
    </span>
  );
}
