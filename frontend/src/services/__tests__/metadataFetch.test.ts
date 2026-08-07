import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchCrossref } from '../metadataFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchCrossref', () => {
  it('requests a bounded bibliographic query and maps import-safe metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          items: [{
            DOI: '10.1000/example',
            title: ['Example research article'],
            author: [{ given: 'Ada', family: 'Lovelace' }],
            type: 'journal-article',
            'container-title': ['Research Journal'],
            published: { 'date-parts': [[2025, 1, 1]] },
            volume: '12',
            issue: '3',
            page: '1-10',
            abstract: '<jats:p>Structured abstract</jats:p>',
            ISSN: ['1234-5678'],
            publisher: 'Example Press',
            license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/' }],
          }],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchCrossref('example phrase', 50);

    expect(String(fetchMock.mock.calls[0][0])).toContain('query.bibliographic=example+phrase');
    expect(String(fetchMock.mock.calls[0][0])).toContain('rows=20');
    expect(results).toEqual([{
      title: 'Example research article',
      creators: [{ firstName: 'Ada', lastName: 'Lovelace' }],
      type: 'journalArticle',
      doi: '10.1000/example',
      publication: 'Research Journal',
      year: 2025,
      volume: '12',
      issue: '3',
      pages: '1-10',
      abstract: 'Structured abstract',
      issn: '1234-5678',
      publisher: 'Example Press',
      openAccess: true,
    }]);
  });

  it('returns an empty result set on a failed remote response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(searchCrossref('network failure')).resolves.toEqual([]);
  });
});
