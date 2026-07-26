// LiteratureSearchService 已迁移到 sourceRegistry.js。
// 保留本文件的旧 API（LiteratureSearchError, searchOpenAlex, searchPubMed, normalize*, deduplicate）
// 以便 test/literature-search.test.js 继续通过。后续版本将废弃。

export {
  OPENALEX_ENDPOINT, PUBMED_ENDPOINT, LiteratureSearchError, LiteratureSearchService,
  clampLimit, normalizeDoi, reconstructOpenAlexAbstract, normalizeOpenAlexWork,
  normalizePubMedArticle, searchOpenAlex, searchPubMed, deduplicateRecords,
} from './searchCompat.js';
