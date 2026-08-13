/**
 * 工具：表格、统计、工具箱。
 * 「更多」已并入这里；倒数日在项目卡上。
 */

import { useAppStore, type MoreTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { StatToolsView } from '@components/views/StatToolsView';
import { ToolsView } from '@components/views/ToolsView';
import { TablesView } from '@components/views/TablesView';

const TABS: { key: MoreTab; label: string; icon: IconName }[] = [
  { key: 'tools', label: '工具箱', icon: 'blueprint' },
  { key: 'tables', label: '表格', icon: 'tables' },
  { key: 'statTools', label: '统计', icon: 'statTools' },
];

export function MoreView() {
  const { moreTab, setMoreTab } = useAppStore();
  // Previous builds linked these unavailable placeholder tabs. Route persisted
  // values to a real surface rather than presenting a non-functional panel.
  const tab = moreTab === 'widgets' ? 'statTools' : moreTab === 'files' ? 'tables' : moreTab;

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="工具">
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
        {tab === 'tables' && <TablesView />}
        {tab === 'statTools' && <StatToolsView />}
        {tab === 'tools' && <ToolsView />}
      </div>
    </div>
  );
}
