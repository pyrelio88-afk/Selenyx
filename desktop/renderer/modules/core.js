const api = window.selenyx;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  view: 'research',
  searchTab: 'china',
  sources: [],
  searchResult: null,
  activeSearchId: null,
  workspace: null,
  selectedSource: null,
  readerOutput: '',
  providers: { activeId: null, profiles: [] },
  skills: [],
  messages: [],
  browserUrl: '',
  browserTitle: '',
};

const paths = {
  moon: ['M12 3a9 9 0 1 0 9 9c-3.8 2.2-8.8-.1-8.8-4.5 0-2 1.1-3.7 2.8-4.6A9 9 0 0 0 12 3Z'],
  search: ['m21 21-4.3-4.3', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  library: ['M4 5h16v15H4z', 'M8 3v4', 'M16 3v4', 'M8 11h8', 'M8 15h5'],
  reader: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3Z', 'M5 4v16a3 3 0 0 1 3-3h11'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z'],
  message: ['M4 5h16v12H8l-4 4Z'],
  link: ['M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1', 'M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1'],
  spark: ['m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z'],
  settings: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['m4 4 16 8-16 8 3-8Z', 'M7 12h13'],
  home: ['m3 11 9-8 9 8', 'M5 10v11h14V10', 'M9 21v-7h6v7'],
  close: ['M5 5l14 14', 'M19 5 5 19'],
  'panel-left': ['M4 4h16v16H4z', 'M9 4v16'],
  'panel-right': ['M4 4h16v16H4z', 'M15 4v16'],
  highlight: ['m5 16 7-12 7 12', 'M8 12h8', 'M4 20h16'],
  note: ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h6'],
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const d of paths[name] ?? paths.spark) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((node) => {
    if (node.querySelector('.icon')) return;
    node.prepend(icon(node.dataset.icon));
  });
}

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) { node.replaceChildren(); }
function toast(message, kind = '') {
  const node = el('div', { className: `toast ${kind}`, text: message });
  $('#toast-region').append(node);
  setTimeout(() => node.remove(), 3600);
}
function errorMessage(result, fallback = '操作失败') {
  return result?.error?.status ? `${result.error.message}（HTTP ${result.error.status}）` : result?.error?.message ?? fallback;
}

async function workspaceEvent(event) {
  const response = await api.pushWorkspaceEvent(event);
  if (!response.ok) throw new Error(errorMessage(response));
  state.workspace = response.workspace;
  updateCounts();
  return response.result;
}

function updateCounts() {
  $('#library-count').textContent = String(state.workspace?.library?.length ?? 0);
  $('#evidence-count').textContent = String(state.workspace?.evidence?.length ?? 0);
}

const viewNames = {
  question: ['立题闸门', '研究问题'],
  research: ['发现文献', '文献检索'],
  library: ['筛选与入库', '本地文献库'],
  reader: ['精读闸门', '阅读 · PDF'],
  browser: ['获取全文', '科研浏览器'],
  chat: ['长链路协作', '科研对话'],
  evidence: ['主张与依据', '证据链'],
  skills: ['综合路径', '证据门编排'],
  write: ['产物 · 写作', '写作工作台'],
  figure: ['产物 · 图表', '图表规划'],
  experiment: ['产物 · 实验', '实验日志'],
};
let viewHook = () => {};

async function setView(view, persist = true) {
  if (!viewNames[view]) return;
  state.view = view;
  $$('.view').forEach((node) => node.classList.toggle('active', node.id === `${view}-view`));
  $$('[data-view]').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  $('#view-eyebrow').textContent = viewNames[view][0];
  $('#view-title').textContent = viewNames[view][1];
  $('#composer').hidden = !['chat', 'reader'].includes(view);
  if (view !== 'browser') await api.browser.hide();
  viewHook(view);
  if (persist && state.workspace) workspaceEvent({ type: 'ui:patch', patch: { lastView: view } }).catch(() => {});
}

function setViewHook(callback) { viewHook = callback; }
function selectedText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const quote = selection.toString().trim();
  if (!quote) return null;
  const anchorNode = selection.anchorNode;
  const inAbstract = $('#reader-document')?.contains(anchorNode);
  const inPdf = $('#pdf-text-layer')?.contains(anchorNode) || $('#pdf-stage')?.contains(anchorNode);
  if (!inAbstract && !inPdf) return null;
  const abstract = state.selectedSource?.abstract ?? '';
  const start = abstract.indexOf(quote);
  return { quote, anchor: { start: Math.max(0, start), end: Math.max(0, start) + quote.length } };
}

export {
  api, state, $, $$, el, clear, icon, hydrateIcons, toast, errorMessage,
  workspaceEvent, updateCounts, setView, setViewHook, selectedText,
};
