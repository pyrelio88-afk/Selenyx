import { api, state, $, $$, el, clear, toast, workspaceEvent, setView } from './core.js';
import { renderRight } from './reader.js';
import { openExternalOrBrowser } from './browserWorkbench.js';

const defaultIntl = ['openalex', 'pubmed', 'crossref'];
const primaryChina = ['pubscholar'];
const publicChina = ['chinaxiv', 'nstl', 'ncpssd', 'sinomed'];
const paidChina = ['cnki', 'wanfang', 'cqvip'];
let internationalExpanded = false;

function sourceById(id) { return state.sources.find((source) => source.id === id); }
function accessText(source) {
  if (source.access === 'paid') return '登录 / 付费';
  if (source.access === 'institutional') return '机构权限';
  if (source.access === 'key') return '需要 Key';
  return source.kind === 'link' ? '站点跳转' : '原生 API';
}

function sourceRow(source, checked = false) {
  const input = el('input', { type: 'checkbox', value: source.id, checked, 'aria-label': source.name });
  return el('label', { className: 'source-row' }, [
    input,
    el('span', {}, [el('b', { text: source.name }), el('small', { text: source.note ?? accessText(source) })]),
    el('i', { className: 'access-tag', text: accessText(source) }),
  ]);
}

function renderControls() {
  const host = $('#source-controls');
  clear(host);
  if (state.searchTab === 'local') {
    host.append(el('div', { className: 'source-lead' }, [
      el('div', { className: 'source-logo', text: '本地' }),
      el('div', {}, [el('h3', { text: '仅检索本地收藏' }), el('p', { text: '断网可用，不会发起任何网络请求。' })]),
      el('span', { className: 'access-tag', text: `${state.workspace?.library?.length ?? 0} 篇` }),
    ]));
    return;
  }
  if (state.searchTab === 'china') {
    const pubScholar = sourceById(primaryChina[0]);
    if (pubScholar) host.append(el('div', { className: 'source-lead' }, [
      el('div', { className: 'source-logo', text: 'PS' }),
      el('div', {}, [el('h3', { text: pubScholar.name }), el('p', { text: '中国平台入口优先 · 同步用 OpenAlex/Crossref 开放 API 返回可收藏记录' })]),
      el('span', { className: 'access-tag', text: '优先入口' }),
    ]));
    const list = el('div', { className: 'source-list' });
    [...publicChina, ...paidChina].map(sourceById).filter(Boolean).forEach((source) => list.append(sourceRow(source, publicChina.includes(source.id))));
    host.append(list);
    return;
  }
  const selected = state.workspace?.sourcePreferences?.international ?? defaultIntl;
  const visible = state.sources.filter((source) => source.region === 'intl' && (internationalExpanded || defaultIntl.includes(source.id)));
  const list = el('div', { className: 'source-list' });
  visible.forEach((source) => list.append(sourceRow(source, selected.includes(source.id))));
  host.append(list);
  const toggle = el('button', {
    type: 'button', className: 'source-picker-button',
    text: internationalExpanded ? '收起其他来源' : `选择更多来源（共 ${state.sources.filter((source) => source.region === 'intl').length} 个）`,
    onClick: () => { internationalExpanded = !internationalExpanded; renderControls(); },
  });
  host.append(toggle);
}

function selectedSources() {
  if (state.searchTab === 'china') return ['pubscholar', 'openalex', 'crossref', ...$$('#source-controls input:checked').map((node) => node.value)];
  if (state.searchTab === 'international') return $$('#source-controls input:checked').map((node) => node.value);
  return [];
}

function renderStatuses() {
  const host = $('#source-statuses');
  clear(host);
  for (const result of state.searchResult?.sourceResults ?? []) {
    const label = {
      complete: `完成 · ${result.count} 条`, zero: '完成 · 0 结果', failed: '失败',
      'rate-limited': '限流', 'requires-key': '需要 Key', 'site-link': '站点跳转',
    }[result.status] ?? result.status;
    host.append(el('span', { className: `source-status ${result.status}`, text: `${sourceById(result.source)?.name ?? result.source}：${label}` }));
  }
}

function applySearchProgress(progress) {
  if (!progress || progress.requestId !== state.activeSearchId || !state.searchResult) return;
  const next = {
    source: progress.source,
    status: progress.status,
    count: progress.count ?? 0,
    httpStatus: progress.httpStatus ?? null,
    error: progress.error ?? null,
    latencyMs: progress.latencyMs ?? null,
  };
  const results = [...(state.searchResult.sourceResults ?? [])];
  const index = results.findIndex((item) => item.source === progress.source);
  if (index >= 0) results[index] = { ...results[index], ...next };
  else results.push(next);
  state.searchResult.sourceResults = results;
  const finished = results.filter((item) => item.status !== 'searching').length;
  $('#search-audit').textContent = `正在检索：${finished}/${results.length} 个来源已返回；失败来源不会影响其他结果。`;
  renderStatuses();
}

