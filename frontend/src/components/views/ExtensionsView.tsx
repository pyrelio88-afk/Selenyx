/**
 * 扩展（v4）：专家 · 技能 · 连接器 三合一容器，页内 tab。
 */

import { useAppStore, type ExtensionsTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { ExpertsView } from '@components/views/ExpertsView';
import { SkillsView } from '@components/views/SkillsView';
import { ConnectorsView } from '@components/views/ConnectorsView';

const TABS: { key: ExtensionsTab; label: string; icon: IconName }[] = [
  { key: 'experts', label: '专家', icon: 'sparkles' },
  { key: 'skills', label: '技能', icon: 'skills' },
  { key: 'connectors', label: '连接器', icon: 'globe' },
];

export function ExtensionsView() {
  const { extensionsTab, setExtensionsTab } = useAppStore();

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="扩展">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={extensionsTab === tab.key}
            className={`tabbar-btn ${extensionsTab === tab.key ? 'active' : ''}`}
            onClick={() => setExtensionsTab(tab.key)}
          >
            <Icon name={tab.icon} size={15} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="tabbed-panel" role="tabpanel">
        {extensionsTab === 'experts' && <ExpertsView />}
        {extensionsTab === 'skills' && <SkillsView />}
        {extensionsTab === 'connectors' && <ConnectorsView />}
      </div>
    </div>
  );
}
