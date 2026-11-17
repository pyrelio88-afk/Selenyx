import { useState, type ReactNode } from 'react';
import { Icon } from '@components/ui/Icon';
import type {
  DisciplineGlossary,
  DisciplineParameter,
  DisciplineFormula,
  DisciplineStandard,
} from '../../../data/disciplines';

export type EntryKind = 'glossary' | 'parameters' | 'formulas' | 'standards' | 'officialDocs';

export interface CustomEntry {
  kind: EntryKind;
  disciplineId: string;
  term?: string; termEn?: string; definition?: string; category?: string; example?: string; aliases?: string;
  name?: string; symbol?: string; value?: string; unit?: string; description?: string;
  formula?: string; reference?: string; variables?: string;
  code?: string; issuer?: string; year?: string;
  source?: string;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export function GlossaryDetail({ g, color, discipline }: { g: DisciplineGlossary; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{g.term}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>{g.termEn}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{g.category}</span>
        </div>
      </div>
      {g.aliases && <DetailRow label="同义词 / 别称">{g.aliases}</DetailRow>}
      <DetailRow label="释义">{g.definition}</DetailRow>
      {g.example && <DetailRow label="示例 / 应用">{g.example}</DetailRow>}
      {g.source && <DetailRow label="出处 / 参考"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.source}</span></DetailRow>}
    </div>
  );
}

export function ParameterDetail({ p, color, discipline }: { p: DisciplineParameter; color: string; discipline: string }) {
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
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{p.category}</span>
        </div>
      </div>
      <DetailRow label="说明">{p.description}</DetailRow>
      {p.source && <DetailRow label="来源"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.source}</span></DetailRow>}
    </div>
  );
}

export function FormulaDetail({ f, color, discipline }: { f: DisciplineFormula; color: string; discipline: string }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>{f.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {f.unit && <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>{f.unit}</span>}
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

export function StandardDetail({ s, color, discipline, onPreviewSource }: { s: DisciplineStandard; color: string; discipline: string; onPreviewSource: (url: string, title: string) => void }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-block', fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          background: color, color: '#fff', fontWeight: 700, marginBottom: 8,
        }}>{s.code}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {s.issuer && <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{s.issuer}</span>}
          {s.year && <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{s.year}</span>}
        </div>
      </div>
      <DetailRow label="内容说明">{s.description}</DetailRow>
      {/* R108: 嵌入原文条文 — 点击展开查看 */}
      {s.fullText && <FullTextBlock text={s.fullText} />}
      {/* R108: 官方原文链接 */}
      {s.docUrl && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="cd-official-link" onClick={() => onPreviewSource(s.docUrl!, s.name)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
            <Icon name="link" size={14} /> 在应用内查看原始发布文件
          </button>
        </div>
      )}
    </div>
  );
}

/** 原文条文展开块（标准规范 / 官方源文件共用） */
function FullTextBlock({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setShow(!show)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', width: '100%', textAlign: 'left' }}
      >
        <Icon name="chevronRight" size={14} style={{ transform: show ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
        {show ? '收起内置原文摘录' : '查看内置原文摘录'}
      </button>
      {show && (
        <div style={{ marginTop: 8, padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
          {text}
        </div>
      )}
    </div>
  );
}

export function OfficialDocDetail({ doc, discipline, color, onPreviewSource }: { doc: DisciplineStandard; discipline: string; color: string; onPreviewSource: (url: string, title: string) => void }) {
  return (
    <div>
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-block', fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          background: color, color: '#fff', fontWeight: 700, marginBottom: 8,
        }}>{doc.code || '官方文件'}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{doc.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{discipline}</span>
          {doc.issuer && <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)' }}>颁布机构：{doc.issuer}</span>}
          {doc.year && <span style={{ fontSize: 'var(--font-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', color: 'var(--text-secondary)' }}>{doc.year}年</span>}
        </div>
      </div>
      <DetailRow label="文件内容">{doc.description}</DetailRow>
      {doc.source && <DetailRow label="来源"><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.source}</span></DetailRow>}
      {/* R108 R5: 官方源文件嵌入可公开原文摘录 + 原始发布文件链接 */}
      {doc.fullText && (
        <FullTextBlock text={doc.fullText} />
      )}
      {doc.docUrl && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="cd-official-link" onClick={() => onPreviewSource(doc.docUrl!, doc.name)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)', fontWeight: 500, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
            <Icon name="link" size={14} /> 在应用内查看原始发布文件
          </button>
        </div>
      )}
    </div>
  );
}

// ===== 自定义添加弹窗 =====

export function AddEntryModal({
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
