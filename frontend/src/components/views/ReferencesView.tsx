import { useState, useMemo } from 'react';
import { useAppStore } from '@stores/appStore';
import { FIELD_LABELS } from '@types/index';

export function ReferencesView() {
  const { references, searchQuery, setSearchQuery } = useAppStore();
  const [filterType, setFilterType] = useState<string>('all');

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

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">文献库</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn">📥 导入</button>
          <button className="btn">🔍 检索</button>
          <button className="btn btn-primary">+ 新建</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="搜索标题、作者、DOI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="input" style={{ width: 160 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">全部类型</option>
          <option value="journalArticle">期刊论文</option>
          <option value="book">书籍</option>
          <option value="preprint">预印本</option>
          <option value="webpage">网页</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📚</div>
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
                <tr key={r.id}>
                  <td style={{ maxWidth: 300, fontWeight: 500 }}>{r.title}</td>
                  <td style={{ maxWidth: 150, color: 'var(--text-secondary)' }}>
                    {r.creators.slice(0, 2).map((c) => `${c.lastName}${c.firstName}`).join(', ')}
                    {r.creators.length > 2 && ' et al.'}
                  </td>
                  <td style={{ maxWidth: 150, color: 'var(--text-secondary)' }}>{r.publication}</td>
                  <td>{r.year}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.doi}</td>
                  <td>
                    <span style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 10,
                      background: r.readStatus === 'read' ? 'var(--accent-light)' : 'var(--bg-hover)',
                      color: r.readStatus === 'read' ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {r.readStatus === 'unread' ? '未读' : r.readStatus === 'reading' ? '阅读中' : r.readStatus === 'read' ? '已读' : '已归档'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
