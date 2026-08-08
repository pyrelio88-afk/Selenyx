import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { BottomSheet } from '@components/layout/BottomSheet';
import { useIsMobile } from '@lib/useIsMobile';
import type { MultiDimTable, TableField, FieldType } from '@apptypes/index';
import '../../styles/tables-workbench.css';

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

const FIELD_COLORS = ['#a64734', '#4f7256', '#506885', '#9a7837', '#7a5b86', '#3d7770', '#a86235', '#4f5f58'];

function genId(prefix = 'f') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildTableCsv(fields: TableField[], records: Record<string, unknown>[]): string {
  const lines = [fields.map((field) => csvEscape(field.name)).join(',')];
  for (const record of records) lines.push(fields.map((field) => csvEscape(record[field.id])).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function parseCsvText(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function prepareTableRecords(
  table: MultiDimTable,
  filterText: string,
  sortField: string | null,
  sortDir: 'asc' | 'desc',
) {
  let records: (Record<string, unknown> & { __idx: number })[] = table.records.map((record, index) => ({ ...record, __idx: index }));
  const query = filterText.trim().toLocaleLowerCase('zh-CN');
  if (query) {
    records = records.filter((record) => table.fields.some((field) => String(record[field.id] ?? '').toLocaleLowerCase('zh-CN').includes(query)));
  }
  if (sortField) {
    records.sort((first, second) => {
      const a = first[sortField] ?? '';
      const b = second[sortField] ?? '';
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-CN');
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }
  return records;
}

function createNewTable(name: string, projectId: string): MultiDimTable {
  const nameFieldId = genId();
  const statusFieldId = genId();
  return {
    id: genId('tbl'), projectId, name,
    fields: [
      { id: nameFieldId, name: '名称', type: 'text', required: true, defaultValue: '' },
      { id: statusFieldId, name: '状态', type: 'select', required: false, defaultValue: '', options: [
        { label: '待处理', color: '#9a7837' },
        { label: '进行中', color: '#506885' },
        { label: '已完成', color: '#4f7256' },
      ] },
    ],
    views: [{ id: genId('v'), name: '默认视图', type: 'table', fieldIds: [nameFieldId, statusFieldId], filters: [], sorts: [], groupFieldId: null, freezeColumns: 1 }],
    records: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function FieldBadge({ type }: { type: FieldType }) {
  const label = FIELD_TYPES.find((item) => item.value === type)?.label ?? type;
  return <span className="tables-field-badge">{label}</span>;
}

function CellEditor({ field, value, onChange, onClose }: { field: TableField; value: unknown; onChange: (value: unknown) => void; onClose: () => void }) {
  if (field.type === 'checkbox') {
    return <input className="tables-checkbox" aria-label={`编辑${field.name}`} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} onBlur={onClose} autoFocus />;
  }
  if (field.type === 'select' && field.options) {
    return (
      <select aria-label={`编辑${field.name}`} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} onBlur={onClose} className="tables-cell-select" autoFocus>
        <option value="">—</option>
        {field.options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === 'rating') {
    const rating = Number(value) || 0;
    return (
      <div className="tables-rating-editor" role="group" aria-label={`编辑${field.name}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button key={score} aria-label={`${score} 星`} aria-pressed={score <= rating} onClick={() => onChange(score === rating ? 0 : score)}>★</button>
        ))}
      </div>
    );
  }
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text';
  return (
    <input
      className="tables-cell-input" aria-label={`编辑${field.name}`} type={inputType} autoFocus
      value={String(value ?? '')}
      onChange={(event) => onChange(field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
      onBlur={onClose}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') onClose(); }}
    />
  );
}

function CellDisplay({ field, value }: { field: TableField; value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="tables-cell-empty">—</span>;
  if (field.type === 'checkbox') return <span className="tables-boolean">{value ? '✓ 是' : '○ 否'}</span>;
  if (field.type === 'select' && field.options) {
    const option = field.options.find((item) => item.label === value);
    return <span className="tables-select-value" style={option ? { borderColor: `${option.color}55`, color: option.color, background: `${option.color}12` } : undefined}>{String(value)}</span>;
  }
  if (field.type === 'url') return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="tables-cell-link" onClick={(event) => event.stopPropagation()}>{String(value)}</a>;
  if (field.type === 'rating') return <span className="tables-rating" aria-label={`${Number(value) || 0} 星`}>{'★'.repeat(Number(value) || 0)}<span>{'★'.repeat(5 - (Number(value) || 0))}</span></span>;
  return <span>{String(value)}</span>;
}

interface TableDirectoryProps {
  tables: MultiDimTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  projectsById: Map<string, string>;
  mobile?: boolean;
}

function TableDirectory({ tables, selectedId, onSelect, onCreate, projectsById, mobile }: TableDirectoryProps) {
  return (
    <aside className={`tables-directory ${mobile ? 'is-mobile' : ''}`} aria-label="数据表目录">
      <div className="tables-directory-head">
        <div><h1>数据表格</h1></div>
        <button className="btn btn-primary" onClick={onCreate}><Icon name="plus" size={15} /> 新建表</button>
      </div>
      {tables.length === 0 ? (
        <div className="tables-directory-empty"><Icon name="tables" size={30} strokeWidth={1.2} /><p>还没有数据表</p><button className="btn" onClick={onCreate}>创建第一张表</button></div>
      ) : (
        <div className="tables-directory-list">
          {tables.map((table) => (
            <button key={table.id} className={`tables-directory-item ${selectedId === table.id ? 'is-active' : ''}`} onClick={() => onSelect(table.id)} aria-current={selectedId === table.id ? 'page' : undefined}>
              <span className="tables-directory-icon"><Icon name="tables" size={16} /></span>
              <span className="tables-directory-copy">
                <strong>{table.name}</strong>
                <small>{table.records.length} 行 · {table.fields.length} 列{table.projectId && projectsById.get(table.projectId) ? ` · ${projectsById.get(table.projectId)}` : ''}</small>
              </span>
              <Icon name="chevronRight" size={15} />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export function TablesView() {
  const { tables, addTable, deleteTable, addTableField, removeTableField, addTableRecord, updateTableRecord, deleteTableRecord, projects } = useAppStore();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(tables[0]?.id ?? null);
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(() => !isMobile);
  const [showCreate, setShowCreate] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableProjectId, setNewTableProjectId] = useState('');
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; fieldId: string } | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const selected = tables.find((table) => table.id === selectedId) ?? null;
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const visibleRecords = useMemo(
    () => selected ? prepareTableRecords(selected, filterText, sortField, sortDir) : [],
    [selected, filterText, sortField, sortDir],
  );

  function selectTable(id: string) {
    setSelectedId(id);
    setMobileListOpen(false);
    setEditingCell(null);
    setFilterText('');
  }

  function handleCreate() {
    const name = newTableName.trim();
    if (!name) return;
    const table = createNewTable(name, newTableProjectId);
    addTable(table);
    selectTable(table.id);
    setNewTableName(''); setNewTableProjectId(''); setShowCreate(false);
  }

  function handleAddField() {
    if (!selected || !newFieldName.trim()) return;
    const field: TableField = { id: genId(), name: newFieldName.trim(), type: newFieldType, required: false, defaultValue: null };
    if ((newFieldType === 'select' || newFieldType === 'multiSelect') && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(/[,，]/).map((label, index) => ({ label: label.trim(), color: FIELD_COLORS[index % FIELD_COLORS.length] })).filter((option) => option.label);
    }
    addTableField(selected.id, field);
    setNewFieldName(''); setNewFieldType('text'); setNewFieldOptions(''); setShowAddField(false);
  }

  function handleAddRow() {
    if (!selected) return;
    addTableRecord(selected.id, Object.fromEntries(selected.fields.map((field) => [field.id, field.defaultValue])));
  }

  function toggleSort(fieldId: string) {
    if (sortField === fieldId) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortField(fieldId); setSortDir('asc'); }
  }

  function handleExport() {
    if (!selected) return;
    const blob = new Blob([buildTableCsv(selected.fields, selected.records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${selected.name.replace(/[\\/:*?"<>|]/g, '_')}.csv`; anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`已导出 ${selected.records.length} 行 CSV`);
  }

  async function handleImport(file: File) {
    if (!selected) return;
    const rows = parseCsvText(await file.text());
    const headers = rows[0]?.map((header) => header.trim()).filter(Boolean) ?? [];
    if (headers.length === 0) { setMessage('CSV 没有可识别的表头'); return; }
    const existingByName = new Map(selected.fields.map((field) => [field.name, field]));
    const importFields = headers.map((name) => existingByName.get(name) ?? { id: genId(), name, type: 'text' as const, required: false, defaultValue: null });
    for (const field of importFields) if (!existingByName.has(field.name)) addTableField(selected.id, field);
    for (const values of rows.slice(1)) {
      const record: Record<string, unknown> = {};
      importFields.forEach((field, index) => { record[field.id] = values[index] ?? ''; });
      addTableRecord(selected.id, record);
    }
    setMessage(`已从 CSV 导入 ${Math.max(0, rows.length - 1)} 行，新增字段会按文本保存`);
  }

  function deleteSelectedTable() {
    if (!selected || !confirm(`删除表格「${selected.name}」？此操作不可撤销。`)) return;
    deleteTable(selected.id);
    const remaining = tables.find((table) => table.id !== selected.id);
    setSelectedId(remaining?.id ?? null);
    if (isMobile) setMobileListOpen(true);
  }

  const inspector = selected ? (
    <div className="tables-inspector-content">
      <section>
        <div className="tables-inspector-heading"><div><h2>字段 · {selected.fields.length}</h2></div><button className="btn" onClick={() => setShowAddField((value) => !value)}><Icon name="plus" size={14} /> 添加字段</button></div>
        {showAddField && (
          <div className="tables-add-field-form">
            <label>字段名称<input className="input" value={newFieldName} onChange={(event) => setNewFieldName(event.target.value)} placeholder="例如：效应量" autoFocus /></label>
            <label>字段类型<select className="input" value={newFieldType} onChange={(event) => setNewFieldType(event.target.value as FieldType)}>{FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            {(newFieldType === 'select' || newFieldType === 'multiSelect') && <label>选项<input className="input" value={newFieldOptions} onChange={(event) => setNewFieldOptions(event.target.value)} placeholder="用逗号分隔" /></label>}
            <div><button className="btn" onClick={() => setShowAddField(false)}>取消</button><button className="btn btn-primary" onClick={handleAddField} disabled={!newFieldName.trim()}>保存字段</button></div>
          </div>
        )}
        <div className="tables-field-list">
          {selected.fields.map((field, index) => (
            <div className="tables-field-item" key={field.id}>
              <span className="tables-field-order">{index + 1}</span>
              <div><strong>{field.name}</strong><FieldBadge type={field.type} /></div>
              <button className="tables-icon-button is-danger" aria-label={`删除字段 ${field.name}`} onClick={() => { if (confirm(`删除字段「${field.name}」及其全部单元格数据？`)) removeTableField(selected.id, field.id); }}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      </section>
      <section className="tables-operation-section">
        <h2>表格操作</h2>
        <button className="btn" onClick={() => importInputRef.current?.click()}><Icon name="import" size={15} /> 导入 CSV</button>
        <button className="btn" onClick={handleExport}><Icon name="download" size={15} /> 导出 CSV</button>
        <button className="btn btn-danger-ghost" onClick={deleteSelectedTable}><Icon name="close" size={15} /> 删除此表</button>
      </section>
    </div>
  ) : null;

  const tableCanvas = selected ? (
    <section className="tables-canvas" aria-label={`数据表：${selected.name}`}>
      <header className="tables-canvas-header">
        {isMobile && <button className="tables-icon-button" aria-label="返回数据表目录" onClick={() => setMobileListOpen(true)}><Icon name="chevronLeft" size={19} /></button>}
        <div className="tables-canvas-title"><h1>{selected.name}</h1><span>{selected.records.length} 行 · {selected.fields.length} 列{selected.projectId && projectsById.get(selected.projectId) ? ` · ${projectsById.get(selected.projectId)}` : ''}</span></div>
        <button className="tables-icon-button tables-inspector-trigger" aria-label="打开字段和操作检查区" aria-haspopup="dialog" onClick={() => setInspectorOpen(true)}><Icon name="more" size={19} /></button>
      </header>

      <div className="tables-toolbar-scroll" aria-label="数据表工具栏">
        <div className="tables-toolbar">
          <div className="tables-filter-input"><Icon name="search" size={15} /><input value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="筛选当前表…" aria-label="筛选当前表" /></div>
          <div className="tables-view-switch" role="group" aria-label="视图模式">
            <button aria-pressed={viewMode === 'table'} className={viewMode === 'table' ? 'is-active' : ''} onClick={() => setViewMode('table')}><Icon name="tables" size={15} /> 表格</button>
            <button aria-pressed={viewMode === 'board'} className={viewMode === 'board' ? 'is-active' : ''} onClick={() => setViewMode('board')}><Icon name="list" size={15} /> 看板</button>
          </div>
          <button className="btn btn-primary" onClick={handleAddRow}><Icon name="plus" size={15} /> 添加记录</button>
          <button className="btn" onClick={() => importInputRef.current?.click()}><Icon name="import" size={15} /> 导入</button>
          <button className="btn" onClick={handleExport}><Icon name="download" size={15} /> 导出</button>
          {!isMobile && <button className="btn" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}><Icon name="more" size={15} /> 字段与操作</button>}
        </div>
      </div>
      {message && <div className="tables-message" role="status">{message}</div>}

      {viewMode === 'table' ? (
        <div className="tables-grid-scroll" tabIndex={0} aria-label="可横向滚动的数据表格">
          <table className="tables-grid">
            <thead><tr><th className="tables-row-number">#</th>{selected.fields.map((field) => (
              <th key={field.id}>
                <button className="tables-sort-button" onClick={() => toggleSort(field.id)} aria-label={`按${field.name}${sortField === field.id && sortDir === 'asc' ? '降序' : '升序'}排序`}>
                  <Icon name={field.type === 'checkbox' ? 'check' : field.type === 'date' ? 'calendar' : 'tag'} size={13} /><span>{field.name}</span><FieldBadge type={field.type} />{sortField === field.id && <b>{sortDir === 'asc' ? '↑' : '↓'}</b>}
                </button>
              </th>
            ))}<th className="tables-row-actions">行操作</th></tr></thead>
            <tbody>
              {visibleRecords.map((record) => {
                const rowIndex = record.__idx;
                return <tr key={rowIndex}><td className="tables-row-number">{rowIndex + 1}</td>{selected.fields.map((field) => {
                  const isEditing = editingCell?.rowIdx === rowIndex && editingCell.fieldId === field.id;
                  return (
                    <td key={field.id} className="tables-editable-cell" tabIndex={isEditing ? -1 : 0} onClick={() => setEditingCell({ rowIdx: rowIndex, fieldId: field.id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditingCell({ rowIdx: rowIndex, fieldId: field.id }); } }}>
                      {isEditing ? <CellEditor field={field} value={record[field.id]} onChange={(value) => updateTableRecord(selected.id, rowIndex, { [field.id]: value })} onClose={() => setEditingCell(null)} /> : <CellDisplay field={field} value={record[field.id]} />}
                    </td>
                  );
                })}<td className="tables-row-actions"><button className="tables-icon-button is-danger" aria-label={`删除第 ${rowIndex + 1} 行`} onClick={() => deleteTableRecord(selected.id, rowIndex)}><Icon name="close" size={15} /></button></td></tr>;
              })}
            </tbody>
          </table>
          {visibleRecords.length === 0 && <div className="tables-grid-empty">{selected.records.length === 0 ? '表格为空，点击“添加记录”开始录入。' : '没有记录符合当前筛选。'}</div>}
        </div>
      ) : <BoardCanvas table={selected} records={visibleRecords} dragRowIdx={dragRowIdx} dropTargetGroup={dropTargetGroup} onDragRow={setDragRowIdx} onDropGroup={setDropTargetGroup} onUpdate={updateTableRecord} />}
    </section>
  ) : <div className="tables-no-selection"><Icon name="tables" size={42} strokeWidth={1.2} /><p>从目录选择数据表，或新建一张表。</p></div>;

  return (
    <div className="tables-workbench">
      {isMobile ? (mobileListOpen || !selected ? <TableDirectory mobile tables={tables} selectedId={selectedId} onSelect={selectTable} onCreate={() => setShowCreate(true)} projectsById={projectsById} /> : tableCanvas) : (
        <div className={`tables-workbench-grid ${inspectorOpen ? '' : 'is-inspector-hidden'}`}><TableDirectory tables={tables} selectedId={selectedId} onSelect={selectTable} onCreate={() => setShowCreate(true)} projectsById={projectsById} />{tableCanvas}{inspectorOpen && <aside className="tables-inspector" aria-label="字段和表格操作">{inspector}</aside>}</div>
      )}

      <input ref={importInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImport(file); event.target.value = ''; }} />

      {isMobile && <BottomSheet open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="字段与表格操作">{inspector}</BottomSheet>}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card tables-create-modal" role="dialog" aria-modal="true" aria-labelledby="tables-create-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="tables-create-title">新建数据表</h2>
            <label>表格名称<input className="input" value={newTableName} onChange={(event) => setNewTableName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleCreate(); }} placeholder="例如：文献数据提取表" autoFocus /></label>
            <label>关联项目（可选）<select className="input" value={newTableProjectId} onChange={(event) => setNewTableProjectId(event.target.value)}><option value="">不关联</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <p>新表预置“名称”和“状态”字段；可在字段检查区继续扩展。</p>
            <div><button className="btn" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" onClick={handleCreate} disabled={!newTableName.trim()}>创建</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BoardCanvasProps {
  table: MultiDimTable;
  records: (Record<string, unknown> & { __idx: number })[];
  dragRowIdx: number | null;
  dropTargetGroup: string | null;
  onDragRow: (index: number | null) => void;
  onDropGroup: (group: string | null) => void;
  onUpdate: (tableId: string, recordIndex: number, patch: Record<string, unknown>) => void;
}

function BoardCanvas({ table, records, dragRowIdx, dropTargetGroup, onDragRow, onDropGroup, onUpdate }: BoardCanvasProps) {
  const selectField = table.fields.find((field) => field.type === 'select' && field.options?.length);
  if (!selectField?.options) return <div className="tables-board-empty"><Icon name="list" size={30} /><strong>看板需要单选字段</strong><p>请在右侧字段检查区添加单选字段和分组选项。</p></div>;
  const titleField = table.fields.find((field) => field.type === 'text') ?? table.fields[0];
  return (
    <div className="tables-board-scroll">
      {selectField.options.map((group) => {
        const groupRecords = records.filter((record) => record[selectField.id] === group.label || (!record[selectField.id] && group.label === selectField.options?.[0]?.label));
        const isTarget = dropTargetGroup === group.label && dragRowIdx !== null;
        return (
          <section className={`tables-board-column ${isTarget ? 'is-drop-target' : ''}`} key={group.label} onDragOver={(event) => { event.preventDefault(); onDropGroup(group.label); }} onDrop={(event) => { event.preventDefault(); if (dragRowIdx !== null) onUpdate(table.id, dragRowIdx, { [selectField.id]: group.label }); onDragRow(null); onDropGroup(null); }}>
            <header><span style={{ background: group.color }} /><strong>{group.label}</strong><small>{groupRecords.length}</small></header>
            <div className="tables-board-cards">{groupRecords.map((record) => (
              <article key={record.__idx} draggable onDragStart={() => onDragRow(record.__idx)} onDragEnd={() => { onDragRow(null); onDropGroup(null); }} className={dragRowIdx === record.__idx ? 'is-dragging' : ''}>
                <strong>{String(record[titleField.id] ?? '未命名') || '未命名'}</strong>
                <label>移动到<select value={String(record[selectField.id] || group.label)} onChange={(event) => onUpdate(table.id, record.__idx, { [selectField.id]: event.target.value })}>{selectField.options?.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}</select></label>
              </article>
            ))}{groupRecords.length === 0 && <p>暂无记录，可拖入此列。</p>}</div>
          </section>
        );
      })}
    </div>
  );
}
