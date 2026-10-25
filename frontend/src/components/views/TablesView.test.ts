import { describe, expect, it } from 'vitest';
import type { MultiDimTable, TableField } from '@apptypes/index';
import { buildTableCsv, csvEscape, parseCsvText, prepareCsvImport, prepareTableRecords } from './TablesView';

const fields: TableField[] = [
  { id: 'name', name: '名称', type: 'text', required: true, defaultValue: '' },
  { id: 'note', name: '备注', type: 'text', required: false, defaultValue: '' },
];

describe('Tables workbench data helpers', () => {
  it('round-trips commas, quotes and line breaks through CSV', () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
    const csv = buildTableCsv(fields, [{ name: '样本,一', note: '第一行\n第二行"引文"' }]);
    expect(parseCsvText(csv)).toEqual([
      ['名称', '备注'],
      ['样本,一', '第一行\n第二行"引文"'],
    ]);
  });

  it('keeps values aligned when an unnamed CSV column appears before a named column', () => {
    const existingFields: TableField[] = [
      { id: 'name', name: '名称', type: 'text', required: false, defaultValue: null },
      { id: 'age', name: '年龄', type: 'text', required: false, defaultValue: null },
    ];
    const prepared = prepareCsvImport(['名称', '', '年龄'], [['样本 A', '批次 3', '42']], existingFields);
    expect(prepared.fields.map((field) => field.name)).toEqual(['名称', '未命名列 2', '年龄']);
    const valueByName = Object.fromEntries(prepared.fields.map((field) => [field.name, prepared.records[0][field.id]]));
    expect(valueByName).toEqual({ 名称: '样本 A', '未命名列 2': '批次 3', 年龄: '42' });
    expect(prepared.unnamedColumnNames).toEqual(['未命名列 2']);
    expect(prepared.newFields.map((field) => field.name)).toEqual(['未命名列 2']);
  });

  it('disambiguates repeated headers and skips truly empty unnamed columns', () => {
    const prepared = prepareCsvImport(['DOI', '', 'DOI'], [['10.1/example-a', '', '10.1/example-b']], []);
    expect(prepared.fields.map((field) => field.name)).toEqual(['DOI', 'DOI（2）']);
    expect(prepared.records[0][prepared.fields[0].id]).toBe('10.1/example-a');
    expect(prepared.records[0][prepared.fields[1].id]).toBe('10.1/example-b');
    expect(prepared.unnamedColumnNames).toEqual([]);
  });

  it('filters and sorts without losing original record indexes used for edits', () => {
    const table: MultiDimTable = {
      id: 'table-1', projectId: '', name: '测试表', fields, views: [],
      records: [{ name: '乙', note: '保留' }, { name: '甲', note: '保留' }, { name: '丙', note: '排除' }],
      createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
    };
    const records = prepareTableRecords(table, '保留', 'name', 'asc');
    expect(records.map((record) => [record.name, record.__idx])).toEqual([['甲', 1], ['乙', 0]]);
  });
});
