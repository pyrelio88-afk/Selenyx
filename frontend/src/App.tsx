import { useEffect, useState, Component, type ReactNode } from 'react';
import { Sidebar } from '@components/layout/Sidebar';
import { NewTaskHome } from '@components/views/NewTaskHome';
import { LibraryView } from '@components/views/LibraryView';
import { ExtensionsView } from '@components/views/ExtensionsView';
import { MoreView } from '@components/views/MoreView';
import { PipelineView } from '@components/views/PipelineView';
import { ProjectsView } from '@components/views/ProjectsView';
import { AIChatView } from '@components/views/AIChatView';
import { TasksView } from '@components/views/TasksView';
import { AutomationsView } from '@components/views/AutomationsView';
import { SettingsModal } from '@components/settings/SettingsModal';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';
import { clearSelenyxBrowserStorage } from '@services/workspaceBackup';
import { readEnvironmentLLM } from '@services/envLLM';
import { isDesktopTauri, setPetVisible } from '@services/nativeRuntime';
import { PetCompanionBridge } from '@components/pet/PetCompanionBridge';
import { bootstrapReferenceRepository } from '@services/referenceRepository';
import { bootstrapWorkspaceRepository } from '@services/workspaceRepository';
import './styles/tokens.css';
import './styles/shell-v4.css';

export type { ViewKey } from '@stores/appStore';

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
  newTask: () => <NewTaskHome />,
  assistant: () => <AIChatView />,
  projects: () => <ProjectsView />,
  library: () => <LibraryView />,
  extensions: () => <ExtensionsView />,
  automations: () => <AutomationsView />,
  more: () => <MoreView />,
  // 不在侧边栏一级导航、经深链进入的视图
  tasks: () => <TasksView />,
  pipeline: () => <PipelineView />,
};

export default function App() {
  const {
    currentView, theme, mode, density, setLLMConfig, petEnabled, fontScale, setView,
    openSettings, closeSettings,
    replaceReferences, setReferenceSync, replaceWorkspace, setWorkspaceSync,
  } = useAppStore();
  // 桌面桌宠窗口创建失败（如 Wayland 透明支持不佳）时降级为应用内漂浮鹤
  const [petWindowFailed, setPetWindowFailed] = useState(false);
  const desktopPetActive = petEnabled && isDesktopTauri() && !petWindowFailed;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  // v4 通用设置：界面缩放（字体大小滑杆）
  useEffect(() => {
    document.body.style.setProperty('zoom', String(fontScale));
    return () => { document.body.style.removeProperty('zoom'); };
  }, [fontScale]);

  // v4 全局快捷键：Ctrl+, 设置弹窗；Ctrl+N 新建任务主页；Esc 关闭弹窗
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        if (useAppStore.getState().settingsOpen) closeSettings();
        else openSettings();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'n' || event.key === 'N')) {
        event.preventDefault();
        setView('newTask');
        return;
      }
      if (event.key === 'Escape' && useAppStore.getState().settingsOpen) {
        closeSettings();
        return;
      }
      // K 全局检索（侧栏搜索框的键帽提示）：输入中/设置弹窗打开时不抢键；
      // 知识库·证据卡 tab 的 J/K 裁决优先，那里不触发跳转。
      if ((event.key === 'k' || event.key === 'K') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
        const state = useAppStore.getState();
        const adjudicating = state.currentView === 'library' && state.libraryTab === 'evidence';
        if (!typing && !state.settingsOpen && !adjudicating) {
          event.preventDefault();
          setView('references');
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSettings, closeSettings, setView]);

  // A local build may opt into direct AI requests through .env.local.  This
  // overwrites stale UI configuration on every launch and keeps keys out of
  // persisted browser state.
  useEffect(() => {
    const environmentLLM = readEnvironmentLLM();
    setLLMConfig(environmentLLM.config);
  }, [setLLMConfig]);

  // Reconcile the offline cache with the lossless SQLite mirror once per app
  // launch.  Failure is non-fatal: the user can continue locally and the next
  // successful launch will upload those mutations.
  useEffect(() => {
    setReferenceSync('syncing', '正在连接本机 SQLite 与 RAG 索引…');
    void bootstrapReferenceRepository(useAppStore.getState().references).then((result) => {
      replaceReferences(result.references);
      setReferenceSync(result.status, result.message);
    });
  }, [replaceReferences, setReferenceSync]);

  // Projects and tasks form one referential unit. Reconcile them together so
  // an offline task can never reach SQLite without its stable parent id.
  useEffect(() => {
    setWorkspaceSync('syncing', '正在同步本机项目与任务…');
    const state = useAppStore.getState();
    void bootstrapWorkspaceRepository(state.projects, state.tasks).then((result) => {
      replaceWorkspace(result.projects, result.tasks);
      setWorkspaceSync(result.status, result.message);
    });
  }, [replaceWorkspace, setWorkspaceSync]);

  useEffect(() => {
    if (currentView === 'pipeline') {
      try { sessionStorage.setItem('visited-pipeline', 'true'); } catch { /* Storage is optional. */ }
    }
  }, [currentView]);

  // 仙鹤桌宠：桌面端驱动独立透明窗口；失败时降级为应用内漂浮鹤。
  useEffect(() => {
    if (!isDesktopTauri()) return;
    setPetVisible(petEnabled)
      .then(() => setPetWindowFailed(false)) // 成功路径复位，防原生窗与漂浮鹤双开
      .catch(() => {
        if (petEnabled) setPetWindowFailed(true);
      });
  }, [petEnabled]);

  const renderView = VIEWS[currentView] ?? VIEWS.newTask;

  return (
    <ThemeProvider>
      <a className="skip-to-content" href="#workspace-main">跳到主要内容</a>
      <div className="app-shell">
        <Sidebar />
        <main id="workspace-main" className="app-main" tabIndex={-1}>
          <div className="app-view-region">
            <ErrorBoundary>{renderView()}</ErrorBoundary>
          </div>
        </main>
        <PetCompanionBridge nativeActive={desktopPetActive} />
      </div>
      <SettingsModal />
    </ThemeProvider>
  );
}
