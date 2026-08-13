import { describe, expect, it } from 'vitest';
import { acceptedEvidenceForExport, buildEvidenceAppendix, citedEvidenceIds, withoutEvidenceAppendix, withEvidenceAppendix } from '../evidenceAppendix';

const card = {
  id: 'abc',
  claim: '集束化护理有效',
  excerpt: '试验组谵妄更少',
  review: 'accepted',
  status: 'accepted',
  project_id: 'project-1',
  page: 12,
  updated_at: '2026-08-12T10:00:00',
};

describe('evidence appendix', () => {
  it('collects unique citation ids in document order', () => {
    expect(citedEvidenceIds('一句[^e:abc]。又一句[^e:abc][^e:zzz]。')).toEqual(['abc', 'zzz']);
  });

  it('renders a card plus honest missing-id row', () => {
    const text = buildEvidenceAppendix('结论[^e:abc] 和无据[^e:ghost]。', [card]);
    expect(text).toContain('## 证据附录');
    expect(text).toContain('论断：集束化护理有效');
    expect(text).toContain('页码：p.12');
    expect(text).toContain('裁决状态：accepted');
    expect(text).toContain('未找到对应证据卡');
    expect(text).not.toContain('ghost 的伪造摘录');
  });

  it('rebuilds instead of trusting an old or fabricated appendix', () => {
    const once = withEvidenceAppendix('结论[^e:abc]', [card]);
    expect(withEvidenceAppendix(once, [card])).toBe(once);
    const rebuilt = withEvidenceAppendix('结论[^e:abc]\n\n## 证据附录\n\n伪造摘录：不可直通', [card]);
    expect(rebuilt).toContain('论断：集束化护理有效');
    expect(rebuilt).not.toContain('伪造摘录：不可直通');
    expect(rebuilt.match(/^## 证据附录$/gm)).toHaveLength(1);
  });

  it('drops an appendix from an unmarked old run rather than persisting it', () => {
    const raw = '普通任务说明\n\n## 证据附录\n\n伪造的旧运行内容';
    expect(withoutEvidenceAppendix(raw)).toBe('普通任务说明');
    expect(withEvidenceAppendix(raw, [card])).toBe('普通任务说明');
  });

  it('exports only accepted evidence belonging to the active run project', () => {
    const selected = acceptedEvidenceForExport('project-1', [
      card,
      { ...card, id: 'pending', review: 'pending' },
      { ...card, id: 'unverified', status: 'pending' },
      { ...card, id: 'other-project', project_id: 'project-2' },
    ]);

    expect(selected.map((item) => item.id)).toEqual(['abc']);
  });
});
