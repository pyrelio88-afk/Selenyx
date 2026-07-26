import { createSourceRecord } from '../domain.js';
import { LiteratureSearchError, clampLimit, normalizeDoi, readJsonOrThrow, buildAudit } from '../searchBase.js';

const UNPAYWALL_ENDPOINT = 'https://api.unpaywall.org/v2/search';
const DOAJ_ENDPOINT = 'https://doaj.org/api/search/articles';
const CORE_ENDPOINT = 'https://api.core.ac.uk/v3/search/works';

// ---- Unpaywall ----
function normalizeUnpaywallResult(item, retrieval) {
  const work = item?.response ?? item;
  if (!work || typeof work.title !== 'string' || !work.title.trim()) return null;
  const doi = normalizeDoi(work.doi);
  const authors = Array.isArray(work.z_authors)
    ? work.z_authors.map((a) => [a?.given, a?.family].filter(Boolean).join(' ')).filter(Boolean)
    : [];
  return createSourceRecord({
    id: doi ? `unpaywall:${doi}` : undefined,
    sourceType: 'article',
    reality: 'real',
    title: work.title.trim(),
    authors,
    year: Number.isInteger(work.year) ? work.year : null,
    venue: work.journal_name ?? null,
    url: work.best_oa_location?.url ?? (doi ? `https://doi.org/${doi}` : null),
    externalIds: { ...(doi ? { doi } : {}) },
    retrieval,
  });
}

async function searchUnpaywall(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, email = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = new URL(UNPAYWALL_ENDPOINT);
  url.searchParams.set('query', term);
  url.searchParams.set('email', email ? String(email) : 'selenyx@example.org');
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' }, signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`Unpaywall network error: ${error.message}`, { source: 'unpaywall', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'unpaywall');
  const retrieval = buildAudit('unpaywall', term, requestedAt, response.status, payload);
  const records = (payload.results ?? []).slice(0, boundedLimit).map((r) => normalizeUnpaywallResult(r, retrieval)).filter(Boolean);
  return { source: 'unpaywall', query: term, total: records.length, page: boundedPage, records, audit: retrieval };
}

// ---- DOAJ ----
function normalizeDoajArticle(a, retrieval) {
  const bib = a?.bibjson;
  if (!bib || typeof bib.title !== 'string' || !bib.title.trim()) return null;
  const doi = normalizeDoi(Array.isArray(bib.identifier) ? bib.identifier.find((i) => i?.type === 'doi')?.id : null);
  const yearMatch = String(bib.year ?? '').match(/\b(19|20)\d{2}\b/);
  return createSourceRecord({
    id: a.id ? `doaj:${a.id}` : (doi ? `doaj:${doi}` : undefined),
    sourceType: 'article',
    reality: 'real',
    title: bib.title.trim(),
    authors: Array.isArray(bib.author) ? bib.author.map((x) => x?.name).filter(Boolean) : [],
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: bib.journal?.title ?? null,
    url: bib.link?.[0]?.url ?? (doi ? `https://doi.org/${doi}` : null),
    externalIds: { ...(doi ? { doi } : {}) },
    retrieval,
  });
}

async function searchDoaj(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = `${DOAJ_ENDPOINT}/${encodeURIComponent(term)}`;
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' }, signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`DOAJ network error: ${error.message}`, { source: 'doaj', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'doaj');
  const retrieval = buildAudit('doaj', term, requestedAt, response.status, payload);
  const records = (payload.results ?? []).slice(0, boundedLimit).map((a) => normalizeDoajArticle(a, retrieval)).filter(Boolean);
  return {
    source: 'doaj', query: term,
    total: Number.isFinite(payload.total) ? payload.total : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

// ---- CORE ----
function normalizeCoreWork(w, retrieval) {
  if (!w || typeof w.title !== 'string' || !w.title.trim()) return null;
  const doi = normalizeDoi(w.doi);
  const yearMatch = String(w.yearPublished ?? w.publishedDate ?? '').match(/\b(19|20)\d{2}\b/);
  return createSourceRecord({
    id: w.id ? `core:${w.id}` : (doi ? `core:${doi}` : undefined),
    sourceType: 'article',
    reality: 'real',
    title: w.title.trim(),
    authors: Array.isArray(w.authors) ? w.authors.map((a) => a?.name).filter(Boolean) : [],
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: w.publisher ?? null,
    abstract: typeof w.abstract === 'string' ? w.abstract : null,
    url: w.downloadUrl ?? (doi ? `https://doi.org/${doi}` : null),
    externalIds: { ...(doi ? { doi } : {}) },
    retrieval,
  });
}

async function searchCore(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, apiKey = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(CORE_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'User-Agent': 'Selenyx/0.7 (research-assistant)',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ q: term, limit: boundedLimit, offset: (boundedPage - 1) * boundedLimit }),
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`CORE network error: ${error.message}`, { source: 'core', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'core');
  const retrieval = buildAudit('core', term, requestedAt, response.status, payload);
  const records = (payload.results ?? []).map((w) => normalizeCoreWork(w, retrieval)).filter(Boolean);
  return {
    source: 'core', query: term,
    total: Number.isFinite(payload.totalHits) ? payload.totalHits : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

export {
  UNPAYWALL_ENDPOINT, searchUnpaywall, normalizeUnpaywallResult,
  DOAJ_ENDPOINT, searchDoaj, normalizeDoajArticle,
  CORE_ENDPOINT, searchCore, normalizeCoreWork,
};
