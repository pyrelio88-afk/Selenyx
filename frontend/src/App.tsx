import { useEffect, Component, type ReactNode } from 'react';
import { Sidebar } from '@components/layout/Sidebar';
import { MobileShell } from '@components/layout/MobileShell';
import { DashboardView } from '@components/views/DashboardView';
import { ReferencesView } from '@components/views/ReferencesView';
import { PipelineView } from '@components/views/PipelineView';
import { ProjectsView } from '@components/views/ProjectsView';
import { TablesView } from '@components/views/TablesView';
import { StatToolsView } from '@components/views/StatToolsView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { AIChatView } from '@components/views/AIChatView';
import { SettingsView } from '@components/views/SettingsView';
import { ToolsView } from '@components/views/ToolsView';
import { SkillsView } from '@components/views/SkillsView';
import { NotesView } from '@components/views/NotesView';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';
import { clearSelenyxBrowserStorage } from '@services/workspaceBackup';
import { readEnvironmentLLM } from '@services/envLLM';
import './styles/tokens.css';

export type { ViewKey } from '@stores/appStore';

const APP_VERSION = '0.01 · 2026-08-07';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-primary)' }}>
          <h2 style={{ marginBottom: 16, fontSize: 20 }}>页面渲染异常</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 8, fontSize: 14 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 13 }}>
            如反复出现，可清除 Selenyx 的浏览器本地数据后重启；请先导出重要工作区。
          </p>
          <button
            className="btn btn-primary"
            onClick={() => { clearSelenyxBrowserStorage(); location.reload(); }}
            style={{ marginRight: 8 }}
          >清空数据并重载</button>
          <button className="btn" onClick={() => location.reload()}>仅刷新页面</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEWS: Record<ViewKey, () => ReactNode> = {
  dashboard: () => <DashboardView />,
  projects: () => <ProjectsView />,
  references: () => <ReferencesView />,
  pipeline: () => <PipelineView />,
  tables: () => <TablesView />,
  statTools: () => <StatToolsView />,
  clinicalData: () => <ClinicalDataView />,
  aiChat: () => <AIChatView />,
  settings: () => <SettingsView />,
  tools: () => <ToolsView />,
  skills: () => <SkillsView />,
  notes: () => <NotesView />,
};

export default function App() {
  const { currentView, theme, mode, density, setLLMConfig } = useAppStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  // A local build may opt into direct AI requests through .env.local.  This
  // overwrites stale UI configuration on every launch and keeps keys out of
  // persisted browser state.
  useEffect(() => {
    const environmentLLM = readEnvironmentLLM();
    setLLMConfig(environmentLLM.config);
  }, [setLLMConfig]);

  useEffect(() => {
    if (currentView === 'pipeline') {
      try { sessionStorage.setItem('visited-pipeline', 'true'); } catch { /* Storage is optional. */ }
    }
  }, [currentView]);

  const renderView = VIEWS[currentView] ?? VIEWS.dashboard;

  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <MobileShell />
          <ErrorBoundary>{renderView()}</ErrorBoundary>
          <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
            Selenyx {APP_VERSION}<span style={{ marginLeft: 8 }}>· 本地工作区 · 前端+后端</span>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
