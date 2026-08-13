/**
 * 知识库：文献 / 证据卡 / 文档·笔记 / 临床数据。
 * 表格在「工具」；PDF 附件随文献条目打开，避免虚构一个独立文件库。
 */

import { useAppStore, type LibraryTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { ReferencesView } from '@components/views/ReferencesView';
import { NotesView } from '@components/views/NotesView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { EvidenceReviewPanel } from '@components/library/EvidenceReview';

const TABS: { key: LibraryTab; label: string; icon: IconName }[] = [
  { key: 'references', label: '文献', icon: 'references' },
  { key: 'evidence', label: '证据卡', icon: 'stageEvidence' },
  { key: 'notes', label: '文档·笔记', icon: 'notes' },
  { key: 'clinical', label: '临床数据', icon: 'clinicalData' },
];

export function LibraryView() {
  const { libraryTab, setLibraryTab, setView } = useAppStore();
  const tab = libraryTab === 'tables' || libraryTab === 'files' ? 'references' : libraryTab;

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
        {tab === 'references' && <ReferencesView />}
        {tab === 'notes' && <NotesView />}
        {tab === 'evidence' && <EvidenceReviewPanel />}
        {tab === 'clinical' && <ClinicalDataView />}
        {(libraryTab === 'tables' || libraryTab === 'files') && (
          <p className="v4-placeholder">
            {libraryTab === 'tables' ? '表格已移到' : '此旧入口不再提供独立文件库；PDF 附件可在文献详情中打开。'}
            <button type="button" className="btn" onClick={() => setView(libraryTab === 'tables' ? 'tables' : 'references')}>
              {libraryTab === 'tables' ? '工具' : '文献'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
