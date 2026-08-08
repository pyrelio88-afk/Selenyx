import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useAppStore } from '@stores/appStore';
import { FIELD_LABELS } from '@apptypes/index';
import type { Reference } from '@apptypes/reference';
import { Icon } from '@components/ui/Icon';
import { StatusChip } from '@components/ui/StatusChip';
import { importReferences, exportBibTeX, exportRIS } from '@utils/referenceConverter';
import {
  dedupeIncomingReferences,
  normalizeDoi,
  referenceOnlineUrl,
  safeExternalUrl,
} from '@utils/referenceIntegrity';
import { fetchByDOI, searchCrossref, type FetchedReference } from '@services/metadataFetch';
import { refApi } from '@services/api';
import { ViewSwitcher, type ViewMode } from '@components/datagrid/ViewSwitcher';
import { KanbanView, type GroupField } from '@components/datagrid/KanbanView';
import { GalleryView } from '@components/datagrid/GalleryView';
import { CalendarView } from '@components/datagrid/CalendarView';
import type { Annotation } from '@apptypes/reference';
import { useIsMobile } from '@lib/useIsMobile';
import { BottomSheet } from '@components/layout/BottomSheet';
import { searchApi, zoteroApi, type ScholarlyCandidate, type ZoteroReferenceCandidate } from '@services/api';
import { referenceFromZotero } from '@utils/zoteroReference';
import { ReferenceEvidenceWorkspace } from './references/ReferenceEvidenceWorkspace';
import './references/references-workspace.css';

// PDF 阅读器懒加载（pdfjs-dist ~400KB，只在需要时加载）
const PdfReader = lazy(() => import('@components/pdf/PdfReader').then(m => ({ default: m.PdfReader })));
// anydoc 转换模态
import { AnydocConvertModal } from '@components/anydoc/AnydocConvertModal';

function createReferenceFromFetched(ref: FetchedReference): Reference {
  const timestamp = new Date().toISOString();
  const doi = normalizeDoi(ref.doi);
  const identifier = doi || ref.title;
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: ref.title,
    creators: ref.creators.map((creator, index) => ({ id: `c_${index}`, firstName: creator.firstName, lastName: creator.lastName, type: 'author' as const, order: index })),
    type: ref.type as Reference['type'],
    doi,
    publication: ref.publication,
    year: String(ref.year),
    volume: ref.volume,
    issue: ref.issue,
    pages: ref.pages,
    abstract: ref.abstract,
    tags: [],
    readStatus: 'unread',
    importance: 3,
    citeKey: identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'reference',
    openAccess: ref.openAccess,
    annotations: [],
    shortTitle: '',
    publisher: ref.publisher,
    place: '',
    date: '',
    accessionDate: '',
    isbn: '',
    issn: ref.issn,
    pmid: ref.pmid ?? '',
    pmcid: '',
    arxivId: ref.arxivId ?? '',
    url: safeExternalUrl(ref.url) ?? (doi ? `https://doi.org/${encodeURIComponent(doi)}` : ''),
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
    source: 'api',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function scholarlyToFetched(candidate: ScholarlyCandidate): FetchedReference {
  const sourceType = candidate.source === 'arxiv' ? 'preprint' : 'journalArticle';
  return {
    title: candidate.title,
    creators: candidate.creators.map(({ firstName, lastName }) => ({ firstName, lastName })),
    type: sourceType,
    doi: candidate.doi,
    publication: candidate.publication,
    year: Number(candidate.year) || new Date().getFullYear(),
    volume: candidate.volume ?? '',
    issue: candidate.issue ?? '',
    pages: candidate.pages ?? '',
    abstract: candidate.abstract,
    issn: '',
    publisher: '',
    openAccess: candidate.openAccess,
    url: candidate.url,
    pmid: candidate.pmid,
    arxivId: candidate.arxivId,
    source: candidate.source,
  };
}

interface ManualReferenceForm {
  title: string;
  authors: string;
  year: string;
  publication: string;
  doi: string;
  url: string;
  abstract: string;
}

function emptyManualReferenceForm(): ManualReferenceForm {
  return { title: '', authors: '', year: String(new Date().getFullYear()), publication: '', doi: '', url: '', abstract: '' };
}

function parseManualCreators(input: string): Reference['creators'] {
  return input.split(/[;；\n]+/).map((raw) => raw.trim()).filter(Boolean).map((name, index) => {
    const comma = name.indexOf(',');
    if (comma >= 0) {
      return { id: `c_${index}`, firstName: name.slice(comma + 1).trim(), lastName: name.slice(0, comma).trim(), type: 'author' as const, order: index };
    }
    const tokens = name.split(/\s+/);
    const lastName = tokens.length > 1 ? tokens.at(-1) ?? '' : name;
    return { id: `c_${index}`, firstName: tokens.length > 1 ? tokens.slice(0, -1).join(' ') : '', lastName, type: 'author' as const, order: index };
  });
}

function createManualReference(form: ManualReferenceForm): Reference {
  const timestamp = new Date().toISOString();
  const doi = normalizeDoi(form.doi);
  const creators = parseManualCreators(form.authors);
  const identifier = doi || `${creators[0]?.lastName ?? 'reference'}${form.year}` || form.title;
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: form.title.trim(),
    creators,
    type: 'journalArticle',
    doi,
    publication: form.publication.trim(),
    year: form.year.trim(),
    volume: '', issue: '', pages: '', abstract: form.abstract.trim(), tags: [], readStatus: 'unread', importance: 3,
    citeKey: identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'reference',
    openAccess: false, annotations: [], shortTitle: '', publisher: '', place: '', date: '', accessionDate: '', isbn: '', issn: '', pmid: '', pmcid: '', arxivId: '',
    url: form.url.trim() || (doi ? `https://doi.org/${encodeURIComponent(doi)}` : ''), uri: '', collections: [], language: '', rights: '', attachments: [], notes: '',
    impactFactor: null, jcrQuartile: null, pageCharge: null, reviewWeeks: null, pipelineStage: null,
    source: 'manual', createdAt: timestamp, updatedAt: timestamp,
  };
}

