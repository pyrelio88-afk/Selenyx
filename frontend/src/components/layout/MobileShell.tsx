import { useEffect, useRef, useState } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { NAV_GROUPS } from '@components/layout/Sidebar';
import { useLocalBackendStatus } from '@components/layout/useLocalBackendStatus';
import { Icon, NAV_ICONS } from '@components/ui/Icon';

const VIEW_LABELS: Record<ViewKey, string> = (() => {
  const labels: Partial<Record<ViewKey, string>> = {};
  for (const group of NAV_GROUPS) {
    for (const item of group.items) labels[item.key] = item.label;
  }
  return labels as Record<ViewKey, string>;
})();

const QUICK_NAV: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: '总览' },
  { key: 'pipeline', label: '流水线' },
  { key: 'references', label: '文献' },
  { key: 'aiChat', label: 'AI' },
];

function focusMainContent() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-main')?.focus());
}

export function MobileShell() {
  const {
    currentView, setView, mode, toggleMode,
  } = useAppStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isDark = mode === 'dark';
  const backend = useLocalBackendStatus();
  const title = VIEW_LABELS[currentView] || 'Selenyx';
  const isQuickView = QUICK_NAV.some((item) => item.key === currentView);

  function closeDrawer({ restoreFocus = true } = {}) {
    setDrawerOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function navigate(view: ViewKey) {
    setView(view);
    setDrawerOpen(false);
    focusMainContent();
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const content = document.querySelector<HTMLElement>('.app-view-region');
    document.body.style.overflow = 'hidden';
    content?.setAttribute('inert', '');
    content?.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      content?.removeAttribute('inert');
      content?.removeAttribute('aria-hidden');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="mobile-topbar">
        <button
          ref={menuButtonRef}
          className="mobile-topbar-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开全部导航"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls="mobile-navigation-drawer"
        >
          <Icon name="menu" size={22} strokeWidth={2} />
        </button>
        <div className="mobile-topbar-copy">
          <strong>{title}</strong>
          <span>Selenyx</span>
        </div>
        <button
          className="mobile-topbar-btn"
          onClick={toggleMode}
          aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={20} />
        </button>
      </header>

      {drawerOpen && (
        <>
          <button
            className="mobile-drawer-overlay"
            onClick={() => closeDrawer()}
            aria-label="关闭导航菜单"
            tabIndex={-1}
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            className="mobile-drawer open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
          >
            <div className="mobile-drawer-header">
              <div className="mobile-drawer-brand">
                <img className="mobile-drawer-brand-crane" src="/brand/selenyx-crane.png" alt="" aria-hidden="true" />
                <span id="mobile-navigation-title">Selenyx</span>
              </div>
              <button
                ref={closeButtonRef}
                className="mobile-drawer-close"
                onClick={() => closeDrawer()}
                aria-label="关闭导航菜单"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <nav className="mobile-drawer-body" aria-label="全部工作区">
              {NAV_GROUPS.map((group) => (
                <section key={group.label} className="mobile-drawer-group" aria-labelledby={`mobile-group-${group.label}`}>
                  <div id={`mobile-group-${group.label}`} className="mobile-drawer-group-label">{group.label}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      className={`mobile-drawer-item ${currentView === item.key ? 'active' : ''}`}
                      onClick={() => navigate(item.key)}
                      aria-current={currentView === item.key ? 'page' : undefined}
                    >
                      <span className="icon"><Icon name={NAV_ICONS[item.key]} size={18} /></span>
                      <span className="mobile-drawer-item-copy">
                        <strong>{item.label}</strong>
                        {item.hint && <small>{item.hint}</small>}
                      </span>
                    </button>
                  ))}
                </section>
              ))}
            </nav>

            <div className={`mobile-local-status is-${backend.tone}`} role="status" aria-live="polite">
              <span className="workspace-status-dot" aria-hidden="true" />
              <span>{backend.label}</span>
            </div>
          </aside>
        </>
      )}

      <nav className="mobile-bottom-nav" aria-label="移动端快捷导航">
        {QUICK_NAV.map((item) => (
          <button
            key={item.key}
            className={currentView === item.key ? 'active' : ''}
            onClick={() => navigate(item.key)}
            aria-current={currentView === item.key ? 'page' : undefined}
          >
            <Icon name={NAV_ICONS[item.key]} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          className={!isQuickView ? 'active' : ''}
          onClick={() => setDrawerOpen(true)}
          aria-label="打开更多功能"
          aria-expanded={drawerOpen}
          aria-controls="mobile-navigation-drawer"
        >
          <Icon name="menu" size={20} />
          <span>更多</span>
        </button>
      </nav>
    </>
  );
}
