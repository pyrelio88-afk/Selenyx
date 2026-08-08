import { describe, expect, it } from 'vitest';
import { describeRetrieval, getReferenceIndexPresentation } from '../ReferenceEvidenceWorkspace';

describe('ReferenceEvidenceWorkspace state language', () => {
  it('never presents an offline cache as a searchable index', () => {
    expect(getReferenceIndexPresentation('offline')).toEqual({
      label: '本机后端离线 · 索引不可查询',
      tone: 'negative',
      searchable: false,
    });
  });

  it('only enables retrieval after SQLite synchronization is confirmed', () => {
    expect(getReferenceIndexPresentation('synced').searchable).toBe(true);
    expect(getReferenceIndexPresentation('idle').searchable).toBe(false);
    expect(getReferenceIndexPresentation('syncing').searchable).toBe(false);
    expect(getReferenceIndexPresentation('error').searchable).toBe(false);
  });

  it('labels retrieval as excerpts rather than a generated conclusion', () => {
    expect(describeRetrieval(3, '项目「护理交接」内')).toContain('3 个可追溯原文片段');
    expect(describeRetrieval(3, '项目「护理交接」内')).toContain('不是自动生成的研究结论');
    expect(describeRetrieval(0, '全库范围内')).toContain('不会用模型内容补齐空结果');
  });
});
