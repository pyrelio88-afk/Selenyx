import { describe, expect, it } from 'vitest';
import { filterReferences } from '../filterReferences';
import type { Reference } from '@apptypes/reference';

function ref(partial: Partial<Reference>): Reference {
  return { id: '1', title: '', type: 'journalArticle', creators: [], doi: '', publication: '', ...partial } as Reference;
}

describe('filterReferences', () => {
  const rows = [
    ref({ id: 'a', title: '护理交接', type: 'journalArticle', doi: '10.1/abc' }),
    ref({ id: 'b', title: 'Open book', type: 'book', creators: [{ firstName: 'Ada', lastName: 'Lovelace' }] as Reference['creators'] }),
    ref({ id: 'c', title: undefined as unknown as string, doi: undefined as unknown as string, publication: undefined as unknown as string }),
  ];

  it('does not crash when doi or title is missing', () => {
    expect(() => filterReferences(rows, 'x', 'all')).not.toThrow();
  });

  it('filters by type and query', () => {
    expect(filterReferences(rows, '交接', 'all').map((item) => item.id)).toEqual(['a']);
    expect(filterReferences(rows, '', 'book').map((item) => item.id)).toEqual(['b']);
    expect(filterReferences(rows, 'lovelace', 'all').map((item) => item.id)).toEqual(['b']);
  });
});
