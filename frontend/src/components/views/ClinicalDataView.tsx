/**
 * Selenyx 学科数据 —— 全学科覆盖（R86 重构）
 * 四类数据：名词 / 数值参数 / 公式 / 标准规范
 * 点击条目打开词典级完整详情弹窗；支持自定义添加条目（localStorage 持久化）
 */

import { useState, useMemo } from 'react';
import { Icon } from '@components/ui/Icon';
import { versionedLoad, versionedSave } from '@lib/storage';
import { useIsMobile } from '@lib/useIsMobile';
import { BottomSheet } from '@components/layout/BottomSheet';
import {
  DISCIPLINES,
  type Discipline,
  type DisciplineGlossary,
  type DisciplineParameter,
  type DisciplineFormula,
  type DisciplineStandard,
} from '../../data/disciplines';

type Tab = 'glossary' | 'parameters' | 'formulas' | 'standards' | 'officialDocs';
type EntryKind = Tab;

/** 自定义条目存储 */
interface CustomEntry {
  kind: EntryKind;
  disciplineId: string;
  // 通用字段（按 kind 取用）
  term?: string; termEn?: string; definition?: string; category?: string; example?: string; aliases?: string;
  name?: string; symbol?: string; value?: string; unit?: string; description?: string;
  formula?: string; reference?: string; variables?: string;
  code?: string; issuer?: string; year?: string;
  source?: string;
}

const CUSTOM_KEY = 'selenyx-custom-entries';
const PAGE_SIZE = 50;

function loadCustomEntries(): CustomEntry[] {
  // D6：走 versionedLoad，自动迁移旧 -v1 裸数组格式 + 损坏回退空数组
  const { items } = versionedLoad<{ items: CustomEntry[] }>(CUSTOM_KEY, { items: [] });
  return Array.isArray(items) ? items : [];
}

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

/** 详情弹窗中选中的条目（统一包装） */
interface DetailTarget {
  kind: EntryKind;
  data: DisciplineGlossary | DisciplineParameter | DisciplineFormula | DisciplineStandard;
  customIndex?: number; // 自定义条目在列表中的下标（可删除）
}

function paramCount(d: Discipline): number {
  return d.parameters?.length ?? 0;
}

