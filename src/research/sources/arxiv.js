import { createHash } from 'node:crypto';
import { createSourceRecord } from '../domain.js';
import { LiteratureSearchError, clampLimit, normalizeDoi, readJsonOrThrow, buildAudit } from '../searchBase.js';

const ARXIV_ENDPOINT = 'https://export.arxiv.org/api/query';

function stripTags(value) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function parseAtomEntries(xml, retrieval) {
  if (typeof xml !== 'string') return [];
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRe.exec(xml)) !== null) {
    const body = match[1];
    const pick = (tag) => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? stripTags(m[1]) : null;
    };
    const title = pick('title');
    if (!title) continue;
    const idRaw = pick('id');
    const arxivId = idRaw ? idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, '').trim() : null;
    const published = pick('published');
    const yearMatch = published ? published.match(/\b(19|20)\d{2}\b/) : null;
    const authors = [];
    const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let am;
    while ((am = authorRe.exec(body)) !== null) {
      const name = stripTags(am[1]);
      if (name) authors.push(name);
    }
    const doiMatch = body.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
    const journalRef = body.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);
    entries.push(createSourceRecord({
      id: arxivId ? `arxiv:${arxivId}` : undefined,
      sourceType: 'preprint',
      reality: 'real',
      title,
      authors,
      year: yearMatch ? Number(yearMatch[0]) : null,
      venue: journalRef ? stripTags(journalRef[1]) : 'arXiv',
      abstract: pick('summary'),
      url: idRaw || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
      externalIds: {
        ...(arxivId ? { arxiv: arxivId } : {}),
        ...(doiMatch ? { doi: normalizeDoi(stripTags(doiMatch[1])) } : {}),
      },
      retrieval,
    }));
  }
  return entries;
}

async function searchArxiv(query, {
  fetchImpl = globalThis.fetch, limit = 10, page = 1, signal = undefined,
} = {}) {
  const term = String(query ?? '').trim();
  if (!term) throw new TypeError('query must be a non-empty string');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const boundedLimit = clampLimit(limit);
  const boundedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const url = new URL(ARXIV_ENDPOINT);
  url.searchParams.set('search_query', `all:${term}`);
  url.searchParams.set('start', String((boundedPage - 1) * boundedLimit));
  url.searchParams.set('max_results', String(boundedLimit));
  url.searchParams.set('sortBy', 'relevance');
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/atom+xml', 'User-Agent': 'Selenyx/0.7 (research-assistant)' },
      signal,
    });
  } catch (error) {
    throw new LiteratureSearchError(`arXiv network error: ${error.message}`, { source: 'arxiv', code: 'NETWORK_ERROR' });
  }
  const text = await response.text();
  if (!response.ok) {
    throw new LiteratureSearchError(`arXiv HTTP ${response.status}`, {
      source: 'arxiv', status: response.status, code: 'HTTP_ERROR', details: text.slice(0, 500),
    });
  }
  const retrieval = buildAudit('arxiv', term, requestedAt, response.status, text);
  const records = parseAtomEntries(text, retrieval);
  const totalMatch = text.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
  return {
    source: 'arxiv', query: term,
    total: totalMatch ? Number(totalMatch[1]) : records.length,
    page: boundedPage, records, audit: retrieval,
  };
}

export { ARXIV_ENDPOINT, searchArxiv, parseAtomEntries };
