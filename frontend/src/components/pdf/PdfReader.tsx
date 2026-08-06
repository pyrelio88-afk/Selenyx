/**
 * PDF.js 阅读器（R76：选区高亮）
 *
 * 基于 pdfjs-dist 4.x（ESM + Web Worker）。
 * 对齐 Zotero / ReadCube Papers 阅读器模式：
 * - Canvas 渲染当前页 + textLayer 文本层（支持选区）
 * - 翻页（上一页/下一页/页码跳转）·缩放（50%–300%）·键盘 ←/→/+/-/Esc
 * - 五色批注层：highlight/note/bookmark/underline/strikeout
 *   · R75：选工具后点击页面空白处新增（演示）
 *   · R76：选中文本 → 弹出浮动工具栏 → 一键创建高亮（Zotero 核心交互）
 *     选区逐行归一化为多条 rect 存入 annotation.rects，缩放/翻页后仍精确命中
 * - 批注点击 → 弹出详情（编辑 note / 删除）
 * - 多行高亮按行渲染，重叠/合并对齐 Zotero 存储模型
 * - R77：左侧栏——批注列表（跨页汇总，点击跳页定位，对齐 Zotero Annotations 侧栏）
 *   + PDF 大纲导航（getOutline 目录树，dest 解析为页码，点击跳页）
 */

import { useEffect, useRef, useState, useCallback } from 'react';
// R102 D3: pdfjs-dist 改为动态加载（~1MB 模块延迟到首次打开 PDF 时才解析执行）
import type * as PdfjsLibType from 'pdfjs-dist';
// 引入官方 textLayer 样式（含 .textLayer span 定位/选区色，保证文本与画布像素级对齐）
import 'pdfjs-dist/web/pdf_viewer.css';
import type { Annotation, AnnotationType } from '@apptypes/reference';
import { Icon } from '@components/ui/Icon';
import { runOcr, detectScannedPdf, terminateOcr, OCR_LANG_LABEL } from '@services/ocr';

// 动态加载器：模块级单例缓存，多次打开 PDF 不重复下载
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

/** 五色批注配色（对齐 R72 设计系统 accent/warning 语义） */
const ANNOTATION_COLORS: Record<AnnotationType, { bg: string; border: string; label: string }> = {
  highlight: { bg: 'rgba(255, 213, 79, 0.35)', border: '#ffd54f', label: '高亮' },
  note: { bg: 'rgba(79, 195, 247, 0.3)', border: '#4fc3f7', label: '笔记' },
  bookmark: { bg: 'rgba(129, 199, 132, 0.3)', border: '#81c784', label: '书签' },
  underline: { bg: 'transparent', border: '#e57373', label: '下划线' },
  strikeout: { bg: 'rgba(186, 104, 200, 0.25)', border: '#ba68c8', label: '删除线' },
};

export const ANNOTATION_TYPES: AnnotationType[] = ['highlight', 'note', 'bookmark', 'underline', 'strikeout'];

interface PdfReaderProps {
  /** PDF 文件来源：URL / Blob / ArrayBuffer */
  source: string | ArrayBuffer | Uint8Array;
  /** 已有批注 */
  annotations?: Annotation[];
  /** 批注变更回调 */
  onAnnotationsChange?: (annotations: Annotation[]) => void;
  /** 关闭回调 */
  onClose?: () => void;
  /** 文献标题（标题栏展示） */
  title?: string;
}

interface PageViewport {
  width: number;
  height: number;
  scale: number;
}

/** R77 大纲节点（含解析后的页码） */
interface OutlineNode {
  title: string;
  page: number | null; // null = 无可定位目标
  depth: number;
  children: OutlineNode[];
  /** R78：由 IMRaD 启发式自动识别生成（非 PDF 原生大纲） */
  auto?: boolean;
}

