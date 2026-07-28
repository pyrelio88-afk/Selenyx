// Single source of truth for native APIs and compliant Chinese search links.
import { searchArxiv } from './sources/arxiv.js';
import { searchCrossref } from './sources/crossref.js';
import { searchEuropePmc } from './sources/europepmc.js';
import { searchSemanticScholar } from './sources/semantic.js';
import { searchUnpaywall, searchDoaj, searchCore } from './sources/openaccess.js';
import { CHINA_SOURCES, getChinaSource, planChinaSearch } from './sources/china.js';

// searchCompat imports this registry. Lazy imports avoid an initialisation cycle.
const searchOpenAlex = async (...args) => (await import('./searchCompat.js')).searchOpenAlex(...args);
const searchPubMed = async (...args) => (await import('./searchCompat.js')).searchPubMed(...args);

function apiSource({ id, name, search, note, homeUrl, access = 'free', capabilities = ['search', 'metadata'] }) {
  return Object.freeze({
    id, name, region: 'intl', kind: 'native-api', access, free: access === 'free',
    capabilities: Object.freeze(capabilities), homeUrl, searchUrlTemplate: null, search, note,
  });
}

const API_SOURCES = Object.freeze({
  openalex: apiSource({ id: 'openalex', name: 'OpenAlex', search: searchOpenAlex, homeUrl: 'https://openalex.org', note: '开放学术图谱，跨学科聚合' }),
  pubmed: apiSource({ id: 'pubmed', name: 'PubMed', search: searchPubMed, homeUrl: 'https://pubmed.ncbi.nlm.nih.gov', note: '生物医学与生命科学' }),
  crossref: apiSource({ id: 'crossref', name: 'Crossref', search: searchCrossref, homeUrl: 'https://search.crossref.org', note: 'DOI 元数据，覆盖广泛' }),
  arxiv: apiSource({ id: 'arxiv', name: 'arXiv', search: searchArxiv, homeUrl: 'https://arxiv.org', note: '预印本，物理、数学、计算机与生医' }),
  europepmc: apiSource({ id: 'europepmc', name: 'Europe PMC', search: searchEuropePmc, homeUrl: 'https://europepmc.org', note: '生医全文与预印本' }),
  semantic: apiSource({ id: 'semantic', name: 'Semantic Scholar', search: searchSemanticScholar, homeUrl: 'https://www.semanticscholar.org', note: '论文元数据、摘要与引用' }),
  unpaywall: apiSource({ id: 'unpaywall', name: 'Unpaywall', search: searchUnpaywall, homeUrl: 'https://unpaywall.org', note: '开放获取全文定位' }),
  doaj: apiSource({ id: 'doaj', name: 'DOAJ', search: searchDoaj, homeUrl: 'https://doaj.org', note: '开放获取期刊目录' }),
  core: apiSource({ id: 'core', name: 'CORE', search: searchCore, homeUrl: 'https://core.ac.uk', note: '全球开放获取聚合', access: 'key', capabilities: ['search', 'metadata', 'requires-key'] }),
});

const ALL_SOURCE_IDS = Object.freeze([...Object.keys(API_SOURCES), ...CHINA_SOURCES.map((source) => source.id)]);

function listApiSources() {
  return Object.values(API_SOURCES).map(({ search: _search, ...source }) => source);
}

function listChinaSources() {
  return CHINA_SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    nameEn: source.nameEn,
    region: 'china',
    free: source.access === 'free',
    access: source.access,
    kind: 'link',
    capabilities: ['search-link', 'external-browser'],
    homeUrl: source.homeUrl,
    searchUrlTemplate: source.integration['search-link']?.template ?? null,
    note: source.note,
  }));
}

function listAllSources() {
  return [...listChinaSources(), ...listApiSources()];
}

function getSourceMeta(id) {
  if (API_SOURCES[id]) {
    const { search: _search, ...source } = API_SOURCES[id];
    return source;
  }
  return listChinaSources().find((source) => source.id === id) ?? null;
}

async function searchSource(id, query, options = {}) {
  if (API_SOURCES[id]) {
    const result = await API_SOURCES[id].search(query, options);
    return { kind: 'native-api', sourceId: id, ...result };
  }
  if (getChinaSource(id)) return { kind: 'link', ...planChinaSearch(id, query, options) };
  throw new Error(`unknown source: ${id}`);
}

export {
  API_SOURCES, ALL_SOURCE_IDS,
  listApiSources, listChinaSources, listAllSources, getSourceMeta, searchSource,
};