export function ClinicalDataView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('glossary');
  const [glossaryCategory, setGlossaryCategory] = useState<string>('');
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [customEntries, setCustomEntries] = useState<CustomEntry[]>(loadCustomEntries);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(0);

  const isMobile = useIsMobile();

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

  function saveCustom(next: CustomEntry[]) {
    setCustomEntries(next);
    versionedSave(CUSTOM_KEY, { items: next });
  }

  function deleteCustom(index: number) {
    // index 是全局 customEntries 下标
    const next = customEntries.filter((_, i) => i !== index);
    saveCustom(next);
    setDetail(null);
  }

  // 学科卡片网格视图
  if (!selected) {
    const totalParams = DISCIPLINES.reduce((a, d) => a + paramCount(d), 0);
    return (
      <div>
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h1 className="view-title">学科数据</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            覆盖中国 13 个学科门类 · {DISCIPLINES.reduce((a, d) => a + d.glossary.length, 0)} 名词 / {totalParams} 数值参数 / {DISCIPLINES.reduce((a, d) => a + d.formulas.length, 0)} 公式 / {DISCIPLINES.reduce((a, d) => a + d.standards.length, 0)} 标准规范 / {DISCIPLINES.reduce((a, d) => a + (d.officialDocs?.length ?? 0), 0)} 红头文件
            {customEntries.length > 0 && ` · ${customEntries.length} 条自定义`}
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
        <div className="grid discipline-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {filteredDisciplines.map((d) => (
            <button
              key={d.id}
              onClick={() => { setSelectedId(d.id); setTab('glossary'); setGlossaryCategory(''); setPage(0); setSearch(''); }}
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
              <div className="discipline-card-counts" style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>{d.glossary.length} 名词</span>
                <span>{paramCount(d)} 数值</span>
                <span>{d.formulas.length} 公式</span>
                <span>{d.standards.length} 标准</span>
                {(d.officialDocs?.length ?? 0) > 0 && <span style={{ color: '#c3272b' }}>{d.officialDocs!.length} 红头文件</span>}
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

  // ===== 学科详情视图 =====
  const customForDisc = customEntries
    .map((e, i) => ({ ...e, __globalIdx: i }))
    .filter((e) => e.disciplineId === selected.id);

  const mergedGlossary: (DisciplineGlossary & { __customIdx?: number })[] = [
    ...selected.glossary,
    ...customForDisc.filter((e) => e.kind === 'glossary').map((e) => ({
      term: e.term || '', termEn: e.termEn || '', definition: e.definition || '', category: e.category || '自定义',
      example: e.example, aliases: e.aliases, source: e.source, __customIdx: e.__globalIdx,
    })),
  ];
  const mergedParams: (DisciplineParameter & { __customIdx?: number })[] = [
    ...(selected.parameters || []),
    ...customForDisc.filter((e) => e.kind === 'parameters').map((e) => ({
      name: e.name || '', symbol: e.symbol, value: e.value || '', unit: e.unit,
      description: e.description || '', category: e.category || '自定义', source: e.source, __customIdx: e.__globalIdx,
    })),
  ];
  const mergedFormulas: (DisciplineFormula & { __customIdx?: number })[] = [
    ...selected.formulas,
    ...customForDisc.filter((e) => e.kind === 'formulas').map((e) => ({
      name: e.name || '', formula: e.formula || '', description: e.description || '',
      unit: e.unit, reference: e.reference, variables: e.variables, __customIdx: e.__globalIdx,
    })),
  ];
  const mergedStandards: (DisciplineStandard & { __customIdx?: number })[] = [
    ...selected.standards,
    ...customForDisc.filter((e) => e.kind === 'standards').map((e) => ({
      name: e.name || '', code: e.code || '', description: e.description || '',
      issuer: e.issuer, year: e.year, __customIdx: e.__globalIdx,
    })),
  ];
  const mergedOfficialDocs: (DisciplineStandard & { __customIdx?: number })[] = [
    ...(selected.officialDocs || []),
    ...customForDisc.filter((e) => e.kind === 'officialDocs').map((e) => ({
      name: e.name || '', code: e.code || '', description: e.description || '',
      issuer: e.issuer, year: e.year, source: e.source, __customIdx: e.__globalIdx,
    })),
  ];

  const detailSearch = search.toLowerCase();
  const matchG = (g: DisciplineGlossary) =>
    !detailSearch || g.term.toLowerCase().includes(detailSearch) || g.termEn.toLowerCase().includes(detailSearch) || g.definition.toLowerCase().includes(detailSearch);
  const matchP = (p: DisciplineParameter) =>
    !detailSearch || p.name.toLowerCase().includes(detailSearch) || p.description.toLowerCase().includes(detailSearch) || (p.symbol || '').toLowerCase().includes(detailSearch);
  const matchF = (f: DisciplineFormula) =>
    !detailSearch || f.name.toLowerCase().includes(detailSearch) || f.formula.toLowerCase().includes(detailSearch) || f.description.toLowerCase().includes(detailSearch);
  const matchS = (s: DisciplineStandard) =>
    !detailSearch || s.name.toLowerCase().includes(detailSearch) || s.code.toLowerCase().includes(detailSearch) || s.description.toLowerCase().includes(detailSearch);

  const glossaryCats = [...new Set(mergedGlossary.map((g) => g.category))].sort();
  const baseGlossary = glossaryCategory ? mergedGlossary.filter((g) => g.category === glossaryCategory) : mergedGlossary;
  const filteredGlossary = baseGlossary.filter(matchG);
  const filteredParams = mergedParams.filter(matchP);
  const filteredFormulas = mergedFormulas.filter(matchF);
  const filteredStandards = mergedStandards.filter(matchS);
  const filteredOfficialDocs = mergedOfficialDocs.filter(matchS);

  // 当前 tab 的分页数据
  const currentList = tab === 'glossary' ? filteredGlossary : tab === 'parameters' ? filteredParams : tab === 'formulas' ? filteredFormulas : tab === 'officialDocs' ? filteredOfficialDocs : filteredStandards;
  const pageCount = Math.ceil(currentList.length / PAGE_SIZE);
  // 移动端: 累积加载(加载更多); 桌面端: 分页切片
  const pagedList = isMobile
    ? currentList.slice(0, (page + 1) * PAGE_SIZE)
    : currentList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasMore = isMobile && currentList.length > pagedList.length;

  const tabMeta: { key: Tab; label: string; count: number }[] = [
    { key: 'glossary', label: '名词', count: mergedGlossary.length },
    { key: 'parameters', label: '数值参数', count: mergedParams.length },
    { key: 'formulas', label: '公式', count: mergedFormulas.length },
    { key: 'standards', label: '标准规范', count: mergedStandards.length },
    { key: 'officialDocs', label: '红头文件', count: mergedOfficialDocs.length },
  ];

  return (
    <div>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => { setSelectedId(null); setSearch(''); }} style={{ padding: '6px 12px' }}>
          <Icon name="close" size={16} /> 返回
        </button>
        <DisciplineIcon id={selected.id} size={28} color={selected.color} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.nameEn} · {selected.description}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="本学科内搜索…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{ paddingLeft: 32, width: 200, fontSize: 13 }}
          />
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <Icon name="search" size={14} />
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 13 }}>
          <Icon name="plus" size={14} /> 自定义添加
        </button>
      </div>

      {/* 标签页 */}
      <div className="cd-tabbar" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {tabMeta.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(0); }}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent',
              borderBottom: tab === t.key ? `2px solid ${selected.color}` : '2px solid transparent',
              color: tab === t.key ? selected.color : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: 13,
              marginBottom: '-2px', transition: 'all var(--transition)',
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* 名词分类筛选 */}
      {tab === 'glossary' && glossaryCats.length > 1 && (
        <div className="cd-cat-chips" style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setGlossaryCategory(''); setPage(0); }}
            className={`btn ${!glossaryCategory ? 'btn-primary' : ''}`}
            style={{ padding: '4px 12px', fontSize: 12 }}
          >全部 ({mergedGlossary.length})</button>
          {glossaryCats.map((c) => {
            const count = mergedGlossary.filter((g) => g.category === c).length;
            return (
              <button
                key={c}
                onClick={() => { setGlossaryCategory(c); setPage(0); }}
                className={`btn ${glossaryCategory === c ? 'btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >{c} ({count})</button>
            );
          })}
        </div>
      )}

      {/* 名词列表 */}
      {tab === 'glossary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(pagedList as typeof filteredGlossary).map((g, i) => (
            <button
              key={`${g.term}-${i}`}
              className="card cd-entry-row"
              onClick={() => setDetail({ kind: 'glossary', data: g, customIndex: g.__customIdx })}
              style={{ padding: '10px 14px', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: selected.color }}>{g.term}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.termEn}</span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-canvas)', color: 'var(--text-muted)',
                }}>{g.category}</span>
                {g.__customIdx !== undefined && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>自定义</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>查看详情 →</span>
              </div>
              <div className="cd-entry-summary" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{g.definition}</div>
            </button>
          ))}
        </div>
      )}

      {/* 数值参数列表 */}
      {tab === 'parameters' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mergedParams.length === 0 && (
            <div className="empty-state" style={{ padding: 40 }}>
              <p style={{ fontSize: 13 }}>本学科的数值参数正在扩充中，也可以点右上角「自定义添加」自己录入</p>
            </div>
          )}
          {(pagedList as typeof filteredParams).map((p, i) => (
            <button
              key={`${p.name}-${i}`}
              className="card cd-entry-row"
              onClick={() => setDetail({ kind: 'parameters', data: p, customIndex: p.__customIdx })}
              style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: selected.color }}>{p.name}</span>
                {p.symbol && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.symbol}</span>}
                <span style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: 'var(--accent)', background: 'var(--accent-light)',
                  padding: '1px 8px', borderRadius: 'var(--radius-sm)',
                }}>{p.value}{p.unit ? ` ${p.unit}` : ''}</span>
                {p.__customIdx !== undefined && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>自定义</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>详情 →</span>
              </div>
              <div className="cd-entry-summary" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* 公式列表 */}
      {tab === 'formulas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(pagedList as typeof filteredFormulas).map((f, i) => (
            <button
              key={`${f.name}-${i}`}
              className="card cd-entry-row"
              onClick={() => setDetail({ kind: 'formulas', data: f, customIndex: f.__customIdx })}
              style={{ padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: selected.color }}>
                  {f.name}
                  {f.__customIdx !== undefined && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>自定义</span>
                  )}
                </span>
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
              <div className="cd-entry-summary" style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* 标准规范列表 */}
      {tab === 'standards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(pagedList as typeof filteredStandards).map((s, i) => (
            <button
              key={`${s.code}-${i}`}
              className="card cd-entry-row"
              onClick={() => setDetail({ kind: 'standards', data: s, customIndex: s.__customIdx })}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
            >
              <div style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                background: selected.color, color: '#fff', fontWeight: 700, flexShrink: 0, marginTop: 2,
              }}>{s.code}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.name}
                  {s.__customIdx !== undefined && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>自定义</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.description}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>详情 →</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'officialDocs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(pagedList as typeof filteredOfficialDocs).map((s, i) => (
            <button
              key={`doc-${s.code}-${i}`}
              className="card cd-entry-row"
              onClick={() => setDetail({ kind: 'officialDocs', data: s, customIndex: s.__customIdx })}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', borderLeft: '4px solid #c3272b', background: 'var(--bg-surface)' }}
            >
              <div style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                background: '#c3272b', color: '#fff', fontWeight: 700, flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap',
              }}>{s.code || '红头文件'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#c3272b' }}>
                  {s.name}
                  {s.__customIdx !== undefined && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>自定义</span>
                  )}
                </div>
                {s.issuer && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>颁布机构：{s.issuer}{s.year && ` · ${s.year}年`}</div>}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.description}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>详情 →</span>
            </button>
          ))}
          {filteredOfficialDocs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              暂无红头文件数据
            </div>
          )}
        </div>
      )}

      {/* 分页(桌面) / 加载更多(移动) */}
      {pageCount > 1 && (
        <div className="cd-pager" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{page + 1} / {pageCount} 页 · 共 {currentList.length} 条</span>
          <button className="btn btn-sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      )}
      {hasMore && (
        <button className="btn cd-loadmore" onClick={() => setPage(page + 1)}>
          加载更多 · 还有 {currentList.length - pagedList.length} 条
        </button>
      )}

      {/* ===== 词典级详情弹窗 ===== */}
      {detail && (
        <div className="modal-overlay cd-detail-modal" onClick={() => setDetail(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640, width: '92%', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', padding: 24 }}
          >
            {detail.kind === 'glossary' && <GlossaryDetail g={detail.data as DisciplineGlossary} color={selected.color} discipline={selected.name} />}
            {detail.kind === 'parameters' && <ParameterDetail p={detail.data as DisciplineParameter} color={selected.color} discipline={selected.name} />}
            {detail.kind === 'formulas' && <FormulaDetail f={detail.data as DisciplineFormula} color={selected.color} discipline={selected.name} />}
            {detail.kind === 'standards' && <StandardDetail s={detail.data as DisciplineStandard} color={selected.color} discipline={selected.name} />}
            {detail.kind === 'officialDocs' && <OfficialDocDetail doc={detail.data as DisciplineStandard} discipline={selected.name} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, position: 'sticky', bottom: -24, background: 'var(--bg-surface)', padding: '12px 24px', margin: '20px -24px -24px', borderTop: '1px solid var(--border)', zIndex: 1 }}>
              {detail.customIndex !== undefined && (
                <button
                  className="btn btn-danger-ghost"
                  onClick={() => { if (confirm('删除这条自定义条目？')) deleteCustom(detail.customIndex!); }}
                >删除此自定义条目</button>
              )}
              <button className="btn btn-primary" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {/* 移动端: 详情走 BottomSheet */}
      {detail && isMobile && (
        <BottomSheet open onClose={() => setDetail(null)} title="条目详情">
          {detail.kind === 'glossary' && <GlossaryDetail g={detail.data as DisciplineGlossary} color={selected.color} discipline={selected.name} />}
          {detail.kind === 'parameters' && <ParameterDetail p={detail.data as DisciplineParameter} color={selected.color} discipline={selected.name} />}
          {detail.kind === 'formulas' && <FormulaDetail f={detail.data as DisciplineFormula} color={selected.color} discipline={selected.name} />}
          {detail.kind === 'standards' && <StandardDetail s={detail.data as DisciplineStandard} color={selected.color} discipline={selected.name} />}
          {detail.kind === 'officialDocs' && <OfficialDocDetail doc={detail.data as DisciplineStandard} discipline={selected.name} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            {detail.customIndex !== undefined && (
              <button
                className="btn"
                style={{ height: 48, color: 'var(--danger, #c3272b)', borderColor: 'var(--danger, #c3272b)' }}
                onClick={() => { if (confirm('删除这条自定义条目？')) deleteCustom(detail.customIndex!); }}
              >删除此自定义条目</button>
            )}
            <button className="btn btn-primary" style={{ height: 48 }} onClick={() => setDetail(null)}>关闭</button>
          </div>
        </BottomSheet>
      )}

      {/* ===== 自定义添加弹窗 ===== */}
      {showAdd && (
        <AddEntryModal
          disciplineId={selected.id}
          disciplineName={selected.name}
          defaultKind={tab}
          onClose={() => setShowAdd(false)}
          onSave={(entry) => { saveCustom([...customEntries, entry]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ===== 词典级详情组件 =====

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function GlossaryDetail({ g, color, discipline }: { g: DisciplineGlossary; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{g.term}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{g.termEn}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{g.category}</span>
        </div>
      </div>
      {g.aliases && <DetailRow label="同义词 / 别称">{g.aliases}</DetailRow>}
      <DetailRow label="释义">{g.definition}</DetailRow>
      {g.example && <DetailRow label="示例 / 应用">{g.example}</DetailRow>}
      {g.source && <DetailRow label="出处 / 参考"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.source}</span></DetailRow>}
    </div>
  );
}

function ParameterDetail({ p, color, discipline }: { p: DisciplineParameter; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>
          {p.name}
          {p.symbol && <span style={{ fontSize: 16, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 10 }}>{p.symbol}</span>}
        </div>
        <div style={{
          display: 'inline-block', marginTop: 8, fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700,
          color: 'var(--accent)', background: 'var(--accent-light)', padding: '4px 14px', borderRadius: 'var(--radius-sm)',
        }}>
          {p.value}{p.unit ? ` ${p.unit}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{p.category}</span>
        </div>
      </div>
      <DetailRow label="说明">{p.description}</DetailRow>
      {p.source && <DetailRow label="来源"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.source}</span></DetailRow>}
    </div>
  );
}

function FormulaDetail({ f, color, discipline }: { f: DisciplineFormula; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>{f.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {f.unit && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>{f.unit}</span>}
        </div>
      </div>
      <DetailRow label="公式">
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600,
          background: 'var(--bg-canvas)', padding: '14px 18px', borderRadius: 'var(--radius-sm)',
          overflowX: 'auto',
        }}>{f.formula}</div>
      </DetailRow>
      {f.variables && <DetailRow label="变量说明">{f.variables}</DetailRow>}
      <DetailRow label="说明">{f.description}</DetailRow>
      {f.reference && <DetailRow label="来源"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.reference}</span></DetailRow>}
    </div>
  );
}

