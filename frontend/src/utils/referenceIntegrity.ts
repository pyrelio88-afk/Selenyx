import type { Reference } from '@apptypes/reference';

/** Normalize a DOI enough for comparisons without changing its display value. */
export function normalizeDoi(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[\s.;,]+$/g, '')
    .toLowerCase();
}

function normalizedTitle(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * DOI is authoritative. For records without one, use a conservative title +
 * year fingerprint so importing the same BibTeX/RIS file does not multiply
 * records on every attempt.
 */
export function referenceFingerprint(reference: Pick<Reference, 'doi' | 'title' | 'year'>): string | null {
  const doi = normalizeDoi(reference.doi);
  if (doi) return `doi:${doi}`;
  const title = normalizedTitle(reference.title);
  if (!title) return null;
  return `title:${title}|year:${reference.year.trim()}`;
}

export function dedupeIncomingReferences(
  existing: readonly Pick<Reference, 'doi' | 'title' | 'year'>[],
  incoming: readonly Reference[],
): { accepted: Reference[]; skipped: number } {
  const fingerprints = new Set(existing.map(referenceFingerprint).filter((value): value is string => Boolean(value)));
  const accepted: Reference[] = [];
  let skipped = 0;

  for (const reference of incoming) {
    const fingerprint = referenceFingerprint(reference);
    if (fingerprint && fingerprints.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    if (fingerprint) fingerprints.add(fingerprint);
    accepted.push(reference);
  }

  return { accepted, skipped };
}

/** Only http(s) resources may be opened or embedded by the local app. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function doiResolverUrl(doi: string | null | undefined): string | null {
  const normalized = normalizeDoi(doi);
  return normalized ? `https://doi.org/${encodeURIComponent(normalized)}` : null;
}

export function referenceOnlineUrl(reference: Pick<Reference, 'url' | 'uri' | 'doi'>): string | null {
  return safeExternalUrl(reference.url)
    ?? safeExternalUrl(reference.uri)
    ?? doiResolverUrl(reference.doi);
}
