/**
 * Selenyx 学科数据 —— 全学科覆盖（R83 重构）
 * 13 个中国学科门类 · 每学科含大量术语表/公式参考值/标准规范
 * 用 SVG 图标替代 emoji（R83 用户要求：少用 emoji，多用真实图标）
 */

import { useState, useMemo } from 'react';
import { Icon } from '@components/ui/Icon';
import { DISCIPLINES, type Discipline } from '../../data/disciplines';

type Tab = 'glossary' | 'formulas' | 'standards';

/** 学科 SVG 图标映射 —— 替代 emoji */
const DISCIPLINE_ICONS: Record<string, string> = {
  philosophy: 'M12 2L6 8v8l6 6 6-6V8l-6-6zM12 4.8L16 8.8v6.4L12 19.2 8 15.2V8.8L12 4.8z',
  economics: 'M3 13h2v8H3v-8zm4-6h2v14H7V7zm4 4h2v10h-2V11zm4-7h2v17h-2V4zm4 9h2v8h-2v-8z',
  law: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z',
  education: 'M12 3L1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v4L12 21l7-3.8v-4L12 17l-7-3.8z',
  literature: 'M21 5c-1.1-.4-2.3-.5-3.5-.5C15.6 4.5 13.5 5.3 12 6.5 10.5 5.3 8.4 4.5 6.5 4.5 5.3 4.5 4.1 4.6 3 5v14.5c0 .6.4 1 1 1 .2 0 .3 0 .5-.1 1-.4 2.3-.4 3.5-.4 1.9 0 4 .8 5.5 2 1.4-1 3.6-2 5.5-2 1.2 0 2.5.1 3.5.4.2.1.3.1.5.1.6 0 1-.4 1-1V5zM12 18.5c-1.2-.8-3.1-1.5-5.5-1.5-1 0-2 .1-3 .3V6.5c1-.2 2-.3 3-.3 2 0 4 .7 5.5 1.7v10.6z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.9 3.9.1.1L9 12H6a7 7 0 1 1 2 4.9l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2L13 12.5V8h-2z',
  science: 'M7 2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h.5L5 20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1l-2.5-11H17a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H7zm0 2h10v3H7V4zm1.6 5h6.8l2.3 10H6.3L8.6 9z',
  engineering: 'M22 9L12 4 2 9l10 5 10-5zm0 5l-10 5-10-5M22 7l-10 5L2 7',
  agriculture: 'M12 22S4 16 4 10a8 8 0 0 1 16 0c0 6-8 12-8 12zm0-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  medicine: 'M19 8h-2V6a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7 9v-2H9v-2h3V9h2v4h3v2h-3v2h-2zM9 6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9V6z',
  management: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  art: 'M12 2C6.5 2 2 5.6 2 10c0 2.1 1.1 4 2.8 5.3L4 20l4.5-2c1.1.3 2.3.5 3.5.5 5.5 0 10-3.6 10-8s-4.5-8-10-8zm-3 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  military: 'M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm0 2.2L18 6.3v4.7c0 4-2.9 7.8-6 9-3.1-1.2-6-5-6-9V6.3L12 4.2z',
};

