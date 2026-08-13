import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';
import { useLocalBackendStatus } from '@components/layout/useLocalBackendStatus';
import { UserPanel } from '@components/layout/UserPanel';
import { APP_VERSION } from '@lib/appVersion';

/**
 * v4 侧边栏三段式（WorkBuddy 范式）：
 * A. 品牌区（仙鹤 logo + 版本号 + 检索/折叠）
 * B. 主导航：固定 7 项一级项，不展开子项
 * C. 底部运行区：后端状态 + 用户区
 */
export const NAV_ITEMS: { key: ViewKey; label: string; hint?: string }[] = [
  { key: 'newTask', label: '新对话', hint: '一句话开始，提交后进入这场对话' },
  { key: 'projects', label: '项目', hint: '项目列表、详情与科研流水线' },
  { key: 'more', label: '工具', hint: '工具箱 · 表格 · 统计' },
  { key: 'automations', label: '自动化', hint: '定时跑任务，建了就能删' },
  { key: 'library', label: '知识库', hint: '文献 · 证据卡 · 笔记' },
  { key: 'extensions', label: '专家·技能·连接器', hint: '角色化助手与能力扩展' },
];

export function Sidebar() {
  const { currentView, setView, requestNewTask, sidebarCollapsed, toggleSidebar } = useAppStore();
  const backend = useLocalBackendStatus();

  return (
    <aside className={`sidebar workspace-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Selenyx 侧栏">
      <div className="workspace-brand v4-brand">
        <div className="workspace-brand-mark" aria-hidden="true">
          <img src="/brand-crane-cloud-512-v1.png" alt="" />
        </div>
        {!sidebarCollapsed && (
          <div className="v4-brand-copy">
            <div className="workspace-brand-name">Selenyx</div>
            <div className="workspace-brand-subtitle">v{APP_VERSION}</div>
          </div>
        )}
        <div className="v4-brand-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
          >
            <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </button>
        </div>
      </div>

      {!sidebarCollapsed && (
        <button
          type="button"
          className="sidebar-search"
          onClick={() => setView('references')}
          title="检索知识库（快捷键 K）"
        >
          <Icon name="search" size={15} />
          <span className="sidebar-search-label">搜索</span>
          <kbd>K</kbd>
        </button>
      )}

      <nav className="sidebar-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${currentView === item.key ? 'active' : ''}`}
            onClick={() => (item.key === 'newTask' ? requestNewTask() : setView(item.key))}
            aria-current={currentView === item.key ? 'page' : undefined}
            title={item.hint}
          >
            <span className="icon">
              <Icon name={NAV_ICONS[item.key]} size={18} />
            </span>
            {!sidebarCollapsed && <span className="nav-item-label">{item.label}</span>}
            {!sidebarCollapsed && item.key === 'newTask' && (
              <span className="nav-item-trail" aria-hidden="true"><Icon name="plus" size={14} /></span>
            )}
          </button>
        ))}
      </nav>

      <div className="workspace-sidebar-footer v4-footer">
        {!sidebarCollapsed && (
          <div
            className={`workspace-local-status is-${backend.tone}`}
            title="数据默认留在本机；后端提供 RAG/学术 API/密钥网关"
            role="status"
            aria-live="polite"
          >
            <span className="workspace-status-dot" aria-hidden="true" />
            <span className="workspace-local-status-label">{backend.label}</span>
          </div>
        )}
        <UserPanel collapsed={sidebarCollapsed} />
      </div>
    </aside>
  );
}
