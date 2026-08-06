/**
 * MobileShell — 移动端外壳：TopBar(56px) + Drawer(左滑出导航)
 * 依据 Selenyx Mobile Spec v1 (UI设计师)：
 *   - TopBar: hamburger(44px热区) + 视图标题 + 日夜切换(44px热区)
 *   - Drawer: 280px 宽(≤85% 视口), 行高 48px, 遮罩 rgba(0,0,0,0.4), 点遮罩/选项关闭
 *   - 桌面 ≤768px 时隐藏常驻 Sidebar, 改用本组件
 * 复用 Sidebar 的 NAV_GROUPS, 不重复维护导航数据。
 */
import { useEffect, useState } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { NAV_GROUPS } from '@components/layout/Sidebar';
import { Icon, NAV_ICONS } from '@components/ui/Icon';

const VIEW_LABELS: Record<ViewKey, string> = (() => {
  const m: Partial<Record<ViewKey, string>> = {};
  for (const g of NAV_GROUPS) for (const it of g.items) m[it.key] = it.label;
  return m as Record<ViewKey, string>;
})();

export function MobileShell() {
  const { currentView, setView, mode, toggleMode } = useAppStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDark = mode === 'dark';

  // 视图切换时关闭抽屉
  useEffect(() => { setDrawerOpen(false); }, [currentView]);

  // 抽屉打开时锁 body 滚动
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [drawerOpen]);

  const title = VIEW_LABELS[currentView] || 'Selenyx';

  return (
    <>
      {/* TopBar */}
      <header className="mobile-topbar" role="banner">
        <button
          className="mobile-topbar-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开导航菜单"
          aria-expanded={drawerOpen}
        >
          <Icon name="menu" size={22} strokeWidth={2} />
        </button>
        <span className="mobile-topbar-title">{title}</span>
        <button
          className="mobile-topbar-btn"
          onClick={toggleMode}
          aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={20} />
        </button>
      </header>

      {/* Drawer + 遮罩 */}
      {drawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}
      <nav
        className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}
        aria-label="移动端导航"
        aria-hidden={!drawerOpen}
      >
        <div className="mobile-drawer-header">
          <Icon name="moon" size={20} strokeWidth={1.8} />
          <span>Selenyx</span>
        </div>
        <div className="mobile-drawer-body">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="mobile-drawer-group">
              {group.label && <div className="mobile-drawer-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={`mobile-drawer-item ${currentView === item.key ? 'active' : ''}`}
                  onClick={() => setView(item.key)}
                  aria-current={currentView === item.key ? 'page' : undefined}
                >
                  <span className="icon"><Icon name={NAV_ICONS[item.key]} size={18} /></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