function DisciplineIcon({ id, size = 32, color }: { id: string; size?: number; color?: string }) {
  const path = DISCIPLINE_ICONS[id] || DISCIPLINE_ICONS.science;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

export function ClinicalDataView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('glossary');
  const [glossaryCategory, setGlossaryCategory] = useState<string>('');

  const selected = useMemo(() => DISCIPLINES.find((d) => d.id === selectedId), [selectedId]);

  const filteredDisciplines = useMemo(() => {
    if (!search) return DISCIPLINES;
    const s = search.toLowerCase();
    return DISCIPLINES.filter((d) =>
      d.name.includes(search) || d.nameEn.toLowerCase().includes(s) ||
      d.description.includes(search) ||
      d.glossary.some((g) => g.term.includes(search) || g.termEn.toLowerCase().includes(s)) ||
      d.formulas.some((f) => f.name.includes(search))
    );
  }, [search]);

  // 学科卡片网格视图
  if (!selected) {
    return (
      <div>
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h1 className="view-title">学科数据</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            覆盖中国 13 个学科门类 · {DISCIPLINES.reduce((a, d) => a + d.glossary.length, 0)} 个术语 / {DISCIPLINES.reduce((a, d) => a + d.formulas.length, 0)} 个公式 / {DISCIPLINES.reduce((a, d) => a + d.standards.length, 0)} 个标准
          </p>
        </div>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input
            className="input"
            placeholder="搜索学科、术语或公式…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <Icon name="search" size={16} />
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {filteredDisciplines.map((d) => (
            <button
              key={d.id}
              onClick={() => { setSelectedId(d.id); setTab('glossary'); setGlossaryCategory(''); }}
              className="stat-card"
              style={{
                cursor: 'pointer', textAlign: 'left', borderLeft: `4px solid ${d.color}`,
                transition: 'transform var(--motion-fast) var(--ease-standard)',
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <DisciplineIcon id={d.id} size={32} color={d.color} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{d.nameEn}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.description}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
                <span>{d.glossary.length} 术语</span>
                <span>{d.formulas.length} 公式</span>
                <span>{d.standards.length} 标准</span>
              </div>
            </button>
          ))}
        </div>
        {filteredDisciplines.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            未找到匹配的学科或术语
          </div>
        )}
      </div>
    );
  }

  // 学科详情视图
  const glossaryCats = [...new Set(selected.glossary.map((g) => g.category))].sort();
  const filteredGlossary = glossaryCategory
    ? selected.glossary.filter((g) => g.category === glossaryCategory)
    : selected.glossary;

  return (
    <div>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => setSelectedId(null)} style={{ padding: '6px 12px' }}>
          <Icon name="close" size={16} /> 返回
        </button>
        <DisciplineIcon id={selected.id} size={28} color={selected.color} />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.nameEn} · {selected.description}</span>
        </div>
      </div>

      {/* 标签页 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {([
          { key: 'glossary' as Tab, label: `术语表 (${selected.glossary.length})` },
          { key: 'formulas' as Tab, label: `公式与参考值 (${selected.formulas.length})` },
          { key: 'standards' as Tab, label: `标准规范 (${selected.standards.length})` },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent',
              borderBottom: tab === t.key ? `2px solid ${selected.color}` : '2px solid transparent',
              color: tab === t.key ? selected.color : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: 13,
              marginBottom: '-2px', transition: 'all var(--transition)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 术语表 */}
      {tab === 'glossary' && (
        <div>
          {glossaryCats.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => setGlossaryCategory('')}
                className={`btn ${!glossaryCategory ? 'btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >全部 ({selected.glossary.length})</button>
              {glossaryCats.map((c) => {
                const count = selected.glossary.filter((g) => g.category === c).length;
                return (
                  <button
                    key={c}
                    onClick={() => setGlossaryCategory(c)}
                    className={`btn ${glossaryCategory === c ? 'btn-primary' : ''}`}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >{c} ({count})</button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredGlossary.map((g, i) => (
              <div key={`${g.term}-${i}`} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: selected.color }}>{g.term}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.termEn}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-canvas)', color: 'var(--text-muted)',
                  }}>{g.category}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{g.definition}</div>
              </div>
            ))}
          </div>
          {filteredGlossary.length > 50 && (
            <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
              显示 {filteredGlossary.length} 条术语
            </div>
          )}
        </div>
      )}

      {/* 公式与参考值 */}
      {tab === 'formulas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selected.formulas.map((f) => (
            <div key={f.name} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: selected.color }}>{f.name}</span>
                {f.unit && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600,
                  }}>{f.unit}</span>
                )}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600,
                background: 'var(--bg-canvas)', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)', marginBottom: 6, overflowX: 'auto',
              }}>{f.formula}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.description}</div>
              {f.reference && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>来源：{f.reference}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 标准规范 */}
      {tab === 'standards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selected.standards.map((s) => (
            <div key={s.code} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                background: selected.color, color: '#fff', fontWeight: 700, flexShrink: 0, marginTop: 2,
              }}>{s.code}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
