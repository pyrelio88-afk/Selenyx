import { api, state, $, el, clear, icon, toast, workspaceEvent } from './core.js';

const builtInSites = [
  { id: 'pubscholar', name: 'PubScholar', url: 'https://pubscholar.cn', region: 'china', note: '中科院公益学术平台' },
  { id: 'chinaxiv', name: 'ChinaXiv', url: 'https://chinaxiv.org', region: 'china', note: '中文预印本' },
  { id: 'nstl', name: 'NSTL', url: 'https://www.nstl.gov.cn', region: 'china', note: '国家科技文献中心' },
  { id: 'ncpssd', name: '国家哲社文献中心', url: 'https://www.ncpssd.cn', region: 'china', note: '哲学社会科学' },
  { id: 'sinomed', name: 'SinoMed', url: 'https://www.sinomed.ac.cn', region: 'china', note: '生物医学文献' },
  { id: 'google-scholar', name: 'Google Scholar', url: 'https://scholar.google.com', region: 'intl', note: '免费检索 · 可能受地区网络或验证码限制' },
  { id: 'arxiv', name: 'arXiv', url: 'https://arxiv.org', region: 'intl', note: '开放预印本' },
  { id: 'openalex', name: 'OpenAlex', url: 'https://openalex.org', region: 'intl', note: '开放学术图谱' },
  { id: 'pubmed', name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', region: 'intl', note: '生物医学文献' },
  { id: 'crossref', name: 'Crossref', url: 'https://search.crossref.org', region: 'intl', note: 'DOI 元数据' },
];

function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('请输入站点网址');
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('只支持 http/https 站点');
  return url.href;
}

