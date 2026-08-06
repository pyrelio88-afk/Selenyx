import { useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useAppStore } from '@stores/appStore';
import { FIELD_LABELS } from '@apptypes/index';
import type { Reference } from '@apptypes/reference';
import { Icon } from '@components/ui/Icon';
import { StatusChip } from '@components/ui/StatusChip';
import { importReferences, exportBibTeX, exportRIS } from '@utils/referenceConverter';
import { fetchByDOI } from '@services/metadataFetch';
import { ViewSwitcher, type ViewMode } from '@components/datagrid/ViewSwitcher';
import { KanbanView, type GroupField } from '@components/datagrid/KanbanView';
import { GalleryView } from '@components/datagrid/GalleryView';
import { CalendarView } from '@components/datagrid/CalendarView';
import type { Annotation } from '@apptypes/reference';

// PDF 阅读器懒加载（pdfjs-dist ~400KB，只在需要时加载）
const PdfReader = lazy(() => import('@components/pdf/PdfReader').then(m => ({ default: m.PdfReader })));

export function ReferencesView() {
  const { references, searchQuery, setSearchQuery, addReferences, updateReference } = useAppStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [groupBy, setGroupBy] = useState<GroupField>('readStatus');
  const [sortField, setSortField] = useState<'title' | 'year' | 'doi' | 'readStatus' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [doiInput, setDoiInput] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);
  const [webViewerUrl, setWebViewerUrl] = useState<string | null>(null);
  const [pdfSource, setPdfSource] = useState<ArrayBuffer | null>(null);
  const [pdfRefId, setPdfRefId] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let result = references;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.creators.some((c) => `${c.firstName}${c.lastName}`.toLowerCase().includes(q)) ||
        r.doi.toLowerCase().includes(q) ||
        r.publication.toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      result = result.filter((r) => r.type === filterType);
    }
    // 排序
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'title') cmp = a.title.localeCompare(b.title, 'zh');
        else if (sortField === 'year') cmp = Number(a.year || 0) - Number(b.year || 0);
        else if (sortField === 'doi') cmp = (a.doi || '').localeCompare(b.doi || '');
        else if (sortField === 'readStatus') cmp = (a.readStatus || '').localeCompare(b.readStatus || '');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [references, searchQuery, filterType, sortField, sortDir]);

  function toggleSort(field: 'title' | 'year' | 'doi' | 'readStatus') {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  /** DOI 自动抓取元数据 → 入库 */
  async function handleDoiFetch() {
    if (!doiInput.trim()) return;
    setDoiLoading(true);
    try {
      const ref = await fetchByDOI(doiInput.trim());
      if (ref) {
        addReferences([{
          id: 'ref_' + Date.now().toString(36),
          title: ref.title,
          creators: ref.creators.map((c, i) => ({ id: "c_" + i, firstName: c.firstName, lastName: c.lastName, type: "author" as const, order: i })),
          type: ref.type as any,
          doi: ref.doi,
          publication: ref.publication,
          year: String(ref.year),
          volume: ref.volume,
          issue: ref.issue,
          pages: ref.pages,
          abstract: ref.abstract,
          tags: [],
          readStatus: 'unread',
          importance: 3,
          citeKey: ref.doi.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20),
          openAccess: ref.openAccess,
          annotations: [],
          shortTitle: '',
          publisher: '',
          place: '',
          date: '',
          accessionDate: '',
          isbn: '',
          issn: '',
          pmid: '',
          pmcid: '',
          arxivId: '',
          url: '',
          uri: '',
          collections: [],
          language: '',
          rights: '',
          attachments: [],
          notes: '',
          impactFactor: null,
          jcrQuartile: null,
          pageCharge: null,
          reviewWeeks: null,
          pipelineStage: null,
          source: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          }]);
        flashToast(`已抓取并添加: ${ref.title.slice(0, 40)}...`);
        setDoiInput('');
      } else {
        // Crossref 没找到，降级为手动添加
        const doi = doiInput.trim().replace(/^https?:\/\/doi\.org\//, '');
        addReferences([{
          id: 'ref_' + Date.now().toString(36),
          title: `[待补充] DOI: ${doi}`,
          creators: [],
          type: 'journalArticle',
          doi,
          publication: '',
          year: String(new Date().getFullYear()),
          volume: '', issue: '', pages: '',
          abstract: '',
          tags: [],
          readStatus: 'unread',
          importance: 3,
          citeKey: doi.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20),
          openAccess: false,
          annotations: [],
          shortTitle: '',
          publisher: '',
          place: '',
          date: '',
          accessionDate: '',
          isbn: '',
          issn: '',
          pmid: '',
          pmcid: '',
          arxivId: '',
          url: '',
          uri: '',
          collections: [],
          language: '',
          rights: '',
          attachments: [],
          notes: '',
          impactFactor: null,
          jcrQuartile: null,
          pageCharge: null,
          reviewWeeks: null,
          pipelineStage: null,
          source: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          }]);
        flashToast(`Crossref 未找到元数据，已创建占位条目 (DOI: ${doi})`);
        setDoiInput('');
      }
    } catch {
      flashToast('抓取失败，请检查网络或 DOI 是否正确');
    } finally {
      setDoiLoading(false);
    }
  }

  const selected = useMemo(() => references.find((r) => r.id === selectedId) ?? null, [references, selectedId]);
  const closePanel = useCallback(() => setSelectedId(null), []);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /** 导入文件：读取 → 嗅探格式 → 批量入库 */
  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const { format, refs } = importReferences(text);
      if (refs.length === 0) { flashToast('未解析到有效文献，请检查文件格式'); return; }
      addReferences(refs);
      flashToast(`成功导入 ${refs.length} 条文献（${format.toUpperCase()} 格式）`);
    } catch (err) {
      flashToast(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [addReferences, flashToast]);

  /** 导出：生成 BibTeX/RIS 文本并下载 */
  const handleExport = useCallback((format: 'bibtex' | 'ris') => {
    const target = filtered.length > 0 ? filtered : references;
    if (target.length === 0) { flashToast('没有可导出的文献'); return; }
    const content = format === 'bibtex' ? exportBibTeX(target) : exportRIS(target);
    const ext = format === 'bibtex' ? 'bib' : 'ris';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `selenyx-references.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    flashToast(`已导出 ${target.length} 条文献为 ${format.toUpperCase()}`);
  }, [filtered, references, flashToast]);

  /** 打开 PDF 阅读器：读取文件 → ArrayBuffer → 渲染 */
  const handleOpenPdf = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      setPdfSource(buf);
      flashToast(`已加载 ${file.name}`);
    } catch {
      flashToast('PDF 读取失败');
    }
  }, [flashToast]);

  /** 批注变更 → 写回文献 */
  const handleAnnotationsChange = useCallback((annos: Annotation[]) => {
    if (pdfRefId) updateReference(pdfRefId, { annotations: annos });
  }, [pdfRefId, updateReference]);

  const pdfRef = pdfRefId ? references.find((r) => r.id === pdfRefId) : null;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">文献库</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bib,.ris,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
          />
          <button className="btn" aria-label="导入文献" onClick={() => fileInputRef.current?.click()}><Icon name="import" size={16} /> 导入</button>
          <button className="btn" onClick={() => {
            import('@data/seedReferences').then(({ getSeedReferences }) => {
              const refs = getSeedReferences();
              const existingDois = new Set(references.map((r) => r.doi).filter(Boolean));
              const newRefs = refs.filter((r) => !r.doi || !existingDois.has(r.doi));
              if (newRefs.length === 0) { flashToast('精读文献已全部导入，无新增'); return; }
              addReferences(newRefs);
              flashToast(`成功导入 ${newRefs.length} 篇精读文献（来自每日精读自动化）`);
            });
          }}><Icon name="references" size={16} /> 导入精读文献</button>
          <div className="export-group">
            <button className="btn" aria-label="导出文献" onClick={() => handleExport('bibtex')}><Icon name="download" size={16} /> 导出 BibTeX</button>
          </div>
          <button className="btn" aria-label="导出 RIS" onClick={() => handleExport('ris')}>导出 RIS</button>
          <button className="btn" aria-label="在线检索"><Icon name="search" size={16} /> 检索</button>
          <button className="btn btn-primary" aria-label="新建文献"><Icon name="plus" size={16} /> 新建</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="搜索标题、作者、DOI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
          aria-label="搜索文献"
        />
        <select className="input" style={{ width: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="按类型筛选">
          <option value="all">全部类型</option>
          <option value="journalArticle">期刊论文</option>
          <option value="book">书籍</option>
          <option value="preprint">预印本</option>
          <option value="webpage">网页</option>
        </select>
        <ViewSwitcher mode={viewMode} onChange={setViewMode} />
        {viewMode === 'kanban' && (
          <select className="input" style={{ width: 120 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupField)} aria-label="看板分组字段">
            <option value="readStatus">按状态</option>
            <option value="type">按类型</option>
            <option value="importance">按重要度</option>
          </select>
        )}
      </div>

      {/* DOI 自动抓取元数据 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="粘贴 DOI 自动抓取文献信息（如 10.1234/abc.def）"
          value={doiInput}
          onChange={(e) => setDoiInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDoiFetch(); }}
          style={{ flex: 1 }}
          aria-label="DOI 自动抓取"
        />
        <button className="btn btn-primary" onClick={handleDoiFetch} disabled={doiLoading}>
          {doiLoading ? '抓取中...' : '抓取元数据'}
        </button>
      </div>

      {/* 统计概览 */}
      {references.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <span className="status-chip" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>
            共 {references.length} 篇
          </span>
          <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            已读 {references.filter((r) => r.readStatus === 'read').length}
          </span>
          <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            阅读中 {references.filter((r) => r.readStatus === 'reading').length}
          </span>
          <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            未读 {references.filter((r) => r.readStatus === 'unread').length}
          </span>
          <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            期刊 {references.filter((r) => r.type === 'journalArticle').length}
          </span>
          {references.filter((r) => r.openAccess).length > 0 && (
            <span className="status-chip" style={{ background: 'var(--accent-light)', color: 'var(--success)' }}>
              OA {references.filter((r) => r.openAccess).length}
            </span>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="references" size={48} strokeWidth={1.2} /></div>
          <p>暂无文献。点击「检索」从 OpenAlex/Crossref/arXiv 检索，或「导入」BibTeX/RIS。</p>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView
          references={filtered}
          groupBy={groupBy}
          onGroupChange={(id, patch) => { updateReference(id, patch); flashToast('已更新'); }}
          onSelect={setSelectedId}
        />
      ) : viewMode === 'gallery' ? (
        <GalleryView references={filtered} onSelect={setSelectedId} />
      ) : viewMode === 'calendar' ? (
        <CalendarView references={filtered} onSelect={setSelectedId} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable-th" onClick={() => toggleSort('title')} style={{ cursor: 'pointer' }}>
                  {FIELD_LABELS.title}{sortField === 'title' && <span style={{ fontSize: 10, marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th>{FIELD_LABELS.creators}</th>
                <th>{FIELD_LABELS.publication}</th>
                <th className="sortable-th" onClick={() => toggleSort('year')} style={{ cursor: 'pointer' }}>
                  {FIELD_LABELS.year}{sortField === 'year' && <span style={{ fontSize: 10, marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="sortable-th" onClick={() => toggleSort('doi')} style={{ cursor: 'pointer' }}>
                  DOI{sortField === 'doi' && <span style={{ fontSize: 10, marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="sortable-th" onClick={() => toggleSort('readStatus')} style={{ cursor: 'pointer' }}>
                  状态{sortField === 'readStatus' && <span style={{ fontSize: 10, marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={selectedId === r.id ? 'selected' : ''}
                  onClick={() => setSelectedId(r.id)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); } }}
                >
                  <td style={{ maxWidth: 300, fontWeight: 500 }}>{r.title}</td>
                  <td style={{ maxWidth: 150, color: 'var(--text-secondary)' }}>
                    {r.creators.slice(0, 2).map((c) => `${c.lastName}${c.firstName}`).join(', ')}
                    {r.creators.length > 2 && ' et al.'}
                  </td>
                  <td style={{ maxWidth: 150, color: 'var(--text-secondary)' }}>{r.publication}</td>
                  <td>{r.year}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.doi}</td>
                  <td><StatusChip status={r.readStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 详情侧滑面板（ONES/Mobbin 模式：点击行 → 右侧详情，不离开列表上下文） */}
      <div className={`ref-detail-overlay ${selected ? 'open' : ''}`} onClick={closePanel} />
      {selected && <RefDetailPanel ref={selected} onClose={closePanel} onOpenPdf={(id) => { setPdfRefId(id); pdfInputRef.current?.click(); }} onOpenWeb={(url) => setWebViewerUrl(url)} />}

      {/* 隐藏 PDF 文件输入 */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOpenPdf(f); e.target.value = ''; }}
      />

      {/* PDF 阅读器全屏覆盖（懒加载） */}
      {pdfSource && pdfRef && (
        <Suspense fallback={<div className="pdf-loading"><div className="skeleton" style={{ width: 400, height: 560 }} /></div>}>
          <PdfReader
            source={pdfSource}
            title={pdfRef.title || pdfRef.citeKey}
            annotations={pdfRef.annotations}
            onAnnotationsChange={handleAnnotationsChange}
            onClose={() => { setPdfSource(null); setPdfRefId(null); }}
          />
        </Suspense>
      )}

      {/* 内置网页浏览器 — 在线阅读文献 */}
      {webViewerUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'var(--bg-canvas)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
          }}>
            <button className="btn btn-sm" onClick={() => setWebViewerUrl(null)}>
              <Icon name="close" size={16} /> 关闭
            </button>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {webViewerUrl}
            </span>
            <a href={webViewerUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              <Icon name="link" size={14} /> 新窗口打开
            </a>
          </div>
          <iframe
            src={webViewerUrl}
            style={{ flex: 1, border: 'none', width: '100%' }}
            title="文献在线阅读"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      )}

      {/* 操作反馈 toast */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}
    </div>
  );
}

/** 文献详情侧滑面板 */
function RefDetailPanel({ ref: r, onClose, onOpenPdf, onOpenWeb }: { ref: Reference; onClose: () => void; onOpenPdf: (id: string) => void; onOpenWeb: (url: string) => void }) {
  const [copied, setCopied] = useState(false);

  function generateGBT7714(): string {
    const authors = r.creators.map((c) => `${c.lastName}${c.firstName}`).join(', ');
    const typeMap: Record<string, string> = {
      'journalArticle': '[J]', 'book': '[M]', 'bookSection': '[M]', 'conferencePaper': '[C]',
      'thesis': '[D]', 'report': '[R]', 'webpage': '[EB/OL]', 'preprint': '[J]',
    };
    const typeTag = typeMap[r.type] || '[J]';
    let citation = `${authors}. ${r.title}${typeTag}. `;
    if (r.publication) citation += `${r.publication}, `;
    if (r.year) citation += `${r.year}`;
    if (r.volume) citation += `, ${r.volume}`;
    if (r.issue) citation += `(${r.issue})`;
    if (r.pages) citation += `: ${r.pages}`;
    citation += '.';
    if (r.doi) citation += ` DOI: ${r.doi}.`;
    return citation;
  }

  function copyCitation() {
    const text = generateGBT7714();
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: select and prompt
      window.prompt('复制以下引用文本：', text);
    });
  }

  return (
    <aside className="ref-detail-panel open" role="dialog" aria-label={`文献详情：${r.title}`}>
      <div className="ref-detail-header">
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>文献详情</span>
        <button className="icon-btn" onClick={onClose} aria-label="关闭面板"><Icon name="close" size={18} /></button>
      </div>
      <div className="ref-detail-body">
        <div className="ref-detail-field">
          <span className="field-label">标题</span>
          <span className="field-value" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{r.title}</span>
        </div>

        <div className="ref-detail-field">
          <span className="field-label">作者</span>
          <span className="field-value">
            {r.creators.map((c) => `${c.lastName}${c.firstName}`).join('; ') || '—'}
          </span>
        </div>

        <div className="detail-grid">
          <div className="ref-detail-field">
            <span className="field-label">期刊 / 出版物</span>
            <span className="field-value">{r.publication || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">年份</span>
            <span className="field-value">{r.year || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">卷 / 期 / 页</span>
            <span className="field-value">{[r.volume, r.issue, r.pages].filter(Boolean).join(' / ') || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">DOI</span>
            <span className="field-value" style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{r.doi || '—'}</span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="ref-detail-field">
            <span className="field-label">类型</span>
            <span className="field-value" style={{ fontSize: 13 }}>{r.type}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">阅读状态</span>
            <span><StatusChip status={r.readStatus} /></span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">影响因子</span>
            <span className="field-value">{r.impactFactor != null ? r.impactFactor.toFixed(1) : '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">JCR 分区</span>
            <span className="field-value">{r.jcrQuartile ?? '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">开放获取</span>
            <span className="field-value">{r.openAccess ? '是' : '否'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">重要度</span>
            <span className="field-value">{'★'.repeat(r.importance)}{'☆'.repeat(5 - r.importance)}</span>
          </div>
        </div>

        {r.abstract && (
          <div className="ref-detail-field">
            <span className="field-label">摘要</span>
            <span className="field-value" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{r.abstract}</span>
          </div>
        )}

        {r.tags.length > 0 && (
          <div className="ref-detail-field">
            <span className="field-label">标签</span>
            <span className="field-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.tags.map((t) => (
                <span key={t} className="status-chip chip-unread chip-xs"><span className="chip-mark chip-mark-dash" />{t}</span>
              ))}
            </span>
          </div>
        )}

        {r.doi && (
          <div className="ref-detail-field">
            <span className="field-label">链接</span>
            <a className="field-value" href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="link" size={14} /> doi.org/{r.doi}
            </a>
          </div>
        )}

        {/* GB/T 7714 引用生成 */}
        <div className="ref-detail-field" style={{ marginTop: 4 }}>
          <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            GB/T 7714 引用格式
            <button
              className="btn btn-xs"
              onClick={copyCitation}
              style={{ padding: '2px 10px', fontSize: 11, lineHeight: 1.4 }}
              aria-label="复制引用文本"
            >
              {copied ? '✓ 已复制' : '复制'}
            </button>
          </span>
          <div style={{
            marginTop: 6,
            padding: '10px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12.5,
            lineHeight: 1.7,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
          }}>
            {generateGBT7714()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenPdf(r.id)}><Icon name="download" size={15} /> 获取全文</button>
          {r.doi && (
            <button className="btn" style={{ flex: 1 }} onClick={() => onOpenWeb(`https://doi.org/${r.doi}`)}><Icon name="link" size={15} /> 在线阅读</button>
          )}
          <button className="btn" style={{ flex: 1 }}><Icon name="tag" size={15} /> 编辑标签</button>
        </div>
      </div>
    </aside>
  );
}