async function saveRecord(record, button) {
  const result = await workspaceEvent({ type: 'library:save', record });
  if (button) {
    button.textContent = result?.merged ? '已合并' : '已收藏';
    button.disabled = true;
  }
  renderLibrary();
  renderRight();
  toast(result?.merged ? '已与本地重复文献合并' : '已保存到 workspace.json');
  return result;
}

function card(record, local = false) {
  const saved = state.workspace?.library?.some((item) => item.id === record.id);
  const lib = state.workspace?.library?.find((item) => item.id === record.id);
  const hasPdf = Boolean(record.localPdf || lib?.localPdf);
  const actions = el('div', { className: 'result-actions' });
  actions.append(el('button', { className: 'text-button', text: hasPdf ? '阅读 PDF' : '进入阅读', onClick: async () => {
    if (!saved) await saveRecord(record);
    state.selectedSource = state.workspace.library.find((item) => item.id === record.id) ?? record;
    await workspaceEvent({ type: 'ui:patch', patch: { selectedSourceId: state.selectedSource.id } });
    setView('reader');
  } }));
  if (!saved) actions.append(el('button', { className: 'text-button', text: '收藏到本地', onClick: async (event) => {
    await saveRecord(record, event.currentTarget);
  } }));
  if (record.url) {
    actions.append(el('button', { className: 'text-button', text: '获取全文', onClick: () => openExternalOrBrowser(record.url, record.title || '全文') }));
    actions.append(el('button', { className: 'text-button', text: '系统浏览器', onClick: () => api.openExternal(record.url) }));
  }
  if (local || saved) {
    actions.append(el('button', { className: 'text-button', text: hasPdf ? '更换 PDF' : '导入 PDF', onClick: async () => {
      const { importPdfFlow } = await import('./reader.js');
      const target = state.workspace.library.find((item) => item.id === record.id) ?? record;
      state.selectedSource = target;
      await importPdfFlow(target);
    } }));
  }
  return el('article', { className: `result-card ${record.reality === 'example' ? 'example' : ''}` }, [
    el('h3', { text: record.title }),
    el('div', { className: 'meta', text: `${record.authors?.join('、') || '作者未知'} · ${record.venue || '来源未知'} · ${record.year || '年份未知'}${local ? ' · 本地' : ''}${hasPdf ? ' · PDF' : ''}` }),
    el('p', { className: 'abstract', text: record.abstract || '暂无摘要；获取全文并导入 PDF 后可精读批注。' }),
    actions,
  ]);
}

function linkCard(link) {
  const source = sourceById(link.sourceId);
  return el('article', { className: 'result-card site-link' }, [
    el('h3', { text: source?.name ?? link.sourceName }),
    el('div', { className: 'meta', text: link.requiresAccount ? '站点跳转 · 可能需要登录或付费' : '站点跳转 · 公益/开放入口' }),
    el('p', { className: 'abstract', text: link.honesty }),
    el('div', { className: 'result-actions' }, [
      el('button', { className: 'text-button', text: '应用内打开', onClick: () => openExternalOrBrowser(link.url, source?.name ?? link.sourceName) }),
      el('button', { className: 'text-button', text: '系统浏览器', onClick: () => api.openExternal(link.url) }),
      el('button', { className: 'text-button', text: '复制链接', onClick: async () => { await navigator.clipboard.writeText(link.url); toast('链接已复制'); } }),
    ]),
  ]);
}

async function collectAllVisible() {
  const records = state.searchResult?.records ?? [];
  if (!records.length) return toast('当前没有可收藏的 API 结果', 'error');
  let saved = 0;
  let merged = 0;
  for (const record of records) {
    const result = await workspaceEvent({ type: 'library:save', record });
    if (result?.merged) merged += 1;
    else saved += 1;
  }
  renderResults();
  renderLibrary();
  renderRight();
  toast(`收藏完成：新增 ${saved} · 合并 ${merged}`);
}

function renderResults() {
  renderStatuses();
  const host = $('#search-results');
  clear(host);
  const result = state.searchResult;
  const records = result?.records ?? [];
  const links = result?.links ?? [];
  const errors = result?.errors ?? [];
  const hasPayload = Boolean(records.length || links.length || errors.length);
  $('#search-state').hidden = Boolean(result);
  if (hasPayload) {
    host.append(el('div', { className: 'result-toolbar', id: 'search-results-toolbar' }, [
      el('b', { text: `${records.length} 条可收藏 · ${links.length} 个站点入口 · ${errors.length} 个失败` }),
      el('div', { className: 'result-actions' }, [
        records.length ? el('button', { className: 'secondary-button', text: '全部收藏到本地', onClick: collectAllVisible }) : null,
        el('button', { className: 'secondary-button', text: '打开文献库', onClick: () => setView('library') }),
      ].filter(Boolean)),
    ]));
  }
  records.forEach((record) => host.append(card(record)));
  links.forEach((link) => host.append(linkCard(link)));
  for (const error of errors) {
    host.append(el('div', { className: 'result-card' }, [
      el('h3', { text: `${sourceById(error.source)?.name ?? error.source} 检索失败` }),
      el('p', { className: 'abstract', text: `${error.message}${error.status ? `（HTTP ${error.status}）` : ''}` }),
    ]));
  }
  if (result && !hasPayload) {
    host.append(el('div', { className: 'empty-state' }, [el('h3', { text: '真实检索返回 0 条' }), el('p', { text: '没有生成或补写任何论文。请调整关键词后重试。' })]));
  }
}

