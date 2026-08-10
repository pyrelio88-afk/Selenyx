/**
 * 知识库（v4）：单入口容器，页内 tab——
 * 文献 / 文档·笔记 / 证据卡 / 表格 / 临床数据 / 图片·文件。
 * 侧边栏不展开子项；旧深链（references/notes/tables/clinicalData）经 setView 归一化落到对应 tab。
 */

import { useAppStore, type LibraryTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { ReferencesView } from '@components/views/ReferencesView';
import { NotesView } from '@components/views/NotesView';
import { TablesView } from '@components/views/TablesView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { EvidenceReviewPanel } from '@components/library/EvidenceReview';

const TABS: { key: LibraryTab; label: string; icon: IconName }[] = [
  { key: 'references', label: '文献', icon: 'references' },
  { key: 'notes', label: '文档·笔记', icon: 'notes' },
  { key: 'evidence', label: '证据卡', icon: 'stageEvidence' },
  { key: 'tables', label: '表格', icon: 'tables' },
  { key: 'clinical', label: '临床数据', icon: 'clinicalData' },
  { key: 'files', label: '图片·文件', icon: 'import' },
];

function FilesTabPlaceholder() {
  return (
    <div className="card v4-placeholder">
      <h2><Icon name="import" size={18} /> 图片·文件</h2>
      <p>课题相关的图片与附件集中管理将随「读写闭环 + 工件」模块上线；PDF 全文目前可在文献详情内查看。</p>
    </div>
  );
}

export function LibraryView() {
  const { libraryTab, setLibraryTab } = useAppStore();

  return (
    <div className="tabbed-view">
      <div className="tabbar" role="tablist" aria-label="知识库">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={libraryTab === tab.key}
            className={`tabbar-btn ${libraryTab === tab.key ? 'active' : ''}`}
            onClick={() => setLibraryTab(tab.key)}
          >
            <Icon name={tab.icon} size={15} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="tabbed-panel" role="tabpanel">
        {libraryTab === 'references' && <ReferencesView />}
        {libraryTab === 'notes' && <NotesView />}
        {libraryTab === 'evidence' && <EvidenceReviewPanel />}
        {libraryTab === 'tables' && <TablesView />}
        {libraryTab === 'clinical' && <ClinicalDataView />}
        {libraryTab === 'files' && <FilesTabPlaceholder />}
      </div>
    </div>
  );
}
