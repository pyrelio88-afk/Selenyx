import { describe, expect, it } from 'vitest';
import { listLocalFiles } from '../listLocalFiles';
import type { Reference } from '@apptypes/reference';

function ref(partial: Partial<Reference> & Pick<Reference, 'id'>): Reference {
  return { title: '', attachments: [], ...partial } as Reference;
}

describe('listLocalFiles', () => {
  it('keeps only attachments with a path and classifies pdf/image', () => {
    const items = listLocalFiles([
      ref({
        id: 'a',
        title: '试验',
        attachments: [
          { filename: 'paper.pdf', path: 'D:/docs/paper.pdf', mimeType: 'application/pdf' },
          { filename: 'fig.png', path: 'D:/docs/fig.png', mimeType: 'image/png' },
          { filename: 'empty.pdf', path: '', mimeType: 'application/pdf' },
        ] as Reference['attachments'],
      }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['pdf', 'image']);
    expect(items[0].referenceId).toBe('a');
  });
});
