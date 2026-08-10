/** 文献详情侧滑面板（移动端 BottomSheet / 桌面 aside 双形态，从 ReferencesView.tsx 抽离）。 */

import { useState } from 'react';
import type { Reference } from '@apptypes/reference';
import { Icon } from '@components/ui/Icon';
import { StatusChip } from '@components/ui/StatusChip';
import { BottomSheet } from '@components/layout/BottomSheet';
import { referenceOnlineUrl } from '@utils/referenceIntegrity';
import { generateGBT7714 } from './referenceFactory';

export function RefDetailPanel({ ref: r, onClose, onOpenPdf, onConvertMd, onOpenWeb, onDelete, oaPdfUrl, oaLoading, onLookupOa, asSheet }: { ref: Reference; onClose: () => void; onOpenPdf: (id: string) => void; onConvertMd: (id: string) => void; onOpenWeb: (url: string) => void; onDelete: (id: string) => void; oaPdfUrl: string | null; oaLoading: boolean; onLookupOa: (referenceId: string, doi: string) => void; asSheet?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onlineUrl = referenceOnlineUrl(r);
  const doiUrl = r.doi ? referenceOnlineUrl({ url: '', uri: '', doi: r.doi }) : null;

  function copyCitation() {
    const text = generateGBT7714(r);
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
            {generateGBT7714(r)}
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
            {generateGBT7714(r)}
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