function renderLibrary(query = '') {
  const host = $('#library-results');
  clear(host);
  const term = query.trim().toLocaleLowerCase();
  const records = (state.workspace?.library ?? []).filter((record) => !term || `${record.title} ${record.authors?.join(' ')}`.toLocaleLowerCase().includes(term));
  if (!records.length) host.append(el('div', { className: 'empty-state' }, [el('h3', { text: term ? '本地收藏中没有匹配项' : '本地文献库为空' }), el('p', { text: '从真实检索结果收藏，或使用“手动添加文献”。' })]));
  records.forEach((record) => host.append(card(record, true)));
}

async function runSearch(event) {
  event.preventDefault();
  const query = $('#literature-query').value.trim();
  if (!query) return;
  if (state.searchTab === 'local') {
    state.searchResult = { query, records: state.workspace.library.filter((record) => `${record.title} ${record.authors?.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), sourceResults: [], links: [], errors: [] };
    $('#search-audit').textContent = '仅检索本地 workspace.json · 未联网';
    renderResults();
    renderRight();
    return;
  }
  const sources = selectedSources();
  if (!sources.length) return toast('请至少选择一个来源', 'error');
  const button = $('#literature-search-form button');
  const requestId = crypto.randomUUID();
  state.activeSearchId = requestId;
  state.searchResult = {
    requestId, query, records: [], links: [], errors: [],
    sourceResults: sources.map((source) => ({ source, status: 'searching', count: 0 })),
  };
  renderResults();
  renderRight();
  button.disabled = true;
  button.textContent = '检索中…';
  $('#search-audit').textContent = `正在请求 ${sources.length} 个来源；每个 API 有独立超时与重试。`;
  try {
    const response = await api.searchLiterature({ query, sources, limit: 10, requestId, matchMode: $('#search-mode').value });
    if (requestId !== state.activeSearchId) return;
    if (!response.ok) throw new Error(response.error?.message ?? '检索失败');
    state.searchResult = response.result;
    const suffix = response.result.isPartial ? ' · 部分来源失败，成功结果已保留' : response.result.isFailure ? ' · 所有 API 均失败' : '';
    $('#search-audit').textContent = `${new Date().toLocaleTimeString()} · ${response.result.records.length} 条可收藏记录 · ${response.result.links.length} 个站点入口${suffix}`;
    renderResults();
    renderRight();
    requestAnimationFrame(() => {
      const toolbar = $('#search-results-toolbar') || $('#search-results');
      toolbar?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  } catch (error) {
    if (requestId === state.activeSearchId) {
      $('#search-audit').textContent = `检索没有完成：${error.message}`;
      toast(error.message, 'error');
    }
  } finally {
    if (requestId === state.activeSearchId) {
      button.disabled = false;
      button.textContent = '检索';
    }
  }
}

function setupSearch() {
  api.onSearchStatus(applySearchProgress);
  $$('.segment-tabs button').forEach((button) => button.addEventListener('click', async () => {
    state.searchTab = button.dataset.searchTab;
    $$('.segment-tabs button').forEach((node) => node.classList.toggle('active', node === button));
    await workspaceEvent({ type: 'preferences:patch', patch: { searchTab: state.searchTab } });
    renderControls();
    // Keep previous results visible unless user starts a new search; only clear statuses for the inactive tab chrome.
    if (!state.searchResult) {
      $('#search-results').replaceChildren();
      $('#source-statuses').replaceChildren();
      $('#search-state').hidden = false;
    }
  }));
  $('#literature-search-form').addEventListener('submit', runSearch);
  $('#manual-add').addEventListener('click', () => { $('#manual-modal').hidden = false; });
  $('#manual-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const year = Number(data.get('year'));
    await workspaceEvent({ type: 'library:save', record: {
      id: `manual:${crypto.randomUUID()}`, title: data.get('title'),
      authors: String(data.get('authors') ?? '').split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      year: Number.isInteger(year) && year > 0 ? year : null,
      venue: data.get('venue'), abstract: data.get('abstract'), externalIds: data.get('doi') ? { doi: data.get('doi') } : {},
      sourceType: 'article', reality: 'real',
    } });
    event.currentTarget.reset();
    $('#manual-modal').hidden = true;
    renderLibrary();
    renderRight();
    toast('文献已保存到本地');
  });
  $$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { $(`#${button.dataset.closeModal}`).hidden = true; }));
}

export { setupSearch, renderControls, renderResults, renderLibrary };
