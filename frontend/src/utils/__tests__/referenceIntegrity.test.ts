import { describe, expect, it } from 'vitest';
import type { Reference } from '@apptypes/reference';
import {
  dedupeIncomingReferences,
  normalizeDoi,
  referenceOnlineUrl,
  safeExternalUrl,
} from '../referenceIntegrity';

function reference(partial: Partial<Reference>): Reference {
  return {
    id: partial.id ?? 'ref',
    doi: partial.doi ?? '',
    title: partial.title ?? 'Untitled reference',
    year: partial.year ?? '2026',
    url: partial.url ?? '',
    uri: partial.uri ?? '',
  } as Reference;
}

describe('reference integrity helpers', () => {
  it('normalizes DOI variants before duplicate comparison', () => {
    expect(normalizeDoi(' DOI: https://doi.org/10.1000/ABC.1. ')).toBe('10.1000/abc.1');

    const result = dedupeIncomingReferences(
      [reference({ id: 'stored', doi: '10.1000/abc.1', title: 'Stored' })],
      [reference({ id: 'incoming', doi: 'https://doi.org/10.1000/ABC.1', title: 'Imported copy' })],
    );

    expect(result).toEqual({ accepted: [], skipped: 1 });
  });

  it('also prevents repeated DOI-less imports by title and year', () => {
    const result = dedupeIncomingReferences(
      [reference({ id: 'stored', title: '  A useful study ', year: '2025' })],
      [
        reference({ id: 'same', title: 'a useful   study', year: '2025' }),
        reference({ id: 'different-year', title: 'A useful study', year: '2026' }),
      ],
    );

    expect(result.skipped).toBe(1);
    expect(result.accepted.map((item) => item.id)).toEqual(['different-year']);
  });

  it('allows only safe http(s) links for online previews', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('file:///private.pdf')).toBeNull();
    expect(referenceOnlineUrl(reference({ url: 'data:text/html,unsafe', doi: '10.1000/safe' }))).toBe('https://doi.org/10.1000%2Fsafe');
    expect(referenceOnlineUrl(reference({ url: 'https://example.org/article' }))).toBe('https://example.org/article');
  });
});