function StandardDetail({ s, color, discipline }: { s: DisciplineStandard; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-block', fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          background: color, color: '#fff', fontWeight: 700, marginBottom: 8,
        }}>{s.code}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {s.issuer && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{s.issuer}</span>}
          {s.year && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{s.year}</span>}
        </div>
      </div>
      <DetailRow label="内容说明">{s.description}</DetailRow>
      {/* R108: 嵌入原文条文 — 点击展开查看 */}
      {s.fullText && <FullTextBlock text={s.fullText} />}
      {/* R108: 官方原文链接 */}
      {s.docUrl && (
        <div style={{ marginTop: 12 }}>
          <a href={s.docUrl} target="_blank" rel="noopener noreferrer" className="cd-official-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)' }}>
            <Icon name="link" size={14} /> 查看官方原文 ↗
          </a>
        </div>
      )}
    </div>
  );
}

/** 原文条文展开块（标准规范 / 红头文件共用） */
function FullTextBlock({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setShow(!show)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', width: '100%', textAlign: 'left' }}
      >
        <Icon name="chevronRight" size={14} style={{ transform: show ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
        {show ? '收起原文条文' : '查看原文条文'}
      </button>
      {show && (
        <div style={{ marginTop: 8, padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
          {text}
        </div>
      )}
    </div>
  );
}

function OfficialDocDetail({ doc, discipline }: { doc: DisciplineStandard; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: '3px solid #c3272b', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-block', fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          background: '#c3272b', color: '#fff', fontWeight: 700, marginBottom: 8,
        }}>{doc.code || '红头文件'}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#c3272b' }}>{doc.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {doc.issuer && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: '#fef0f0', color: '#c3272b' }}>颁布机构：{doc.issuer}</span>}
          {doc.year && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{doc.year}年</span>}
        </div>
      </div>
      <DetailRow label="文件内容">{doc.description}</DetailRow>
      {doc.source && <DetailRow label="来源"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.source}</span></DetailRow>}
      {/* R108 R5: 红头文件嵌入原文条文 + 官方原文链接 */}
      {doc.fullText && (
        <FullTextBlock text={doc.fullText} />
      )}
      {doc.docUrl && (
        <div style={{ marginTop: 12 }}>
          <a href={doc.docUrl} target="_blank" rel="noopener noreferrer" className="cd-official-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#c3272b', fontWeight: 500 }}>
            <Icon name="link" size={14} /> 查看官方原文 ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ===== 自定义添加弹窗 =====

function AddEntryModal({
  disciplineId, disciplineName, defaultKind, onClose, onSave,
}: {
  disciplineId: string;
  disciplineName: string;
  defaultKind: EntryKind;
  onClose: () => void;
  onSave: (e: CustomEntry) => void;
}) {
  const [kind, setKind] = useState<EntryKind>(defaultKind);
  const [fields, setFields] = useState<Record<string, string>>({});

  function set(k: string, v: string) {
    setFields({ ...fields, [k]: v });
  }

  function save() {
    const base: CustomEntry = { kind, disciplineId };
    if (kind === 'glossary') {
      if (!fields.term?.trim() || !fields.definition?.trim()) return;
      onSave({ ...base, term: fields.term.trim(), termEn: fields.termEn?.trim() || '', definition: fields.definition.trim(), category: fields.category?.trim() || '自定义', example: fields.example?.trim(), aliases: fields.aliases?.trim(), source: fields.source?.trim() });
    } else if (kind === 'parameters') {
      if (!fields.name?.trim() || !fields.value?.trim() || !fields.description?.trim()) return;
      onSave({ ...base, name: fields.name.trim(), symbol: fields.symbol?.trim(), value: fields.value.trim(), unit: fields.unit?.trim(), description: fields.description.trim(), category: fields.category?.trim() || '自定义', source: fields.source?.trim() });
    } else if (kind === 'formulas') {
      if (!fields.name?.trim() || !fields.formula?.trim() || !fields.description?.trim()) return;
      onSave({ ...base, name: fields.name.trim(), formula: fields.formula.trim(), description: fields.description.trim(), unit: fields.unit?.trim(), variables: fields.variables?.trim(), reference: fields.reference?.trim() });
    } else {
      if (!fields.name?.trim() || !fields.code?.trim() || !fields.description?.trim()) return;
      onSave({ ...base, name: fields.name.trim(), code: fields.code.trim(), description: fields.description.trim(), issuer: fields.issuer?.trim(), year: fields.year?.trim(), source: fields.source?.trim() });
    }
  }

  const kindLabels: Record<EntryKind, string> = { glossary: '名词', parameters: '数值参数', formulas: '公式', standards: '标准规范', officialDocs: '红头文件' };

  const fieldDefs: { kind: EntryKind; fields: { key: string; label: string; required?: boolean; textarea?: boolean; placeholder?: string }[] }[] = [
    {
      kind: 'glossary',
      fields: [
        { key: 'term', label: '名词（中文）', required: true, placeholder: '如：循证护理' },
        { key: 'termEn', label: '英文名', placeholder: '如：Evidence-Based Nursing' },
        { key: 'category', label: '分类', placeholder: '如：护理理论（留空归入「自定义」）' },
        { key: 'definition', label: '完整释义', required: true, textarea: true, placeholder: '像词典一样完整：定义、核心内涵、适用范围…' },
        { key: 'aliases', label: '同义词/别称' },
        { key: 'example', label: '示例/应用', textarea: true },
        { key: 'source', label: '出处/参考' },
      ],
    },
    {
      kind: 'parameters',
      fields: [
        { key: 'name', label: '参数名称', required: true, placeholder: '如：正常成人静息心率' },
        { key: 'symbol', label: '符号', placeholder: '如：HR' },
        { key: 'value', label: '数值/范围', required: true, placeholder: '如：60–100' },
        { key: 'unit', label: '单位', placeholder: '如：次/分' },
        { key: 'category', label: '分类', placeholder: '如：生命体征' },
        { key: 'description', label: '完整说明', required: true, textarea: true, placeholder: '临床意义、测量方法、异常提示…' },
        { key: 'source', label: '来源' },
      ],
    },
    {
      kind: 'formulas',
      fields: [
        { key: 'name', label: '公式名称', required: true },
        { key: 'formula', label: '公式表达式', required: true, placeholder: '如：BMI = 体重(kg) / 身高(m)²' },
        { key: 'variables', label: '变量说明', textarea: true },
        { key: 'unit', label: '单位' },
        { key: 'description', label: '完整说明', required: true, textarea: true },
        { key: 'reference', label: '来源/参考' },
      ],
    },
    {
      kind: 'standards',
      fields: [
        { key: 'code', label: '标准编号', required: true, placeholder: '如：GB/T 7714—2015' },
        { key: 'name', label: '标准名称', required: true },
        { key: 'issuer', label: '发布机构' },
        { key: 'year', label: '年份' },
        { key: 'description', label: '内容说明', required: true, textarea: true },
      ],
    },
    {
      kind: 'officialDocs',
      fields: [
        { key: 'code', label: '文件编号', required: true, placeholder: '如：中发〔2022〕14号' },
        { key: 'name', label: '文件名称', required: true },
        { key: 'issuer', label: '颁布机构' },
        { key: 'year', label: '年份' },
        { key: 'source', label: '来源' },
        { key: 'description', label: '文件内容', required: true, textarea: true },
      ],
    },
  ];

  const activeDef = fieldDefs.find((f) => f.kind === kind)!;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '92%', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', padding: 24 }}
      >
        <h3 style={{ marginBottom: 4, fontSize: 16 }}>自定义添加到「{disciplineName}」</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>学到什么就记下来，数据保存在本机浏览器中</p>

        {/* 类型选择 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(Object.keys(kindLabels) as EntryKind[]).map((k) => (
            <button
              key={k}
              className={`btn btn-sm ${kind === k ? 'btn-primary' : ''}`}
              onClick={() => setKind(k)}
            >{kindLabels[k]}</button>
          ))}
        </div>

        {activeDef.fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {f.label}{f.required && <span style={{ color: 'var(--accent)' }}> *</span>}
            </label>
            {f.textarea ? (
              <textarea
                className="input"
                value={fields[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
              />
            ) : (
              <input
                className="input"
                value={fields[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ width: '100%', fontSize: 13 }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, position: 'sticky', bottom: -24, background: 'var(--bg-surface)', padding: '12px 24px', margin: '8px -24px -24px', borderTop: '1px solid var(--border)', zIndex: 1 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
