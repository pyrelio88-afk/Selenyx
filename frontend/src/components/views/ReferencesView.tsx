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
import { useIsMobile } from '@lib/useIsMobile';
import { BottomSheet } from '@components/layout/BottomSheet';

// PDF 阅读器懒加载（pdfjs-dist ~400KB，只在需要时加载）
const PdfReader = lazy(() => import('@components/pdf/PdfReader').then(m => ({ default: m.PdfReader })));
// anydoc 转换模态
import { AnydocConvertModal } from '@components/anydoc/AnydocConvertModal';

export function ReferencesView() {
  const { references, searchQuery, setSearchQuery, addReferences, updateReference, deleteReference } = useAppStore();
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
  const [anydocOpen, setAnydocOpen] = useState(false);
  const [anydocRefId, setAnydocRefId] = useState<string | null>(null);
  // A1 导出预览弹窗（飞书 webview 拦截 a.click 下载 → 改为应用内展示+复制）
  const [exportPreview, setExportPreview] = useState<{ format: string; content: string } | null>(null);
  // A2 删除二次确认（飞书 webview 拦截 window.confirm → 改为应用内确认弹窗）
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // A3 开放获取 PDF 链接（Unpaywall 查询结果）
  const [oaPdfUrl, setOaPdfUrl] = useState<string | null>(null);
  const [oaLoading, setOaLoading] = useState(false);
  // 移动端: 更多操作菜单 / 筛选面板
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const isMobile = useIsMobile();
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

  /** A1 导出修复：生成 BibTeX/RIS 文本 → 应用内弹窗展示 + 复制按钮（飞书 webview 拦截 a.click 下载） */
  const handleExport = useCallback((format: 'bibtex' | 'ris') => {
    const target = searchQuery ? filtered : references;
    if (target.length === 0) { flashToast('没有可导出的文献'); return; }
    const content = format === 'bibtex' ? exportBibTeX(target) : exportRIS(target);
    setExportPreview({ format: format.toUpperCase(), content });
  }, [searchQuery, filtered, references, flashToast]);

  /** A1 导出复制：优先 clipboard API，降级 execCommand 选中文本框（webview 兼容） */
  const handleExportCopy = useCallback(async () => {
    if (!exportPreview) return;
    const text = exportPreview.content;
    try {
      await navigator.clipboard?.writeText(text);
      flashToast(`已复制 ${text.length} 字符到剪贴板`);
    } catch {
      // 降级：选中文本框内容让用户手动 Ctrl+C
      const ta = document.getElementById('export-textarea') as HTMLTextAreaElement | null;
      if (ta) { ta.focus(); ta.select(); flashToast('剪贴板不可用，已全选文本，请按 Ctrl+C 复制'); }
      else { flashToast('剪贴板不可用'); }
    }
  }, [exportPreview, flashToast]);

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

  /** anydoc 转出的 Markdown 存入当前文献的笔记字段 */
  const handleSaveMdToNotes = useCallback((markdown: string, filename: string) => {
    if (!anydocRefId) { flashToast('已转换，但未关联文献——请先点开一篇文献再「存为笔记」'); return; }
    const ref = references.find((r) => r.id === anydocRefId);
    const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
    const head = `> 由 anydoc 从 \`${filename}\` 转换 · ${stamp}\n\n`;
    const merged = ref?.notes ? `${head}${markdown}\n\n---\n${ref.notes}` : `${head}${markdown}`;
    updateReference(anydocRefId, { notes: merged });
    flashToast(`已存入「${ref?.title?.slice(0, 20) ?? '文献'}」笔记`);
  }, [anydocRefId, references, updateReference, flashToast]);

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
          <button className="btn ref-desktop-only" aria-label="导入文献" onClick={() => fileInputRef.current?.click()}><Icon name="import" size={16} /> 导入</button>
          <button className="btn ref-desktop-only" aria-label="文档转 Markdown" onClick={() => { setAnydocRefId(selectedId); setAnydocOpen(true); }} title="上传 PDF/Word/Excel 等文档，本地转为 Markdown 进入精读"><Icon name="download" size={16} /> 文档转MD</button>
          <button className="btn ref-desktop-only" onClick={() => {
            import('@data/seedReferences').then(({ getSeedReferences }) => {
              const refs = getSeedReferences();
              const existingDois = new Set(references.map((r) => r.doi).filter(Boolean));
              const newRefs = refs.filter((r) => !r.doi || !existingDois.has(r.doi));
              if (newRefs.length === 0) { flashToast('精读文献已全部导入，无新增'); return; }
              addReferences(newRefs);
              flashToast(`成功导入 ${newRefs.length} 篇精读文献（来自每日精读自动化）`);
            });
          }}><Icon name="references" size={16} /> 导入精读文献</button>
          <button className="btn ref-desktop-only" aria-label="导出 BibTeX" onClick={() => handleExport('bibtex')}><Icon name="download" size={16} /> 导出 BibTeX</button>
          <button className="btn ref-desktop-only" aria-label="导出 RIS" onClick={() => handleExport('ris')}><Icon name="download" size={16} /> 导出 RIS</button>
          <button className="btn ref-desktop-only" aria-label="在线检索"><Icon name="search" size={16} /> 检索</button>
          {/* 移动端: 更多操作(桌面隐藏) */}
          <button className="btn ref-more-btn" aria-label="更多操作" onClick={() => setShowMoreMenu(true)}><Icon name="more" size={16} /> 更多</button>
          <button className="btn btn-primary" aria-label="新建文献"><Icon name="plus" size={16} /> 新建</button>
        </div>
      </div>

      <div className="ref-search-row" style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="搜索标题、作者、DOI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
          aria-label="搜索文献"
        />
        <select className="input ref-desktop-only" style={{ width: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="按类型筛选">
          <option value="all">全部类型</option>
          <option value="journalArticle">期刊论文</option>
          <option value="book">书籍</option>
          <option value="preprint">预印本</option>
          <option value="webpage">网页</option>
        </select>
        <span className="ref-desktop-only"><ViewSwitcher mode={viewMode} onChange={setViewMode} /></span>
        {viewMode === 'kanban' && (
          <select className="input ref-desktop-only" style={{ width: 120 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupField)} aria-label="看板分组字段">
            <option value="readStatus">按状态</option>
            <option value="type">按类型</option>
            <option value="importance">按重要度</option>
          </select>
        )}
        {/* 移动端: 筛选按钮(桌面隐藏) */}
        <button className="btn ref-filter-btn" onClick={() => setShowFilterMenu(true)}><Icon name="filter" size={15} /> 筛选</button>
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
      ) : isMobile ? (
        <div className="ref-mobile-list">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="card"
              onClick={() => setSelectedId(r.id)}
              style={{ padding: 14, cursor: 'pointer', border: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {r.creators.slice(0, 2).map((c) => `${c.lastName}${c.firstName}`).join(', ')}{r.creators.length > 2 && ' et al.'}
                {r.year && ` · ${r.year}`}{r.publication && ` · ${r.publication}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span><StatusChip status={r.readStatus} /></span>
                {r.tags.length > 0 && (
                  <div className="scroll-x" style={{ display: 'flex', gap: 4, flex: 1, marginLeft: 8 }}>
                    {r.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button className="btn ref-card-act" style={{ fontSize: 12 }} onClick={() => setExportPreview({ format: 'BibTeX', content: exportBibTeX([r]) })} title="导出此条"><Icon name="download" size={15} /> 导出</button>
                <button className="btn ref-card-act" style={{ fontSize: 12, color: 'var(--danger, #c3272b)' }} onClick={() => setConfirmDeleteId(r.id)} title="删除"><Icon name="close" size={15} /> 删除</button>
              </div>
            </div>
          ))}
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

      {/* 详情面板: 桌面侧滑 / 移动端 BottomSheet */}
      {!isMobile && <div className={`ref-detail-overlay ${selected ? 'open' : ''}`} onClick={closePanel} />}
      {selected && <RefDetailPanel ref={selected} onClose={closePanel} onOpenPdf={(id) => { setPdfRefId(id); pdfInputRef.current?.click(); }} onConvertMd={(id) => { setAnydocRefId(id); setAnydocOpen(true); }} onOpenWeb={(url) => setWebViewerUrl(url)} onDelete={(id) => setConfirmDeleteId(id)} oaPdfUrl={oaPdfUrl} oaLoading={oaLoading} onLookupOa={async (doi) => { if (!doi) return; setOaLoading(true); setOaPdfUrl(null); try { const res = await fetch(`https://api.unpaywall.org/v2/${doi}?email=selenyx@research.local`); if (res.ok) { const d = await res.json(); const loc = d.best_oa_location; if (loc?.url_for_pdf || loc?.url) { setOaPdfUrl(loc.url_for_pdf || loc.url); flashToast('找到开放获取 PDF 链接'); } else { flashToast('未找到开放获取版本'); } } else { flashToast('Unpaywall 查询失败'); } } catch { flashToast('网络请求失败（可能被 CORS 限制）'); } finally { setOaLoading(false); } }} asSheet={isMobile} />}

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
          <div style={{ padding: '6px 16px', fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border)' }}>
            提示：多数期刊网站禁止被嵌入，若下方空白请点「新窗口打开」；本地 PDF 全文请用「获取全文」在阅读器中查看。
          </div>
          <iframe
            src={webViewerUrl}
            style={{ flex: 1, border: 'none', width: '100%' }}
            title="文献在线阅读"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      )}

      {/* anydoc 文档转 Markdown 模态 */}
      <AnydocConvertModal
        open={anydocOpen}
        onClose={() => setAnydocOpen(false)}
        onSaveToNotes={anydocRefId ? handleSaveMdToNotes : undefined}
      />

      {/* 移动端: 更多操作菜单 */}
      {isMobile && showMoreMenu && (
        <BottomSheet open onClose={() => setShowMoreMenu(false)} title="更多操作">
          <button className="mobile-drawer-item" onClick={() => { setShowMoreMenu(false); fileInputRef.current?.click(); }}><Icon name="import" size={18} /> 导入文献</button>
          <button className="mobile-drawer-item" onClick={() => { setShowMoreMenu(false); setAnydocRefId(selectedId); setAnydocOpen(true); }}><Icon name="download" size={18} /> 文档转MD</button>
          <button className="mobile-drawer-item" onClick={() => {
            setShowMoreMenu(false);
            import('@data/seedReferences').then(({ getSeedReferences }) => {
              const refs = getSeedReferences();
              const existingDois = new Set(references.map((r) => r.doi).filter(Boolean));
              const newRefs = refs.filter((r) => !r.doi || !existingDois.has(r.doi));
              if (newRefs.length === 0) { flashToast('精读文献已全部导入，无新增'); return; }
              addReferences(newRefs);
              flashToast(`成功导入 ${newRefs.length} 篇精读文献`);
            });
          }}><Icon name="references" size={18} /> 导入精读文献</button>
          <button className="mobile-drawer-item" onClick={() => { setShowMoreMenu(false); handleExport('bibtex'); }}><Icon name="download" size={18} /> 导出 BibTeX</button>
          <button className="mobile-drawer-item" onClick={() => { setShowMoreMenu(false); handleExport('ris'); }}><Icon name="download" size={18} /> 导出 RIS</button>
        </BottomSheet>
      )}

      {/* 移动端: 筛选面板 */}
      {isMobile && showFilterMenu && (
        <BottomSheet open onClose={() => setShowFilterMenu(false)} title="筛选与视图">
          <div style={{ marginBottom: 16 }}>
            <span className="field-label" style={{ display: 'block', marginBottom: 8 }}>类型</span>
            <select className="input" style={{ width: '100%' }} value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="按类型筛选">
              <option value="all">全部类型</option>
              <option value="journalArticle">期刊论文</option>
              <option value="book">书籍</option>
              <option value="preprint">预印本</option>
              <option value="webpage">网页</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <span className="field-label" style={{ display: 'block', marginBottom: 8 }}>视图模式</span>
            <ViewSwitcher mode={viewMode} onChange={setViewMode} />
          </div>
          {viewMode === 'kanban' && (
            <div style={{ marginBottom: 16 }}>
              <span className="field-label" style={{ display: 'block', marginBottom: 8 }}>看板分组</span>
              <select className="input" style={{ width: '100%' }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupField)} aria-label="看板分组字段">
                <option value="readStatus">按状态</option>
                <option value="type">按类型</option>
                <option value="importance">按重要度</option>
              </select>
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', height: 48 }} onClick={() => setShowFilterMenu(false)}>完成</button>
        </BottomSheet>
      )}

      {/* 移动端: 导出预览 BottomSheet */}
      {isMobile && exportPreview && (
        <BottomSheet open onClose={() => setExportPreview(null)} title={`导出 ${exportPreview.format}`}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{exportPreview.content.split('\n').filter((l) => l.trim()).length} 条文献</p>
          <textarea id="export-textarea" readOnly value={exportPreview.content} style={{ width: '100%', height: 280, padding: 12, background: 'var(--bg-canvas)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6, resize: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1, height: 48 }} onClick={handleExportCopy}><Icon name="import" size={18} /> 复制全部</button>
            <button className="btn" style={{ height: 48 }} onClick={() => setExportPreview(null)}>关闭</button>
          </div>
        </BottomSheet>
      )}

      {/* 移动端: 删除确认 BottomSheet */}
      {isMobile && confirmDeleteId && (
        <BottomSheet open onClose={() => setConfirmDeleteId(null)} title="确认删除">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>确认删除此文献？</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>此操作不可撤销，文献及其笔记/批注将永久删除。</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, height: 48 }} onClick={() => setConfirmDeleteId(null)}>取消</button>
            <button className="btn" style={{ flex: 1, height: 48, background: 'var(--danger, #c3272b)', color: '#fff', borderColor: 'var(--danger, #c3272b)' }} onClick={() => { deleteReference(confirmDeleteId); setConfirmDeleteId(null); closePanel(); flashToast('已删除文献'); }}>确认删除</button>
          </div>
        </BottomSheet>
      )}

      {/* 操作反馈 toast */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}

      {/* A1 导出预览弹窗（飞书 webview 拦截下载 → 应用内展示+复制） */}
      {exportPreview && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setExportPreview(null)}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>导出 {exportPreview.format} · {exportPreview.content.split('\n').filter(l=>l.trim()).length} 条</h3>
              <button className="icon-btn" onClick={() => setExportPreview(null)} aria-label="关闭"><Icon name="close" size={18} /></button>
            </div>
            <textarea id="export-textarea" readOnly value={exportPreview.content} style={{ flex: 1, margin: 16, padding: 12, background: 'var(--bg-canvas)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6, resize: 'none', minHeight: 200 }} />
            <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleExportCopy}><Icon name="import" size={15} /> 复制全部</button>
              <button className="btn" onClick={() => setExportPreview(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* A2 删除二次确认弹窗（飞书 webview 拦截 window.confirm → 应用内确认） */}
      {confirmDeleteId && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmDeleteId(null)}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, maxWidth: 360, width: '100%', padding: 24, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>确认删除此文献？</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>此操作不可撤销，文献及其笔记/批注将永久删除。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn" style={{ flex: 1, background: 'var(--danger, #c3272b)', color: '#fff', borderColor: 'var(--danger, #c3272b)' }} onClick={() => { deleteReference(confirmDeleteId); setConfirmDeleteId(null); closePanel(); flashToast('已删除文献'); }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 文献详情侧滑面板 */
function RefDetailPanel({ ref: r, onClose, onOpenPdf, onConvertMd, onOpenWeb: _onOpenWeb, onDelete, oaPdfUrl, oaLoading, onLookupOa, asSheet }: { ref: Reference; onClose: () => void; onOpenPdf: (id: string) => void; onConvertMd: (id: string) => void; onOpenWeb: (url: string) => void; onDelete: (id: string) => void; oaPdfUrl: string | null; oaLoading: boolean; onLookupOa: (doi: string) => void; asSheet?: boolean }) {
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

  // --- 移动端 BottomSheet 详情 (asSheet=true) ---
  if (asSheet) {
    return (
      <BottomSheet open onClose={onClose} title="文献详情">
        <div className="ref-detail-field">
          <span className="field-label">标题</span>
          <span className="field-value" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{r.title}</span>
        </div>
        <div className="ref-detail-field">
          <span className="field-label">作者</span>
          <span className="field-value">{r.creators.map((c) => `${c.lastName}${c.firstName}`).join('; ') || '—'}</span>
        </div>
        <div className="detail-grid">
          <div className="ref-detail-field">
            <span className="field-label">期刊</span>
            <span className="field-value">{r.publication || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">年份</span>
            <span className="field-value">{r.year || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">DOI</span>
            <span className="field-value" style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{r.doi || '—'}</span>
          </div>
          <div className="ref-detail-field">
            <span className="field-label">阅读状态</span>
            <span><StatusChip status={r.readStatus} /></span>
          </div>
        </div>
        <div className="detail-grid">
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
              {r.tags.map((t) => (<span key={t} className="status-chip chip-unread chip-xs"><span className="chip-mark chip-mark-dash" />{t}</span>))}
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
        {/* GB/T 7714 引用 */}
        <div className="ref-detail-field" style={{ marginTop: 4 }}>
          <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            GB/T 7714 引用
            <button className="btn btn-xs" onClick={copyCitation} style={{ padding: '2px 10px', fontSize: 11 }} aria-label="复制引用文本">{copied ? '✓ 已复制' : '复制'}</button>
          </span>
          <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, lineHeight: 1.7, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {generateGBT7714()}
          </div>
        </div>
        {/* 移动端操作: 2 列网格 + 删除单列置底 */}
        <div className="ref-detail-actions-mobile" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => onOpenPdf(r.id)}><Icon name="download" size={18} /> 上传PDF阅读</button>
          <button className="btn" onClick={() => onConvertMd(r.id)}><Icon name="import" size={18} /> 转Markdown</button>
          {r.doi && (
            <button className="btn" onClick={() => onLookupOa(r.doi)} disabled={oaLoading}><Icon name="link" size={18} /> {oaLoading ? '查询中…' : '查找OA全文'}</button>
          )}
          {r.doi && (
            <a className="btn" href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="link" size={18} /> 在线阅读</a>
          )}
          <button className="btn"><Icon name="tag" size={18} /> 编辑标签</button>
          <button className="btn ref-act-delete" style={{ color: 'var(--danger, #c3272b)' }} onClick={() => onDelete(r.id)}><Icon name="close" size={18} /> 删除</button>
        </div>
      </BottomSheet>
    );
  }

  // --- 桌面侧滑面板 (asSheet=false) ---
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

        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ flex: '1 1 120px' }} onClick={() => onOpenPdf(r.id)} title="上传本地 PDF 文件在阅读器中查看"><Icon name="download" size={15} /> 上传PDF阅读</button>
          <button className="btn" style={{ flex: '1 1 120px' }} onClick={() => onConvertMd(r.id)} title="上传该文献的 PDF/Word 等文件，本地转 Markdown"><Icon name="import" size={15} /> 转Markdown</button>
          {r.doi && (
            <>
              <button className="btn" style={{ flex: '1 1 120px' }} onClick={() => onLookupOa(r.doi)} disabled={oaLoading} title="通过 Unpaywall 查询开放获取版本">
                <Icon name="link" size={15} /> {oaLoading ? '查询中…' : '查找OA全文'}
              </button>
              {oaPdfUrl && (
                <a className="btn btn-primary" style={{ flex: '1 1 120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} href={oaPdfUrl} target="_blank" rel="noopener noreferrer" title="在新窗口打开开放获取 PDF">
                  <Icon name="download" size={15} /> 打开OA PDF
                </a>
              )}
              <a className="btn" style={{ flex: '1 1 120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" title="在新窗口打开出版商页面">
                <Icon name="link" size={15} /> 在线阅读
              </a>
            </>
          )}
          <button className="btn" style={{ flex: '1 1 120px' }}><Icon name="tag" size={15} /> 编辑标签</button>
          <button className="btn" style={{ flex: '0 0 auto', color: 'var(--danger, #c3272b)' }} onClick={() => onDelete(r.id)} title="删除此文献"><Icon name="close" size={15} /> 删除</button>
        </div>
      </div>
    </aside>
  );
}
