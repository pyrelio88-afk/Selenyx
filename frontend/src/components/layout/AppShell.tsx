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
  const openSettings = useAppStore((state) => state.openSettings);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

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
            <span>工作区</span><span aria-hidden="true">/</span><strong>{viewLabel}</strong>
          </div>
          <div className="workspace-topbar-actions">
            <span className="workspace-local-label"><Icon name="shield" size={13} /> 本地优先</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => openSettings('appearance')}
              aria-label="外观设置"
              title="外观设置"
            >
              <Icon name={mode === 'dark' ? 'moon' : 'sun'} size={16} />
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
