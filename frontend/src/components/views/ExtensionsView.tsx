/**
 * 专家与扩展：角色化专家、本机技能与学术/MCP 连接器。
 */

import { lazy, Suspense } from 'react';
import { useAppStore, type ExtensionsTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';

const ExpertsView = lazy(() => import('@components/views/ExpertsView').then((m) => ({ default: m.ExpertsView })));
const SkillsView = lazy(() => import('@components/views/SkillsView').then((m) => ({ default: m.SkillsView })));
const ConnectorsView = lazy(() => import('@components/views/ConnectorsView').then((m) => ({ default: m.ConnectorsView })));

const TABS: { key: ExtensionsTab; label: string; icon: IconName }[] = [
  { key: 'experts', label: '研究专家', icon: 'sparkles' },
  { key: 'skills', label: '科研技能', icon: 'skills' },
  { key: 'connectors', label: '连接器与 MCP', icon: 'connector' },
];

export function ExtensionsView() {
  const { extensionsTab, setExtensionsTab } = useAppStore();

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="专家与扩展">
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
        <Suspense fallback={<div className="view-loading-skeleton" role="status">正在加载扩展模块…</div>}>
          {extensionsTab === 'experts' && <ExpertsView />}
          {extensionsTab === 'skills' && <SkillsView />}
          {extensionsTab === 'connectors' && <ConnectorsView />}
        </Suspense>
      </div>
    </div>
  );
}
