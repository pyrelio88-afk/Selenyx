import { useEffect, useState, Component, type ReactNode } from 'react';
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
import { clearSelenyxBrowserStorage, startNativeWorkspaceSnapshots } from '@services/workspaceBackup';
import { localApi } from '@services/api';
import { isDesktopTauri } from '@services/nativeRuntime';
import './styles/tokens.css';

export type { ViewKey } from '@stores/appStore';

const APP_VERSION = '0.01 · 2026-08-07';

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
            如反复出现，可清除 Selenyx 的浏览器缓存后重启；已导出的 JSON 和桌面本机快照不会被此操作改写。
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
  const { currentView, theme, mode, density, setView } = useAppStore();
  const [desktopBackend, setDesktopBackend] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [backendProbeAttempt, setBackendProbeAttempt] = useState(0);
  const [hasCompletedDesktopProbe, setHasCompletedDesktopProbe] = useState(false);
  const desktopRuntime = isDesktopTauri();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  useEffect(() => startNativeWorkspaceSnapshots(), []);

  // The UI remains local-first if the sidecar is unavailable, but users must
  // never be left guessing why AI or SQLite-backed operations are offline.
  useEffect(() => {
    if (!desktopRuntime) {
      setDesktopBackend('ready');
      setHasCompletedDesktopProbe(false);
      return;
    }
    let active = true;
    setDesktopBackend('checking');
    void localApi.health()
      .then(() => {
        if (!active) return;
        setDesktopBackend('ready');
        setHasCompletedDesktopProbe(true);
      })
      .catch(() => {
        if (!active) return;
        setDesktopBackend('offline');
        setHasCompletedDesktopProbe(true);
      });
    return () => { active = false; };
  }, [backendProbeAttempt, desktopRuntime]);

  // P0-6: 标记用户进入过科研流水线页
  useEffect(() => {
    if (currentView === 'pipeline') {
      try { sessionStorage.setItem('visited-pipeline', 'true'); } catch { /* */ }
    }
  }, [currentView]);

  const renderView = VIEWS[currentView] ?? VIEWS.dashboard;

  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <MobileShell />
          {desktopRuntime && (desktopBackend === 'offline' || (hasCompletedDesktopProbe && desktopBackend === 'checking')) && (
            <div
              role="status"
              aria-live="polite"
              aria-busy={desktopBackend === 'checking'}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                margin: '12px 16px 0', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--warning, #b7791f)', background: 'var(--warning-light, #fff8e6)',
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              <strong>{desktopBackend === 'checking' ? '正在检查本机服务' : '本机服务暂不可用'}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>
                {desktopBackend === 'checking'
                  ? '正在确认本机 AI 与 SQLite 服务状态…'
                  : '项目与文献仍保存在本机；AI 对话和本机 SQLite 服务暂时离线。'}
              </span>
              <button className="btn btn-sm" disabled={desktopBackend === 'checking'} onClick={() => setBackendProbeAttempt((attempt) => attempt + 1)}>
                {desktopBackend === 'checking' ? '检查中…' : '重试'}
              </button>
              <button className="btn btn-sm" onClick={() => setView('settings')}>查看设置</button>
            </div>
          )}
          <ErrorBoundary>
            {renderView()}
          </ErrorBoundary>
          {/* D4: 版本号 */}
          <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
            Selenyx {APP_VERSION}
            <span style={{ marginLeft: 8 }}>· 本机工作区 · 本地优先</span>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
