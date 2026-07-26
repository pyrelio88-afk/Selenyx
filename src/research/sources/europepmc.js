import { createSourceRecord } from '../domain.js';
import { LiteratureSearchError, clampLimit, normalizeDoi, readJsonOrThrow, buildAudit } from '../searchBase.js';

const EUROPEPMC_ENDPOINT = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

function normalizeEuropePmcResult(r, retrieval) {
  if (!r || typeof r !== 'object' || typeof r.title !== 'string' || !r.title.trim()) return null;
  const doi = normalizeDoi(r.doi);
  const pmid = r.pmid ? String(r.pmid) : null;
  const yearMatch = String(r.pubYear ?? r.firstPublicationDate ?? '').match(/\b(19|20)\d{2}\b/);
  const authors = typeof r.authorString === 'string'
    ? r.authorString.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return createSourceRecord({
    id: pmid ? `europepmc:${pmid}` : (doi ? `europepmc:${doi}` : undefined),
    sourceType: r.source === 'PPR' ? 'preprint' : 'article',
    reality: 'real',
    title: r.title.trim(),
    authors,
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: r.journalTitle ?? r.journalAbbreviation ?? null,
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (doi ? `https://doi.org/${doi}` : null),
    externalIds: {
      ...(pmid ? { pmid } : {}),
      ...(doi ? { doi } : {}),
      ...(r.pmcid ? { pmcid: String(r.pmcid) } : {}),
    },
    retrieval,
  });
}

async function searchEuropePmc(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = new URL(EUROPEPMC_ENDPOINT);
  url.searchParams.set('query', term);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(boundedLimit));
  url.searchParams.set('page', String(boundedPage));
  url.searchParams.set('resultType', 'core');
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Selenyx/0.7 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`Europe PMC network error: ${error.message}`, { source: 'europepmc', code: 'NETWORK_ERROR' });
  }
  const payload = await readJsonOrThrow(response, 'europepmc');
  const retrieval = buildAudit('europepmc', term, requestedAt, response.status, payload);
  const list = payload.resultList?.result ?? [];
  const records = list.map((r) => normalizeEuropePmcResult(r, retrieval)).filter(Boolean);
  return {
    source: 'europepmc', query: term,
    total: Number.isFinite(payload.hitCount) ? payload.hitCount : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

export { EUROPEPMC_ENDPOINT, searchEuropePmc, normalizeEuropePmcResult };