function resolveInput(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('请输入网址或检索词');
  if (/^(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:[/:?#]|$)/i.test(text)) return safeUrl(text);
  return `https://pubscholar.cn/s?q=${encodeURIComponent(text)}`;
}

function customSites() { return state.workspace?.ui?.browserSites ?? []; }
function favorites() { return new Set(state.workspace?.ui?.browserFavorites ?? []); }

function allSites() {
  const sites = [...builtInSites, ...customSites()];
  const favoriteIds = favorites();
  const recentIds = state.workspace?.ui?.browserRecent ?? [];
  return [...sites.filter((site) => favoriteIds.has(site.id)), ...recentIds.map((id) => sites.find((site) => site.id === id)).filter(Boolean), ...sites]
    .filter((site, index, list) => list.findIndex((item) => item.id === site.id) === index)
    .map((site) => ({ ...site, favorite: favoriteIds.has(site.id) }));
}

async function patchBrowserUi(patch) {
  await workspaceEvent({ type: 'ui:patch', patch });
  renderSites();
}

async function toggleFavorite(site) {
  const ids = favorites();
  if (ids.has(site.id)) ids.delete(site.id); else ids.add(site.id);
  await patchBrowserUi({ browserFavorites: [...ids] });
}

async function removeCustomSite(site) {
  if (!site.id.startsWith('custom:')) return;
  await patchBrowserUi({
    browserSites: customSites().filter((item) => item.id !== site.id),
    browserFavorites: [...favorites()].filter((id) => id !== site.id),
    browserRecent: (state.workspace.ui.browserRecent ?? []).filter((id) => id !== site.id),
  });
  toast(`已删除 ${site.name}`);
}

function siteCard(site) {
  const main = el('button', { className: 'site-card-main', onClick: () => openSite(site) }, [
    el('span', { className: 'site-mark', text: site.name.slice(0, 2).toUpperCase() }),
    el('span', {}, [el('b', { text: site.name }), el('small', { text: site.note })]),
  ]);
  const actions = el('div', { className: 'site-card-actions' }, [
    el('button', { type: 'button', title: site.favorite ? '取消收藏' : '收藏', text: site.favorite ? '★' : '☆', onClick: () => toggleFavorite(site) }),
  ]);
  if (site.id.startsWith('custom:')) actions.append(el('button', {
    type: 'button', title: '删除站点', text: '删除', onClick: () => removeCustomSite(site),
  }));
  return el('article', { className: 'site-card' }, [main, actions]);
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

function browserBounds() {
  const rect = $('#browser-host').getBoundingClientRect();
  return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
}

async function openSite(site) {
  let url;
  try { url = safeUrl(site.url); } catch (error) { toast(error.message, 'error'); return; }
  state.browserUrl = url;
  $('#browser-url').value = url;
  $('#browser-homepage').hidden = true;
  $('#browser-host').hidden = false;
  const recent = [site.id, ...(state.workspace.ui.browserRecent ?? []).filter((id) => id !== site.id)].slice(0, 8);
  workspaceEvent({ type: 'ui:patch', patch: { browserRecent: recent } }).catch(() => {});
  renderStatus({ state: 'loading', url });
  const response = await api.browser.show({ url, bounds: browserBounds() });
  if (!response.ok) renderStatus({ state: 'blocked', url, message: response.error?.message ?? '站点无法加载' });
}

function renderStatus(status) {
  const host = $('#browser-status');
  if (status.state === 'needs-bounds') {
    if (!$('#browser-host').hidden) api.browser.setBounds(browserBounds());
    return;
  }
  clear(host);
  if (status.state === 'ready') { host.hidden = true; return; }
  host.hidden = false;
  const blocked = status.state === 'blocked';
  if (blocked) api.browser.hide().catch(() => {});
  host.append(
    icon(blocked ? 'globe' : 'search'),
    el('h3', { text: blocked ? '该站点暂时无法在应用内加载' : '正在载入站点…' }),
    el('p', { text: blocked
      ? `${status.message || '可能受登录、验证码、证书或网络策略限制。'} 可直接改用系统浏览器，不会停在白屏。`
      : status.url || '' }),
  );
  if (blocked) host.append(el('div', { className: 'fallback-actions' }, [
    el('button', { className: 'primary-button', text: '系统浏览器打开', onClick: () => api.browser.openExternal(status.url || state.browserUrl) }),
    el('button', { className: 'secondary-button', text: '重试', onClick: () => openSite({ id: `retry:${Date.now()}`, name: '重试', url: status.url || state.browserUrl }) }),
    el('button', { className: 'secondary-button', text: '复制链接', onClick: async () => { await navigator.clipboard.writeText(status.url || state.browserUrl); toast('链接已复制'); } }),
    el('button', { className: 'secondary-button', text: '返回首页', onClick: showHome }),
  ]));
}

async function showHome() {
  await api.browser.hide();
  $('#browser-host').hidden = true;
  $('#browser-homepage').hidden = false;
  renderSites();
}

function ensureSiteDialog() {
  if ($('#site-modal')) return;
  const backdrop = el('div', { id: 'site-modal', className: 'modal-backdrop', hidden: true });
  const form = el('form', { id: 'site-form', className: 'modal-card' }, [
    el('header', {}, [el('div', {}, [el('p', { className: 'kicker', text: 'CUSTOM SITE' }), el('h2', { text: '添加科研站点' })]), el('button', { type: 'button', className: 'icon-button', text: '×', 'aria-label': '关闭', onClick: () => { backdrop.hidden = true; } })]),
    el('label', {}, ['站点名称', el('input', { name: 'name', required: true, maxlength: '80', placeholder: '例如：我的机构图书馆' })]),
    el('label', {}, ['站点网址', el('input', { name: 'url', required: true, inputmode: 'url', placeholder: 'https://example.edu' })]),
    el('footer', {}, [el('button', { type: 'button', className: 'secondary-button', text: '取消', onClick: () => { backdrop.hidden = true; } }), el('button', { className: 'primary-button', text: '保存站点' })]),
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const name = String(data.get('name') ?? '').trim();
      if (!name) throw new Error('请输入站点名称');
      const url = safeUrl(data.get('url'));
      const sites = [...customSites(), { id: `custom:${crypto.randomUUID()}`, name, url, region: 'custom', note: new URL(url).hostname }];
      await patchBrowserUi({ browserSites: sites });
      form.reset();
      backdrop.hidden = true;
      toast('站点已保存，重启后仍会保留');
    } catch (error) { toast(error.message, 'error'); }
  });
  backdrop.append(form);
  document.body.append(backdrop);
}

function setupBrowser() {
  ensureSiteDialog();
  renderSites();
  $('#browser-home').addEventListener('click', showHome);
  $('#browser-go').addEventListener('click', () => {
    try {
      const url = resolveInput($('#browser-url').value);
      openSite({ id: `recent:${Date.now()}`, name: '当前地址', url, region: 'custom', note: '最近访问' });
    } catch (error) { toast(error.message, 'error'); }
  });
  $('#browser-url').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#browser-go').click(); });
  $('#browser-add-site').addEventListener('click', () => { $('#site-modal').hidden = false; $('#site-form [name="name"]').focus(); });
  api.browser.onStatus(renderStatus);
  window.addEventListener('resize', () => { if (!$('#browser-host').hidden) api.browser.setBounds(browserBounds()); });
}

export { setupBrowser, renderSites, showHome, safeUrl, resolveInput };
