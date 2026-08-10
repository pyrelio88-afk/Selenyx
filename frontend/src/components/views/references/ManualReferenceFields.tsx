/** 手动录入文献的表单字段组（从 ReferencesView.tsx 抽离）。 */

import type { ManualReferenceForm } from './referenceFactory';

export function ManualReferenceFields({ form, onChange }: { form: ManualReferenceForm; onChange: (patch: Partial<ManualReferenceForm>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <label className="form-label" htmlFor="manual-reference-title">文献标题 *</label>
        <input id="manual-reference-title" className="input" autoFocus value={form.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="输入论文、书籍或报告标题" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-authors">作者</label>
        <input id="manual-reference-authors" className="input" value={form.authors} onChange={(event) => onChange({ authors: event.target.value })} placeholder="如：Wang, Wei; Zhang, Li（多位作者用分号分隔）" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
        <div>
          <label className="form-label" htmlFor="manual-reference-year">年份</label>
          <input id="manual-reference-year" className="input" inputMode="numeric" value={form.year} onChange={(event) => onChange({ year: event.target.value })} placeholder="2026" />
        </div>
        <div>
          <label className="form-label" htmlFor="manual-reference-publication">期刊 / 出版物</label>
          <input id="manual-reference-publication" className="input" value={form.publication} onChange={(event) => onChange({ publication: event.target.value })} placeholder="如：Nature / 中华护理杂志" />
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-doi">DOI</label>
        <input id="manual-reference-doi" className="input" value={form.doi} onChange={(event) => onChange({ doi: event.target.value })} placeholder="10.xxxx/xxxx（可粘贴 doi.org 链接）" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-url">原文链接</label>
        <input id="manual-reference-url" className="input" type="url" value={form.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://…（可选）" />
      </div>
      <div>
        <label className="form-label" htmlFor="manual-reference-abstract">摘要 / 备注</label>
        <textarea id="manual-reference-abstract" className="input" rows={4} value={form.abstract} onChange={(event) => onChange({ abstract: event.target.value })} placeholder="粘贴摘要或记录要点（可选）" style={{ resize: 'vertical' }} />
      </div>
    </div>
  );
}
