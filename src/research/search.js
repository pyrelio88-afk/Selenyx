import { createHash } from 'node:crypto';
import { createSourceRecord } from './domain.js';

const OPENALEX_ENDPOINT = 'https://api.openalex.org/works';
const PUBMED_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

class LiteratureSearchError extends Error {
  constructor(message, { source, status = null, code = 'SEARCH_FAILED', details = null } = {}) {
    super(message);
    this.name = 'LiteratureSearchError';
    this.source = source;
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name, message: this.message, source: this.source,
      status: this.status, code: this.code, details: this.details,
    };
  }
}

function clampLimit(value, fallback = 10, max = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(number)));
}

function responseHash(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

async function readJson(response, source) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new LiteratureSearchError(`${source} returned invalid JSON`, {
      source, status: response.status, code: 'INVALID_RESPONSE',
    });
  }
  if (!response.ok) {
    throw new LiteratureSearchError(`${source} HTTP ${response.status}`, {
      source,
      status: response.status,
      code: 'HTTP_ERROR',
      details: JSON.stringify(payload).slice(0, 1_000),
    });
  }
  return payload;
}

function reconstructOpenAlexAbstract(index) {
  if (!index || typeof index !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0) words[position] = word;
    }
  }
  return words.filter(Boolean).join(' ') || null;
}

function normalizeDoi(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
}

function normalizeOpenAlexWork(work, retrieval) {
  if (!work || typeof work !== 'object' || typeof work.title !== 'string' || !work.title.trim()) return null;
  const openAlexId = typeof work.id === 'string' ? work.id.replace('https://openalex.org/', '') : null;
  const doi = normalizeDoi(work.doi);
  return createSourceRecord({
    id: openAlexId ? `openalex:${openAlexId}` : undefined,
    sourceType: work.type === 'preprint' ? 'preprint' : 'article',
    reality: 'real',
    title: work.title,
    authors: Array.isArray(work.authorships)
      ? work.authorships.map((item) => item?.author?.display_name).filter(Boolean)
      : [],
    year: Number.isInteger(work.publication_year) ? work.publication_year : null,
    venue: work.primary_location?.source?.display_name ?? null,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
    url: work.doi ?? work.primary_location?.landing_page_url ?? work.id ?? null,
    externalIds: {
      ...(openAlexId ? { openAlex: openAlexId } : {}),
      ...(doi ? { doi } : {}),
    },
    isRetracted: Boolean(work.is_retracted),
    retrieval,
  });
}

async function searchOpenAlex(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, mailto = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set('search', term);
  url.searchParams.set('per-page', String(clampLimit(limit)));
  url.searchParams.set('page', String(Math.max(1, Math.trunc(Number(page) || 1))));
  if (mailto) url.searchParams.set('mailto', String(mailto));
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.6 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`OpenAlex network error: ${error.message}`, {
      source: 'openalex', code: 'NETWORK_ERROR',
    });
  }
  const payload = await readJson(response, 'openalex');
  const retrieval = {
    provider: 'openalex',
    query: term,
    requestedAt,
    httpStatus: response.status,
    responseHash: responseHash(payload),
  };
  const records = Array.isArray(payload.results)
    ? payload.results.map((work) => normalizeOpenAlexWork(work, retrieval)).filter(Boolean)
    : [];
  return {
    source: 'openalex',
    query: term,
    total: Number.isFinite(payload.meta?.count) ? payload.meta.count : records.length,
    page: Math.max(1, Math.trunc(Number(page) || 1)),
    records,
    audit: retrieval,
  };
}

