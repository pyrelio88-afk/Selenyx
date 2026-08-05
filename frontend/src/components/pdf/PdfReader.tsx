/**
 * PDF.js 阅读器骨架
 *
 * 基于 pdfjs-dist 4.x（ESM + Web Worker）。
 * 对齐 Zotero / ReadCube Papers 阅读器模式：
 * - Canvas 渲染当前页，翻页（上一页/下一页/页码跳转）
 * - 缩放（50%–300%）
 * - 五色批注层骨架：highlight/note/bookmark/underline/strikeout 五种类型，
 *   归一化坐标存储（缩放不变），渲染为绝对定位覆盖层
 * - 批注点击 → 弹出批注详情（编辑 note / 删除）
 * - 键盘 ←/→ 翻页，+/- 缩放
 *
 * 骨架性质：批注创建用「点击页面空白处新增 note」演示；
 * 选区高亮（textLayer 选择 → rect）留 R76 接入 Selection API。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation, AnnotationType } from '@types/reference';
import { Icon } from '@components/ui/Icon';

// Worker 配置：pdfjs-dist 4.x 用 .mjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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

export function PdfReader({ source, annotations = [], onAnnotationsChange, onClose, title }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationType | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // ===== 加载文档 =====
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = typeof source === 'string' ? { url: source } : { data: source };
    pdfjsLib.getDocument(params).promise
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        setPageNum(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'PDF 加载失败');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [source]);

  // ===== 渲染当前页 =====
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    // 取消上一个渲染任务
    renderTaskRef.current?.cancel();

    doc.getPage(pageNum).then((page) => {
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
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === 'Escape') { setActiveTool(null); setSelectedAnnotation(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, zoomIn, zoomOut]);

  // ===== 批注：当前页的批注 =====
  const pageAnnotations = annotations.filter((a) => a.page === pageNum);

  /** 点击页面空白 → 若当前选了批注工具则在该位置新增批注 */
  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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

      {/* ===== 页面区 ===== */}
      <div className="pdf-body" ref={containerRef}>
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
            className={`pdf-page-wrap ${activeTool ? 'tool-active' : ''}`}
            onClick={handlePageClick}
            style={{ cursor: activeTool ? 'crosshair' : 'default' }}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            {/* ===== 批注覆盖层 ===== */}
            {viewport && pageAnnotations.map((a) => {
              const [x1, y1, x2, y2] = a.rect;
              const color = ANNOTATION_COLORS[a.type];
              const style: React.CSSProperties = {
                position: 'absolute',
                left: x1 * viewport.width,
                top: y1 * viewport.height,
                width: (x2 - x1) * viewport.width,
                height: (y2 - y1) * viewport.height,
                background: color.bg,
                border: a.type === 'underline' ? 'none' : `1.5px solid ${color.border}`,
                borderBottom: a.type === 'underline' ? `2px solid ${color.border}` : undefined,
                textDecoration: a.type === 'strikeout' ? 'line-through' : undefined,
                borderRadius: 2,
                cursor: 'pointer',
                zIndex: selectedAnnotation === a.id ? 10 : 5,
                boxShadow: selectedAnnotation === a.id ? `0 0 0 2px ${color.border}` : undefined,
              };
              return (
                <div
                  key={a.id}
                  className="pdf-annotation"
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-label={`${color.label}批注${a.note ? `：${a.note}` : ''}`}
                  onClick={(e) => { e.stopPropagation(); setSelectedAnnotation(a.id === selectedAnnotation ? null : a.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedAnnotation(a.id); }}
                />
              );
            })}
          </div>
        )}
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
        <span className="pdf-hint">←→ 翻页 · +/− 缩放 · Esc 取消工具</span>
      </div>
    </div>
  );
}