/** R77：递归解析 PDF 大纲，dest → 页码（1-based） */
async function resolveOutline(doc: PdfjsLibType.PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await doc.getOutline();
  if (!raw || raw.length === 0) return [];
  const resolveDest = async (dest: unknown): Promise<number | null> => {
    try {
      let d = dest;
      if (typeof d === 'string') {
        d = await doc.getDestination(d);
        if (!d) return null; // 命名目标失效（审查官 #1）
      }
      if (Array.isArray(d) && d.length > 0) {
        const ref = d[0];
        // 显式目标首元素可能是 ref 对象，也可能是页码数字（审查官 #1）
        if (typeof ref === 'number') return ref + 1;
        if (ref && typeof ref === 'object' && 'num' in ref) {
          return (await doc.getPageIndex(ref as any)) + 1;
        }
      }
    } catch {
      /* 单项解析失败只影响该条目，不连累整棵树 */
    }
    return null;
  };
  const walk = async (items: typeof raw, depth: number): Promise<OutlineNode[]> => {
    const nodes: OutlineNode[] = [];
    for (const it of items) {
      const page = await resolveDest(it.dest);
      const children = it.items?.length ? await walk(it.items, depth + 1) : [];
      nodes.push({ title: it.title || '(无标题)', page, depth, children });
    }
    return nodes;
  };
  return walk(raw, 0);
}

/**
 * R78：无大纲时的 IMRaD 启发式结构识别（结构化学习设计师 P1）。
 * 护理期刊论文绝大多数无 outline，但结构恰是最规整的 IMRaD——
 * 扫描前 8 页文本层，匹配中英文常见章节标题独立成行，生成伪大纲（auto: true）。
 * 只取每个标题的首次出现；按出现顺序（页码+页内序）排列。
 */
const IMRAD_HEADING_RE = /^(摘\s*要|摘由|关键词|关键字|前\s*言|引\s*言|背\s*景|目\s*的|对象与方法|资料与方法|材料与方法|方\s*法|结\s*果|讨\s*论|结\s*论|参考文献|致\s*谢|abstract|key\s?words?|introduction|background|objectives?|aims?|methods?|materials|results?|discussion|conclusions?|references|acknowledg\w*)[：:.]?\s*$/i;

async function detectImradOutline(doc: PdfjsLibType.PDFDocumentProxy): Promise<OutlineNode[]> {
  const found: OutlineNode[] = [];
  const seen = new Set<string>();
  const maxScan = Math.min(doc.numPages, 8);
  for (let p = 1; p <= maxScan; p++) {
    try {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      for (const item of tc.items) {
        if (!('str' in item)) continue;
        const s = (item as { str: string }).str.trim();
        if (s.length < 2 || s.length > 30) continue;
        if (!IMRAD_HEADING_RE.test(s)) continue;
        const key = s.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ title: s, page: p, depth: 0, children: [], auto: true });
      }
    } catch {
      /* 单页文本提取失败不影响其余页 */
    }
  }
  return found;
}

