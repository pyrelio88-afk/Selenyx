/**
 * 视图切换器 — 表格 / 看板 / 画廊 / 日历（多维表格核心交互）
 * 提供表格、看板、画廊和日历之间的数据视图标签页。
 */

export type ViewMode = 'table' | 'kanban' | 'gallery' | 'calendar';

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'table', label: '表格', icon: '⊞' },
  { key: 'kanban', label: '看板', icon: '▤' },
  { key: 'gallery', label: '画廊', icon: '⊟' },
  { key: 'calendar', label: '日历', icon: '◫' },
];

interface ViewSwitcherProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

export function ViewSwitcher({ mode, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" role="tablist" aria-label="数据视图切换">
      {VIEW_OPTIONS.map((v) => (
        <button
          key={v.key}
          role="tab"
          aria-selected={mode === v.key}
          className={`view-tab ${mode === v.key ? 'active' : ''}`}
          onClick={() => onChange(v.key)}
        >
          <span className="view-tab-icon" aria-hidden>{v.icon}</span>
          <span>{v.label}</span>
        </button>
      ))}
    </div>
  );
}
