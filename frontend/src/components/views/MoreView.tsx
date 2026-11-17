/**
 * 工具与统计：科研工具箱、多维数据表、统计计算与检验。
 */

import { lazy, Suspense } from 'react';
import { useAppStore, type MoreTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';

const ToolsView = lazy(() => import('@components/views/ToolsView').then((m) => ({ default: m.ToolsView })));
const TablesView = lazy(() => import('@components/views/TablesView').then((m) => ({ default: m.TablesView })));
const StatToolsView = lazy(() => import('@components/views/StatToolsView').then((m) => ({ default: m.StatToolsView })));

const TABS: { key: MoreTab; label: string; icon: IconName }[] = [
  { key: 'tools', label: '工具箱', icon: 'blueprint' },
  { key: 'tables', label: '科研数据表', icon: 'tables' },
  { key: 'statTools', label: '统计与检验', icon: 'statTools' },
];

export function MoreView() {
  const { moreTab, setMoreTab } = useAppStore();
  const tab = moreTab === 'widgets' ? 'statTools' : moreTab === 'files' ? 'tables' : moreTab;

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="工具与统计">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`tabbar-btn ${tab === item.key ? 'active' : ''}`}
            onClick={() => setMoreTab(item.key)}
          >
            <Icon name={item.icon} size={15} /> {item.label}
          </button>
        ))}
      </div>
      <div className="tabbed-panel" role="tabpanel">
        <Suspense fallback={<div className="view-loading-skeleton" role="status">正在加载工具模块…</div>}>
          {tab === 'tables' && <TablesView />}
          {tab === 'statTools' && <StatToolsView />}
          {tab === 'tools' && <ToolsView />}
        </Suspense>
      </div>
    </div>
  );
}
