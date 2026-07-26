// 兼容层：保留 R0.6 旧导出符号 (LiteratureSearchError, searchOpenAlex, searchPubMed, normalize*, LiteratureSearchService, deduplicateRecords)
// 让 test/literature-search.test.js 不需要重写。
// 新代码请走 src/research/sourceRegistry.js + sources/*.js。

import { createSourceRecord } from './domain.js';
import {
  LiteratureSearchError, clampLimit, normalizeDoi, responseHash,
  readJsonOrThrow, buildAudit,
} from './searchBase.js';
import { searchSource, API_SOURCES } from './sourceRegistry.js';
import { searchArxiv } from './sources/arxiv.js';
import { searchCrossref } from './sources/crossref.js';
import { searchEuropePmc } from './sources/europepmc.js';
import { searchSemanticScholar } from './sources/semantic.js';
import { searchUnpaywall, searchDoaj, searchCore } from './sources/openaccess.js';

const OPENALEX_ENDPOINT = 'https://api.openalex.org/works';
const PUBMED_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

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

async function searchOpenAlex(query, opts = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set('search', term);
  url.searchParams.set('per-page', String(clampLimit(opts.limit)));
  url.searchParams.set('page', String(Math.max(1, Math.trunc(Number(opts.page) || 1))));
  if (opts.mailto) url.searchParams.set('mailto', String(opts.mailto));
  const requestedAt = new Date().toISOString();
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' },
      signal: opts.signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`OpenAlex network error: ${error.message}`, { source: 'openalex', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'openalex');
  const retrieval = buildAudit('openalex', term, requestedAt, response.status, payload);
  const records = (payload.results ?? []).map((w) => normalizeOpenAlexWork(w, retrieval)).filter(Boolean);
  return {
    source: 'openalex', query: term,
    total: Number.isFinite(payload.meta?.count) ? payload.meta.count : records.length,
    page: Math.max(1, Math.trunc(Number(opts.page) || 1)),
    records, audit: retrieval,
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
    externalIds: { pmid: String(id), ...(doiItem?.value ? { doi: normalizeDoi(doiItem.value) } : {}) },
    retrieval,
  });
}

async function searchPubMed(query, opts = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  const boundedLimit = clampLimit(opts.limit);
  const boundedPage = Math.max(1, Math.trunc(Number(opts.page) || 1));
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const searchUrl = new URL(`${PUBMED_ENDPOINT}/esearch.fcgi`);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(boundedLimit));
  searchUrl.searchParams.set('retstart', String((boundedPage - 1) * boundedLimit));
  searchUrl.searchParams.set('term', term);
  if (opts.apiKey) searchUrl.searchParams.set('api_key', String(opts.apiKey));
  if (opts.email) searchUrl.searchParams.set('email', String(opts.email));
  const requestedAt = new Date().toISOString();
  let searchResponse;
  try {
    searchResponse = await fetchImpl(searchUrl, { headers: { Accept: 'application/json' }, signal: opts.signal });
  } catch (error) {
    throw new LiteratureSearchError(`PubMed network error: ${error.message}`, { source: 'pubmed', code: 'NETWORK_ERROR' });
  }
  const searchPayload = await readJsonOrThrow(searchResponse, 'pubmed');
  const ids = searchPayload.esearchresult?.idlist ?? [];
  const total = Number(searchPayload.esearchresult?.count ?? 0);
  const baseAudit = buildAudit('pubmed', term, requestedAt, searchResponse.status, searchPayload);
  if (ids.length === 0) {
    return { source: 'pubmed', query: term, total, page: boundedPage, records: [], audit: baseAudit };
  }
  const summaryUrl = new URL(`${PUBMED_ENDPOINT}/esummary.fcgi`);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('retmode', 'json');
  summaryUrl.searchParams.set('id', ids.join(','));
  if (opts.apiKey) summaryUrl.searchParams.set('api_key', String(opts.apiKey));
  if (opts.email) summaryUrl.searchParams.set('email', String(opts.email));
  const summaryResponse = await fetchImpl(summaryUrl, { headers: { Accept: 'application/json' }, signal: opts.signal });
  const summaryPayload = await readJsonOrThrow(summaryResponse, 'pubmed');
  const retrieval = { ...baseAudit, httpStatus: summaryResponse.status, responseHash: responseHash({ search: searchPayload, summary: summaryPayload }) };
  const records = ids.map((id) => normalizePubMedArticle(id, summaryPayload.result?.[id], retrieval)).filter(Boolean);
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
      throw new LiteratureSearchError(`unsupported literature source: ${source}`, { source, code: 'UNSUPPORTED_SOURCE' });
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
    const records = deduplicateRecords(results.flatMap((r) => r.records));
    return {
      query: String(query ?? '').trim(),
      sources: requested,
      total: records.length,
      records,
      sourceResults: results.map((r) => ({ source: r.source, total: r.total, returned: r.records.length, page: r.page, audit: r.audit })),
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
  searchArxiv, searchCrossref, searchEuropePmc, searchSemanticScholar,
  searchUnpaywall, searchDoaj, searchCore, searchSource, API_SOURCES,
};
