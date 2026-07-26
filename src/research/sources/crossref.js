import { createSourceRecord } from '../domain.js';
import { LiteratureSearchError, clampLimit, normalizeDoi, readJsonOrThrow, buildAudit } from '../searchBase.js';

const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';

function normalizeCrossrefWork(work, retrieval) {
  if (!work || typeof work !== 'object') return null;
  const title = Array.isArray(work.title) ? work.title[0] : work.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const doi = normalizeDoi(work.DOI);
  const dateParts = work.issued?.['date-parts']?.[0];
  const year = Array.isArray(dateParts) && Number.isInteger(dateParts[0]) ? dateParts[0] : null;
  const authors = Array.isArray(work.author)
    ? work.author.map((a) => [a?.given, a?.family].filter(Boolean).join(' ')).filter(Boolean)
    : [];
  return createSourceRecord({
    id: doi ? `crossref:${doi}` : undefined,
    sourceType: work.type === 'posted-content' ? 'preprint' : 'article',
    reality: 'real',
    title: title.trim(),
    authors,
    year,
    venue: Array.isArray(work['container-title']) ? work['container-title'][0] : (work.publisher ?? null),
    abstract: typeof work.abstract === 'string' ? work.abstract.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null,
    url: work.URL ?? (doi ? `https://doi.org/${doi}` : null),
    externalIds: { ...(doi ? { doi } : {}) },
    retrieval,
  });
}

async function searchCrossref(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, mailto = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = new URL(CROSSREF_ENDPOINT);
  url.searchParams.set('query', term);
  url.searchParams.set('rows', String(boundedLimit));
  url.searchParams.set('offset', String((boundedPage - 1) * boundedLimit));
  if (mailto) url.searchParams.set('mailto', String(mailto));
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`Crossref network error: ${error.message}`, { source: 'crossref', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'crossref');
  const retrieval = buildAudit('crossref', term, requestedAt, response.status, payload);
  const items = payload.message?.items ?? [];
  const records = items.map((w) => normalizeCrossrefWork(w, retrieval)).filter(Boolean);
  return {
    source: 'crossref', query: term,
    total: Number.isFinite(payload.message?.['total-results']) ? payload.message['total-results'] : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

export { CROSSREF_ENDPOINT, searchCrossref, normalizeCrossrefWork };
