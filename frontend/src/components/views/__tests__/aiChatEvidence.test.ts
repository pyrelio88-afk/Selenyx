import { describe, expect, it } from 'vitest';
import type { EvidenceRecord } from '@services/api';
import { acceptedEvidenceForProject, buildAcceptedEvidenceContext } from '../AIChatView';

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'e-1',
    project_id: 'project-a',
    reference_id: 'ref-1',
    claim: '干预可能降低风险',
    excerpt: '研究组的结局风险低于对照组。',
    relation: 'supports',
    review: 'accepted',
    status: 'accepted',
    confidence: 'medium',
    page: 8,
    chunk_id: 'chunk-1',
    notes: '',
    created_at: '2026-08-08T00:00:00Z',
    updated_at: '2026-08-08T00:00:00Z',
    ...overrides,
  };
}

describe('AIChat accepted-evidence boundary', () => {
  it('returns no evidence while the loaded scope belongs to another project', () => {
    expect(acceptedEvidenceForProject('project-b', 'project-a', [evidence()])).toEqual([]);
  });

  it('keeps only manually accepted records from the active project', () => {
    const records = [
      evidence(),
      evidence({ id: 'e-2', review: 'pending' }),
      evidence({ id: 'e-unverified', status: 'pending' }),
      evidence({ id: 'e-3', project_id: 'project-b' }),
    ];
    expect(acceptedEvidenceForProject('project-a', 'project-a', records).map((item) => item.id)).toEqual(['e-1']);
  });

  it('builds a bounded citation contract and excludes unaccepted evidence', () => {
    const context = buildAcceptedEvidenceContext([
      evidence(),
      evidence({ id: 'e-2', review: 'rejected', excerpt: '不得进入提示词的内容' }),
    ]);
    expect(context).toContain('[E1]');
    expect(context).toContain('reference_id=ref-1');
    expect(context).toContain('现有已接受证据不足');
    expect(context).not.toContain('不得进入提示词的内容');
    expect(context).not.toContain('[E2]');
  });
});
