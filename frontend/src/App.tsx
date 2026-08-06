import { useEffect, useState, Component, type ReactNode } from 'react';
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

const APP_VERSION = 'R108 · 2026-08-07';

// D6: 应用内版本自动校验 —— 单文件 SPA 浏览器强缓存，加载时比对远端最新构建标记，不一致弹 banner 自动刷新
// 注意：字面量直接写入赋值（不经 const），确保 terser 不混淆、远端 HTML 正则可提取
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, string>).__SELENYX_BUILD__ = 'R108-r10-2026-08-07';
}

function VersionChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    // 每会话只查一次，避免 reload 循环
    if (sessionStorage.getItem('selenyx_version_checked')) return;
    sessionStorage.setItem('selenyx_version_checked', '1');
    const currentBuild = (window as unknown as Record<string, string>).__SELENYX_BUILD__;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(location.href, { cache: 'no-store' });
        const html = await res.text();
        const m = html.match(/__SELENYX_BUILD__=["']([^"']+)["']/);
        if (m && m[1] !== currentBuild && !cancelled) setUpdateAvailable(true);
      } catch { /* 离线或鉴权失败，静默 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!updateAvailable) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); location.reload(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [updateAvailable]);

  if (!updateAvailable) return null;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '8px 16px', flexWrap: 'wrap',
      background: 'var(--accent, #1565c0)', color: '#fff', fontSize: 13,
    }}>
      <span>检测到新版本，{countdown} 秒后自动刷新</span>
      <button onClick={() => location.reload()} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>立即刷新</button>
      <button onClick={() => setUpdateAvailable(false)} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>稍后</button>
    </div>
  );
}

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
          <VersionChecker />
          <ErrorBoundary>
            {CurrentView()}
          </ErrorBoundary>
          {/* D4: 版本号 */}
          <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
            Selenyx {APP_VERSION}
            <span style={{ marginLeft: 8 }}>· 自动检测新版本，若未更新请按 Ctrl+Shift+R 强制刷新</span>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
