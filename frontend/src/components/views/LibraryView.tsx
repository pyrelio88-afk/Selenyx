/**
 * 知识库（v4）：单入口容器，页内 tab——
 * 文献 / 文档·笔记 / 证据卡 / 表格 / 临床数据 / 图片·文件。
 * 侧边栏不展开子项；旧深链（references/notes/tables/clinicalData）经 setView 归一化落到对应 tab。
 */

import { useEffect, useState } from 'react';
import { useAppStore, type LibraryTab } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { ReferencesView } from '@components/views/ReferencesView';
import { NotesView } from '@components/views/NotesView';
import { TablesView } from '@components/views/TablesView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { evidenceApi } from '@services/api';

const TABS: { key: LibraryTab; label: string; icon: IconName }[] = [
  { key: 'references', label: '文献', icon: 'references' },
  { key: 'notes', label: '文档·笔记', icon: 'notes' },
  { key: 'evidence', label: '证据卡', icon: 'stageEvidence' },
  { key: 'tables', label: '表格', icon: 'tables' },
  { key: 'clinical', label: '临床数据', icon: 'clinicalData' },
  { key: 'files', label: '图片·文件', icon: 'import' },
];

/** 证据卡 tab 占位：真实待裁决数已可读，裁决队列随模块 A 上线 */
function EvidenceTabPlaceholder() {
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    evidenceApi.summary()
      .then((summary) => { if (!cancelled) setPending(Number(summary.pending ?? 0)); })
      .catch(() => { if (!cancelled) setPending(null); });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="card v4-placeholder">
      <h2><Icon name="stageEvidence" size={18} /> 证据卡队列</h2>
      <p>
        证据门是 Selenyx 的灵魂：agent 产出的每张证据卡（论断 / 原文摘录 / 页码 / 来源）都要经你裁决后才进成稿——
        AI 干活，人签字。
        {pending !== null && <>当前待裁决 <b className="v4-pending-count">{pending}</b> 条。</>}
      </p>
      <p className="v4-placeholder-note">
        待裁决队列（卡片流 + J/K 快捷键 + 批量模式）、项目与主页的朱砂待办角标，将在下一模块上线。
      </p>
    </div>
  );
}

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
        {libraryTab === 'evidence' && <EvidenceTabPlaceholder />}
        {libraryTab === 'tables' && <TablesView />}
        {libraryTab === 'clinical' && <ClinicalDataView />}
        {libraryTab === 'files' && <FilesTabPlaceholder />}
      </div>
    </div>
  );
}
