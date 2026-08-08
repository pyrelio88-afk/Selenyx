import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';
import { useLocalBackendStatus } from '@components/layout/useLocalBackendStatus';

/**
 * Keep primary objects discoverable at the shell level. Evidence review stays
 * inside the relevant project, library, and writing workspaces.
 */
export interface NavGroup {
  label: string;
  items: { key: ViewKey; label: string; hint?: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { key: 'dashboard', label: '总览', hint: '进度与倒数日' },
      { key: 'aiChat', label: 'AI 助手', hint: '项目会话与证据问答' },
    ],
  },
  {
    label: '项目',
    items: [
      { key: 'projects', label: '项目管理', hint: '创建、切换与删除项目' },
      { key: 'references', label: '文献库', hint: '检索 · 导入 · 全文' },
      { key: 'notes', label: '阅读笔记', hint: '摘录与批注' },
      { key: 'pipeline', label: '科研流水线', hint: '立题→检索→评级→设计→数据→分析→写作→传播' },
    ],
  },
  {
    label: '数据',
    items: [
      { key: 'tables', label: '数据表', hint: '筛选与对照' },
      { key: 'statTools', label: '统计工具', hint: '检验与效应量' },
      { key: 'clinicalData', label: '学科资料', hint: '名词 · 标准 · 公式' },
    ],
  },
  {
    label: '工具',
    items: [
      { key: 'skills', label: '科研能力', hint: '能力来源与验证状态' },
      { key: 'tools', label: '工具箱', hint: 'DOI · 引用 · 设计' },
      { key: 'settings', label: '设置', hint: '后端 · 主题 · 备份' },
    ],
  },
];

export function Sidebar() {
  const { currentView, setView, mode, toggleMode } = useAppStore();
  const isDark = mode === 'dark';
  const backend = useLocalBackendStatus();

  return (
    <aside className="sidebar workspace-sidebar" aria-label="科研工作台侧栏">
      <div className="workspace-brand">
        <div className="workspace-brand-mark" aria-hidden="true">
          <img src="/brand/selenyx-crane.png" alt="" />
        </div>
        <div className="workspace-brand-name">Selenyx</div>
      </div>

      <nav className="sidebar-nav" aria-label="科研工作台导航">
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
                title={item.hint}
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
        <div
          className={`workspace-local-status is-${backend.tone}`}
          title="数据默认留在本机；后端提供 RAG/学术 API/密钥网关"
          role="status"
          aria-live="polite"
        >
          <span className="workspace-status-dot" aria-hidden="true" />
          <span className="workspace-local-status-label">{backend.label}</span>
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