function ManualReferenceFields({ form, onChange }: { form: ManualReferenceForm; onChange: (patch: Partial<ManualReferenceForm>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <label className="form-label" htmlFor="manual-reference-title">文献标题 *</label>
        <input id="manual-reference-title" className="input" autoFocus value={form.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="输入论文、书籍或报告标题" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-authors">作者</label>
        <input id="manual-reference-authors" className="input" value={form.authors} onChange={(event) => onChange({ authors: event.target.value })} placeholder="如：Wang, Wei; Zhang, Li（多位作者用分号分隔）" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
        <div>
          <label className="form-label" htmlFor="manual-reference-year">年份</label>
          <input id="manual-reference-year" className="input" inputMode="numeric" value={form.year} onChange={(event) => onChange({ year: event.target.value })} placeholder="2026" />
        </div>
        <div>
          <label className="form-label" htmlFor="manual-reference-publication">期刊 / 出版物</label>
          <input id="manual-reference-publication" className="input" value={form.publication} onChange={(event) => onChange({ publication: event.target.value })} placeholder="如：Nature / 中华护理杂志" />
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-doi">DOI</label>
        <input id="manual-reference-doi" className="input" value={form.doi} onChange={(event) => onChange({ doi: event.target.value })} placeholder="10.xxxx/xxxx（可粘贴 doi.org 链接）" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-url">原文链接</label>
        <input id="manual-reference-url" className="input" type="url" value={form.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://…（可选）" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-abstract">摘要 / 备注</label>
        <textarea id="manual-reference-abstract" className="input" rows={4} value={form.abstract} onChange={(event) => onChange({ abstract: event.target.value })} placeholder="粘贴摘要或记录要点（可选）" style={{ resize: 'vertical' }} />
      </div>
    </div>
  );
}

export function ReferencesView() {
  const {
    references, searchQuery, setSearchQuery,
    addReferences, updateReference, deleteReferenceAndRelations,
    referenceSyncStatus, referenceSyncMessage,
    projects, currentProjectId,
  } = useAppStore();
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [literatureQuery, setLiteratureQuery] = useState('');
  const [literatureResults, setLiteratureResults] = useState<FetchedReference[]>([]);
  const [literatureSearching, setLiteratureSearching] = useState(false);
  const [literatureSearched, setLiteratureSearched] = useState(false);
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroLoading, setZoteroLoading] = useState(false);
  const [zoteroCandidates, setZoteroCandidates] = useState<ZoteroReferenceCandidate[]>([]);
  const [zoteroSelected, setZoteroSelected] = useState<Set<string>>(new Set());
  const [zoteroMessage, setZoteroMessage] = useState('');
  // A1 导出预览弹窗（先在应用内展示，支持复制或另存）
  const [exportPreview, setExportPreview] = useState<{ format: string; content: string; referenceCount: number } | null>(null);
  // A2 删除二次确认（使用应用内确认弹窗）
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [manualForm, setManualForm] = useState<ManualReferenceForm>(emptyManualReferenceForm);
  // A3 开放获取 PDF 链接（Unpaywall 查询结果）
  const [oaPdfLink, setOaPdfLink] = useState<{ referenceId: string; url: string } | null>(null);
  const [oaLoading, setOaLoading] = useState(false);
  // 移动端: 更多操作菜单 / 筛选面板
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const isMobile = useIsMobile();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!confirmDeleteId || isMobile) return;
    const focusFrame = window.requestAnimationFrame(() => deleteCancelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmDeleteId(null);
      if (event.key !== 'Tab' || !deleteDialogRef.current) return;
      const focusable = Array.from(deleteDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      deleteTriggerRef.current?.focus();
      deleteTriggerRef.current = null;
    };
  }, [confirmDeleteId, isMobile]);

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

  const savedDois = useMemo(
    () => new Set(references.map((reference) => normalizeDoi(reference.doi)).filter(Boolean)),
    [references],
  );

  function toggleSort(field: 'title' | 'year' | 'doi' | 'readStatus') {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  /** DOI 自动抓取元数据 → 入库 */
  async function handleDoiFetch() {
    const requestedDoi = normalizeDoi(doiInput);
    if (!requestedDoi) return;
    if (savedDois.has(requestedDoi)) {
      setDoiInput('');
      flashToast('该 DOI 已在本地文献库中');
      return;
    }
    setDoiLoading(true);
    try {
      const ref = await fetchByDOI(requestedDoi);
      if (ref) {
        const fetchedDoi = normalizeDoi(ref.doi) || requestedDoi;
        if (fetchedDoi && savedDois.has(fetchedDoi)) {
          setDoiInput('');
          flashToast('该 DOI 已在本地文献库中');
          return;
        }
        addReferences([{
          id: 'ref_' + Date.now().toString(36),
          title: ref.title,
          creators: ref.creators.map((c, i) => ({ id: "c_" + i, firstName: c.firstName, lastName: c.lastName, type: "author" as const, order: i })),
          type: ref.type as any,
          doi: fetchedDoi,
          publication: ref.publication,
          year: String(ref.year),
          volume: ref.volume,
          issue: ref.issue,
          pages: ref.pages,
          abstract: ref.abstract,
          tags: [],
          readStatus: 'unread',
          importance: 3,
          citeKey: fetchedDoi.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20),
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
        const doi = requestedDoi;
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

  const handleLiteratureSearch = useCallback(async () => {
    const query = literatureQuery.trim();
    if (!query) return;
    setLiteratureSearching(true);
    setLiteratureSearched(true);
    try {
      const response = await searchApi.scholarly(query, ['openalex', 'crossref', 'pubmed', 'arxiv']);
      setLiteratureResults(response.results.map(scholarlyToFetched));
      const sourceSummary = response.diagnostics
        .map((item) => `${item.source}:${item.error ?? item.count ?? item.status}`)
        .join(' · ');
      flashToast(response.count ? `多源检索命中 ${response.count} 条 · ${sourceSummary}` : `多源检索无结果 · ${sourceSummary}`);
    } catch {
      // Browser-only/offline-backend fallback remains useful, but is labelled
      // honestly as a single-source Crossref query.
      const fallback = await searchCrossref(query);
      setLiteratureResults(fallback);
      flashToast(`本地学术网关不可用，已降级为 Crossref 单源检索（${fallback.length} 条）`);
    } finally {
      setLiteratureSearching(false);
    }
  }, [flashToast, literatureQuery]);

  const selected = useMemo(() => references.find((r) => r.id === selectedId) ?? null, [references, selectedId]);
  const closePanel = useCallback(() => setSelectedId(null), []);

  /** Keep project associations and transient readers consistent with deletion. */
  const deleteReferenceWithCleanup = useCallback((referenceId: string) => {
    deleteReferenceAndRelations(referenceId);
    // C2 修复：同步清理后端 RAG chunks + evidence（后端离线时静默降级，前端 store 仍清理）
    void refApi.delete(referenceId).catch(() => {});
    if (pdfRefId === referenceId) {
      setPdfSource(null);
      setPdfRefId(null);
    }
    if (anydocRefId === referenceId) {
      setAnydocOpen(false);
      setAnydocRefId(null);
    }
    if (oaPdfLink?.referenceId === referenceId) setOaPdfLink(null);
    setConfirmDeleteId(null);
    closePanel();
    flashToast('已删除文献，并移除关联项目中的引用');
  }, [anydocRefId, closePanel, deleteReferenceAndRelations, flashToast, oaPdfLink, pdfRefId]);

  const openManualCreate = useCallback(() => {
    setManualForm(emptyManualReferenceForm());
    setShowManualCreate(true);
  }, []);

  const saveManualReference = useCallback(() => {
    if (!manualForm.title.trim()) {
      flashToast('请先填写文献标题');
      return;
    }
    const reference = createManualReference(manualForm);
    addReferences([reference]);
    setSelectedId(reference.id);
    setShowManualCreate(false);
    flashToast('已创建本地文献条目');
  }, [addReferences, flashToast, manualForm]);

  const handleAddSearchResult = useCallback((result: FetchedReference) => {
    const candidate = createReferenceFromFetched(result);
    const { accepted } = dedupeIncomingReferences(references, [candidate]);
    if (accepted.length === 0) {
      flashToast('该 DOI 已在本地文献库中');
      return;
    }
    addReferences(accepted);
    flashToast(`已加入本地文献库：${result.title.slice(0, 40)}`);
  }, [addReferences, flashToast, references]);

  /** 导入文件：读取 → 嗅探格式 → 批量入库 */
  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const { format, refs } = importReferences(text);
      if (refs.length === 0) { flashToast('未解析到有效文献，请检查文件格式'); return; }
      const { accepted, skipped } = dedupeIncomingReferences(references, refs);
      if (accepted.length === 0) {
        flashToast(`未导入新文献：${skipped} 条与本地记录重复`);
        return;
      }
      addReferences(accepted);
      flashToast(`成功导入 ${accepted.length} 条文献（${format.toUpperCase()} 格式）${skipped ? `，已跳过 ${skipped} 条重复记录` : ''}`);
    } catch (err) {
      flashToast(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [addReferences, flashToast, references]);

  /** Explicit, read-only Zotero Local API preview. Nothing is copied before confirmation. */
  const openZoteroImport = useCallback(async () => {
    setZoteroOpen(true);
    setZoteroLoading(true);
    setZoteroCandidates([]);
    setZoteroSelected(new Set());
    setZoteroMessage('正在检查本机 Zotero…');
    try {
      await zoteroApi.status();
      const response = await zoteroApi.items(250);
      setZoteroCandidates(response.items);
      setZoteroSelected(new Set(response.items.map((item) => item.key)));
      setZoteroMessage(
        response.items.length
          ? `已读取 ${response.items.length} 条候选（另跳过 ${response.skipped} 条附件/笔记）；请勾选后确认复制。`
          : 'Zotero 可连接，但没有可导入的顶层文献条目。',
      );
    } catch (error) {
      setZoteroMessage(
        `${error instanceof Error ? error.message : '无法连接本机 Zotero'} `
        + '请启动 Zotero，并在“设置 → 高级”启用“允许本机其他应用与 Zotero 通信”；也可改用 BibTeX/RIS 文件导入。',
      );
    } finally {
      setZoteroLoading(false);
    }
  }, []);

  const importSelectedZotero = useCallback(() => {
    const chosen = zoteroCandidates
      .filter((candidate) => zoteroSelected.has(candidate.key))
      .map(referenceFromZotero);
    const { accepted, skipped } = dedupeIncomingReferences(references, chosen);
    if (accepted.length) addReferences(accepted);
    setZoteroOpen(false);
    flashToast(
      accepted.length
        ? `已从 Zotero 只读复制 ${accepted.length} 条文献${skipped ? `，跳过 ${skipped} 条重复` : ''}`
        : `没有新文献可复制${skipped ? `；${skipped} 条均已存在` : ''}`,
    );
  }, [addReferences, flashToast, references, zoteroCandidates, zoteroSelected]);

  /** A1 导出修复：生成 BibTeX/RIS 文本 → 应用内弹窗展示 + 复制按钮。 */
  const handleExport = useCallback((format: 'bibtex' | 'ris') => {
    const target = searchQuery ? filtered : references;
    if (target.length === 0) { flashToast('没有可导出的文献'); return; }
    const content = format === 'bibtex' ? exportBibTeX(target) : exportRIS(target);
    setExportPreview({ format: format.toUpperCase(), content, referenceCount: target.length });
  }, [searchQuery, filtered, references, flashToast]);

  /** A1 导出复制：优先 clipboard API，降级 execCommand 选中文本框（webview 兼容） */
  const handleExportCopy = useCallback(async () => {
    if (!exportPreview) return;
    const text = exportPreview.content;
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      flashToast(`已复制 ${text.length} 字符到剪贴板`);
    } catch {
      // 降级：选中文本框内容让用户手动 Ctrl+C
      const ta = document.getElementById('export-textarea') as HTMLTextAreaElement | null;
      if (ta) { ta.focus(); ta.select(); flashToast('剪贴板不可用，已全选文本，请按 Ctrl+C 复制'); }
      else { flashToast('剪贴板不可用'); }
    }
  }, [exportPreview, flashToast]);

  /**
   * 真实导出文件，而不仅是展示一段可复制文本。Blob URL 同时适用于浏览器和
   * Tauri WebView；下载失败时保留预览窗口，用户仍可复制内容。
   */
  const handleExportDownload = useCallback(() => {
    if (!exportPreview) return;
    const extension = exportPreview.format.toLowerCase() === 'ris' ? 'ris' : 'bib';
    const mime = extension === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex';
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `selenyx-references-${stamp}.${extension}`;
    let href: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        throw new Error('当前运行环境不支持 Blob 下载');
      }
      href = URL.createObjectURL(new Blob([exportPreview.content], { type: `${mime};charset=utf-8` }));
      link = document.createElement('a');
      link.href = href;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      flashToast(`已请求下载 ${filename}`);
    } catch {
      // Keep the preview open: users can always copy the verified export text.
      flashToast(`无法自动下载 ${filename}；导出文本仍保留，可复制或手动保存`);
    } finally {
      link?.remove();
      if (href) window.setTimeout(() => URL.revokeObjectURL(href!), 60_000);
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

  const handleLookupOa = useCallback(async (referenceId: string, doi: string) => {
    const normalizedDoi = normalizeDoi(doi);
    if (!normalizedDoi) {
      flashToast('当前文献没有可查询的 DOI');
      return;
    }
    setOaLoading(true);
    setOaPdfLink(null);
    try {
      const response = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(normalizedDoi)}?email=selenyx@research.local`);
      if (!response.ok) {
        flashToast('Unpaywall 查询失败');
        return;
      }
      const payload = await response.json() as {
        best_oa_location?: { url_for_pdf?: unknown; url?: unknown } | null;
      };
      const location = payload.best_oa_location;
      const candidate = typeof location?.url_for_pdf === 'string'
        ? location.url_for_pdf
        : typeof location?.url === 'string' ? location.url : null;
      const safeUrl = safeExternalUrl(candidate);
      if (safeUrl) {
        setOaPdfLink({ referenceId, url: safeUrl });
        flashToast('找到开放获取 PDF 链接');
      } else {
        flashToast('未找到可安全打开的开放获取版本');
      }
    } catch {
      flashToast('网络请求失败（可能被 CORS 限制）');
    } finally {
      setOaLoading(false);
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
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? null;

  return (
    <div className={`references-workspace ${selected ? "is-reading" : ""}`}>
      <div className="view-header">
        <div className="reference-view-heading">
          <div>
            <h1 className="view-title">文献库 / 证据检索与 RAG</h1>
            <p className="reference-view-description">左栏筛选文献，中栏读摘要与原文，右栏做本机证据检索；模型不会把空结果编成证据。</p>
            <div role="status" title={referenceSyncMessage} className={`reference-header-status is-${referenceSyncStatus}`}>
              {referenceSyncStatus === 'synced' ? 'SQLite 文献库已同步' : referenceSyncStatus === 'syncing' ? '正在同步 SQLite' : referenceSyncStatus === 'offline' ? '本机后端离线，仅使用缓存' : referenceSyncStatus === 'error' ? '同步异常，仅使用缓存' : '等待本机后端同步'}
            </div>
          </div>
        </div>
        <div className="reference-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bib,.ris,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
          />
          <button className="btn ref-desktop-only" aria-label="导入文献" onClick={() => fileInputRef.current?.click()}><Icon name="import" size={16} /> 导入</button>
          <button className="btn ref-desktop-only" aria-label="在线检索" onClick={() => setSearchOpen(true)}><Icon name="search" size={16} /> 检索</button>
          <button className="btn ref-more-btn" aria-label="更多操作" onClick={() => setShowMoreMenu(true)}><Icon name="more" size={16} /> 更多</button>
          <button className="btn btn-primary" aria-label="新建文献" onClick={openManualCreate}><Icon name="plus" size={16} /> 新建</button>

          {!isMobile && showMoreMenu && (
            <div className="reference-more-popover" role="menu" aria-label="文献库更多操作">
              <button role="menuitem" onClick={() => { setShowMoreMenu(false); void openZoteroImport(); }}><Icon name="references" size={16} /><span><strong>从 Zotero 导入</strong><small>先预览再只读复制</small></span></button>
              <button role="menuitem" onClick={() => { setShowMoreMenu(false); setAnydocRefId(selectedId); setAnydocOpen(true); }}><Icon name="download" size={16} /><span><strong>文档转 Markdown</strong><small>本地转换并进入精读</small></span></button>
              <button role="menuitem" onClick={() => {
                setShowMoreMenu(false);
                void import('@data/seedReferences').then(({ getSeedReferences }) => {
                  const refs = getSeedReferences();
                  const existingDois = new Set(references.map((reference) => reference.doi).filter(Boolean));
                  const newRefs = refs.filter((reference) => !reference.doi || !existingDois.has(reference.doi));
                  if (newRefs.length === 0) { flashToast('精读文献已全部导入，无新增'); return; }
                  addReferences(newRefs);
                  flashToast(`成功导入 ${newRefs.length} 篇精读文献`);
                });
              }}><Icon name="import" size={16} /><span><strong>导入精读文献</strong><small>导入本机每日精读结果</small></span></button>
              <div className="reference-more-divider" />
              <button role="menuitem" onClick={() => { setShowMoreMenu(false); void handleExport('bibtex'); }}><Icon name="download" size={16} /><span><strong>导出 BibTeX</strong><small>适用于 LaTeX 与文献工具</small></span></button>
              <button role="menuitem" onClick={() => { setShowMoreMenu(false); void handleExport('ris'); }}><Icon name="download" size={16} /><span><strong>导出 RIS</strong><small>适用于 EndNote 等工具</small></span></button>
              <button className="reference-more-close" onClick={() => setShowMoreMenu(false)}>关闭</button>
            </div>
          )}
        </div>
      </div>

      <ReferenceEvidenceWorkspace
        references={references}
        project={currentProject}
        syncStatus={referenceSyncStatus}
        syncMessage={referenceSyncMessage}
        onOpenReference={setSelectedId}
      />

      <div className="reference-search-cluster">
      <div className="ref-search-row reference-library-toolbar" style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
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
      <div className="reference-doi-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
      </div>

      {/* 统计概览 */}
      {references.length > 0 && (
        <div className="reference-library-stats" style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
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
          <div className="icon" style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}><Icon name="references" size={48} strokeWidth={1.6} /></div>
          <p>{isMobile
            ? '暂无文献。点击右上角「更多」导入 BibTeX/RIS 或检索文献。'
            : '暂无文献。点击「检索」从 OpenAlex/Crossref/arXiv 检索，或「导入」BibTeX/RIS。'}</p>
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
                <button className="btn ref-card-act" style={{ fontSize: 12 }} onClick={() => setExportPreview({ format: 'BibTeX', content: exportBibTeX([r]), referenceCount: 1 })} title="导出此条"><Icon name="download" size={15} /> 导出</button>
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
          emptyAction={isMobile
            ? { label: '添加文献', onClick: () => setShowMoreMenu(true) }
            : { label: '导入文献', onClick: () => fileInputRef.current?.click() }}
        />
      ) : viewMode === 'gallery' ? (
        <GalleryView references={filtered} onSelect={setSelectedId} />
      ) : viewMode === 'calendar' ? (
        <CalendarView references={filtered} onSelect={setSelectedId} />
      ) : (
        <div className="reference-library-table"><div style={{ overflowX: 'auto' }}>
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
        </div></div>
      )}

      {/* 详情面板: 桌面侧滑 / 移动端 BottomSheet */}
      {!isMobile && !selected && <div className={`ref-detail-overlay`} onClick={closePanel} />}
      {selected && (
        <RefDetailPanel
          ref={selected}
          onClose={closePanel}
          onOpenPdf={(id) => { setPdfRefId(id); pdfInputRef.current?.click(); }}
          onConvertMd={(id) => { setAnydocRefId(id); setAnydocOpen(true); }}
          onOpenWeb={setWebViewerUrl}
          onDelete={(referenceId) => {
            deleteTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setConfirmDeleteId(referenceId);
          }}
          oaPdfUrl={oaPdfLink?.referenceId === selected.id ? oaPdfLink.url : null}
          oaLoading={oaLoading}
          onLookupOa={handleLookupOa}
          asSheet={isMobile}
        />
      )}

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

      {/* 手动新建：此前标题栏按钮无行为；现在直接创建完整本地条目。 */}
      {showManualCreate && (isMobile ? (
        <BottomSheet open onClose={() => setShowManualCreate(false)} title="新建本地文献">
          <ManualReferenceFields form={manualForm} onChange={(patch) => setManualForm((current) => ({ ...current, ...patch }))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" style={{ flex: 1, height: 48 }} onClick={() => setShowManualCreate(false)}>取消</button>
            <button className="btn btn-primary" style={{ flex: 1, height: 48 }} onClick={saveManualReference}>保存文献</button>
          </div>
        </BottomSheet>
      ) : (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowManualCreate(false)}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, width: 'min(640px, 100%)', maxHeight: '85vh', overflow: 'auto', padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>新建本地文献</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>先保存到本机；稍后仍可补充全文、批注和标签。</p>
              </div>
              <button className="icon-btn" onClick={() => setShowManualCreate(false)} aria-label="关闭"><Icon name="close" size={18} /></button>
            </div>
            <ManualReferenceFields form={manualForm} onChange={(patch) => setManualForm((current) => ({ ...current, ...patch }))} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="btn" onClick={() => setShowManualCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveManualReference}>保存文献</button>
            </div>
          </div>
        </div>
      ))}

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

      {searchOpen && !isMobile && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSearchOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="literature-search-title" style={{ background: 'var(--bg-surface)', borderRadius: 12, width: 'min(760px, 100%)', maxHeight: '82vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 id="literature-search-title" style={{ fontSize: 16, fontWeight: 600 }}>文献在线检索</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>检索结果不会自动保存，需逐条确认加入本地库。</p>
              </div>
              <button className="icon-btn" onClick={() => setSearchOpen(false)} aria-label="关闭"><Icon name="close" size={18} /></button>
            </div>
            <LiteratureSearchContent query={literatureQuery} onQueryChange={setLiteratureQuery} results={literatureResults} searching={literatureSearching} searched={literatureSearched} onSearch={handleLiteratureSearch} onAdd={handleAddSearchResult} savedDois={savedDois} />
          </div>
        </div>
      )}

      {searchOpen && isMobile && (
        <BottomSheet open onClose={() => setSearchOpen(false)} title="文献在线检索">
          <LiteratureSearchContent query={literatureQuery} onQueryChange={setLiteratureQuery} results={literatureResults} searching={literatureSearching} searched={literatureSearched} onSearch={handleLiteratureSearch} onAdd={handleAddSearchResult} savedDois={savedDois} />
        </BottomSheet>
      )}

      {zoteroOpen && !isMobile && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setZoteroOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="zotero-import-title" style={{ background: 'var(--bg-surface)', borderRadius: 12, width: 'min(780px, 100%)', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 id="zotero-import-title" style={{ fontSize: 16, fontWeight: 600 }}>从本机 Zotero 只读复制</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>先预览、勾选、再复制到 Selenyx；不会写回或修改 Zotero 数据库。</p>
              </div>
              <button className="icon-btn" onClick={() => setZoteroOpen(false)} aria-label="关闭 Zotero 导入"><Icon name="close" size={18} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div role="status" style={{ fontSize: 12.5, color: zoteroCandidates.length ? 'var(--text-secondary)' : 'var(--text-muted)', marginBottom: 12 }}>{zoteroMessage}</div>
              {zoteroLoading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>正在读取候选文献…</div>}
              {!zoteroLoading && zoteroCandidates.length > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button className="btn btn-sm" onClick={() => setZoteroSelected(new Set(zoteroCandidates.map((item) => item.key)))}>全选</button>
                    <button className="btn btn-sm" onClick={() => setZoteroSelected(new Set())}>全不选</button>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>已选 {zoteroSelected.size} / {zoteroCandidates.length}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 430, overflow: 'auto' }}>
                    {zoteroCandidates.map((candidate) => (
                      <label key={candidate.key} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={zoteroSelected.has(candidate.key)}
                          onChange={(event) => setZoteroSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(candidate.key); else next.delete(candidate.key);
                            return next;
                          })}
                        />
                        <span>
                          <strong style={{ display: 'block', fontSize: 13 }}>{candidate.title || '[无标题]'}</strong>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {[candidate.creators.map((creator) => creator.lastName || creator.firstName).filter(Boolean).join(', '), candidate.publication, candidate.year, candidate.doi].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button className="btn" onClick={() => setZoteroOpen(false)}>取消</button>
                    <button className="btn btn-primary" disabled={zoteroSelected.size === 0} onClick={importSelectedZotero}>复制所选文献</button>
                  </div>
                </>
              )}
              {!zoteroLoading && zoteroCandidates.length === 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => { setZoteroOpen(false); fileInputRef.current?.click(); }}>改用 BibTeX/RIS 文件</button>
                  <button className="btn" onClick={() => void openZoteroImport()}>重试</button>
                </div>
              )}
            </div>
          </div>
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
          <button className="mobile-drawer-item" onClick={() => { setShowMoreMenu(false); setSearchOpen(true); }}><Icon name="search" size={18} /> 在线检索</button>
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
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>共 {exportPreview.referenceCount} 条文献</p>
          <textarea id="export-textarea" readOnly value={exportPreview.content} style={{ width: '100%', height: 280, padding: 12, background: 'var(--bg-canvas)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6, resize: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1, height: 48 }} onClick={handleExportCopy}><Icon name="import" size={18} /> 复制全部</button>
            <button className="btn" style={{ height: 48 }} onClick={handleExportDownload}><Icon name="download" size={18} /> 下载</button>
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
            <button className="btn" style={{ flex: 1, height: 48, background: 'var(--danger, #c3272b)', color: '#fff', borderColor: 'var(--danger, #c3272b)' }} onClick={() => deleteReferenceWithCleanup(confirmDeleteId)}>确认删除</button>
          </div>
        </BottomSheet>
      )}

      {/* 操作反馈 toast */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}

      {/* A1 导出预览弹窗（应用内展示与复制） */}
      {!isMobile && exportPreview && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setExportPreview(null)}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>导出 {exportPreview.format} · {exportPreview.referenceCount} 条文献</h3>
              <button className="icon-btn" onClick={() => setExportPreview(null)} aria-label="关闭"><Icon name="close" size={18} /></button>
            </div>
            <textarea id="export-textarea" readOnly value={exportPreview.content} style={{ flex: 1, margin: 16, padding: 12, background: 'var(--bg-canvas)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6, resize: 'none', minHeight: 200 }} />
            <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleExportCopy}><Icon name="import" size={15} /> 复制全部</button>
              <button className="btn" onClick={handleExportDownload}><Icon name="download" size={15} /> 下载 .{exportPreview.format === 'RIS' ? 'ris' : 'bib'}</button>
              <button className="btn" onClick={() => setExportPreview(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* A2 删除二次确认弹窗 */}
      {!isMobile && confirmDeleteId && (
        <div className="ref-center-modal" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmDeleteId(null)}>
          <div ref={deleteDialogRef} role="dialog" aria-modal="true" aria-labelledby="reference-delete-title" aria-describedby="reference-delete-description" style={{ background: 'var(--bg-surface)', borderRadius: 12, maxWidth: 360, width: '100%', padding: 24, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 id="reference-delete-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>确认删除此文献？</h3>
            <p id="reference-delete-description" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>此操作不可撤销，文献及其笔记/批注将永久删除。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button ref={deleteCancelRef} className="btn" style={{ flex: 1 }} onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn" style={{ flex: 1, background: 'var(--danger, #c3272b)', color: '#fff', borderColor: 'var(--danger, #c3272b)' }} onClick={() => deleteReferenceWithCleanup(confirmDeleteId)}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiteratureSearchContent({
  query,
  onQueryChange,
  results,
  searching,
  searched,
  onSearch,
  onAdd,
  savedDois,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: FetchedReference[];
  searching: boolean;
  searched: boolean;
  onSearch: () => void;
  onAdd: (result: FetchedReference) => void;
  savedDois: Set<string>;
}) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onSearch(); }}
          placeholder="输入题名、作者、期刊或关键词"
          aria-label="多源文献检索"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={onSearch} disabled={!query.trim() || searching}>
          <Icon name="search" size={16} /> {searching ? '检索中…' : '检索'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.55, margin: '10px 0 14px' }}>
        本机学术网关并行查询 OpenAlex、Crossref、PubMed 与 arXiv，并按 DOI/题名去重；后端不可用时才降级为 Crossref 单源。结果仅用于发现与导入，关键字段仍应回到出版页面核验。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((result, index) => {
          const saved = Boolean(result.doi && savedDois.has(result.doi.toLowerCase()));
          return (
            <article key={`${result.doi || result.title}-${index}`} className="card reference-search-result" style={{ padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.45 }}>{result.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>
                    {result.creators.slice(0, 4).map((creator) => [creator.firstName, creator.lastName].filter(Boolean).join(' ')).filter(Boolean).join(', ') || '作者信息待补充'}
                    {result.creators.length > 4 && ' et al.'}
                    {result.year ? ` · ${result.year}` : ''}{result.publication ? ` · ${result.publication}` : ''}
                  </div>
                  {result.doi && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>DOI: {result.doi}</div>}
                  {result.source && <span className="reference-source-badge">来源 · {result.source}</span>}
                </div>
                <div className="reference-search-result-actions">
                  {safeExternalUrl(result.url) && (
                    <a className="btn btn-sm" href={safeExternalUrl(result.url) ?? undefined} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14} /> 核验来源</a>
                  )}
                  <button className="btn btn-sm" disabled={saved} onClick={() => onAdd(result)}>{saved ? '已在库中' : '加入本地库'}</button>
                </div>
              </div>
            </article>
          );
        })}
        {searched && !searching && results.length === 0 && (
          <div className="empty-state" style={{ padding: '28px 12px' }}>未找到可用结果，请改用更具体的题名、作者或 DOI。</div>
        )}
      </div>
    </div>
  );
}

/** 文献详情侧滑面板 */
function RefDetailPanel({ ref: r, onClose, onOpenPdf, onConvertMd, onOpenWeb, onDelete, oaPdfUrl, oaLoading, onLookupOa, asSheet }: { ref: Reference; onClose: () => void; onOpenPdf: (id: string) => void; onConvertMd: (id: string) => void; onOpenWeb: (url: string) => void; onDelete: (id: string) => void; oaPdfUrl: string | null; oaLoading: boolean; onLookupOa: (referenceId: string, doi: string) => void; asSheet?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onlineUrl = referenceOnlineUrl(r);
  const doiUrl = r.doi ? referenceOnlineUrl({ url: '', uri: '', doi: r.doi }) : null;

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
              {r.tags.map((t) => (<span key={t} className="status-chip chip-unread chip-xs">{t}</span>))}
            </span>
          </div>
        )}
        {doiUrl && (
          <div className="ref-detail-field">
            <span className="field-label">链接</span>
            <a className="field-value" href={doiUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
            <button className="btn" onClick={() => onLookupOa(r.id, r.doi)} disabled={oaLoading}><Icon name="link" size={18} /> {oaLoading ? '查询中…' : '查找OA全文'}</button>
          )}
          {onlineUrl && (
            <button className="btn" onClick={() => onOpenWeb(onlineUrl)}><Icon name="globe" size={18} /> 应用内预览</button>
          )}
          {onlineUrl && (
            <a className="btn" href={onlineUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="link" size={18} /> 在线阅读</a>
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
                <span key={t} className="status-chip chip-unread chip-xs">{t}</span>
              ))}
            </span>
          </div>
        )}

        {doiUrl && (
          <div className="ref-detail-field">
            <span className="field-label">链接</span>
            <a className="field-value" href={doiUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
              <button className="btn" style={{ flex: '1 1 120px' }} onClick={() => onLookupOa(r.id, r.doi)} disabled={oaLoading} title="通过 Unpaywall 查询开放获取版本">
                <Icon name="link" size={15} /> {oaLoading ? '查询中…' : '查找OA全文'}
              </button>
              {oaPdfUrl && (
                <a className="btn btn-primary" style={{ flex: '1 1 120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} href={oaPdfUrl} target="_blank" rel="noopener noreferrer" title="在新窗口打开开放获取 PDF">
                  <Icon name="download" size={15} /> 打开OA PDF
                </a>
              )}
            </>
          )}
          {onlineUrl && (
            <>
              <button className="btn" style={{ flex: '1 1 120px' }} onClick={() => onOpenWeb(onlineUrl)} title="在应用内预览网页；如期刊拒绝嵌入，可用旁边的新窗口打开">
                <Icon name="globe" size={15} /> 应用内预览
              </button>
              <a className="btn" style={{ flex: '1 1 120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} href={onlineUrl} target="_blank" rel="noopener noreferrer" title="在新窗口打开出版商页面">
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
