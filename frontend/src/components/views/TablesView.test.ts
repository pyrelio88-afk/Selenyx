import { describe, expect, it } from 'vitest';
import type { MultiDimTable, TableField } from '@apptypes/index';
import { buildTableCsv, csvEscape, parseCsvText, prepareTableRecords } from './TablesView';

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
