/** 多源文献检索面板内容（从 ReferencesView.tsx 抽离）。 */

import { Icon } from '@components/ui/Icon';
import type { FetchedReference } from '@services/metadataFetch';
import { safeExternalUrl } from '@utils/referenceIntegrity';

export function LiteratureSearchContent({
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
