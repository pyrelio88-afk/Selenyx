import { api, state, $, el, clear, icon, toast, workspaceEvent, setView } from './core.js';

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

let boundsFrame = 0;
let boundsFallbackTimer = 0;
let forceNextBoundsSync = false;
let lastBoundsKey = '';

function browserBounds() {
  const rect = $('#browser-host').getBoundingClientRect();
  return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
}

async function flushBrowserBounds() {
  if (boundsFrame) cancelAnimationFrame(boundsFrame);
  if (boundsFallbackTimer) clearTimeout(boundsFallbackTimer);
  boundsFrame = 0;
  boundsFallbackTimer = 0;
  const force = forceNextBoundsSync;
  forceNextBoundsSync = false;
  const host = $('#browser-host');
  if (!host || host.hidden || state.view !== 'browser') return;
  const bounds = browserBounds();
  if (bounds.width < 1 || bounds.height < 1) return;
  const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
  if (!force && key === lastBoundsKey) return;
  lastBoundsKey = key;
  const response = await api.browser.setBounds(bounds);
  if (!response?.ok) toast(response?.error?.message ?? '网页区域尺寸同步失败', 'error');
}

function syncBrowserBounds(force = false) {
  forceNextBoundsSync ||= force;
  if (boundsFrame || boundsFallbackTimer) return;
  boundsFrame = requestAnimationFrame(flushBrowserBounds);
  boundsFallbackTimer = setTimeout(flushBrowserBounds, 80);
}

async function openSite(site) {
  let url;
  try { url = safeUrl(site.url); } catch (error) { toast(error.message, 'error'); return; }
  state.browserUrl = url;
  $('#browser-url').value = url;
  $('#browser-homepage').hidden = true;
  $('#browser-host').hidden = false;
  // Wait two frames so CSS layout settles before sending bounds to WebContentsView.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const recent = [site.id, ...(state.workspace.ui.browserRecent ?? []).filter((id) => id !== site.id)].slice(0, 8);
  workspaceEvent({ type: 'ui:patch', patch: { browserRecent: recent } }).catch(() => {});
  renderStatus({ state: 'loading', url });
  let bounds = browserBounds();
  if (bounds.width < 40 || bounds.height < 40) {
    const main = $('.main-panel')?.getBoundingClientRect?.() ?? { left: 220, top: 120, width: 900, height: 700 };
    bounds = {
      x: Math.round(main.left + 12),
      y: Math.round(main.top + 56),
      width: Math.max(320, Math.round(main.width - 24)),
      height: Math.max(240, Math.round(main.height - 72)),
    };
  }
  const response = await api.browser.show({ url, bounds });
  syncBrowserBounds(true);
  if (!response.ok) renderStatus({ state: 'blocked', url, message: response.error?.message ?? '站点无法加载' });
}

