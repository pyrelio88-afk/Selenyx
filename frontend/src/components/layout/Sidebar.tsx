import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';

export interface NavGroup {
  label: string;
  items: { key: ViewKey; label: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
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
  const {
    currentView, setView, mode, toggleMode,
    projects, currentProjectId, references,
  } = useAppStore();
  const isDark = mode === 'dark';
  const activeProject = projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null;

  function openProjects() {
    setView('projects');
  }

  return (
    <aside className="sidebar workspace-sidebar">
      <div className="workspace-brand">
        <div className="workspace-brand-mark" aria-hidden="true"><Icon name="moon" size={19} strokeWidth={1.9} /></div>
        <div>
          <div className="workspace-brand-name">Selenyx</div>
          <div className="workspace-brand-subtitle">本地科研工作台</div>
        </div>
      </div>

      <button className="workspace-switcher" onClick={openProjects} aria-label="切换或管理科研项目">
        <span className="workspace-switcher-avatar">研</span>
        <span className="workspace-switcher-copy">
          <strong>{activeProject?.name || '未选择项目'}</strong>
          <small>{activeProject ? '当前科研空间' : '创建项目后开始工作'}</small>
        </span>
        <Icon name="chevronDown" size={15} />
      </button>

      <div className="workspace-actions">
        <button className="workspace-primary-action" onClick={openProjects}>
          <Icon name="plus" size={16} />
          新建项目
        </button>
        <button className="workspace-quick-action" onClick={() => setView('references')} title="前往文献库">
          <Icon name="references" size={16} />
          <span>文献</span>
          <b>{references.length}</b>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="主导航">
        {NAV_GROUPS.map((group, gi) => (
          <section key={gi} className="workspace-nav-group" aria-label={group.label || '工作台'}>
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
          </section>
        ))}
      </nav>

      <div className="workspace-sidebar-footer">
        <div className="workspace-local-status">
          <span className="workspace-status-dot" aria-hidden="true" />
          本地数据空间
        </div>
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
