import { describe, expect, it } from 'vitest';
import type { EvidenceRecord } from '@services/api';
import { countEvidenceReviews, getEvidenceReviewMeta } from './PipelineView';

function record(id: string, review: EvidenceRecord['review']): EvidenceRecord {
  return { id, review } as EvidenceRecord;
}

describe('Pipeline evidence presentation', () => {
  it('gives every review state a visible symbol and text label', () => {
    expect(getEvidenceReviewMeta('pending')).toMatchObject({ label: '待审', symbol: '○', className: 'is-pending' });
    expect(getEvidenceReviewMeta('accepted')).toMatchObject({ label: '已接受', symbol: '✓', className: 'is-accepted' });
    expect(getEvidenceReviewMeta('rejected')).toMatchObject({ label: '已拒绝', symbol: '×', className: 'is-rejected' });
  });

  it('keeps accepted evidence separate from pending and rejected evidence', () => {
    const counts = countEvidenceReviews([
      record('pending-1', 'pending'),
      record('accepted-1', 'accepted'),
      record('accepted-2', 'accepted'),
      record('rejected-1', 'rejected'),
    ]);
    expect(counts).toEqual({ pending: 1, accepted: 2, rejected: 1 });
  });
});
