/**
 * anydoc 文档转 Markdown 模态
 *
 * 集成于 Selenyx「全文」段：上传 PDF/Word/Excel/PPT/EPUB 等文档，
 * 在浏览器本地用 Firecrawl anydoc (WASM) 转为 GitHub-Flavored Markdown，
 * 供精读流程使用。文件不出机器。
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Icon } from '@components/ui/Icon';
import {
  convertToMarkdown,
  describeAnydocError,
  isAnydocSupported,
  ANYDOC_ACCEPT,
  type AnydocResult,
} from '@services/anydocConvert';

type Status = 'idle' | 'converting' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 初始文件（从文献详情「转 Markdown」按钮带过来） */
  initialFile?: File | null;
  /** 保存为文献笔记回调 */
  onSaveToNotes?: (markdown: string, filename: string) => void;
}

export function AnydocConvertModal({ open, onClose, initialFile, onSaveToNotes }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnydocResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时若有初始文件则自动转换
  useEffect(() => {
    if (open && initialFile) {
      setFileName(initialFile.name);
      runConvert(initialFile);
    } else if (!open) {
      // 关闭时重置
      setStatus('idle');
      setResult(null);
      setFileName('');
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const runConvert = useCallback(async (file: File) => {
    setStatus('converting');
    setResult(null);
    const res = await convertToMarkdown(file);
    setResult(res);
    setStatus(res.ok ? 'done' : 'error');
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!isAnydocSupported(file.name)) {
      setStatus('error');
      setResult({ ok: false, errorCode: 'unsupported', errorMessage: `不支持的文件类型：${file.name}` });
      setFileName(file.name);
      return;
    }
    setFileName(file.name);
    runConvert(file);
  }, [runConvert]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const copyMarkdown = useCallback(() => {
    if (!result?.markdown) return;
    const md = result.markdown;
    navigator.clipboard?.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('复制以下 Markdown：', md.slice(0, 5000));
    });
  }, [result]);

  const downloadMd = useCallback(() => {
    if (!result?.markdown) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.[^.]+$/, '') + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [result, fileName]);

  if (!open) return null;

  const charCount = result?.markdown?.length ?? 0;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-card anydoc-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '92%', maxWidth: 880, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        role="dialog"
        aria-label="文档转 Markdown"
      >
        {/* 头部 */}
        <div className="anydoc-modal-header" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <Icon name="import" size={18} />
          <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>文档转 Markdown · anydoc</span>
          <span className="status-chip" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 11 }}>
            本地转换 · 文件不出机器
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><Icon name="close" size={18} /></button>
        </div>

        {/* 说明条 */}
        <div style={{
          padding: '8px 20px', fontSize: 11.5, color: 'var(--text-muted)',
          background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          支持 PDF / Word / PowerPoint / Excel / OpenDocument / RTF / EPUB / CSV。
          <strong style={{ color: 'var(--warning, #b8860b)' }}>注意：扫描版（图片型）PDF 无法转换</strong>
          ——anydoc 仅提取含文本层的 PDF，无 OCR 能力；扫描版请先用 OCR 工具处理。
        </div>

        {/* 主体 */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 16 }}>
          {/* 空闲/拖拽区 */}
          {(status === 'idle' || status === 'error') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className="anydoc-dropzone"
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'var(--accent-light)' : 'var(--bg-surface)',
                transition: 'var(--transition)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="import" size={40} strokeWidth={1.2} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                {status === 'error' ? '转换失败，点击重新选择文件' : '点击或拖拽文档到此处'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {ANYDOC_ACCEPT}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ANYDOC_ACCEPT}
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />
            </div>
          )}

          {/* 转换中 */}
          {status === 'converting' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>正在本地转换…</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>首次使用需初始化转换引擎（约 6MB），稍后即快</div>
            </div>
          )}

          {/* 错误 */}
          {status === 'error' && result && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--danger, #c3272b)', fontWeight: 600 }}>
                <Icon name="warning" size={18} /> 转换失败
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {describeAnydocError(result.errorCode, result.errorMessage)}
              </div>
              {result.errorCode && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  错误码：{result.errorCode}{result.elapsedMs ? ` · 耗时 ${result.elapsedMs}ms` : ''}
                </div>
              )}
            </div>
          )}

          {/* 成功 */}
          {status === 'done' && result?.markdown && (
            <>
              {/* 结果元信息 + 工具栏 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                <span className="status-chip" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>
                  ✓ {result.format?.toUpperCase() || '已转换'}
                </span>
                <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                  {charCount.toLocaleString()} 字符
                </span>
                {result.elapsedMs != null && (
                  <span className="status-chip" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                    {result.elapsedMs}ms
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm" onClick={copyMarkdown}>
                  <Icon name="check" size={14} /> {copied ? '已复制' : '复制'}
                </button>
                <button className="btn btn-sm" onClick={downloadMd}>
                  <Icon name="download" size={14} /> 下载 .md
                </button>
                {onSaveToNotes && (
                  <button className="btn btn-sm btn-primary" onClick={() => onSaveToNotes(result.markdown!, fileName)}>
                    <Icon name="tag" size={14} /> 存为笔记
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => { setStatus('idle'); setResult(null); }}>
                  <Icon name="import" size={14} /> 重新选择
                </button>
              </div>

              {/* Markdown 渲染 */}
              <div className="anydoc-md-viewer" style={{
                flex: 1, overflow: 'auto', padding: 16,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', fontSize: 13.5, lineHeight: 1.75,
              }}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {result.markdown}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
