import { useState, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '@stores/appStore';
import { FIELD_LABELS } from '@types/index';
import type { Reference } from '@types/reference';
import { Icon } from '@components/ui/Icon';
import { StatusChip } from '@components/ui/StatusChip';
import { importReferences, exportBibTeX, exportRIS } from '@utils/referenceConverter';

export function ReferencesView() {
  const { references, searchQuery, setSearchQuery, addReferences } = useAppStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
    return result;
  }, [references, searchQuery, filterType]);

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
          <div className="export-group">
            <button className="btn" aria-label="导出文献" onClick={() => handleExport('bibtex')}><Icon name="download" size={16} /> 导出 BibTeX</button>
          </div>
          <button className="btn" aria-label="导出 RIS" onClick={() => handleExport('ris')}>导出 RIS</button>
          <button className="btn" aria-label="在线检索"><Icon name="search" size={16} /> 检索</button>
          <button className="btn btn-primary" aria-label="新建文献"><Icon name="plus" size={16} /> 新建</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="搜索标题、作者、DOI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
          aria-label="搜索文献"
        />
        <select className="input" style={{ width: 160 }} value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="按类型筛选">
          <option value="all">全部类型</option>
          <option value="journalArticle">期刊论文</option>
          <option value="book">书籍</option>
          <option value="preprint">预印本</option>
          <option value="webpage">网页</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="references" size={48} strokeWidth={1.2} /></div>
          <p>暂无文献。点击「检索」从 OpenAlex/Crossref/arXiv 检索，或「导入」BibTeX/RIS。</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{FIELD_LABELS.title}</th>
                <th>{FIELD_LABELS.creators}</th>
                <th>{FIELD_LABELS.publication}</th>
                <th>{FIELD_LABELS.year}</th>
                <th>DOI</th>
                <th>状态</th>
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
      {selected && <RefDetailPanel ref={selected} onClose={closePanel} />}

      {/* 操作反馈 toast */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}
    </div>
  );
}

/** 文献详情侧滑面板 */
function RefDetailPanel({ ref: r, onClose }: { ref: Reference; onClose: () => void }) {
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

        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary" style={{ flex: 1 }}><Icon name="download" size={15} /> 获取全文</button>
          <button className="btn" style={{ flex: 1 }}><Icon name="tag" size={15} /> 编辑标签</button>
        </div>
      </div>
    </aside>
  );
}
