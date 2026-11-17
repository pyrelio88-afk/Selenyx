/**
 * 知识库：文献 / 证据卡 / 文档·笔记 / 学科资料。
 * 各子面板按需异步加载，避免首帧同步拉起 PDF/WASM 与全学科词库。
 */

import { lazy, Suspense } from 'react';
import { useAppStore, type LibraryTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';

const ReferencesView = lazy(() => import('@components/views/ReferencesView').then((m) => ({ default: m.ReferencesView })));
const EvidenceReviewPanel = lazy(() => import('@components/library/EvidenceReview').then((m) => ({ default: m.EvidenceReviewPanel })));
const NotesView = lazy(() => import('@components/views/NotesView').then((m) => ({ default: m.NotesView })));
const ClinicalDataView = lazy(() => import('@components/views/ClinicalDataView').then((m) => ({ default: m.ClinicalDataView })));

const TABS: { key: LibraryTab; label: string; icon: IconName; badgeKey?: 'evidence' }[] = [
  { key: 'references', label: '文献', icon: 'references' },
  { key: 'evidence', label: '证据卡', icon: 'stageEvidence', badgeKey: 'evidence' },
  { key: 'notes', label: '文档·笔记', icon: 'notes' },
  { key: 'clinical', label: '学科资料', icon: 'clinicalData' },
];

export function LibraryView() {
  const { libraryTab, setLibraryTab } = useAppStore();
  const tab: LibraryTab = libraryTab === 'tables' || libraryTab === 'files' ? 'references' : libraryTab;

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="知识库">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`tabbar-btn ${tab === item.key ? 'active' : ''}`}
            onClick={() => setLibraryTab(item.key)}
          >
            <Icon name={item.icon} size={15} /> {item.label}
          </button>
        ))}
      </div>

      <div className="tabbed-panel" role="tabpanel">
        <Suspense fallback={<div className="view-loading-skeleton" role="status">正在加载知识库模块…</div>}>
          {tab === 'references' && <ReferencesView />}
          {tab === 'evidence' && <EvidenceReviewPanel />}
          {tab === 'notes' && <NotesView />}
          {tab === 'clinical' && <ClinicalDataView />}
        </Suspense>
      </div>
    </div>
  );
}
