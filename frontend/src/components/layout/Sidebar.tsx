import type { ViewKey } from '../../App';
import { useAppStore } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';

interface SidebarProps {
  current: ViewKey;
  onNavigate: (v: ViewKey) => void;
}

const NAV_ITEMS: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: '总览' },
  { key: 'references', label: '文献库' },
  { key: 'pipeline', label: '科研流水线' },
  { key: 'projects', label: '项目' },
  { key: 'statTools', label: '统计工具' },
  { key: 'clinicalData', label: '临床数据' },
  { key: 'aiChat', label: 'AI 助手' },
  { key: 'settings', label: '设置' },
];

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const { mode, toggleMode } = useAppStore();
  const isDark = mode === 'dark';

  return (
    <aside className="sidebar">
      {/* Logo —— 手绘月相符号，非 emoji 方块 */}
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="moon" size={20} strokeWidth={1.8} />
        <span>Selenyx</span>
      </div>
      <nav className="sidebar-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${current === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={current === item.key ? 'page' : undefined}
          >
            <span className="icon">
              <Icon name={NAV_ICONS[item.key]} size={18} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {mode === 'light' ? '日间' : '夜间'}
        </span>
        <button
          className="icon-btn"
          onClick={toggleMode}
          aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
          title={isDark ? '日间模式' : '夜间模式'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </aside>
  );
}