export function PdfReader({ source, annotations = [], onAnnotationsChange, onClose, title }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfjsLibType.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationType | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  // R76 选区高亮：选中文本后弹出的浮动工具栏
  const [selectionPopup, setSelectionPopup] = useState<{
    rects: [number, number, number, number][]; // 归一化逐行 rect
    bbox: [number, number, number, number];     // 外接包围盒（rect 字段）
    text: string;
    left: number; top: number;                   // 弹层定位（px，相对 page-wrap）
  } | null>(null);
  const renderTaskRef = useRef<PdfjsLibType.RenderTask | null>(null);
  // R77：左侧栏
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'annotations' | 'outline'>('annotations');
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  // R78：反向联动 + 脉冲定位（快速原型师 ①②）
  const annoListRef = useRef<HTMLUListElement>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  // R85：OCR 文字识别（扫描版 PDF / 图片文献补位，与 pdfjs 文本层互补）
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrResult, setOcrResult] = useState<{ text: string; confidence: number; page: number | 'all' } | null>(null);
  const [ocrPanelOpen, setOcrPanelOpen] = useState(false);
  const [scannedHint, setScannedHint] = useState(false);

  /** R78：跳转到批注时给目标一个 1.2s 脉冲闪烁，让用户认得出落点 */
  const triggerPulse = useCallback((id: string) => {
    setPulseId(id);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 1200);
  }, []);

  /**
   * R78：侧栏列表双向联动（快速原型师 ①②）。
   * - 页面上点批注 → 侧栏滚动到对应项（反向）
   * - 翻页/大纲跳页 → 列表滚动到当前页第一条批注（只滚动、不自动选中）
   * 用 block:'nearest' 避免连带外层阅读容器滚动。
   */
  useEffect(() => {
    if (!sidebarOpen || sidebarTab !== 'annotations') return;
    const list = annoListRef.current;
    if (!list || annotations.length === 0) return;
    const sorted = annotations.slice().sort((a, b) => a.page - b.page);
    const targetId = (selectedAnnotation && sorted.some((a) => a.id === selectedAnnotation))
      ? selectedAnnotation
      : sorted.find((a) => a.page === pageNum)?.id;
    if (!targetId) return;
    list.querySelector(`[data-anno-id="${targetId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedAnnotation, pageNum, sidebarTab, sidebarOpen, annotations]);

  // ===== 加载文档 =====
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
    const params = typeof source === 'string' ? { url: source } : { data: source };
    const pdfjsLib = await loadPdfjs();
    if (cancelled) return;
    pdfjsLib.getDocument(params).promise
      .then(async (d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        setPageNum(1);
        setLoading(false);
        // R77：解析大纲目录树；R78：无大纲时回退 IMRaD 启发式识别
        try {
          let ol = await resolveOutline(d);
          if (ol.length === 0) ol = await detectImradOutline(d);
          if (!cancelled) setOutline(ol);
        } catch { setOutline([]); }
        // R85：探测是否扫描版 PDF（无文本层）→ 提示用户可 OCR
        try {
          const scanned = await detectScannedPdf(d);
          if (!cancelled) setScannedHint(scanned);
        } catch { /* 探测失败不阻塞阅读 */ }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'PDF 加载失败');
        setLoading(false);
      });
    })(); // end async IIFE
    return () => { cancelled = true; };
  }, [source]);

  // ===== 渲染当前页（Canvas + textLayer 文本层）=====
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    // 取消上一个渲染任务
    renderTaskRef.current?.cancel();

    doc.getPage(pageNum).then(async (page) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: scale * 1.5 }); // 1.5x 基础清晰度
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = vp.width * dpr;
      canvas.height = vp.height * dpr;
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setViewport({ width: vp.width, height: vp.height, scale: vp.scale });

      const task = page.render({ canvasContext: ctx, viewport: vp });
      renderTaskRef.current = task;
      task.promise.catch((e) => {
        if (e?.name !== 'RenderingCancelledException') console.error('render error', e);
      });

      // R76：渲染文本层（选区高亮的前置）
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${vp.width}px`;
        textLayerDiv.style.height = `${vp.height}px`;
        // 官方 textLayer span 字号依赖 --scale-factor；设到容器即可
        textLayerDiv.style.setProperty('--scale-factor', String(vp.scale));
        try {
          const pdfjsLib = await loadPdfjs();
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textLayerDiv,
            viewport: vp,
          });
          await textLayer.render();
        } catch (e: any) {
          if (e?.name !== 'RenderingCancelledException') console.warn('textLayer render', e);
        }
      }
    });
    return () => { cancelled = true; };
  }, [doc, pageNum, scale]);

  // ===== 翻页 / 缩放 =====
  const goPrev = useCallback(() => setPageNum((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPageNum((p) => Math.min(numPages, p + 1)), [numPages]);
  const goTo = useCallback((n: number) => {
    if (n >= 1 && n <= numPages) setPageNum(n);
  }, [numPages]);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, s + 0.25)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.5, s - 0.25)), []);

  // ===== 键盘快捷键 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // R76：选区弹层打开时，1-5 一键创建对应类型批注
      if (selectionPopup && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        createFromSelection(ANNOTATION_TYPES[Number(e.key) - 1]);
        return;
      }
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === 'Escape') { setActiveTool(null); setSelectedAnnotation(null); setSelectionPopup(null); window.getSelection()?.removeAllRanges(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, zoomIn, zoomOut, selectionPopup]);

  // ===== R85：OCR 文字识别（扫描版 PDF / 图片补位）=====
  /** 把指定页渲染到离屏 Canvas（用于 OCR 或导出），返回 canvas */
  const renderPageToCanvas = useCallback(async (page: PdfjsLibType.PDFPageProxy): Promise<HTMLCanvasElement> => {
    const vp = page.getViewport({ scale: 2 }); // 2x 保证 OCR 精度
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }, []);

  /** 识别当前页：直接复用已渲染的可见 canvas */
  const runOcrPage = useCallback(async () => {
    if (!doc || !canvasRef.current || ocrRunning) return;
    setOcrRunning(true);
    setOcrProgress('准备识别…');
    setOcrPanelOpen(true);
    try {
      const res = await runOcr(canvasRef.current);
      setOcrResult({ ...res, page: pageNum });
    } catch (e) {
      setOcrResult({ text: `识别失败：${e instanceof Error ? e.message : String(e)}`, confidence: 0, page: pageNum });
    } finally {
      setOcrRunning(false);
      setOcrProgress('');
    }
  }, [doc, pageNum, ocrRunning]);

  /** 识别全部页：逐页离屏渲染 + OCR，拼接为全文 */
  const runOcrAll = useCallback(async () => {
    if (!doc || ocrRunning) return;
    setOcrRunning(true);
    setOcrPanelOpen(true);
    setOcrResult(null);
    const parts: string[] = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        setOcrProgress(`识别中…（${p}/${doc.numPages}）`);
        const page = await doc.getPage(p);
        const canvas = await renderPageToCanvas(page);
        const res = await runOcr(canvas);
        parts.push(`\n\n===== 第 ${p} 页 =====\n${res.text}`);
      }
      setOcrResult({ text: parts.join('\n').trim(), confidence: 0, page: 'all' });
    } catch (e) {
      setOcrResult({ text: `识别失败：${e instanceof Error ? e.message : String(e)}`, confidence: 0, page: 'all' });
    } finally {
      setOcrRunning(false);
      setOcrProgress('');
    }
  }, [doc, ocrRunning, renderPageToCanvas]);

  // 卸载时释放 OCR worker 内存
  useEffect(() => () => { terminateOcr(); }, []);

  // ===== 批注：当前页的批注 =====
  const pageAnnotations = annotations.filter((a) => a.page === pageNum);

  /**
   * R76 选区高亮：鼠标抬起时若选中文本则计算逐行归一化 rect 并弹出浮动工具栏。
   * 对齐 Zotero：选区跨多行 → 多条 rect（每行一条），缩放/翻页后仍精确命中。
   * 同行多段按 y 中心聚类合并为一条（避免一行内出现破碎高亮）。
   */
  const handleSelectionEnd = useCallback(() => {
    if (activeTool || !viewport || !pageWrapRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelectionPopup(null); return; }
    const range = sel.getRangeAt(0);
    const wrap = pageWrapRef.current;
    const wrapRect = wrap.getBoundingClientRect();
    // 仅处理落在页面区内的选区
    if (!range.intersectsNode(wrap) && !wrap.contains(range.commonAncestorContainer)) {
      setSelectionPopup(null); return;
    }
    const clientRects = Array.from(range.getClientRects());
    if (clientRects.length === 0) { setSelectionPopup(null); return; }

    // 转归一化并过滤落在页面外的零碎 rect
    const raw = clientRects
      .map((r) => ({
        x1: (r.left - wrapRect.left) / viewport.width,
        y1: (r.top - wrapRect.top) / viewport.height,
        x2: (r.right - wrapRect.left) / viewport.width,
        y2: (r.bottom - wrapRect.top) / viewport.height,
      }))
      .filter((r) => r.x2 - r.x1 > 1e-4 && r.y2 - r.y1 > 1e-4)
      .map((r) => ([
        Math.max(0, Math.min(1, r.x1)),
        Math.max(0, Math.min(1, r.y1)),
        Math.max(0, Math.min(1, r.x2)),
        Math.max(0, Math.min(1, r.y2)),
      ]) as [number, number, number, number]);

    if (raw.length === 0) { setSelectionPopup(null); return; }

    // 同行合并：按 y 中心聚类（容差为行高的 40%）
    const lineTol = Math.max(...raw.map((r) => (r[3] - r[1]))) * 0.4;
    raw.sort((a, b) => a[1] - b[1]);
    const merged: [number, number, number, number][] = [];
    for (const r of raw) {
      const last = merged[merged.length - 1];
      if (last && Math.abs((r[1] + r[3]) / 2 - (last[1] + last[3]) / 2) <= lineTol) {
        last[0] = Math.min(last[0], r[0]);
        last[2] = Math.max(last[2], r[2]);
        last[1] = Math.min(last[1], r[1]);
        last[3] = Math.max(last[3], r[3]);
      } else {
        merged.push([...r] as [number, number, number, number]);
      }
    }

    // 外接包围盒
    const bbox: [number, number, number, number] = [
      Math.min(...merged.map((r) => r[0])),
      Math.min(...merged.map((r) => r[1])),
      Math.max(...merged.map((r) => r[2])),
      Math.max(...merged.map((r) => r[3])),
    ];
    const text = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 300);
    // 弹层定位：选区末行右上方，clamp 进页面内
    const lastRect = merged[merged.length - 1];
    const left = Math.min(Math.max(lastRect[2] * viewport.width - 120, 8), viewport.width - 248);
    const top = Math.max(lastRect[1] * viewport.height - 48, 8);

    setSelectionPopup({ rects: merged, bbox, text, left, top });
  }, [activeTool, viewport]);

  /** R76：从当前选区创建批注 */
  const createFromSelection = useCallback((type: AnnotationType) => {
    if (!selectionPopup) return;
    const newAnno: Annotation = {
      id: `anno_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      page: pageNum,
      type,
      rect: selectionPopup.bbox,
      rects: selectionPopup.rects.length > 1 ? selectionPopup.rects : undefined,
      text: selectionPopup.text,
      note: '',
      color: ANNOTATION_COLORS[type].border,
      createdAt: new Date().toISOString(),
    };
    onAnnotationsChange?.([...annotations, newAnno]);
    setSelectedAnnotation(newAnno.id);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionPopup, pageNum, annotations, onAnnotationsChange]);

  /** 点击页面空白 → 若当前选了批注工具则在该位置新增批注 */
  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // R76：若刚完成文本选区（非折叠），不触发点选批注，让选区弹层接管
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (!activeTool || !viewport) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewport.width;
    const y = (e.clientY - rect.top) / viewport.height;
    const newAnno: Annotation = {
      id: `anno_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      page: pageNum,
      type: activeTool,
      rect: [Math.max(0, x - 0.06), Math.max(0, y - 0.015), Math.min(1, x + 0.06), Math.min(1, y + 0.015)],
      text: '',
      note: '',
      color: ANNOTATION_COLORS[activeTool].border,
      createdAt: new Date().toISOString(),
    };
    onAnnotationsChange?.([...annotations, newAnno]);
    setSelectedAnnotation(newAnno.id);
    setActiveTool(null);
  }, [activeTool, viewport, pageNum, annotations, onAnnotationsChange]);

  /** 删除批注 */
  const deleteAnnotation = useCallback((id: string) => {
    onAnnotationsChange?.(annotations.filter((a) => a.id !== id));
    setSelectedAnnotation(null);
  }, [annotations, onAnnotationsChange]);

  /** 更新批注 note */
  const updateAnnotationNote = useCallback((id: string, note: string) => {
    onAnnotationsChange?.(annotations.map((a) => (a.id === id ? { ...a, note } : a)));
  }, [annotations, onAnnotationsChange]);

  const currentAnno = selectedAnnotation ? annotations.find((a) => a.id === selectedAnnotation) : null;

  return (
    <div className="pdf-reader" role="dialog" aria-label={title ? `PDF 阅读器：${title}` : 'PDF 阅读器'}>
      {/* ===== 工具栏 ===== */}
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-left">
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="关闭阅读器">
              <Icon name="close" size={16} />
            </button>
          )}
          {/* R77：侧边栏开关 */}
          <button
            className={`icon-btn ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="切换侧边栏"
            aria-pressed={sidebarOpen}
            title="侧边栏（批注 / 大纲）"
          >
            <Icon name="menu" size={16} />
          </button>
          {title && <span className="pdf-title" title={title}>{title}</span>}
        </div>

        <div className="pdf-toolbar-center">
          <button className="icon-btn" onClick={goPrev} disabled={pageNum <= 1} aria-label="上一页">
            <Icon name="chevronRight" size={15} className="icon-flip" />
          </button>
          <span className="pdf-page-info">
            <input
              className="pdf-page-input"
              type="number"
              min={1}
              max={numPages}
              value={pageNum}
              onChange={(e) => goTo(parseInt(e.target.value, 10) || 1)}
              aria-label="页码"
            />
            <span className="pdf-page-total">/ {numPages}</span>
          </span>
          <button className="icon-btn" onClick={goNext} disabled={pageNum >= numPages} aria-label="下一页">
            <Icon name="chevronRight" size={15} />
          </button>
          <span className="pdf-sep" />
          <button className="icon-btn" onClick={zoomOut} disabled={scale <= 0.5} aria-label="缩小">
            <span className="pdf-zoom-icon">−</span>
          </button>
          <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={zoomIn} disabled={scale >= 3} aria-label="放大">
            <span className="pdf-zoom-icon">+</span>
          </button>
        </div>

        <div className="pdf-toolbar-right">
          <button
            className={`icon-btn ${ocrPanelOpen ? 'active' : ''}`}
            onClick={() => setOcrPanelOpen((v) => !v)}
            disabled={ocrRunning}
            title={`OCR 文字识别（${OCR_LANG_LABEL}）`}
            aria-label="OCR 文字识别"
            aria-pressed={ocrPanelOpen}
          >
            <Icon name="search" size={16} />
          </button>
          {ANNOTATION_TYPES.map((t) => (
            <button
              key={t}
              className={`pdf-tool-btn ${activeTool === t ? 'active' : ''}`}
              style={{ borderBottomColor: ANNOTATION_COLORS[t].border }}
              onClick={() => setActiveTool(activeTool === t ? null : t)}
              title={ANNOTATION_COLORS[t].label}
              aria-label={`批注工具：${ANNOTATION_COLORS[t].label}`}
              aria-pressed={activeTool === t}
            >
              <span className="pdf-tool-dot" style={{ background: ANNOTATION_COLORS[t].border }} />
              <span className="pdf-tool-label">{ANNOTATION_COLORS[t].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== R77 阅读区：侧边栏 + 页面区 ===== */}
      <div className="pdf-body-wrapper">
        {/* ===== R77 左侧栏：批注列表 / 大纲导航 ===== */}
        {sidebarOpen && (
          <aside className="pdf-sidebar" aria-label="批注与大纲侧栏">
            <div className="pdf-sidebar-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={sidebarTab === 'annotations'}
                className={`pdf-sidebar-tab ${sidebarTab === 'annotations' ? 'active' : ''}`}
                onClick={() => setSidebarTab('annotations')}
              >
                批注（{annotations.length}）
              </button>
              <button
                role="tab"
                aria-selected={sidebarTab === 'outline'}
                className={`pdf-sidebar-tab ${sidebarTab === 'outline' ? 'active' : ''}`}
                onClick={() => setSidebarTab('outline')}
              >
                大纲
              </button>
            </div>
            <div className="pdf-sidebar-content">
              {sidebarTab === 'annotations' && (
                annotations.length === 0 ? (
                  <p className="pdf-sidebar-empty">暂无批注。选中文本或选择工具后在页面上添加。</p>
                ) : (
                  <ul className="pdf-anno-list" ref={annoListRef}>
                    {annotations
                      .slice()
                      .sort((a, b) => a.page - b.page)
                      .map((a) => {
                        const c = ANNOTATION_COLORS[a.type];
                        const isActive = selectedAnnotation === a.id;
                        return (
                          <li key={a.id} data-anno-id={a.id}>
                            <button
                              className={`pdf-anno-item ${isActive ? 'active' : ''}`}
                              onClick={() => { setPageNum(a.page); setSelectedAnnotation(a.id); triggerPulse(a.id); }}
                              aria-current={isActive}
                            >
                              <span className="pdf-tool-dot" style={{ background: c.border, flexShrink: 0 }} />
                              <span className="pdf-anno-item-main">
                                <span className="pdf-anno-item-top">
                                  <span className="pdf-anno-item-type">{c.label}</span>
                                  <span className="pdf-anno-item-page">第 {a.page} 页</span>
                                </span>
                                <span className="pdf-anno-item-text">
                                  {(a.text || a.note || '').slice(0, 60) || '(无文本)'}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )
              )}
              {sidebarTab === 'outline' && (
                outline === null ? (
                  <p className="pdf-sidebar-empty">正在解析大纲…</p>
                ) : outline.length === 0 ? (
                  <p className="pdf-sidebar-empty">此 PDF 无目录大纲，且未识别到 IMRaD 章节结构。</p>
                ) : (
                  <>
                    {outline[0]?.auto && (
                      <p className="pdf-outline-auto-badge">自动识别（IMRaD 启发式，非原书目录）</p>
                    )}
                    <ul className="pdf-outline-tree" role="tree">
                      {outline.map((node, i) => (
                        <OutlineItem key={`${node.title}-${i}`} node={node} onJump={goTo} />
                      ))}
                    </ul>
                  </>
                )
              )}
            </div>
          </aside>
        )}

      {/* ===== 页面区 ===== */}
      <div className="pdf-body" ref={containerRef}>
        {/* ===== R85 扫描版 PDF 提示 ===== */}
        {scannedHint && !ocrRunning && (
          <div className="pdf-ocr-hint" role="status">
            <Icon name="search" size={15} />
            <span>检测到扫描版 PDF（无可提取文本层）。点击右上角 OCR 按钮识别文字。</span>
            <button className="pdf-ocr-hint-btn" onClick={runOcrPage}>识别本页</button>
            <button className="icon-btn" onClick={() => setScannedHint(false)} aria-label="关闭提示"><Icon name="close" size={13} /></button>
          </div>
        )}
        {loading && (
          <div className="pdf-loading">
            <div className="skeleton" style={{ width: 400, height: 560, maxWidth: '90vw' }} />
            <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>正在加载 PDF…</p>
          </div>
        )}
        {error && (
          <div className="pdf-error">
            <Icon name="empty" size={40} strokeWidth={1.2} />
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && (
          <div
            ref={pageWrapRef}
            className={`pdf-page-wrap ${activeTool ? 'tool-active' : ''}`}
            onClick={handlePageClick}
            onMouseUp={handleSelectionEnd}
            onMouseDown={(e) => {
              // 点空白处清空选区弹层（弹层自身 stopPropagation）
              if (selectionPopup && !(e.target as HTMLElement).closest('.pdf-selection-popover')) {
                setSelectionPopup(null);
              }
            }}
            style={{ cursor: activeTool ? 'crosshair' : 'default' }}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            {/* ===== 文本层（R76 选区高亮前置）===== */}
            <div ref={textLayerRef} className="textLayer pdf-text-layer" />
            {/* ===== 批注覆盖层 ===== */}
            {viewport && pageAnnotations.flatMap((a) => {
              const color = ANNOTATION_COLORS[a.type];
              // R76：有 rects 时逐行渲染；否则退回单一 rect（R75 兼容）
              const rects = a.rects && a.rects.length > 0 ? a.rects : [a.rect];
              return rects.map((r, idx) => {
                const [x1, y1, x2, y2] = r;
                const style: React.CSSProperties = {
                  position: 'absolute',
                  left: x1 * viewport.width,
                  top: y1 * viewport.height,
                  width: (x2 - x1) * viewport.width,
                  height: (y2 - y1) * viewport.height,
                  background: color.bg,
                  border: a.type === 'underline' ? 'none' : (rects.length > 1 && idx > 0 ? 'none' : `1.5px solid ${color.border}`),
                  borderBottom: a.type === 'underline' ? `2px solid ${color.border}` : undefined,
                  textDecoration: a.type === 'strikeout' ? 'line-through' : undefined,
                  borderRadius: 2,
                  cursor: 'pointer',
                  zIndex: selectedAnnotation === a.id ? 10 : 5,
                  boxShadow: selectedAnnotation === a.id ? `0 0 0 2px ${color.border}` : undefined,
                };
                return (
                  <div
                    key={`${a.id}-${idx}`}
                    className={`pdf-annotation ${pulseId === a.id ? 'pdf-anno-pulse' : ''}`}
                    style={style}
                    role="button"
                    tabIndex={0}
                    aria-label={`${color.label}批注${a.note ? `：${a.note}` : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedAnnotation(a.id === selectedAnnotation ? null : a.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedAnnotation(a.id); }}
                  />
                );
              });
            })}

            {/* ===== R76 选区浮动工具栏 ===== */}
            {selectionPopup && viewport && (
              <div
                className="pdf-selection-popover"
                role="toolbar"
                aria-label="选区批注工具栏"
                style={{ left: selectionPopup.left, top: selectionPopup.top }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <span className="pdf-sel-count">{selectionPopup.rects.length} 行</span>
                {ANNOTATION_TYPES.map((t, i) => (
                  <button
                    key={t}
                    className="pdf-sel-btn"
                    title={`${ANNOTATION_COLORS[t].label}（${i + 1}）`}
                    aria-label={`${ANNOTATION_COLORS[t].label}`}
                    onClick={() => createFromSelection(t)}
                  >
                    <span className="pdf-tool-dot" style={{ background: ANNOTATION_COLORS[t].border }} />
                    <span className="pdf-sel-label">{ANNOTATION_COLORS[t].label}</span>
                  </button>
                ))}
                <button
                  className="pdf-sel-cancel"
                  title="取消（Esc）"
                  aria-label="取消"
                  onClick={() => { setSelectionPopup(null); window.getSelection()?.removeAllRanges(); }}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== R85 OCR 结果面板（底部抽屉）===== */}
        {ocrPanelOpen && (
          <div className="pdf-ocr-panel" role="region" aria-label="OCR 识别结果">
            <div className="pdf-ocr-panel-header">
              <span className="pdf-ocr-panel-title">
                <Icon name="search" size={14} /> OCR 文字识别
              </span>
              <span className="pdf-ocr-lang">{OCR_LANG_LABEL}</span>
              <div className="pdf-ocr-actions">
                <button className="btn btn-sm" onClick={runOcrPage} disabled={ocrRunning || !doc}>
                  {ocrRunning && ocrResult === null ? '…' : '识别本页'}
                </button>
                <button className="btn btn-sm" onClick={runOcrAll} disabled={ocrRunning || !doc}>
                  识别全部
                </button>
                {ocrResult?.text && !ocrRunning && (
                  <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(ocrResult.text); }}>复制全文</button>
                )}
                <button className="icon-btn" onClick={() => setOcrPanelOpen(false)} aria-label="关闭 OCR 面板"><Icon name="close" size={14} /></button>
              </div>
            </div>
            {ocrRunning && (
              <div className="pdf-ocr-progress">{ocrProgress || '加载 OCR 引擎与语言数据（首次约 5–10 秒）…'}</div>
            )}
            {!ocrRunning && ocrResult && (
              <>
                {ocrResult.confidence > 0 && (
                  <div className="pdf-ocr-meta">
                    {ocrResult.page === 'all' ? '全文' : `第 ${ocrResult.page} 页`} · 置信度 {ocrResult.confidence}%
                  </div>
                )}
                <textarea
                  className="pdf-ocr-text"
                  value={ocrResult.text || '（未识别到文字，可能图片清晰度不足）'}
                  readOnly
                  rows={10}
                  aria-label="OCR 识别文本"
                />
              </>
            )}
            {!ocrRunning && !ocrResult && (
              <p className="pdf-ocr-empty">点击「识别本页」或「识别全部」开始。扫描版 PDF / 图片文献首次使用需下载引擎（约 7MB，浏览器自动缓存）。</p>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ===== 批注详情弹层 ===== */}
      {currentAnno && (
        <div className="pdf-anno-popover" role="dialog" aria-label="批注详情">
          <div className="pdf-anno-header">
            <span className="pdf-tool-dot" style={{ background: ANNOTATION_COLORS[currentAnno.type].border }} />
            <span className="pdf-anno-type">{ANNOTATION_COLORS[currentAnno.type].label}</span>
            <span className="pdf-anno-page">第 {currentAnno.page} 页</span>
            <button className="icon-btn" onClick={() => deleteAnnotation(currentAnno.id)} aria-label="删除批注" style={{ marginLeft: 'auto' }}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <textarea
            className="input pdf-anno-note"
            placeholder="添加批注内容…"
            value={currentAnno.note}
            onChange={(e) => updateAnnotationNote(currentAnno.id, e.target.value)}
            rows={3}
          />
        </div>
      )}

      {/* ===== 状态栏 ===== */}
      <div className="pdf-statusbar">
        <span>第 {pageNum} / {numPages} 页</span>
        <span>{pageAnnotations.length} 条批注</span>
        <span className="pdf-hint">←→ 翻页 · +/− 缩放 · 选中文本直接高亮 · Esc 取消</span>
      </div>
    </div>
  );
}

/** R77：大纲树递归节点 */
function OutlineItem({ node, onJump }: { node: OutlineNode; onJump: (n: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className="pdf-outline-row" style={{ paddingLeft: 8 + node.depth * 14 }}>
        {hasChildren ? (
          <button
            className="pdf-outline-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? '折叠' : '展开'}
          >
            <Icon name="chevronRight" size={11} className={expanded ? 'icon-rotate-90' : ''} />
          </button>
        ) : (
          <span className="pdf-outline-bullet" />
        )}
        <button
          className="pdf-outline-link"
          disabled={node.page === null}
          onClick={() => node.page !== null && onJump(node.page)}
          title={node.page !== null ? `跳转到第 ${node.page} 页` : '无可定位目标'}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul role="group" className="pdf-outline-children">
          {node.children.map((child, i) => (
            <OutlineItem key={`${child.title}-${i}`} node={child} onJump={onJump} />
          ))}
        </ul>
      )}
    </li>
  );
}
