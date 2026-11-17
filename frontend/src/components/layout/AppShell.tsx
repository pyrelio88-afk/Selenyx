import { useState, type ReactNode } from 'react';
import { Icon } from '@components/ui/Icon';
import { Sidebar } from '@components/layout/Sidebar';
import { useAppStore } from '@stores/appStore';

interface AppShellProps {
  viewLabel: string;
  children: ReactNode;
  petCompanion?: ReactNode;
}

/** The only owner of top-level navigation layout and its mobile modal state. */
export function AppShell({ viewLabel, children, petCompanion }: AppShellProps) {
  const mode = useAppStore((state) => state.mode);
  const toggleMode = useAppStore((state) => state.toggleMode);
  const openSettings = useAppStore((state) => state.openSettings);
  const openKnowledgeSearch = useAppStore((state) => state.openKnowledgeSearch);
  const setView = useAppStore((state) => state.setView);
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const activeProject = projects.find((project) => project.id === currentProjectId && project.status !== 'archived');

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileNavigationOpen} onMobileOpenChange={setMobileNavigationOpen} />
      {mobileNavigationOpen && (
        <button
          type="button"
          className="workspace-sidebar-backdrop"
          aria-label="关闭导航菜单"
          tabIndex={-1}
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
      <div className="app-workspace" inert={mobileNavigationOpen}>
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <span>工作区</span>
            <span aria-hidden="true">/</span>
            <strong>{viewLabel}</strong>
            {activeProject && (
              <button
                type="button"
                className="topbar-project-pill"
                onClick={() => setView('projects')}
                title={`当前关联课题：${activeProject.name}（点击管理项目）`}
              >
                <Icon name="projects" size={13} />
                <span>{activeProject.name}</span>
              </button>
            )}
          </div>
          <div className="workspace-topbar-actions">
            <button
              type="button"
              className="topbar-search-pill"
              onClick={openKnowledgeSearch}
              aria-label="全局检索工作区"
              title="搜索文献、笔记与项目（Ctrl+K）"
            >
              <Icon name="search" size={13} />
              <span>检索</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="workspace-local-label"><Icon name="shield" size={13} /> 本地优先</span>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleMode}
              aria-label={mode === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
              title={mode === 'dark' ? '切换浅色模式（更多主题见外观设置）' : '切换深色模式（更多主题见外观设置）'}
            >
              <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => openSettings()}
              aria-label="打开设置"
              title="设置（Ctrl+,）"
            >
              <Icon name="settings" size={16} />
            </button>
          </div>
        </header>
        <main id="workspace-main" className="app-main" tabIndex={-1}>
          <div className="app-view-region">{children}</div>
        </main>
        {petCompanion}
      </div>
    </div>
  );
}
