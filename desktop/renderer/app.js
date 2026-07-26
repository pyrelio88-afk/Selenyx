const api = window.selenyx;

const state = {
  view: 'research',
  rightTab: 'tasks',
  selectedSource: null,
  searchResult: null,
  providers: { activeId: null, profiles: [], secureStorageAvailable: false },
  skills: [],
  evidence: [],
  annotations: [],
  messages: [],
  browserUrl: 'https://arxiv.org',
  browserStatus: { state: 'idle' },
};

const views = {
  research: ['研究工作台', '文献检索'],
  chat: ['研究会话', '科研对话'],
  reader: ['文献工作台', '阅读模式'],
  browser: ['科研站点', '内置浏览器'],
  evidence: ['证据链', '证据图谱'],
  skills: ['本地能力', '科研技能'],
};

const settingsSections = [
  ['model', '模型', '◈'],
  ['chat', '对话', '◌'],
  ['appearance', '外观', '◐'],
  ['security', '安全', '◇'],
  ['memory', '记忆与上下文', '⌁'],
  ['voice', '语音', '◖'],
  ['advanced', '高级', '⌘'],
  ['notifications', '通知', '◉'],
  ['billing', '账单', '¤'],
  ['providers', '提供方', '↔'],
  ['gateway', '网关', '⌂'],
  ['plugins', '插件', '✦'],
  ['archives', '已归档对话', '□'],
];

const sites = [
  { id: 'arxiv', name: 'arXiv', url: 'https://arxiv.org' },
  { id: 'openalex', name: 'OpenAlex', url: 'https://openalex.org' },
  { id: 'pubmed', name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov' },
  { id: 'cnki', name: '中国知网', url: 'https://www.cnki.net' },
  { id: 'doaj', name: 'DOAJ', url: 'https://doaj.org' },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null) node.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function toast(message, kind = '') {
  const item = el('div', { class: `toast ${kind}`, text: message });
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), 4_000);
}

function errorMessage(result, fallback = '操作失败') {
  if (!result) return fallback;
  if (result.ok !== false) return fallback;
  const parts = [
    Number.isInteger(result.error?.status) ? `HTTP ${result.error.status}` : null,
    result.error?.message,
  ].filter(Boolean);
  return parts.join(' · ') || fallback;
}

function loadUiState() {
  try {
    const left = Number(localStorage.getItem('selenyx.ui.leftWidth'));
    const right = Number(localStorage.getItem('selenyx.ui.rightWidth'));
    if (left >= 210 && left <= 380) document.documentElement.style.setProperty('--left-width', `${left}px`);
    if (right >= 260 && right <= 480) document.documentElement.style.setProperty('--right-width', `${right}px`);
    if (localStorage.getItem('selenyx.ui.leftCollapsed') === 'true') $('#app').classList.add('left-collapsed');
    if (localStorage.getItem('selenyx.ui.rightCollapsed') === 'true') $('#app').classList.add('right-collapsed');
  } catch {}
}

