// 国内学术来源注册表。
// 合规红线：这些平台多有反爬与登录墙，Selenyx 一律不抓页、不模拟登录、不绕过验证。
// 每个来源声明 4 种集成模式的能力，UI 据此渲染，绝不静默假死。
//
// 模式定义：
//  native-api        有官方开放 API，可直接程序化检索
//  search-link       仅提供拼好的检索 URL，点击跳转系统浏览器
//  embedded-browser  可尝试 iframe 内嵌（多数会因 X-Frame-Options 失败，需兜底）
//  external-browser  强制走系统浏览器（登录墙/反爬严格的平台）

const MODES = Object.freeze(['native-api', 'search-link', 'embedded-browser', 'external-browser']);

function defSource(cfg) {
  return Object.freeze({
    id: cfg.id,
    name: cfg.name,
    nameEn: cfg.nameEn ?? cfg.name,
    homeUrl: cfg.homeUrl,
    region: cfg.region ?? 'china',
    access: cfg.access ?? 'free',           // free | institutional | paid
    integration: Object.freeze({            // 各模式可用性 + 说明
      'native-api': cfg.nativeApi ?? null,  // { available, endpoint?, note }
      'search-link': cfg.searchLink ?? null, // { available, buildUrl(query), note }
      'embedded-browser': cfg.embedded ?? { available: false, note: '站点设置 X-Frame-Options，禁止内嵌' },
      'external-browser': cfg.external ?? { available: true, note: '在系统浏览器打开' },
    }),
    note: cfg.note ?? '',
  });
}

function enc(q) { return encodeURIComponent(q); }

const CHINA_SOURCES = Object.freeze([
  defSource({
    id: 'pubscholar',
    name: 'PubScholar 公益学术平台',
    nameEn: 'PubScholar',
    homeUrl: 'https://pubscholar.cn',
    access: 'free',
    nativeApi: { available: false, note: '暂无公开 API，公益平台由中科院运营' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://pubscholar.cn/s?q=${enc(q)}`,
      note: '跳转 PubScholar 检索结果页',
    },
    note: '中科院文献情报中心公益平台，免费、无登录墙，优先级最高',
  }),
  defSource({
    id: 'chinaxiv',
    name: 'ChinaXiv 预印本',
    nameEn: 'ChinaXiv',
    homeUrl: 'https://chinaxiv.org',
    access: 'free',
    nativeApi: { available: false, note: '无公开检索 API' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://chinaxiv.org/user/search.htm?searchText=${enc(q)}`,
      note: '跳转 ChinaXiv 检索',
    },
    note: '中科院运营的中文预印本平台，免费',
  }),
  defSource({
    id: 'nstl',
    name: 'NSTL 国家科技图书文献中心',
    nameEn: 'NSTL',
    homeUrl: 'https://www.nstl.gov.cn',
    access: 'free',
    nativeApi: { available: false, note: '检索接口未公开' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://www.nstl.gov.cn/search.html?t=JournalPaper&q=${enc(q)}`,
      note: '跳转 NSTL 检索',
    },
    note: '国家级科技文献保障平台，文摘免费',
  }),
  defSource({
    id: 'ncpssd',
    name: '国家哲学社会科学文献中心',
    nameEn: 'NCPSSD',
    homeUrl: 'https://www.ncpssd.cn',
    access: 'free',
    nativeApi: { available: false, note: '无公开 API' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://www.ncpssd.cn`,
      note: '检索深链已失效，回退国家哲社文献中心官网',
    },
    note: '社科领域国家级免费平台',
  }),
  defSource({
    id: 'sinomed',
    name: 'SinoMed 中国生物医学文献',
    nameEn: 'SinoMed',
    homeUrl: 'https://www.sinomed.ac.cn',
    access: 'institutional',
    nativeApi: { available: false, note: '机构订阅，无公开 API' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://www.sinomed.ac.cn`,
      note: '检索深链已失效，回退 SinoMed 官网，可能需机构权限',
    },
    note: '医学生物领域中文核心库，机构订阅',
  }),
  defSource({
    id: 'cnki',
    name: '中国知网 CNKI',
    nameEn: 'CNKI',
    homeUrl: 'https://www.cnki.net',
    access: 'paid',
    nativeApi: { available: false, note: '商业平台，无开放检索 API；严禁模拟登录' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://www.cnki.net`,
      note: '检索深链无法可靠核验，回退知网官网，需机构或个人账号',
    },
    note: '商业平台，登录墙严格，仅提供检索跳转',
  }),
  defSource({
    id: 'wanfang',
    name: '万方数据',
    nameEn: 'Wanfang',
    homeUrl: 'https://www.wanfangdata.com.cn',
    access: 'paid',
    nativeApi: { available: false, note: '商业平台，无公开 API' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://s.wanfangdata.com.cn/paper?q=${enc(q)}`,
      note: '跳转万方检索，需账号',
    },
    note: '商业平台，仅检索跳转',
  }),
  defSource({
    id: 'cqvip',
    name: '维普 CQVIP',
    nameEn: 'CQVIP',
    homeUrl: 'https://qikan.cqvip.com',
    access: 'paid',
    nativeApi: { available: false, note: '商业平台，无公开 API' },
    searchLink: {
      available: true,
      buildUrl: (q) => `https://qikan.cqvip.com`,
      note: '站点拒绝自动核验，回退维普官网，需账号',
    },
    note: '商业平台，仅检索跳转',
  }),
]);

function getChinaSource(id) {
  return CHINA_SOURCES.find((s) => s.id === id) ?? null;
}

// 决定某来源在当前环境下应使用哪种集成模式。
// 规则：native-api 可用则优先；否则 search-link（跳系统浏览器）；
// embedded 仅在明确可用时建议；external 是最终兜底。
function resolveMode(source, { preferEmbedded = false } = {}) {
  const it = source.integration;
  if (it['native-api']?.available) return 'native-api';
  if (preferEmbedded && it['embedded-browser']?.available) return 'embedded-browser';
  if (it['search-link']?.available) return 'search-link';
  return 'external-browser';
}

// 为一次检索生成可执行动作描述。绝不静默失败——每种模式都带人类可读说明。
function planChinaSearch(sourceId, query, options = {}) {
  const source = getChinaSource(sourceId);
  if (!source) throw new LiteratureSearchErrorLocal(`unknown china source: ${sourceId}`);
  const mode = resolveMode(source, options);
  const link = source.integration['search-link'];
  const url = link?.available && typeof link.buildUrl === 'function' ? link.buildUrl(query) : source.homeUrl;
  return {
    sourceId: source.id,
    sourceName: source.name,
    mode,
    url,
    note: source.integration[mode]?.note ?? source.note,
    requiresAccount: source.access !== 'free',
    honesty: mode === 'embedded-browser'
      ? '该站可能禁止内嵌，若白屏请改用系统浏览器打开'
      : '将在系统浏览器中打开检索结果，Selenyx 不抓取该站页面内容',
  };
}

class LiteratureSearchErrorLocal extends Error {
  constructor(message) { super(message); this.name = 'ChinaSourceError'; }
}

export { MODES, CHINA_SOURCES, getChinaSource, resolveMode, planChinaSearch };
