import { api, state, $, el, clear, icon, toast, workspaceEvent } from './core.js';

const builtInSites = [
  { id: 'pubscholar', name: 'PubScholar', url: 'https://pubscholar.cn', region: 'china', note: '中科院公益学术平台' },
  { id: 'chinaxiv', name: 'ChinaXiv', url: 'https://chinaxiv.org', region: 'china', note: '中文预印本' },
  { id: 'nstl', name: 'NSTL', url: 'https://www.nstl.gov.cn', region: 'china', note: '国家科技文献中心' },
  { id: 'ncpssd', name: '国家哲社文献中心', url: 'https://www.ncpssd.org', region: 'china', note: '哲学社会科学' },
  { id: 'sinomed', name: 'SinoMed', url: 'https://www.sinomed.ac.cn', region: 'china', note: '生物医学文献' },
  { id: 'cnki', name: '中国知网', url: 'https://www.cnki.net', region: 'china', note: '登录/付费 · 禁嵌时外部打开' },
  { id: 'wanfang', name: '万方数据', url: 'https://www.wanfangdata.com.cn', region: 'china', note: '登录/付费' },
  { id: 'cqvip', name: '维普', url: 'https://qikan.cqvip.com', region: 'china', note: '登录/付费' },
  { id: 'arxiv', name: 'arXiv', url: 'https://arxiv.org', region: 'intl', note: '预印本 · 可尝试内嵌' },
  { id: 'openalex', name: 'OpenAlex', url: 'https://openalex.org', region: 'intl', note: '开放学术图谱' },
  { id: 'pubmed', name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', region: 'intl', note: '生物医学文献' },
  { id: 'crossref', name: 'Crossref', url: 'https://search.crossref.org', region: 'intl', note: 'DOI 元数据' },
];

function allSites() {
  const custom = state.workspace?.ui?.browserSites ?? [];
  const favorites = new Set(state.workspace?.ui?.browserFavorites ?? []);
  const recentIds = state.workspace?.ui?.browserRecent ?? [];
  const sites = [...builtInSites, ...custom].map((site) => ({ ...site, favorite: favorites.has(site.id) }));
  return [...sites.filter((site) => site.favorite), ...recentIds.map((id) => sites.find((site) => site.id === id)).filter(Boolean), ...sites]
    .filter((site, index, list) => list.findIndex((item) => item.id === site.id) === index);
}

function siteCard(site) {
  return el('button', { className: 'site-card', onClick: () => openSite(site) }, [
    el('span', { text: site.name.slice(0, 2).toUpperCase() }),
    el('span', {}, [el('b', { text: `${site.favorite ? '★ ' : ''}${site.name}` }), el('small', { text: site.note })]),
  ]);
}

function renderSites() {
  const host = $('#browser-sites');
  clear(host);
  const sites = allSites();
  for (const [region, title] of [['china', '国内平台'], ['intl', '国际平台'], ['custom', '自定义站点']]) {
    const matches = sites.filter((site) => site.region === region);
    if (!matches.length) continue;
    const grid = el('div', { className: 'site-grid' });
    matches.forEach((site) => grid.append(siteCard(site)));
    host.append(el('section', { className: 'site-group' }, [el('h3', { text: title }), grid]));
  }
}

function resolveInput(value) {
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `https://pubscholar.cn/s?q=${encodeURIComponent(text)}`;
}

function browserBounds() {
  const rect = $('#browser-host').getBoundingClientRect();
  return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
}

async function openSite(site) {
  state.browserUrl = site.url;
  $('#browser-url').value = site.url;
  $('#browser-homepage').hidden = true;
  $('#browser-host').hidden = false;
  const recent = [site.id, ...(state.workspace.ui.browserRecent ?? []).filter((id) => id !== site.id)].slice(0, 8);
  workspaceEvent({ type: 'ui:patch', patch: { browserRecent: recent } }).catch(() => {});
  renderStatus({ state: 'loading', url: site.url });
  const response = await api.browser.show({ url: site.url, bounds: browserBounds() });
  if (!response.ok) renderStatus({ state: 'blocked', url: site.url, message: response.error?.message ?? '站点无法内嵌' });
}

function renderStatus(status) {
  const host = $('#browser-status');
  clear(host);
  if (status.state === 'ready') {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const blocked = status.state === 'blocked';
  host.append(
    icon(blocked ? 'globe' : 'search'),
    el('h3', { text: blocked ? '该站点无法在应用内稳定显示' : '正在载入站点…' }),
    el('p', { text: blocked ? `${status.message || '可能由 X-Frame-Options、登录墙、验证码或网络超时引起。'} Selenyx 不会静默停在白屏。` : status.url || '' }),
  );
  if (blocked) host.append(el('div', { className: 'fallback-actions' }, [
    el('button', { className: 'primary-button', text: '系统浏览器打开', onClick: () => api.browser.openExternal(status.url || state.browserUrl) }),
    el('button', { className: 'secondary-button', text: '复制链接', onClick: async () => { await navigator.clipboard.writeText(status.url || state.browserUrl); toast('链接已复制'); } }),
    el('button', { className: 'secondary-button', text: '返回站点首页', onClick: showHome }),
  ]));
}

async function showHome() {
  await api.browser.hide();
  $('#browser-host').hidden = true;
  $('#browser-homepage').hidden = false;
  renderSites();
}

function setupBrowser() {
  renderSites();
  $('#browser-home').addEventListener('click', showHome);
  $('#browser-go').addEventListener('click', () => openSite({ id: `recent:${Date.now()}`, name: '当前地址', url: resolveInput($('#browser-url').value), region: 'custom', note: '最近访问' }));
  $('#browser-url').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#browser-go').click(); });
  $('#browser-add-site').addEventListener('click', async () => {
    const name = (window.prompt('站点名称') || '').trim();
    if (!name) return;
    const url = resolveInput(window.prompt('站点网址（https://）') || '');
    const sites = [...(state.workspace.ui.browserSites ?? []), { id: `custom:${crypto.randomUUID()}`, name, url, region: 'custom', note: '自定义站点' }];
    await workspaceEvent({ type: 'ui:patch', patch: { browserSites: sites } });
    renderSites();
  });
  api.browser.onStatus(renderStatus);
  window.addEventListener('resize', () => { if (!$('#browser-host').hidden) api.browser.setBounds(browserBounds()); });
}

export { setupBrowser, renderSites, showHome };
