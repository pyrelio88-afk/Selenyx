import { useEffect, Component, type ReactNode } from 'react';
import { Sidebar } from '@components/layout/Sidebar';
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
import { useAppStore, type ViewKey } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';
import './styles/tokens.css';

export type { ViewKey } from '@stores/appStore';

const APP_VERSION = 'R101 · 2026-08-06';

// D5: ErrorBoundary — 渲染异常时显示可恢复的错误页而非白屏
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
            如反复出现，可尝试清空本地数据（不会影响已保存到云端的文献）
          </p>
          <button
            className="btn btn-primary"
            onClick={() => { try { localStorage.clear(); } catch { /* */ } location.reload(); }}
            style={{ marginRight: 8 }}
          >清空数据并重载</button>
          <button className="btn" onClick={() => location.reload()}>仅刷新页面</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEWS: Record<ViewKey, () => React.ReactNode> = {
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
};

export default function App() {
  const { currentView, theme, mode, density } = useAppStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  // P0-6: 标记用户进入过科研流水线页
  useEffect(() => {
    if (currentView === 'pipeline') {
      try { sessionStorage.setItem('visited-pipeline', 'true'); } catch { /* */ }
    }
  }, [currentView]);

  const CurrentView = VIEWS[currentView] ?? VIEWS.dashboard;

  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <ErrorBoundary>
            {CurrentView()}
          </ErrorBoundary>
          {/* D4: 版本号 */}
          <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
            Selenyx {APP_VERSION}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
