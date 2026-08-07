import { describe, expect, it } from 'vitest';
import type { ZoteroReferenceCandidate } from '@services/api';
import { referenceFromZotero } from '../zoteroReference';

const candidate: ZoteroReferenceCandidate = {
  key: 'ABCD1234',
  type: 'journalArticle',
  title: ' Local Zotero evidence ',
  creators: [{ firstName: 'Ada', lastName: 'Lovelace', type: 'author' }],
  publication: 'Evidence Journal',
  year: '2025',
  date: '2025-09-01',
  doi: 'https://doi.org/10.1000/example',
  url: 'https://example.test/article',
  volume: '4', issue: '2', pages: '1-10', abstract: 'Structured evidence.', publisher: '', place: '', isbn: '', issn: '',
  language: 'en', rights: '', collections: ['COLLECTION1'], tags: ['methods'],
};

describe('referenceFromZotero', () => {
  it('preserves Zotero metadata in the local reference model without trusting unsafe URLs', () => {
    const reference = referenceFromZotero({ ...candidate, url: 'javascript:alert(1)' });

    expect(reference).toMatchObject({
      type: 'journalArticle',
      title: 'Local Zotero evidence',
      doi: '10.1000/example',
      url: 'https://doi.org/10.1000%2Fexample',
      uri: 'zotero://select/library/items/ABCD1234',
      creators: [{ firstName: 'Ada', lastName: 'Lovelace', type: 'author', order: 0 }],
      collections: ['COLLECTION1'],
      tags: ['methods'],
      source: 'import',
    });
  });

  it('uses safe model fallbacks for unknown Zotero item and creator types', () => {
    const reference = referenceFromZotero({
      ...candidate,
      type: 'unknownItem',
      creators: [{ firstName: '', lastName: 'Institution', type: 'inventor' }],
    });

    expect(reference.type).toBe('journalArticle');
    expect(reference.creators[0]).toMatchObject({ lastName: 'Institution', type: 'author' });
  });
});