async function openExternalOrBrowser(url, name = '当前地址') {
  try {
    const href = safeUrl(url);
    await setView('browser');
    await openSite({ id: `link:${Date.now()}`, name, url: href, region: 'custom', note: '来自检索' });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderStatus(status) {
  const host = $('#browser-status');
  if (status.state === 'needs-bounds') {
    if (!$('#browser-host').hidden) api.browser.setBounds(browserBounds());
    return;
  }
  if (status.url) {
    state.browserUrl = status.url;
    if ($('#browser-url')) $('#browser-url').value = status.url;
  }
  if (status.title) state.browserTitle = status.title;
  clear(host);
  if (status.state === 'ready') {
    host.hidden = true;
    host.classList.remove('overlay');
    return;
  }
  const blocked = status.state === 'blocked';
  const slow = status.state === 'slow';
  host.hidden = false;
  host.classList.add('overlay');
  if (!blocked && !slow) {
    host.append(
      icon('search'),
      el('h3', { text: '正在载入站点…' }),
      el('p', { text: status.url || state.browserUrl || '' }),
    );
    return;
  }
  host.append(
    icon('globe'),
    el('h3', { text: blocked ? '该站点暂时无法在应用内稳定显示' : '站点加载较慢' }),
    el('p', { text: status.message || '可能受登录、验证码、证书或网络策略限制。内嵌页面仍保留。' }),
  );
  host.append(el('div', { className: 'fallback-actions' }, [
    el('button', { className: 'primary-button', text: '系统浏览器打开', onClick: () => api.browser.openExternal(status.url || state.browserUrl) }),
    el('button', { className: 'secondary-button', text: '刷新重试', onClick: () => api.browser.reload().catch(() => openSite({ id: `retry:${Date.now()}`, name: '重试', url: status.url || state.browserUrl })) }),
    el('button', { className: 'secondary-button', text: '收藏当前页', onClick: () => saveCurrentPage() }),
    el('button', { className: 'secondary-button', text: '复制链接', onClick: async () => { await navigator.clipboard.writeText(status.url || state.browserUrl); toast('链接已复制'); } }),
    el('button', { className: 'secondary-button', text: '返回首页', onClick: showHome }),
    el('button', { className: 'secondary-button', text: '关闭提示继续浏览', onClick: () => { host.hidden = true; } }),
  ]));
}

async function saveCurrentPage() {
  const response = await api.browser.pageMeta();
  if (!response?.ok) {
    const url = state.browserUrl || $('#browser-url')?.value;
    if (!url) return toast(response?.error?.message || '没有可收藏的页面', 'error');
    return saveMetaAsLiterature({ url, title: state.browserTitle || url });
  }
  return saveMetaAsLiterature(response.meta);
}

async function saveMetaAsLiterature(meta) {
  const url = String(meta.url || '').trim();
  const title = String(meta.title || url || '').trim();
  if (!url || !title) return toast('页面标题或地址为空，无法收藏', 'error');
  let year = null;
  const yearMatch = String(meta.year || '').match(/(19|20)\d{2}/);
  if (yearMatch) year = Number(yearMatch[0]);
  const doiRaw = String(meta.doi || '');
  const doi = doiRaw.replace(/^doi:/i, '').replace(/^https?:\/\/doi\.org\//i, '').trim();
  const record = {
    id: `web:${crypto.randomUUID()}`,
    title,
    authors: Array.isArray(meta.authors) ? meta.authors : [],
    year,
    venue: meta.venue || null,
    abstract: meta.abstract || `来自内置浏览器收藏：${url}`,
    url,
    sourceType: 'webpage',
    reality: 'real',
    externalIds: doi ? { doi } : {},
  };
  const result = await workspaceEvent({ type: 'library:save', record });
  toast(result?.merged ? '已与本地重复文献合并' : '当前页已收藏到本地文献库');
  return result;
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
  const nameInput = el('input', { id: 'site-name-input', name: 'name', required: true, maxlength: '80', placeholder: '例如：机构图书馆 / 自定义数据库' });
  const urlInput = el('input', { id: 'site-url-input', name: 'url', required: true, inputmode: 'url', placeholder: 'https://www.cnki.net' });
  const form = el('form', { id: 'site-form', className: 'modal-card' }, [
    el('header', {}, [el('div', {}, [el('p', { className: 'kicker', text: 'CUSTOM SITE' }), el('h2', { text: '添加科研站点' })]), el('button', { type: 'button', className: 'icon-button', text: '×', 'aria-label': '关闭', onClick: () => { backdrop.hidden = true; } })]),
    el('p', { className: 'paper-hint', text: '适合知网、万方、机构库等付费/登录墙站点。免费站点可直接从首页卡片进入。' }),
    el('label', {}, ['站点名称', nameInput]),
    el('label', {}, ['站点网址', urlInput]),
    el('footer', {}, [
      el('button', { type: 'button', className: 'secondary-button', text: '取消', onClick: () => { backdrop.hidden = true; } }),
      el('button', { type: 'submit', className: 'primary-button', text: '保存站点' }),
    ]),
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const name = String(nameInput.value ?? '').trim();
      if (!name) throw new Error('请输入站点名称');
      const url = safeUrl(urlInput.value);
      if (customSites().some((site) => site.url === url)) throw new Error('该站点已存在');
      const sites = [...customSites(), { id: `custom:${crypto.randomUUID()}`, name, url, region: 'custom', note: new URL(url).hostname }];
      await patchBrowserUi({ browserSites: sites });
      form.reset();
      backdrop.hidden = true;
      toast('站点已保存，正在打开…');
      openSite(sites[sites.length - 1]);
    } catch (error) { toast(error.message, 'error'); }
  });
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.hidden = true; });
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
  $('#browser-reload')?.addEventListener('click', async () => {
    try {
      if ($('#browser-host').hidden) return toast('请先打开一个站点', 'error');
      await api.browser.reload();
    } catch (error) { toast(error.message, 'error'); }
  });
  $('#browser-save-page')?.addEventListener('click', () => saveCurrentPage().catch((error) => toast(error.message, 'error')));
  $('#browser-open-external')?.addEventListener('click', () => {
    const url = state.browserUrl || $('#browser-url').value;
    if (!url) return toast('没有可打开的地址', 'error');
    api.browser.openExternal(url).catch((error) => toast(error.message, 'error'));
  });
  $('#browser-add-site').addEventListener('click', () => {
    ensureSiteDialog();
    const modal = $('#site-modal');
    modal.hidden = false;
    ($('#site-name-input') || $('#site-form input[name="name"]'))?.focus();
  });
  api.browser.onStatus(renderStatus);
  const host = $('#browser-host');
  const observer = new ResizeObserver(() => syncBrowserBounds());
  observer.observe(host);
  observer.observe($('.main-panel'));
  window.addEventListener('resize', () => syncBrowserBounds(true));
  window.visualViewport?.addEventListener('resize', () => syncBrowserBounds(true));
  document.addEventListener('selenyx:layout', () => syncBrowserBounds());
}

export {
  setupBrowser, renderSites, showHome, safeUrl, resolveInput,
  browserBounds, syncBrowserBounds, openSite, openExternalOrBrowser, saveCurrentPage,
};
