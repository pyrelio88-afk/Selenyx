/**
 * Selenyx 临床数据 —— NANDA 护理诊断 / 检验参考值 / 护理科研术语表
 * R80: 从空壳替换为前端内置完整数据集，支持搜索与分类筛选
 */

import { useState, useMemo } from 'react';
import { Icon } from '@components/ui/Icon';
import { NANDA_DIAGNOSES, LAB_VALUES, GLOSSARY } from '../../data/clinical';

type Tab = 'nanda' | 'labs' | 'glossary';

export function ClinicalDataView() {
  const [tab, setTab] = useState<Tab>('nanda');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const nandaDomains = useMemo(() => [...new Set(NANDA_DIAGNOSES.map((d) => d.domain))].sort(), []);
  const labCats = useMemo(() => [...new Set(LAB_VALUES.map((l) => l.category))].sort(), []);
  const glossCats = useMemo(() => [...new Set(GLOSSARY.map((g) => g.category))].sort(), []);

  const filteredNanda = useMemo(() => {
    return NANDA_DIAGNOSES.filter((d) => {
      const matchSearch = !search || d.name.includes(search) || d.code.includes(search) || d.definition.includes(search);
      const matchCat = !category || d.domain === category;
      return matchSearch && matchCat;
    });
  }, [search, category]);

  const filteredLabs = useMemo(() => {
    return LAB_VALUES.filter((l) => {
      const matchSearch = !search || l.name.includes(search) || l.critical.includes(search);
      const matchCat = !category || l.category === category;
      return matchSearch && matchCat;
    });
  }, [search, category]);

  const filteredGloss = useMemo(() => {
    return GLOSSARY.filter((g) => {
      const matchSearch = !search || g.zh.includes(search) || g.en.toLowerCase().includes(search.toLowerCase()) || g.definition.includes(search);
      const matchCat = !category || g.category === category;
      return matchSearch && matchCat;
    });
  }, [search, category]);

  function switchTab(t: Tab) {
    setTab(t);
    setSearch('');
    setCategory('');
    setExpanded(null);
  }

  const cats = tab === 'nanda' ? nandaDomains : tab === 'labs' ? labCats : glossCats;
  const count = tab === 'nanda' ? filteredNanda.length : tab === 'labs' ? filteredLabs.length : filteredGloss.length;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">临床数据</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {tab === 'nanda' ? `${NANDA_DIAGNOSES.length} 条 NANDA 诊断` : tab === 'labs' ? `${LAB_VALUES.length} 项检验值` : `${GLOSSARY.length} 条术语`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['nanda', 'labs', 'glossary'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`} onClick={() => switchTab(t)}>
            {t === 'nanda' ? 'NANDA 诊断' : t === 'labs' ? '检验值' : '术语表'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon name="search" size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input className="input" placeholder="搜索名称、编码、定义..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }}>
          <option value="">全部分类</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>显示 {count} 条结果</p>

      {/* NANDA 诊断 */}
      {tab === 'nanda' && (
        <div className="grid grid-2">
          {filteredNanda.map((d) => (
            <div key={d.code} className="card" style={{ cursor: 'pointer', padding: 16 }} onClick={() => setExpanded(expanded === d.code ? null : d.code)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.code}</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{d.name}</h3>
                </div>
                <span className="field-badge" style={{ whiteSpace: 'nowrap' }}>{d.domain}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d.definition}</p>
              {expanded === d.code && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {d.definingCharacteristics.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>诊断特征</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {d.definingCharacteristics.map((c) => <span key={c} className="tag-chip">{c}</span>)}
                      </div>
                    </div>
                  )}
                  {d.relatedFactors.length > 0 && (
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>相关因素</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {d.relatedFactors.map((f) => <span key={f} className="tag-chip tag-chip-alt">{f}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 检验值 */}
      {tab === 'labs' && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>检验项目</th>
                <th>分类</th>
                <th>参考范围</th>
                <th>单位</th>
                <th>危急值</th>
                <th>护理要点</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabs.map((l) => (
                <tr key={l.name}>
                  <td style={{ fontWeight: 500 }}>{l.name}</td>
                  <td><span className="field-badge">{l.category}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{l.range}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{l.unit}</td>
                  <td style={{ fontSize: 12, color: 'var(--danger)' }}>{l.critical}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.nursingNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 术语表 */}
      {tab === 'glossary' && (
        <div className="grid grid-2">
          {filteredGloss.map((g, i) => (
            <div key={i} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{g.zh}</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{g.en}</span>
                </div>
                <span className="field-badge">{g.category}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 6 }}>{g.definition}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
