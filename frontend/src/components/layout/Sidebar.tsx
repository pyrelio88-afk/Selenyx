import { useEffect, useRef, useState } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { Crane } from '@components/ui/Crane';
import { useLocalBackendStatus } from '@components/layout/useLocalBackendStatus';
import { UserPanel } from '@components/layout/UserPanel';
import { CHAT_CHANGED_EVENT, listRecentConversations, type RecentConversation } from '@components/assistant/recentConversations';

const NAV_ITEMS: { key: ViewKey; label: string; icon: IconName; hint: string }[] = [
  { key: 'tasks', label: '研究记录', icon: 'list', hint: '进度、确认与成果' },
  { key: 'library', label: '文献与证据', icon: 'references', hint: '文献、证据与笔记' },
];

const RESEARCH_TOOLS: { key: ViewKey; label: string; icon: IconName; hint: string }[] = [
  { key: 'more', label: '工具与统计', icon: 'chart', hint: '工具、表格与统计' },
  { key: 'automations', label: '定时任务', icon: 'calendar', hint: '按时间自动运行研究' },
  { key: 'extensions', label: '专家与技能', icon: 'connector', hint: '专家、技能与连接器' },
];

const CHAT_BUSY_HINT = '正在生成回复，请等待完成或停止生成后再切换对话';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const {
    currentView, setView, requestNewTask, sidebarCollapsed, toggleSidebar,
    projects, currentProjectId, setCurrentProject, requestCreateProject, requestChatOpen, chatStreamBusy,
    openKnowledgeSearch,
  } = useAppStore();
  const backend = useLocalBackendStatus();
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [toolsOpen, setToolsOpen] = useState(() => RESEARCH_TOOLS.some((item) => item.key === currentView));
  const [chatsOpen, setChatsOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const toolsActive = RESEARCH_TOOLS.some((item) => item.key === currentView);
  const showLabels = !sidebarCollapsed || mobileOpen;
  const recentProjects = projects.filter((project) => project.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      sidebarRef.current?.querySelector<HTMLElement>('.sidebar-new-task')?.focus();
    });
    const close = () => {
      onMobileOpenChange(false);
      mobileToggleRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        sidebarRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 640) {
        onMobileOpenChange(false);
        window.requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>('.v4-brand-actions button')?.focus());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen, onMobileOpenChange]);

  useEffect(() => {
    const refresh = () => {
      try {
        setRecent(listRecentConversations(Object.keys(localStorage), localStorage, 8)
          .filter((chat) => chat.scope === 'global' || projects.some((project) => project.id === chat.scope)));
      } catch { setRecent([]); }
    };
    refresh();
    window.addEventListener(CHAT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHAT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [projects]);

  const closeMobileNavigation = () => {
    if (!mobileOpen) return;
    onMobileOpenChange(false);
    mobileToggleRef.current?.focus();
  };
  const search = () => { openKnowledgeSearch(); closeMobileNavigation(); };
  const navigate = (view: ViewKey) => { setView(view); closeMobileNavigation(); };

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar workspace-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      aria-label={mobileOpen ? undefined : 'Selenyx 侧栏'}
      aria-labelledby={mobileOpen ? 'sidebar-dialog-title' : undefined}
      aria-modal={mobileOpen || undefined}
      role={mobileOpen ? 'dialog' : undefined}
      tabIndex={-1}
    >
      <div className="workspace-brand v4-brand">
        <span className="workspace-brand-mark sidebar-desktop-mark" aria-hidden="true"><Crane size={38} /></span>
        <button ref={mobileToggleRef} type="button" className="workspace-brand-mark sidebar-mobile-toggle"
          aria-label={mobileOpen ? '收起侧栏' : '展开侧栏'} aria-expanded={mobileOpen} aria-controls="sidebar-main-content"
          onClick={() => onMobileOpenChange(!mobileOpen)} title={mobileOpen ? '收起侧栏' : '展开侧栏'}>
          <Crane size={38} />
        </button>
        {showLabels && <div className="v4-brand-copy"><div id="sidebar-dialog-title" className="workspace-brand-name">Selenyx 导航</div><span className="workspace-brand-caption">科研工作台</span></div>}
        {mobileOpen && <button type="button" className="sidebar-mobile-close" aria-label="收起侧栏" onClick={closeMobileNavigation}><Icon name="chevronLeft" size={16} /></button>}
        <div className="v4-brand-actions">
          <button type="button" className="icon-btn" onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}>
            <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </button>
        </div>
      </div>
      <div id="sidebar-main-content" className="sidebar-main-content">

      <button type="button" className={`sidebar-new-task${currentView === 'newTask' ? ' is-active' : ''}`} onClick={() => { requestNewTask(); closeMobileNavigation(); }} aria-label="新研究" aria-current={currentView === 'newTask' ? 'page' : undefined} title="新研究（Ctrl+N）">
        <Icon name="plus" size={18} />
        {showLabels && <><span>新研究</span><kbd>Ctrl N</kbd></>}
      </button>
      <button type="button" className="sidebar-search" onClick={search} aria-label="搜索工作区" title="搜索工作区（快捷键 K / Ctrl+K）">
        <Icon name="search" size={16} />
        {showLabels && <><span className="sidebar-search-label">搜索工作区</span><kbd>K</kbd></>}
      </button>

      <nav className="sidebar-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} type="button"
            className={`nav-item ${currentView === item.key ? 'active' : ''}`}
            onClick={() => navigate(item.key)} aria-label={item.label}
            aria-current={currentView === item.key ? 'page' : undefined} title={item.hint}>
            <span className="icon"><Icon name={item.icon} size={17} /></span>
            {showLabels && <span className="nav-item-label">{item.label}</span>}
          </button>
        ))}
        <button type="button" className={`nav-item sidebar-compact-project ${currentView === 'projects' ? 'active' : ''}`}
          onClick={() => navigate('projects')} aria-label="研究项目"
          aria-current={currentView === 'projects' ? 'page' : undefined} title="研究项目">
          <span className="icon"><Icon name="projects" size={17} /></span>
        </button>
        <button type="button" className={`nav-item sidebar-tools-trigger ${toolsActive ? 'active' : ''}`}
          aria-label="更多工具" aria-expanded={toolsOpen} aria-controls="sidebar-research-tools"
          onClick={() => setToolsOpen((open) => !open)} title="工具与统计、定时任务、专家与技能">
          <span className="icon"><Icon name="more" size={17} /></span>
          {showLabels && <><span className="nav-item-label">更多工具</span><Icon name="chevronDown" size={13} /></>}
        </button>
        {toolsOpen && <div id="sidebar-research-tools" className="sidebar-tools-list">
          {RESEARCH_TOOLS.map((item) => (
            <button key={item.key} type="button" className={`nav-item ${currentView === item.key ? 'active' : ''}`}
              onClick={() => navigate(item.key)} aria-label={item.label}
              aria-current={currentView === item.key ? 'page' : undefined} title={item.hint}>
              <span className="icon"><Icon name={item.icon} size={17} /></span>
              {showLabels && <span className="nav-item-label">{item.label}</span>}
            </button>
          ))}
        </div>}
      </nav>

      {showLabels && (
        <div className="sidebar-dynamic">
          <section className="dynamic-section" aria-label="研究项目">
            <div className="sidebar-section-heading sidebar-project-heading">
              <button type="button" className={`sidebar-section-link ${currentView === 'projects' ? 'is-current' : ''}`}
                onClick={() => navigate('projects')} aria-current={currentView === 'projects' ? 'page' : undefined}>
                <Icon name="projects" size={16} /> 研究项目
              </button>
              <button type="button" onClick={() => { requestCreateProject(); closeMobileNavigation(); }} aria-label="新建项目" title="新建项目"><Icon name="plus" size={14} /></button>
            </div>
            {recentProjects.map((project) => (
              <button key={project.id} type="button" className={`dynamic-item sidebar-project-item ${currentView === 'projects' && currentProjectId === project.id ? 'is-current' : ''}`}
                onClick={() => { setCurrentProject(project.id); navigate('projects'); }} title={project.name}>
                <span className="dynamic-item-text">{project.name}</span>
              </button>
            ))}
          </section>
          {recent.length > 0 && <section className="dynamic-section" aria-label="最近对话">
            <button type="button" className="sidebar-section-heading sidebar-section-toggle" aria-expanded={chatsOpen}
              onClick={() => setChatsOpen((open) => !open)}>
              <span>最近对话</span><Icon name="chevronDown" size={13} />
            </button>
            {chatsOpen && recent.map((chat) => (
              <button key={`${chat.scope}:${chat.sessionId}`} type="button" className="dynamic-item"
                onClick={() => { requestChatOpen(chat.scope, chat.sessionId); closeMobileNavigation(); }} disabled={chatStreamBusy}
                title={chatStreamBusy ? `${chat.title} · ${CHAT_BUSY_HINT}` : chat.title}
                aria-label={chatStreamBusy ? `${chat.title}，${CHAT_BUSY_HINT}` : chat.title}>
                <Icon name="aiChat" size={15} /><span className="dynamic-item-text">{chat.title}</span>
              </button>
            ))}
          </section>}
        </div>
      )}
      </div>

      <div className="workspace-sidebar-footer v4-footer">
        {showLabels && (
          <div className={`workspace-local-status is-${backend.tone}`} role="status" aria-live="polite" title={backend.label}>
            <span className="workspace-status-dot" aria-hidden="true" />
            <span className="workspace-local-status-label">{backend.label}</span>
          </div>
        )}
        <UserPanel collapsed={!showLabels} />
      </div>
    </aside>
  );
}
