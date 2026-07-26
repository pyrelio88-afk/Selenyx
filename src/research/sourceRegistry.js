// 来源管理器：统一登记所有检索来源（国际原生 API + 国内合规入口）。
// UI 与检索服务都从这里取 metadata，单一事实源。
import { searchArxiv } from './sources/arxiv.js';
import { searchCrossref } from './sources/crossref.js';
import { searchEuropePmc } from './sources/europepmc.js';
import { searchSemanticScholar } from './sources/semantic.js';
import { searchUnpaywall, searchDoaj, searchCore } from './sources/openaccess.js';
import { CHINA_SOURCES, getChinaSource, planChinaSearch } from './sources/china.js';

// 国际原生 API 来源登记。每个 = { id, name, search(query, opts), free, region }
const API_SOURCES = Object.freeze({
  arxiv: { id: 'arxiv', name: 'arXiv', region: 'intl', free: true, search: searchArxiv, note: '预印本，物理/数学/CS/生医' },
  crossref: { id: 'crossref', name: 'Crossref', region: 'intl', free: true, search: searchCrossref, note: 'DOI 元数据，覆盖极广' },
  europepmc: { id: 'europepmc', name: 'Europe PMC', region: 'intl', free: true, search: searchEuropePmc, note: '生医全文+预印本' },
  semantic: { id: 'semantic', name: 'Semantic Scholar', region: 'intl', free: true, search: searchSemanticScholar, note: 'AI 驱动，含摘要与引用' },
  unpaywall: { id: 'unpaywall', name: 'Unpaywall', region: 'intl', free: true, search: searchUnpaywall, note: '开放获取全文定位' },
  doaj: { id: 'doaj', name: 'DOAJ', region: 'intl', free: true, search: searchDoaj, note: '开放获取期刊目录' },
  core: { id: 'core', name: 'CORE', region: 'intl', free: true, search: searchCore, note: '全球开放获取聚合' },
});

const ALL_SOURCE_IDS = Object.freeze([...Object.keys(API_SOURCES), ...CHINA_SOURCES.map((s) => s.id)]);

function listApiSources() {
  return Object.values(API_SOURCES).map(({ id, name, region, free, note }) => ({ id, name, region, free, note, kind: 'native-api' }));
}

function listChinaSources() {
  return CHINA_SOURCES.map((s) => ({
    id: s.id, name: s.name, nameEn: s.nameEn, region: 'china', free: s.access === 'free',
    access: s.access, kind: 'link', note: s.note,
  }));
}

function listAllSources() {
  return [...listApiSources(), ...listChinaSources()];
}

function getSourceMeta(id) {
  if (API_SOURCES[id]) return { ...API_SOURCES[id], kind: 'native-api' };
  const china = getChinaSource(id);
  if (china) return { id: china.id, name: china.name, region: 'china', kind: 'link', access: china.access, note: china.note };
  return null;
}

// 对原生 API 来源执行检索；对国内来源返回「跳转动作」而非抓取。
// 返回统一信封，UI 按 kind 分支渲染。
async function searchSource(id, query, opts = {}) {
  if (API_SOURCES[id]) {
    const result = await API_SOURCES[id].search(query, opts);
    return { kind: 'native-api', sourceId: id, ...result };
  }
  const china = getChinaSource(id);
  if (china) {
    return { kind: 'link', ...planChinaSearch(id, query, opts) };
  }
  throw new Error(`unknown source: ${id}`);
}

export {
  API_SOURCES, ALL_SOURCE_IDS,
  listApiSources, listChinaSources, listAllSources, getSourceMeta, searchSource,
};
