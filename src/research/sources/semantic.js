import { createSourceRecord } from '../domain.js';
import { LiteratureSearchError, clampLimit, normalizeDoi, readJsonOrThrow, buildAudit } from '../searchBase.js';

const SEMANTIC_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/search';

function normalizeSemanticPaper(p, retrieval) {
  if (!p || typeof p !== 'object' || typeof p.title !== 'string' || !p.title.trim()) return null;
  const doi = normalizeDoi(p.externalIds?.DOI);
  return createSourceRecord({
    id: p.paperId ? `semantic:${p.paperId}` : (doi ? `semantic:${doi}` : undefined),
    sourceType: 'article',
    reality: 'real',
    title: p.title.trim(),
    authors: Array.isArray(p.authors) ? p.authors.map((a) => a?.name).filter(Boolean) : [],
    year: Number.isInteger(p.year) ? p.year : null,
    venue: p.venue ?? null,
    abstract: typeof p.abstract === 'string' ? p.abstract : null,
    url: p.url ?? (doi ? `https://doi.org/${doi}` : null),
    externalIds: {
      ...(p.paperId ? { semanticScholar: String(p.paperId) } : {}),
      ...(doi ? { doi } : {}),
      ...(p.externalIds?.PubMed ? { pmid: String(p.externalIds.PubMed) } : {}),
    },
    retrieval,
  });
}

async function searchSemanticScholar(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, apiKey = null, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = new URL(SEMANTIC_ENDPOINT);
  url.searchParams.set('query', term);
  url.searchParams.set('limit', String(boundedLimit));
  url.searchParams.set('offset', String((boundedPage - 1) * boundedLimit));
  url.searchParams.set('fields', 'title,authors,year,venue,abstract,url,externalIds,paperId');
  const requestedAt = new Date().toISOString();
  const headers = { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' };
  if (apiKey) headers['x-api-key'] = String(apiKey);
  let response;
  try {
    response = await fetchImpl(url, { headers, signal });
  } catch (error) {
    throw new LiteratureSearchError(`Semantic Scholar network error: ${error.message}`, { source: 'semantic', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'semantic');
  const retrieval = buildAudit('semantic', term, requestedAt, response.status, payload);
  const records = (payload.data ?? []).map((p) => normalizeSemanticPaper(p, retrieval)).filter(Boolean);
  return {
    source: 'semantic', query: term,
    total: Number.isFinite(payload.total) ? payload.total : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

export { SEMANTIC_ENDPOINT, searchSemanticScholar, normalizeSemanticPaper };