function normalizePubMedArticle(id, article, retrieval) {
  if (!article || typeof article !== 'object' || typeof article.title !== 'string' || !article.title.trim()) return null;
  const publicationDate = article.pubdate || article.epubdate || '';
  const yearMatch = String(publicationDate).match(/\b(19|20)\d{2}\b/);
  const articleIds = Array.isArray(article.articleids) ? article.articleids : [];
  const doiItem = articleIds.find((item) => String(item?.idtype).toLowerCase() === 'doi');
  return createSourceRecord({
    id: `pubmed:${id}`,
    sourceType: 'article',
    reality: 'real',
    title: article.title,
    authors: Array.isArray(article.authors) ? article.authors.map((item) => item?.name).filter(Boolean) : [],
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: article.fulljournalname ?? article.source ?? null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/`,
    externalIds: {
      pmid: String(id),
      ...(doiItem?.value ? { doi: normalizeDoi(doiItem.value) } : {}),
    },
    retrieval,
  });
}

async function searchPubMed(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, apiKey = null, email = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const searchUrl = new URL(`${PUBMED_ENDPOINT}/esearch.fcgi`);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(boundedLimit));
  searchUrl.searchParams.set('retstart', String((boundedPage - 1) * boundedLimit));
  searchUrl.searchParams.set('term', term);
  if (apiKey) searchUrl.searchParams.set('api_key', String(apiKey));
  if (email) searchUrl.searchParams.set('email', String(email));
  const requestedAt = new Date().toISOString();
  let searchResponse;
  try {
    searchResponse = await fetchImpl(searchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.6 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`PubMed network error: ${error.message}`, {
      source: 'pubmed', code: 'NETWORK_ERROR',
    });
  }
  const searchPayload = await readJson(searchResponse, 'pubmed');
  const ids = Array.isArray(searchPayload.esearchresult?.idlist) ? searchPayload.esearchresult.idlist : [];
  const total = Number(searchPayload.esearchresult?.count ?? 0);
  const baseAudit = {
    provider: 'pubmed',
    query: term,
    requestedAt,
    httpStatus: searchResponse.status,
    responseHash: responseHash(searchPayload),
  };
  if (ids.length === 0) {
    return { source: 'pubmed', query: term, total, page: boundedPage, records: [], audit: baseAudit };
  }
  const summaryUrl = new URL(`${PUBMED_ENDPOINT}/esummary.fcgi`);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('retmode', 'json');
  summaryUrl.searchParams.set('id', ids.join(','));
  if (apiKey) summaryUrl.searchParams.set('api_key', String(apiKey));
  if (email) summaryUrl.searchParams.set('email', String(email));
  let summaryResponse;
  try {
    summaryResponse = await fetchImpl(summaryUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.6 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`PubMed summary network error: ${error.message}`, {
      source: 'pubmed', code: 'NETWORK_ERROR',
    });
  }
  const summaryPayload = await readJson(summaryResponse, 'pubmed');
  const retrieval = {
    ...baseAudit,
    httpStatus: summaryResponse.status,
    responseHash: responseHash({ search: searchPayload, summary: summaryPayload }),
  };
  const records = ids
    .map((id) => normalizePubMedArticle(id, summaryPayload.result?.[id], retrieval))
    .filter(Boolean);
  return { source: 'pubmed', query: term, total, page: boundedPage, records, audit: retrieval };
}

function deduplicateRecords(records) {
  const seen = new Set();
  const output = [];
  for (const record of records) {
    const doi = record.externalIds?.doi;
    const titleKey = record.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const key = doi ? `doi:${doi}` : `title:${titleKey}:${record.year ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }
  return output;
}

class LiteratureSearchService {
  constructor({ fetchImpl = globalThis.fetch, openAlex = {}, pubMed = {} } = {}) {
    this.fetchImpl = fetchImpl;
    this.openAlexOptions = openAlex;
    this.pubMedOptions = pubMed;
  }

  async search(query, { sources = ['openalex', 'pubmed'], limit = 10, page = 1, signal } = {}) {
    const requested = [...new Set(sources)];
    const tasks = requested.map(async (source) => {
      if (source === 'openalex') {
        return searchOpenAlex(query, { ...this.openAlexOptions, fetchImpl: this.fetchImpl, limit, page, signal });
      }
      if (source === 'pubmed') {
        return searchPubMed(query, { ...this.pubMedOptions, fetchImpl: this.fetchImpl, limit, page, signal });
      }
      throw new LiteratureSearchError(`unsupported literature source: ${source}`, {
        source, code: 'UNSUPPORTED_SOURCE',
      });
    });
    const settled = await Promise.allSettled(tasks);
    const results = [];
    const errors = [];
    settled.forEach((entry, index) => {
      if (entry.status === 'fulfilled') results.push(entry.value);
      else {
        const error = entry.reason instanceof LiteratureSearchError
          ? entry.reason
          : new LiteratureSearchError(String(entry.reason), { source: requested[index] });
        errors.push(error.toJSON());
      }
    });
    const records = deduplicateRecords(results.flatMap((result) => result.records));
    return {
      query: String(query ?? '').trim(),
      sources: requested,
      total: records.length,
      records,
      sourceResults: results.map((result) => ({
        source: result.source,
        total: result.total,
        returned: result.records.length,
        page: result.page,
        audit: result.audit,
      })),
      errors,
      isPartial: errors.length > 0 && results.length > 0,
      isFailure: results.length === 0 && errors.length > 0,
    };
  }
}

export {
  OPENALEX_ENDPOINT, PUBMED_ENDPOINT, LiteratureSearchError, LiteratureSearchService,
  clampLimit, normalizeDoi, reconstructOpenAlexAbstract, normalizeOpenAlexWork,
  normalizePubMedArticle, searchOpenAlex, searchPubMed, deduplicateRecords,
};