function saveUiValue(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function setView(view) {
  if (!views[view]) return;
  if (state.view === 'browser' && view !== 'browser') api.browser.hide();
  state.view = view;
  $$('.view').forEach((node) => node.classList.toggle('active', node.id === `${view}-view`));
  $$('[data-view]').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  $('#view-eyebrow').textContent = views[view][0];
  $('#view-title').textContent = views[view][1];
  $('#composer').hidden = view === 'research' || view === 'browser' || view === 'evidence' || view === 'skills';
  if (view === 'browser') setTimeout(openBrowser, 30);
}

function activeProvider() {
  return state.providers.profiles.find((item) => item.id === state.providers.activeId) ?? null;
}

function renderProviderPill() {
  const provider = activeProvider();
  $('#provider-pill').textContent = provider ? `${provider.name} · ${provider.model}` : '离线 L1';
  $('#context-label').textContent = provider
    ? 'L2 · 内容将发送至所选提供方'
    : '本地上下文 · 不上传';
}

async function refreshProviders() {
  const result = await api.providers.list();
  if (result.ok) {
    state.providers = result;
    renderProviderPill();
  } else {
    toast(errorMessage(result, '无法读取提供方'), 'error');
  }
}

function renderSearchResults() {
  const container = $('#search-results');
  const status = $('#search-state');
  clear(container);
  if (!state.searchResult) return;
  const result = state.searchResult;
  status.hidden = true;
  if (result.isFailure) {
    const panel = el('div', { class: 'error-panel' });
    panel.append(el('strong', { text: '真实检索失败' }));
    for (const error of result.errors) {
      panel.append(el('div', { text: `${error.source}: ${error.status ? `HTTP ${error.status} · ` : ''}${error.message}` }));
    }
    container.append(panel);
    return;
  }
  if (result.records.length === 0) {
    status.hidden = false;
    clear(status);
    status.append(
      el('div', { class: 'empty-symbol', text: '0' }),
      el('h3', { text: '真实检索返回 0 条' }),
      el('p', { text: 'Selenyx 没有生成相似标题或示例结果来填充页面。可以调整关键词后重试。' }),
    );
    return;
  }
  result.records.forEach((record, index) => {
    const source = record.externalIds?.pmid ? 'PubMed' : 'OpenAlex';
    const title = el('h3', {}, [
      document.createTextNode(record.title),
      el('span', { class: record.reality === 'example' ? 'example-chip' : 'source-chip', text: record.reality === 'example' ? '示例' : source }),
    ]);
    const meta = [
      record.authors.slice(0, 3).join(', '),
      record.year,
      record.venue,
      record.isRetracted ? '⚠ 已撤稿' : null,
    ].filter(Boolean).join(' · ');
    const actions = el('div', { class: 'result-actions' }, [
      el('button', {
        class: 'text-button',
        text: '进入阅读',
        onClick: () => selectSource(record),
      }),
      el('button', {
        class: 'text-button',
        text: '打开原文',
        onClick: () => record.url && api.browser.openExternal(record.url),
      }),
      el('button', {
        class: 'text-button',
        text: '加入证据板',
        onClick: () => addSourceEvidence(record),
      }),
    ]);
    container.append(el('article', { class: 'result-card' }, [
      el('div', { class: 'result-head' }, [
        el('span', { class: 'result-index', text: String(index + 1).padStart(2, '0') }),
        el('div', { class: 'result-copy' }, [
          title,
          el('div', { class: 'result-meta', text: meta || '元数据未报告' }),
          record.abstract ? el('p', { class: 'result-abstract', text: record.abstract }) : null,
          actions,
        ]),
      ]),
    ]));
  });
  if (result.errors.length) {
    container.prepend(el('div', {
      class: 'notice',
      text: `部分数据源失败：${result.errors.map((item) => `${item.source}${item.status ? ` HTTP ${item.status}` : ''}`).join('；')}。已展示成功返回的真实结果。`,
    }));
  }
}

async function runSearch(event) {
  event.preventDefault();
  const query = $('#literature-query').value.trim();
  if (!query) return;
  const sources = $$('input[name="source"]:checked').map((node) => node.value);
  if (!sources.length) {
    toast('请至少选择一个真实数据源', 'error');
    return;
  }
  const button = $('#literature-search-form button');
  button.disabled = true;
  button.textContent = '检索中…';
  $('#search-audit').textContent = '正在请求真实 API…';
  clear($('#search-results'));
  try {
    const response = await api.searchLiterature({ query, sources, limit: 10, page: 1 });
    if (!response.ok) {
      state.searchResult = {
        isFailure: true, records: [], errors: [{
          source: 'system', status: response.error?.status, message: response.error?.message ?? '检索失败',
        }],
      };
    } else {
      state.searchResult = response.result;
    }
    const audits = state.searchResult.sourceResults ?? [];
    $('#search-audit').textContent = audits.length
      ? audits.map((item) => `${item.source} HTTP ${item.audit.httpStatus} · ${item.returned}/${item.total}`).join(' ｜ ')
      : `${state.searchResult.errors.length} 个数据源失败`;
    renderSearchResults();
  } finally {
    button.disabled = false;
    button.textContent = '检索';
  }
}

function selectSource(record) {
  state.selectedSource = record;
  renderReader();
  setView('reader');
  toast('已进入真实文献阅读模式');
}

function addSourceEvidence(record) {
  if (state.evidence.some((item) => item.sourceId === record.id && item.kind === 'source')) {
    toast('该文献已在证据板中');
    return;
  }
  state.evidence.push({
    id: `ev-${Date.now()}`,
    kind: 'source',
    sourceId: record.id,
    statement: record.title,
    status: '待抽取',
    reality: record.reality,
  });
  $('#evidence-count').textContent = String(state.evidence.length);
  renderRightContent();
  toast('已加入证据板');
}

function renderReader(extra = null) {
  const root = $('#reader-document');
  clear(root);
  const record = state.selectedSource;
  if (!record) {
    root.append(el('div', { class: 'paper-empty' }, [
      el('span', { text: '▤' }),
      el('h2', { text: '尚未选择文献' }),
      el('p', { text: '从真实检索结果中选择“进入阅读”。' }),
    ]));
    return;
  }
  root.append(
    el('p', { class: 'eyebrow', text: record.externalIds?.pmid ? 'PUBMED · REAL' : 'OPENALEX · REAL' }),
    el('h2', { text: record.title }),
    el('p', {
      class: 'paper-meta',
      text: [record.authors.join(', '), record.venue, record.year].filter(Boolean).join(' · '),
    }),
    el('section', { class: 'paper-abstract' }, [
      el('h3', { text: '摘要 / Abstract' }),
      el('p', { text: record.abstract ?? '数据源没有提供可展示的摘要。Selenyx 不会自动补写。' }),
    ]),
  );
  if (extra) root.append(el('section', { class: 'setting-group' }, extra));
}

function formatSkillResult(value) {
  if (value == null) return '没有可展示的结果。';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

async function readerAction(action) {
  const record = state.selectedSource;
  if (!record) {
    toast('请先选择一篇真实文献', 'error');
    return;
  }
  const input = record.abstract || record.title;
  if (action === 'highlight' || action === 'underline' || action === 'note') {
    const selection = window.getSelection()?.toString().trim();
    const annotation = {
      id: `ann-${Date.now()}`,
      type: action,
      sourceId: record.id,
      text: selection || '未选择具体文本',
      createdAt: new Date().toISOString(),
    };
    state.annotations.push(annotation);
    renderRightContent();
    toast(selection ? '批注已保存到本地会话' : '已创建空批注，请在证据栏补充内容');
    return;
  }
  if (action === 'relevance') {
    renderReader([
      el('h3', { text: '与当前项目的相关性 · L1' }),
      el('p', { text: '当前项目尚未设置研究问题，L1 不生成无依据分数。请先在项目中定义研究问题与关键词。' }),
    ]);
    return;
  }
  const skillId = action === 'translate' ? 'translate' : 'summarize';
  const response = await api.runSkill({ id: skillId, input });
  if (!response.ok) {
    toast(errorMessage(response, '离线技能运行失败'), 'error');
    return;
  }
  const title = action === 'translate' ? '术语辅助翻译 · L1 离线' : '摘录式总结 · L1 离线';
  renderReader([
    el('h3', { text: title }),
    el('pre', { text: formatSkillResult(response.result) }),
    el('p', { class: 'paper-meta', text: action === 'translate'
      ? '未覆盖的文本保持原文；这不是任意全文的高质量机器翻译。'
      : '摘要来自确定性抽取，不代表模型理解或新增结论。' }),
  ]);
}

function renderMessages() {
  const root = $('#messages');
  clear(root);
  state.messages.forEach((message) => {
    const body = el('div', { class: 'message-body' }, [
      document.createTextNode(message.content),
      el('div', { class: 'message-meta', text: message.meta }),
    ]);
    root.append(message.role === 'user'
      ? el('div', { class: 'message user' }, body)
      : el('div', { class: 'message assistant' }, [
        el('div', { class: 'message-avatar', text: '◐' }),
        body,
      ]));
  });
  $('#chat-scroll').scrollTop = $('#chat-scroll').scrollHeight;
}

async function sendMessage() {
  const input = $('#composer-input');
  const content = input.value.trim();
  if (!content) return;
  state.messages.push({ role: 'user', content, meta: '本地输入' });
  input.value = '';
  input.style.height = '';
  renderMessages();
  const provider = activeProvider();
  if (!provider) {
    state.messages.push({
      role: 'assistant',
      content: '当前没有配置模型 Key，因此我不会伪造大模型回答。你仍可使用文献检索、批注、L1 摘录式总结、术语辅助翻译和本地查重。',
      meta: 'L1 · 无远端调用',
    });
    renderMessages();
    return;
  }
  const evidenceContext = state.evidence.slice(-8).map((item) => `- ${item.statement}`).join('\n');
  const response = await api.providers.chat({
    id: provider.id,
    messages: [
      {
        role: 'system',
        content: `你是 Selenyx 科研助手。只依据用户输入与以下证据回答；证据不足时明确说不知道。\n${evidenceContext || '当前没有已审阅证据。'}`,
      },
      ...state.messages.filter((item) => item.role === 'user' || item.role === 'assistant')
        .map(({ role, content: text }) => ({ role, content: text })),
    ],
  });
  if (!response.ok) {
    state.messages.push({
      role: 'assistant',
      content: errorMessage(response, '模型请求失败'),
      meta: `${provider.name} · 真实错误`,
    });
  } else {
    state.messages.push({
      role: 'assistant',
      content: response.result.content,
      meta: `L2 · ${provider.name} / ${response.result.model}`,
    });
  }
  renderMessages();
}

function browserBounds() {
  const rect = $('#browser-host').getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function resolveBrowserInput(value) {
  const text = String(value ?? '').trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

async function openBrowser() {
  const value = $('#browser-url').value;
  const url = resolveBrowserInput(value);
  state.browserUrl = url;
  $('#browser-status').className = 'browser-fallback';
  clear($('#browser-status'));
  $('#browser-status').append(
    el('span', { class: 'empty-symbol', text: '◌' }),
    el('h3', { text: '正在加载真实站点' }),
    el('p', { text: url }),
  );
  const result = await api.browser.show({ url, bounds: browserBounds() });
  if (!result.ok) renderBrowserStatus({
    state: 'blocked',
    url,
    message: errorMessage(result, '站点加载失败'),
    workaround: 'open-external',
  });
}

function renderBrowserStatus(status) {
  state.browserStatus = status;
  if (status.state === 'needs-bounds') {
    if (state.view === 'browser') api.browser.setBounds(browserBounds());
    return;
  }
  const root = $('#browser-status');
  if (status.state === 'ready') {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  clear(root);
  root.className = `browser-fallback ${status.state === 'blocked' ? 'blocked' : ''}`;
  root.append(
    el('span', { class: 'empty-symbol', text: status.state === 'blocked' ? '!' : '◌' }),
    el('h3', { text: status.state === 'blocked' ? '站点无法在内置浏览器中完成加载' : '正在加载' }),
    el('p', { text: status.message || status.url || '请稍候' }),
  );
  if (status.state === 'blocked') {
    root.append(el('button', {
      class: 'primary-button',
      text: '改用系统浏览器',
      onClick: () => api.browser.openExternal(status.url || state.browserUrl),
    }));
  }
}

function renderRightContent() {
  const root = $('#right-content');
  clear(root);
  if (state.rightTab === 'tasks') {
    const tasks = [
      { title: '定义研究问题', body: state.selectedSource ? '待补充项目纳排标准' : '尚未开始' },
      { title: '真实检索', body: state.searchResult ? `${state.searchResult.records.length} 条记录` : '等待查询' },
      { title: '证据审阅', body: `${state.evidence.length} 个候选对象` },
    ];
    tasks.forEach((task) => root.append(el('div', { class: 'side-card' }, [
      el('h3', { text: task.title }), el('p', { text: task.body }),
    ])));
    return;
  }
  if (state.rightTab === 'documents') {
    if (!state.selectedSource) {
      root.append(el('div', { class: 'side-empty', text: '选择文献后显示当前文档。' }));
    } else {
      root.append(el('div', { class: 'side-card' }, [
        el('h3', { text: state.selectedSource.title }),
        el('p', { text: state.selectedSource.url || '没有原文 URL' }),
      ]));
    }
    return;
  }
  if (!state.evidence.length && !state.annotations.length) {
    root.append(el('div', { class: 'side-empty', text: '证据和批注尚为空。' }));
    return;
  }
  state.evidence.forEach((item) => root.append(el('div', { class: 'side-card' }, [
    el('h3', { text: item.statement }),
    el('p', { text: `${item.status} · ${item.reality === 'example' ? '示例' : '真实来源'}` }),
  ])));
  state.annotations.forEach((item) => root.append(el('div', { class: 'side-card' }, [
    el('h3', { text: `${item.type} 批注` }),
    el('p', { text: item.text }),
  ])));
}

function renderSkills() {
  const root = $('#skill-grid');
  clear(root);
  state.skills.forEach((skill) => root.append(el('article', { class: 'skill-card' }, [
    el('span', { class: 'level-chip', text: skill.offline ? 'L1 离线' : 'L2' }),
    el('h3', { text: skill.name }),
    el('p', { text: skill.desc }),
  ])));
}

function settingHeader(title, description) {
  return [el('h2', { text: title }), el('p', { text: description })];
}

function settingRow(title, description, control) {
  return el('div', { class: 'setting-row' }, [
    el('div', { class: 'setting-label' }, [
      document.createTextNode(title),
      el('small', { text: description }),
    ]),
    control,
  ]);
}

function infoSettings(title, description, rows) {
  const root = $('#settings-content');
  clear(root);
  root.append(...settingHeader(title, description));
  const group = el('div', { class: 'setting-group' });
  rows.forEach(([name, detail, value]) => group.append(settingRow(name, detail, el('strong', { text: value }))));
  root.append(group);
}

function renderAppearanceSettings() {
  const root = $('#settings-content');
  clear(root);
  root.append(...settingHeader('外观', '宣纸白与朱砂强调。强调色会即时生效并在重启后恢复。'));
  const color = el('input', { type: 'color', value: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b43a32' });
  color.addEventListener('input', () => {
    document.documentElement.style.setProperty('--accent', color.value);
    saveUiValue('selenyx.ui.accent', color.value);
  });
  const reset = el('button', { class: 'secondary-button', text: '恢复默认布局', onClick: () => {
    for (const key of ['selenyx.ui.leftWidth', 'selenyx.ui.rightWidth', 'selenyx.ui.leftCollapsed', 'selenyx.ui.rightCollapsed']) {
      try { localStorage.removeItem(key); } catch {}
    }
    document.documentElement.style.setProperty('--left-width', '252px');
    document.documentElement.style.setProperty('--right-width', '316px');
    $('#app').classList.remove('left-collapsed', 'right-collapsed');
    toast('布局已恢复默认');
  } });
  const group = el('div', { class: 'setting-group' }, [
    settingRow('强调色', '通过根 CSS 变量真实覆盖', color),
    settingRow('三栏布局', '宽度和折叠状态仅保存在本地', reset),
  ]);
  root.append(group);
}

function renderProviderSettings() {
  const root = $('#settings-content');
  clear(root);
  root.append(...settingHeader('提供方', 'CC Switch 式本地配置；Key 由主进程加密保存，不进入 localStorage 或渲染进程持久状态。'));
  root.append(el('div', {
    class: 'notice',
    text: state.providers.secureStorageAvailable
      ? '系统凭据加密可用。测试连接会发出真实请求并保留 HTTP 状态。'
      : '系统凭据加密不可用：远端 API Key 将不会被保存。',
  }));
  const list = el('div', { class: 'provider-list' });
  state.providers.profiles.forEach((provider) => {
    list.append(el('div', { class: `provider-row ${provider.id === state.providers.activeId ? 'active' : ''}` }, [
      el('div', {}, [
        el('strong', { text: provider.name }),
        el('p', { text: `${provider.baseUrl} · ${provider.model} · ${provider.hasKey ? 'Key 已加密保存' : provider.isLocal ? '本地免 Key' : '未设置 Key'}` }),
      ]),
      el('div', { class: 'provider-actions' }, [
        el('button', { class: 'text-button', text: '切换', onClick: async () => {
          const result = await api.providers.activate(provider.id);
          if (!result.ok) return toast(errorMessage(result), 'error');
          state.providers = result;
          renderProviderPill();
          renderProviderSettings();
        } }),
        el('button', { class: 'text-button', text: '测试', onClick: async () => {
          const result = await api.providers.test(provider.id);
          toast(result.ok ? `连接成功 · HTTP ${result.result.status}` : errorMessage(result), result.ok ? '' : 'error');
        } }),
        el('button', { class: 'text-button', text: '删除', onClick: async () => {
          if (!window.confirm(`删除提供方“${provider.name}”？`)) return;
          const result = await api.providers.remove(provider.id);
          if (!result.ok) return toast(errorMessage(result), 'error');
          state.providers = result;
          renderProviderPill();
          renderProviderSettings();
        } }),
      ]),
    ]));
  });
  root.append(list);
  const form = el('form', { class: 'provider-form' });
  const fields = [
    ['name', '名称', '例如：实验室代理', false],
    ['model', '模型', '例如：gpt-4o-mini', false],
    ['baseUrl', 'Base URL', 'https://api.example.com/v1', true],
    ['apiKey', 'API Key', '仅交给主进程加密保存', true],
  ];
  for (const [name, label, placeholder, wide] of fields) {
    form.append(el('label', { class: wide ? 'wide' : '' }, [
      document.createTextNode(label),
      el('input', { name, placeholder, type: name === 'apiKey' ? 'password' : 'text', autocomplete: 'off', required: name !== 'apiKey' }),
    ]));
  }
  form.append(el('button', { class: 'primary-button wide', type: 'submit', text: '保存提供方' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const result = await api.providers.save(data);
    if (!result.ok) return toast(errorMessage(result, '保存失败'), 'error');
    state.providers = result;
    form.reset();
    renderProviderPill();
    renderProviderSettings();
    toast('提供方已安全保存');
  });
  root.append(form);
}

function renderSettingsSection(id) {
  $$('#settings-nav button').forEach((button) => button.classList.toggle('active', button.dataset.settings === id));
  if (id === 'providers') return renderProviderSettings();
  if (id === 'appearance') return renderAppearanceSettings();
  const content = {
    model: ['模型', '选择当前提供方与模型。真实切换状态会显示在输入区。', [
      ['当前模式', '无 Key 时只使用 L1', activeProvider() ? `L2 · ${activeProvider().model}` : '离线 L1'],
      ['当前提供方', '在“提供方”分区添加和测试', activeProvider()?.name ?? '未配置'],
    ]],
    chat: ['对话', '科研对话保留来源与运行层级。', [
      ['回答策略', '证据不足时明确说明', '证据优先'],
      ['会话范围', '当前项目内隔离', '本地'],
    ]],
    security: ['安全', '敏感数据默认不离开设备。', [
      ['Electron 隔离', 'renderer 无 Node 权限', '已启用'],
      ['Key 存储', '操作系统加密能力', state.providers.secureStorageAvailable ? '可用' : '不可用'],
      ['链接策略', '只允许 HTTP(S)', '已启用'],
    ]],
    memory: ['记忆与上下文', '项目记忆和模型上下文分离。', [
      ['本地画像', '阅读与批注事件形成', '启用'],
      ['远端上传', '仅在 L2 请求时', '按请求'],
      ['证据保留', '原始出处不可静默覆盖', '启用'],
    ]],
    voice: ['语音', '本轮未实现，界面不会放置伪开关。', [['能力状态', '等待真实语音后端', '未配置']]],
    advanced: ['高级', '诊断与实验能力。', [['运行版本', 'R0.6 可信科研纵切', '0.6.0'], ['开发者工具', '生产构建默认关闭', '受控']]],
    notifications: ['通知', '本轮未接入系统通知。', [['能力状态', '不伪装为已启用', '未实现']]],
    billing: ['账单', '只展示提供方真实返回的用量；没有数据时保持未知。', [['本地计费', 'Selenyx 不代收费用', '无'], ['用量', '等待提供方响应', '未知']]],
    gateway: ['网关', '远端网关模式将在连接、鉴权和 WebSocket 探测完成后开放。', [['当前执行边界', '工具和文件操作位置', '本机'], ['远端网关', '尚未配置', '关闭']]],
    plugins: ['插件', '插件只能提交候选结果，不能绕过验证写入可信证据链。', [['已安装插件', '本轮未开放插件市场', '0']]],
    archives: ['已归档对话', '归档会话保留在本地。', [['归档数量', '当前项目', '0']]],
  };
  const [title, description, rows] = content[id] ?? content.model;
  infoSettings(title, description, rows);
}

function openSettings(section = 'model') {
  $('#settings-modal').hidden = false;
  if (state.view === 'browser') api.browser.hide();
  renderSettingsSection(section);
}

function setupSettings() {
  const nav = $('#settings-nav');
  settingsSections.forEach(([id, label, icon], index) => nav.append(el('button', {
    class: index === 0 ? 'active' : '',
    'data-settings': id,
    onClick: () => renderSettingsSection(id),
  }, [el('span', { text: icon }), document.createTextNode(label)])));
}

function setupResizer(resizer, side) {
  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizer.classList.add('dragging');
    resizer.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      if (side === 'left') {
        const value = Math.max(210, Math.min(380, moveEvent.clientX));
        document.documentElement.style.setProperty('--left-width', `${value}px`);
        saveUiValue('selenyx.ui.leftWidth', value);
      } else {
        const value = Math.max(260, Math.min(480, window.innerWidth - moveEvent.clientX));
        document.documentElement.style.setProperty('--right-width', `${value}px`);
        saveUiValue('selenyx.ui.rightWidth', value);
      }
      if (state.view === 'browser') api.browser.setBounds(browserBounds());
    };
    const up = () => {
      resizer.classList.remove('dragging');
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
  });
}

async function boot() {
  loadUiState();
  setupSettings();
  renderRightContent();
  renderReader();
  sites.forEach((site) => $('#browser-site').append(el('option', { value: site.id, text: site.name })));
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#literature-search-form').addEventListener('submit', runSearch);
  $('#collapse-left').addEventListener('click', () => {
    const collapsed = $('#app').classList.toggle('left-collapsed');
    saveUiValue('selenyx.ui.leftCollapsed', collapsed);
    $('#collapse-left').textContent = collapsed ? '›' : '‹';
  });
  $('#toggle-right').addEventListener('click', () => {
    const collapsed = $('#app').classList.toggle('right-collapsed');
    saveUiValue('selenyx.ui.rightCollapsed', collapsed);
  });
  setupResizer($('#left-resizer'), 'left');
  setupResizer($('#right-resizer'), 'right');
  $$('.right-tabs button').forEach((button) => button.addEventListener('click', () => {
    state.rightTab = button.dataset.rightTab;
    $$('.right-tabs button').forEach((item) => item.classList.toggle('active', item === button));
    renderRightContent();
  }));
  $$('[data-reader-action]').forEach((button) => button.addEventListener('click', () => readerAction(button.dataset.readerAction)));
  $('#send-message').addEventListener('click', sendMessage);
  $('#composer-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  $('#composer-input').addEventListener('input', (event) => {
    event.currentTarget.style.height = '';
    event.currentTarget.style.height = `${Math.min(160, event.currentTarget.scrollHeight)}px`;
  });
  $('#provider-pill').addEventListener('click', () => openSettings('providers'));
  $('#open-settings').addEventListener('click', () => openSettings());
  $('#close-settings').addEventListener('click', () => {
    $('#settings-modal').hidden = true;
    if (state.view === 'browser') openBrowser();
  });
  $('#settings-modal').addEventListener('click', (event) => {
    if (event.target === $('#settings-modal')) $('#close-settings').click();
  });
  $('#browser-site').addEventListener('change', (event) => {
    const site = sites.find((item) => item.id === event.target.value);
    if (site) $('#browser-url').value = site.url;
  });
  $('#browser-go').addEventListener('click', openBrowser);
  $('#browser-url').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openBrowser();
  });
  $('#browser-external').addEventListener('click', () => api.browser.openExternal(resolveBrowserInput($('#browser-url').value)));
  api.browser.onStatus(renderBrowserStatus);
  window.addEventListener('resize', () => {
    if (state.view === 'browser') api.browser.setBounds(browserBounds());
  });

  const [health, skillResponse] = await Promise.all([api.health(), api.listSkills()]);
  if (health.ok) {
    $('#runtime-badge').className = 'status-badge ready';
    $('#runtime-badge').textContent = health.secureStorageAvailable ? '本地核心就绪' : '核心就绪 · 安全存储不可用';
  } else {
    $('#runtime-badge').className = 'status-badge error';
    $('#runtime-badge').textContent = '核心自检失败';
  }
  if (skillResponse.ok) {
    state.skills = skillResponse.skills;
    renderSkills();
  }
  await refreshProviders();
  setView('research');
}

boot().catch((error) => {
  $('#runtime-badge').className = 'status-badge error';
  $('#runtime-badge').textContent = '启动失败';
  toast(`启动失败：${error.message}`, 'error');
});
