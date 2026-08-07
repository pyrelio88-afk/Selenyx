import type { Reference } from '@apptypes/reference';
import type { ZoteroReferenceCandidate } from '@services/api';
import { normalizeDoi, safeExternalUrl } from './referenceIntegrity';

const ITEM_TYPES: ReadonlySet<Reference['type']> = new Set([
  'journalArticle', 'book', 'bookSection', 'conferencePaper', 'thesis', 'report', 'webpage', 'preprint',
  'dataset', 'software', 'patent', 'standard', 'magazineArticle', 'newspaperArticle', 'bookReview',
  'dictionaryEntry', 'encyclopediaArticle', 'chapter', 'presentation', 'hearing', 'bill', 'statute', 'case',
  'film', 'tvBroadcast', 'radioBroadcast', 'podcast', 'interview', 'letter', 'map', 'blogPost',
]);
const CREATOR_TYPES: ReadonlySet<Reference['creators'][number]['type']> = new Set([
  'author', 'editor', 'translator', 'contributor', 'director', 'producer',
]);

/** Convert a read-only Zotero Local API candidate into Selenyx's durable UI model. */
export function referenceFromZotero(candidate: ZoteroReferenceCandidate): Reference {
  const timestamp = new Date().toISOString();
  const doi = normalizeDoi(candidate.doi);
  const safeUrl = safeExternalUrl(candidate.url) ?? (doi ? `https://doi.org/${encodeURIComponent(doi)}` : '');
  const title = candidate.title.trim() || '[Untitled Zotero item]';
  const type = ITEM_TYPES.has(candidate.type as Reference['type'])
    ? candidate.type as Reference['type']
    : 'journalArticle';
  const creators = candidate.creators.map((creator, index) => ({
    id: `zotero_${candidate.key || 'item'}_creator_${index}`,
    firstName: creator.firstName,
    lastName: creator.lastName,
    type: CREATOR_TYPES.has(creator.type as Reference['creators'][number]['type'])
      ? creator.type as Reference['creators'][number]['type']
      : 'author',
    order: index,
  }));
  const identifier = doi || candidate.key || title;

  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    citeKey: identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'zotero',
    type,
    title,
    shortTitle: '',
    abstract: candidate.abstract,
    creators,
    publication: candidate.publication,
    volume: candidate.volume,
    issue: candidate.issue,
    pages: candidate.pages,
    publisher: candidate.publisher,
    place: candidate.place,
    year: candidate.year,
    date: candidate.date,
    accessionDate: '',
    doi,
    isbn: candidate.isbn,
    issn: candidate.issn,
    pmid: '',
    pmcid: '',
    arxivId: '',
    url: safeUrl,
    uri: candidate.key ? `zotero://select/library/items/${candidate.key}` : '',
    collections: candidate.collections,
    tags: candidate.tags,
    language: candidate.language,
    rights: candidate.rights,
    attachments: [],
    annotations: [],
    notes: '',
    impactFactor: null,
    jcrQuartile: null,
    openAccess: false,
    pageCharge: null,
    reviewWeeks: null,
    pipelineStage: null,
    readStatus: 'unread',
    importance: 3,
    source: 'import',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
