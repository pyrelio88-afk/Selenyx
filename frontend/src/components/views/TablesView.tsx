/**
 * Selenyx 多维表格视图 —— Notion/飞书多维表格式数据库
 * 支持自定义字段类型、表格视图、排序、筛选、行内编辑
 */

import { useState, useMemo } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import type { MultiDimTable, TableField, FieldType } from '@types/index';

function genId() {
  return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'date', label: '日期' },
  { value: 'checkbox', label: '复选框' },
  { value: 'url', label: '链接' },
  { value: 'rating', label: '评分' },
];

const FIELD_COLORS = ['#c3272b', '#21a675', '#3b7dd8', '#e8a317', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

function createNewTable(name: string): MultiDimTable {
  const fid1 = genId();
  const fid2 = genId();
  return {
    id: 'tbl_' + Date.now().toString(36),
    projectId: '',
    name,
    fields: [
      { id: fid1, name: '名称', type: 'text' as FieldType, required: true, defaultValue: '' },
      { id: fid2, name: '状态', type: 'select' as FieldType, required: false, defaultValue: '', options: [
        { label: '待处理', color: '#e8a317' },
        { label: '进行中', color: '#3b7dd8' },
        { label: '已完成', color: '#21a675' },
      ]},
    ],
    views: [{
      id: 'v_' + genId(),
      name: '默认视图',
      type: 'table' as const,
      fieldIds: [fid1, fid2],
      filters: [],
      sorts: [],
      groupFieldId: null,
      freezeColumns: 1,
    }],
    records: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function CellEditor({ field, value, onChange }: { field: TableField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'checkbox') {
    return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.type === 'select' && field.options) {
    return (
      <select value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className="cell-select">
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt.label} value={opt.label}>{opt.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === 'date') {
    return <input type="date" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className="cell-input" />;
  }
  if (field.type === 'url') {
    return <input type="url" value={(value as string) || ''} placeholder="https://" onChange={(e) => onChange(e.target.value)} className="cell-input" />;
  }
  if (field.type === 'rating') {
    const n = (value as number) || 0;
    return (
      <div className="rating-cell" style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} className="rating-star" style={{
            border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            color: i <= n ? '#e8a317' : 'var(--border)',
          }} onClick={() => onChange(i === n ? 0 : i)}>★</button>
        ))}
      </div>
    );
  }
  return <input type={field.type === 'number' ? 'number' : 'text'} value={(value as string) ?? ''} onChange={(e) => onChange(field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} className="cell-input" />;
}

function FieldBadge({ type }: { type: FieldType }) {
  const labels: Record<string, string> = { text: '文本', number: '数字', select: '单选', multiSelect: '多选', date: '日期', checkbox: '复选', url: '链接', email: '邮箱', formula: '公式', rating: '评分', attachment: '附件' };
  return <span className="field-badge">{labels[type] || type}</span>;
}

export function TablesView() {
  const { tables, addTable, deleteTable, addTableField, removeTableField, addTableRecord, updateTableRecord, deleteTableRecord, projects } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(tables[0]?.id || null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; fieldId: string } | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');

  const selected = tables.find((t) => t.id === selectedId);

  function handleCreate() {
    if (!newTableName.trim()) return;
    const t = createNewTable(newTableName.trim());
    addTable(t);
    setSelectedId(t.id);
    setNewTableName('');
    setShowCreate(false);
  }

  function handleAddField() {
    if (!newFieldName.trim() || !selected) return;
    const field: TableField = {
      id: genId(),
      name: newFieldName.trim(),
      type: newFieldType,
      required: false,
      defaultValue: null,
    };
    if ((newFieldType === 'select' || newFieldType === 'multiSelect') && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(/[,，]/).map((label, i) => ({
        label: label.trim(),
        color: FIELD_COLORS[i % FIELD_COLORS.length],
      })).filter((o) => o.label);
    }
    addTableField(selected.id, field);
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldOptions('');
    setShowAddField(false);
  }

  function handleAddRow() {
    if (!selected) return;
    const record: Record<string, unknown> = {};
    selected.fields.forEach((f) => { record[f.id] = f.defaultValue; });
    addTableRecord(selected.id, record);
  }

  const sortedFilteredRecords = useMemo(() => {
    if (!selected) return [];
    let records: (Record<string, unknown> & { __idx: number })[] = selected.records.map((r, i) => ({ ...r, __idx: i }));
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      records = records.filter((r) =>
        selected.fields.some((f) => String(r[f.id] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortField) {
      records.sort((a, b) => {
        const va = a[sortField] ?? '';
        const vb = b[sortField] ?? '';
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
        const cmp = String(va).localeCompare(String(vb), 'zh');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return records;
  }, [selected, sortField, sortDir, filterText]);

  function toggleSort(fieldId: string) {
    if (sortField === fieldId) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldId);
      setSortDir('asc');
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* 左侧表格列表 */}
      <div className="table-list-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>多维表格</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} /> 新建
          </button>
        </div>
        {tables.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 8px' }}>
            <div className="icon"><Icon name="tables" size={32} strokeWidth={1.2} /></div>
            <p style={{ fontSize: 13 }}>还没有表格，创建第一个数据库</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tables.map((t) => (
              <button
                key={t.id}
                className={`table-list-item ${selectedId === t.id ? 'active' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <Icon name="tables" size={16} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span className="record-count">{t.records.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右侧表格区域 */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 80 }}>
            <div className="icon"><Icon name="tables" size={48} strokeWidth={1.2} /></div>
            <p>选择左侧表格或创建新表格</p>
          </div>
        ) : (
          <>
            <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 className="view-title">{selected.name}</h1>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selected.records.length} 条记录 · {selected.fields.length} 个字段
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="筛选..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  style={{ width: 160 }}
                />
                <button className="btn btn-danger-ghost" onClick={() => { if (confirm(`删除表格「${selected.name}」？此操作不可撤销。`)) { deleteTable(selected.id); setSelectedId(null); } }}>
                  删除表格
                </button>
              </div>
            </div>

            {/* 表格 */}
            <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="row-num-cell">#</th>
                    {selected.fields.map((field) => (
                      <th key={field.id} onClick={() => toggleSort(field.id)} className="sortable-th">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <Icon name={field.type === 'checkbox' ? 'check' : field.type === 'date' ? 'calendar' : 'tag'} size={13} />
                          <span>{field.name}</span>
                          <FieldBadge type={field.type} />
                          {sortField === field.id && <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </div>
                        <button
                          className="field-remove-btn"
                          onClick={(e) => { e.stopPropagation(); removeTableField(selected.id, field.id); }}
                          title="删除字段"
                        >×</button>
                      </th>
                    ))}
                    <th className="add-field-th">
                      {showAddField ? (
                        <div className="add-field-inline">
                          <input className="cell-input" placeholder="字段名" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} style={{ width: 80 }} />
                          <select className="cell-select" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as FieldType)}>
                            {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                          </select>
                          {(newFieldType === 'select' || newFieldType === 'multiSelect') && (
                            <input className="cell-input" placeholder="选项,逗号分隔" value={newFieldOptions} onChange={(e) => setNewFieldOptions(e.target.value)} style={{ width: 100 }} />
                          )}
                          <button className="btn btn-sm btn-primary" onClick={handleAddField}><Icon name="check" size={14} /></button>
                          <button className="btn btn-sm" onClick={() => { setShowAddField(false); setNewFieldName(''); setNewFieldOptions(''); }}>取消</button>
                        </div>
                      ) : (
                        <button className="add-field-btn" onClick={() => setShowAddField(true)}>
                          <Icon name="plus" size={14} /> 添加字段
                        </button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredRecords.map((record) => {
                    const rowIdx = record.__idx;
                    return (
                      <tr key={rowIdx}>
                        <td className="row-num-cell">
                          <span className="row-num">{rowIdx + 1}</span>
                          <button className="row-delete-btn" onClick={() => deleteTableRecord(selected.id, rowIdx)}>×</button>
                        </td>
                        {selected.fields.map((field) => (
                          <td key={field.id} onClick={() => setEditingCell({ rowIdx, fieldId: field.id })}>
                            {editingCell?.rowIdx === rowIdx && editingCell?.fieldId === field.id ? (
                              <CellEditor
                                field={field}
                                value={record[field.id]}
                                onChange={(v) => { updateTableRecord(selected.id, rowIdx, { [field.id]: v }); }}
                              />
                            ) : (
                              <CellDisplay field={field} value={record[field.id]} />
                            )}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button className="btn add-row-btn" onClick={handleAddRow}>
              <Icon name="plus" size={16} /> 添加记录
            </button>
          </>
        )}
      </div>

      {/* 创建表格弹窗 */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>新建表格</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>表格名称</label>
              <input className="input" placeholder="如：数据提取表" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} autoFocus />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>关联项目（可选）</label>
              <select className="input" value="" onChange={() => {}}>
                <option value="">不关联</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              新表格预置「名称」和「状态」两个字段，之后可随时添加更多字段。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CellDisplay({ field, value }: { field: TableField; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="cell-empty">—</span>;
  }
  if (field.type === 'checkbox') {
    return <span style={{ color: value ? 'var(--accent)' : 'var(--text-muted)' }}>{value ? '✓' : '○'}</span>;
  }
  if (field.type === 'select' && field.options) {
    const opt = field.options.find((o) => o.label === value);
    return <span className="select-tag" style={opt ? { background: opt.color + '20', color: opt.color, borderColor: opt.color + '40' } : {}}>{String(value)}</span>;
  }
  if (field.type === 'url') {
    return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="cell-link">{String(value)}</a>;
  }
  if (field.type === 'rating') {
    return <span style={{ color: '#e8a317' }}>{'★'.repeat(Number(value) || 0)}<span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - (Number(value) || 0))}</span></span>;
  }
  return <span>{String(value)}</span>;
}
