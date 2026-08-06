import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';

interface NavGroup {
  label: string;
  items: { key: ViewKey; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { key: 'dashboard', label: '总览' },
      { key: 'aiChat', label: 'AI 助手' },
    ],
  },
  {
    label: '项目',
    items: [
      { key: 'projects', label: '项目管理' },
      { key: 'references', label: '文献库' },
      { key: 'notes', label: '笔记区' },
      { key: 'pipeline', label: '科研流水线' },
    ],
  },
  {
    label: '数据',
    items: [
      { key: 'tables', label: '多维表格' },
      { key: 'statTools', label: '统计工具' },
      { key: 'clinicalData', label: '学科数据' },
    ],
  },
  {
    label: '工具',
    items: [
      { key: 'skills', label: '科研技能' },
      { key: 'tools', label: '工具箱' },
      { key: 'settings', label: '设置' },
    ],
  },
];

export function Sidebar() {
  const { currentView, setView, mode, toggleMode } = useAppStore();
  const isDark = mode === 'dark';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="moon" size={20} strokeWidth={1.8} />
        <span>Selenyx</span>
      </div>
      <nav className="sidebar-nav" aria-label="主导航">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'contents' }}>
            {group.label && (
              <div className="nav-group-label">{group.label}</div>
            )}
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${currentView === item.key ? 'active' : ''}`}
                onClick={() => setView(item.key)}
                aria-current={currentView === item.key ? 'page' : undefined}
              >
                <span className="icon">
                  <Icon name={NAV_ICONS[item.key]} size={18} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
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
