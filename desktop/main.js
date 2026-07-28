const {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  ipcMain,
  safeStorage,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_VERSION = '0.8.0-rc.3';
let mainWindow = null;
let browserView = null;
let browserLoadTimer = null;
let browserViewAttached = false;
let browserNavigationId = 0;
let browserCurrentUrl = '';
let moduleCache = null;
let modulePromise = null;
const captureArgument = process.argv.find((item) => item.startsWith('--capture-ui='));
const captureDirectory = captureArgument ? path.resolve(captureArgument.slice('--capture-ui='.length)) : null;
const captureViewArgument = process.argv.find((item) => item.startsWith('--capture-view='));
const captureView = captureViewArgument ? captureViewArgument.slice('--capture-view='.length) : 'research';
const captureSearchArgument = process.argv.find((item) => item.startsWith('--capture-search='));
const captureSearch = captureSearchArgument ? decodeURIComponent(captureSearchArgument.slice('--capture-search='.length)) : null;
const verifyLayoutArgument = process.argv.find((item) => item.startsWith('--verify-browser-layout='));
const verifyLayoutFile = verifyLayoutArgument ? path.resolve(verifyLayoutArgument.slice('--verify-browser-layout='.length)) : null;
const verifyBrowserArgument = process.argv.find((item) => item.startsWith('--verify-browser-url='));
const verifyBrowserUrl = verifyBrowserArgument ? decodeURIComponent(verifyBrowserArgument.slice('--verify-browser-url='.length)) : null;

function engineRoot() {
  return app.isPackaged
    ? path.join(__dirname, 'engine')
    : path.join(__dirname, '..', 'src');
}

function dataPaths() {
  const root = app.getPath('userData');
  return {
    root,
    profile: path.join(root, 'profile.json'),
    providers: path.join(root, 'providers.json'),
    workspace: path.join(root, 'workspace.json'),
  };
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}

async function modules() {
  if (moduleCache) return moduleCache;
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const root = engineRoot();
    const [skills, profile, search, registry, workspace, providers, urlPolicy, assistant] = await Promise.all([
      import(pathToFileURL(path.join(root, 'skills', 'index.js')).href),
      import(pathToFileURL(path.join(root, 'scholar', 'profile.js')).href),
      import(pathToFileURL(path.join(root, 'research', 'search.js')).href),
      import(pathToFileURL(path.join(root, 'research', 'sourceRegistry.js')).href),
      import(pathToFileURL(path.join(root, 'research', 'workspace.js')).href),
      import(pathToFileURL(path.join(root, 'providers', 'profiles.js')).href),
      import(pathToFileURL(path.join(root, 'security', 'urlPolicy.js')).href),
      import(pathToFileURL(path.join(root, 'research', 'assistant.js')).href),
    ]);
    moduleCache = { skills, profile, search, registry, workspace, providers, urlPolicy, assistant };
    return moduleCache;
  })();
  try {
    return await modulePromise;
  } finally {
    if (!moduleCache) modulePromise = null;
  }
}

function publicError(error) {
  return {
    ok: false,
    error: {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
      code: error?.code ?? 'UNEXPECTED_ERROR',
      status: Number.isInteger(error?.status) ? error.status : null,
      details: typeof error?.details === 'string' ? error.details.slice(0, 1_000) : null,
    },
  };
}

function registerHandle(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return await handler(event, payload);
    } catch (error) {
      return publicError(error);
    }
  });
}

function encryptedKey(apiKey) {
  if (!apiKey) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    const error = new Error('系统凭据加密当前不可用，API Key 未保存');
    error.code = 'SECURE_STORAGE_UNAVAILABLE';
    throw error;
  }
  return safeStorage.encryptString(String(apiKey)).toString('base64');
}

function decryptKey(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    const error = new Error('系统凭据加密当前不可用，无法读取 API Key');
    error.code = 'SECURE_STORAGE_UNAVAILABLE';
    throw error;
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function providerState() {
  const raw = readJson(dataPaths().providers, { activeId: null, profiles: [] });
  return {
    activeId: typeof raw.activeId === 'string' ? raw.activeId : null,
    profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
  };
}

function publicProviderState(state = providerState()) {
  return {
    activeId: state.activeId,
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
    profiles: state.profiles.map(({ encryptedApiKey, ...profile }) => ({
      ...profile,
      hasKey: Boolean(encryptedApiKey),
      keyHint: encryptedApiKey ? '••••••••' : '',
    })),
  };
}

function saveProviderState(state) {
  writeJsonAtomic(dataPaths().providers, state);
}

function notifyBrowser(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:status', status);
}

function detachBrowserView() {
  if (browserLoadTimer) clearTimeout(browserLoadTimer);
  browserLoadTimer = null;
  if (mainWindow && browserView && browserViewAttached) mainWindow.contentView.removeChildView(browserView);
  browserViewAttached = false;
}

function closeBrowserView() {
  detachBrowserView();
  if (browserView && !browserView.webContents.isDestroyed()) browserView.webContents.close();
  browserView = null;
  browserCurrentUrl = '';
}

function ensureBrowserView() {
  if (browserView) {
    if (!browserViewAttached) {
      mainWindow.contentView.addChildView(browserView);
      browserViewAttached = true;
    }
    return browserView;
  }
  browserView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  browserView.setBackgroundColor('#fbfaf7');
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    modules()
      .then(({ urlPolicy }) => shell.openExternal(urlPolicy.validateExternalUrl(url)))
      .catch(() => {});
    return { action: 'deny' };
  });
  const markBrowserReady = () => {
    if (!browserViewAttached) return;
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    const url = browserView?.webContents?.getURL();
    if (url && url !== 'about:blank') notifyBrowser({ state: 'ready', url });
  };
  browserView.webContents.on('dom-ready', markBrowserReady);
  browserView.webContents.on('did-stop-loading', markBrowserReady);
  browserView.webContents.on('did-start-loading', () => {
    if (!browserViewAttached) return;
    notifyBrowser({ state: 'loading', url: browserView.webContents.getURL() });
  });
  browserView.webContents.on('did-finish-load', () => {
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    notifyBrowser({ state: 'ready', url: browserView.webContents.getURL() });
  });
  browserView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    notifyBrowser({
      state: 'blocked',
      url: validatedURL,
      errorCode,
      message: errorDescription,
      workaround: 'open-external',
    });
  });
  mainWindow.contentView.addChildView(browserView);
  browserViewAttached = true;
  return browserView;
}

function validateBounds(payload = {}) {
  const bounds = {
    x: Math.max(0, Math.trunc(Number(payload.x) || 0)),
    y: Math.max(0, Math.trunc(Number(payload.y) || 0)),
    width: Math.max(1, Math.trunc(Number(payload.width) || 1)),
    height: Math.max(1, Math.trunc(Number(payload.height) || 1)),
  };
  const content = mainWindow?.getContentBounds();
  if (content) {
    bounds.width = Math.min(bounds.width, Math.max(1, content.width - bounds.x));
    bounds.height = Math.min(bounds.height, Math.max(1, content.height - bounds.y));
  }
  return bounds;
}

function registerIpc() {
  registerHandle('app:health', async () => ({
    ok: true,
    version: APP_VERSION,
    platform: process.platform,
    packaged: app.isPackaged,
    online: true,
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  }));

  registerHandle('skill:list', async () => {
    const { skills } = await modules();
    return { ok: true, skills: skills.listSkills() };
  });

  registerHandle('skill:run', async (_event, payload = {}) => {
    if (typeof payload.id !== 'string') throw new TypeError('skill id is required');
    const { skills, providers } = await modules();
    const skill = skills.getSkill(payload.id);
    if (!skill) throw new TypeError(`unknown skill: ${payload.id}`);
    // Desktop never accepts a renderer-provided provider object or Key.
    if (skill.family === 'nature') {
      if (skill.mode === 'l1') {
        return { ok: true, result: { type: 'text', level: 'L1', text: skills.executeNatureL1(skill.id, payload.input) } };
      }
      if (skill.mode === 'route') {
        return { ok: true, result: { type: 'route', route: skill.route, message: skill.desc } };
      }
      if (skill.mode === 'external') {
        return { ok: true, result: { type: 'unavailable', code: 'EXTERNAL_RUNTIME_REQUIRED', message: skill.desc, requirements: skill.requirements ?? [] } };
      }
      const current = providerState();
      const stored = current.profiles.find((item) => item.id === current.activeId);
      if (!stored) {
        const error = new Error('此 Nature 技能需要模型增强；请先在“提供方”中配置并启用本地 BYOK 模型');
        error.code = 'NO_PROVIDER';
        throw error;
      }
      const { encryptedApiKey, ...profile } = stored;
      const response = await providers.chatWithProvider(
        profile, decryptKey(encryptedApiKey), skills.buildNatureMessages(skill.id, payload.input),
        { temperature: 0.2, maxTokens: 4_096 },
      );
      return { ok: true, result: { type: 'text', level: 'L2', text: response.content, model: response.model } };
    }
    if (typeof skill.fn !== 'function') {
      return { ok: true, result: { type: 'route', route: 'reader', message: skill.desc } };
    }
    return { ok: true, result: { type: 'text', level: 'L1', text: await skill.fn(payload.input) } };
  });

  registerHandle('profile:read', async () => {
    const { profile } = await modules();
    return {
      ok: true,
      profile: readJson(dataPaths().profile, profile.emptyProfile()),
    };
  });

  registerHandle('profile:event', async (_event, event) => {
    const { profile } = await modules();
    const current = readJson(dataPaths().profile, profile.emptyProfile());
    writeJsonAtomic(dataPaths().profile, profile.applyEvent(current, event));
    return { ok: true };
  });

  registerHandle('assistant:plan', async (_event, payload = {}) => {
    const { assistant } = await modules();
    return { ok: true, plan: assistant.buildResearchPlan(payload.question, payload.context) };
  });

  registerHandle('assistant:update', async (_event, payload = {}) => {
    const { assistant } = await modules();
    return { ok: true, plan: assistant.updateResearchPlan(payload.plan, payload.taskId, payload.status) };
  });
  registerHandle('literature:search', async (event, payload = {}) => {
    const query = String(payload.query ?? '').trim();
    if (!query) throw new TypeError('search query is required');
    const requestId = String(payload.requestId ?? 'search');
    const { search, registry } = await modules();
    const requested = [...new Set(Array.isArray(payload.sources) && payload.sources.length
      ? payload.sources.map(String) : ['openalex', 'pubmed', 'crossref'])];
    const known = requested.filter((id) => registry.getSourceMeta(id));
    const progress = (source, status, extra = {}) => {
      if (!event.sender.isDestroyed()) event.sender.send('literature:status', {
        requestId, query, source, status, ...extra,
      });
    };
    const completed = await Promise.all(known.map(async (id) => {
      const startedAt = Date.now();
      progress(id, 'searching');
      try {
        const value = await registry.searchSource(id, query, {
          limit: payload.limit,
          page: payload.page,
          timeoutMs: payload.timeoutMs,
          maxAttempts: payload.maxAttempts,
          matchMode: payload.matchMode ?? 'auto',
        });
        const status = value.kind === 'link' ? 'site-link' : value.records?.length ? 'complete' : 'zero';
        progress(id, status, { count: value.records?.length ?? 0, latencyMs: Date.now() - startedAt });
        return { source: id, value, latencyMs: Date.now() - startedAt };
      } catch (error) {
        const meta = registry.getSourceMeta(id);
        const status = error?.code === 'TIMEOUT' ? 'timeout'
          : error?.status === 429 ? 'rate-limited'
            : meta?.access === 'key' && [401, 403].includes(error?.status) ? 'requires-key'
              : 'failed';
        progress(id, status, {
          latencyMs: Date.now() - startedAt,
          httpStatus: error?.status ?? null,
          error: String(error?.message ?? error),
        });
        return { source: id, error, latencyMs: Date.now() - startedAt };
      }
    }));
    const records = [];
    const sourceResults = [];
    const errors = [];
    const links = [];
    for (const entry of completed) {
      const source = entry.source;
      if (entry.error) {
        const error = entry.error;
        const meta = registry.getSourceMeta(source);
        const status = error?.code === 'TIMEOUT' ? 'timeout'
          : error?.status === 429 ? 'rate-limited'
            : meta?.access === 'key' && [401, 403].includes(error?.status) ? 'requires-key'
              : 'failed';
        errors.push({
          source, name: error?.name ?? 'Error', message: String(error?.message ?? error),
          code: error?.code ?? 'SEARCH_FAILED', status: Number.isInteger(error?.status) ? error.status : null,
        });
        sourceResults.push({ source, status, httpStatus: error?.status ?? null, count: 0, error: String(error?.message ?? error), latencyMs: entry.latencyMs });
        continue;
      }
      const value = entry.value;
      if (value.kind === 'link') {
        const link = { ...value };
        links.push(link);
        sourceResults.push({ source, status: 'site-link', httpStatus: null, count: 0, error: null, latencyMs: entry.latencyMs, audit: { provider: source, mode: link.mode, url: link.url, honesty: link.honesty } });
        continue;
      }
      records.push(...(value.records ?? []));
      sourceResults.push({
        source, status: value.records?.length ? 'complete' : 'zero', httpStatus: value.audit?.httpStatus ?? null,
        count: value.records?.length ?? 0, total: value.matchMode === 'exact-title' ? value.records?.length ?? 0 : value.total ?? 0, rawCount: value.rawCount ?? value.records?.length ?? 0, matchMode: value.matchMode ?? 'broad', error: null, latencyMs: entry.latencyMs, audit: value.audit ?? null,
      });
    }
    const successful = sourceResults.some((item) => ['complete', 'zero'].includes(item.status));
    return { ok: true, result: {
      requestId, query, sources: known, records: search.deduplicateRecords(records), sourceResults, errors, links,
      isPartial: errors.length > 0 && successful,
      isFailure: errors.length > 0 && !successful,
    } };
  });

  registerHandle('literature:sources', async () => {
    const { registry } = await modules();
    return { ok: true, sources: registry.listAllSources() };
  });

  registerHandle('workspace:read', async () => {
    const { workspace } = await modules();
    return { ok: true, workspace: workspace.normalizeWorkspace(readJson(dataPaths().workspace, workspace.emptyWorkspace())) };
  });

  registerHandle('workspace:event', async (_event, event = {}) => {
    const { workspace } = await modules();
    const current = workspace.normalizeWorkspace(readJson(dataPaths().workspace, workspace.emptyWorkspace()));
    const applied = workspace.applyWorkspaceEvent(current, event);
    writeJsonAtomic(dataPaths().workspace, applied.state);
    return { ok: true, workspace: applied.state, result: applied.result };
  });

  registerHandle('provider:list', async () => ({ ok: true, ...publicProviderState() }));

  registerHandle('provider:save', async (_event, payload = {}) => {
    const { providers } = await modules();
    const current = providerState();
    const existing = current.profiles.find((item) => item.id === payload.id);
    const normalized = providers.normalizeProviderProfile({
      ...payload,
      id: payload.id || existing?.id,
      credentialRef: payload.id || existing?.credentialRef,
      createdAt: existing?.createdAt,
    });
    const stored = {
      ...normalized,
      encryptedApiKey: typeof payload.apiKey === 'string' && payload.apiKey
        ? encryptedKey(payload.apiKey)
        : existing?.encryptedApiKey ?? null,
    };
    const profiles = current.profiles.filter((item) => item.id !== stored.id);
    profiles.push(stored);
    const next = { activeId: current.activeId ?? stored.id, profiles };
    saveProviderState(next);
    return { ok: true, ...publicProviderState(next) };
  });

  registerHandle('provider:delete', async (_event, payload = {}) => {
    const id = String(payload.id ?? '');
    const current = providerState();
    const profiles = current.profiles.filter((item) => item.id !== id);
    const next = {
      activeId: current.activeId === id ? (profiles[0]?.id ?? null) : current.activeId,
      profiles,
    };
    saveProviderState(next);
    return { ok: true, ...publicProviderState(next) };
  });

  registerHandle('provider:activate', async (_event, payload = {}) => {
    const id = String(payload.id ?? '');
    const current = providerState();
    if (!current.profiles.some((item) => item.id === id)) throw new TypeError('provider not found');
    const next = { ...current, activeId: id };
    saveProviderState(next);
    return { ok: true, ...publicProviderState(next) };
  });

  registerHandle('provider:test', async (_event, payload = {}) => {
    const current = providerState();
    const stored = current.profiles.find((item) => item.id === payload.id);
    if (!stored) throw new TypeError('provider not found');
    const { encryptedApiKey, ...profile } = stored;
    const { providers } = await modules();
    const result = await providers.testProviderConnection(profile, decryptKey(encryptedApiKey));
    return { ok: true, result };
  });

  registerHandle('provider:chat', async (_event, payload = {}) => {
    const current = providerState();
    const stored = current.profiles.find((item) => item.id === (payload.id || current.activeId));
    if (!stored) {
      const error = new Error('未配置可用模型；当前只能使用离线 L1');
      error.code = 'NO_PROVIDER';
      throw error;
    }
    const { encryptedApiKey, ...profile } = stored;
    const { providers } = await modules();
    const result = await providers.chatWithProvider(
      profile,
      decryptKey(encryptedApiKey),
      payload.messages,
      { temperature: payload.temperature, maxTokens: payload.maxTokens },
    );
    return { ok: true, result };
  });

  registerHandle('browser:show', async (_event, payload = {}) => {
    if (!mainWindow) throw new Error('window is unavailable');
    const { urlPolicy } = await modules();
    const url = urlPolicy.validateBrowserUrl(payload.url);
    const view = ensureBrowserView();
    const navigationId = ++browserNavigationId;
    browserCurrentUrl = url;
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    view.setBounds(validateBounds(payload.bounds));
    notifyBrowser({ state: 'loading', url, navigationId });
    browserLoadTimer = setTimeout(() => {
      if (navigationId !== browserNavigationId || !browserViewAttached) return;
      detachBrowserView();
      notifyBrowser({
        state: 'blocked',
        url,
        navigationId,
        message: '站点长时间没有完成加载。可能是网络、登录、验证码或站点策略限制，已停止等待。',
        workaround: 'open-external',
      });
    }, 30_000);
    if (view.webContents.getURL() === url && !view.webContents.isLoading()) {
      clearTimeout(browserLoadTimer);
      browserLoadTimer = null;
      notifyBrowser({ state: 'ready', url, navigationId });
    } else {
      view.webContents.loadURL(url).catch((error) => {
        if (navigationId !== browserNavigationId || view.webContents.isDestroyed()) return;
        detachBrowserView();
        notifyBrowser({
          state: 'blocked', url, navigationId, message: error.message, workaround: 'open-external',
        });
      });
    }
    return { ok: true, url, navigationId };
  });

  registerHandle('browser:bounds', async (_event, payload = {}) => {
    if (browserView) browserView.setBounds(validateBounds(payload));
    return { ok: true };
  });

  registerHandle('browser:hide', async () => {
    detachBrowserView();
    return { ok: true };
  });

  registerHandle('external:open', async (_event, payload = {}) => {
    const { urlPolicy } = await modules();
    const url = urlPolicy.validateExternalUrl(payload.url);
    await shell.openExternal(url);
    return { ok: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: !captureDirectory,
    title: 'Selenyx — 科研助手',
    backgroundColor: '#fbfaf7',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer-gone] ${details.reason} (${details.exitCode})`);
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    modules()
      .then(({ urlPolicy }) => shell.openExternal(urlPolicy.validateExternalUrl(url)))
      .catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.on('resize', () => notifyBrowser({ state: 'needs-bounds' }));
  mainWindow.on('closed', () => {
    closeBrowserView();
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch(() => {
    mainWindow?.loadFile(path.join(__dirname, 'renderer', 'fatal.html'));
  });
  if (captureDirectory) {
    mainWindow.webContents.once('did-finish-load', async () => {
      fs.mkdirSync(captureDirectory, { recursive: true });
      let runtimeState = 'pending';
      for (let attempt = 0; attempt < 150; attempt += 1) {
        runtimeState = await mainWindow.webContents.executeJavaScript("document.querySelector('#runtime-badge')?.className || 'missing'");
        if (/ready|error/.test(runtimeState)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const captureDiagnostics = await mainWindow.webContents.executeJavaScript(`(async () => {
        const timed = (name, promise) => Promise.race([
          promise.then((value) => ({ name, state: 'resolved', value })),
          new Promise((resolve) => setTimeout(() => resolve({ name, state: 'timeout' }), 1500)),
        ]);
        return Promise.all([
          timed('health', window.selenyx.health()),
          timed('workspace', window.selenyx.readWorkspace()),
          timed('sources', window.selenyx.listSources()),
          timed('skills', window.selenyx.listSkills()),
        ]);
      })()`);
      fs.writeFileSync(
        path.join(captureDirectory, 'runtime-diagnostics.json'),
        JSON.stringify(captureDiagnostics, null, 2),
        'utf8'
      );

      if (captureView !== 'research') {
        await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-view="${captureView}"]')?.click()`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (captureView === 'skills') {
        await mainWindow.webContents.executeJavaScript(`(() => {
          const input = document.querySelector('#assistant-brief');
          input.value = '梳理生成式 AI 对科研写作可靠性的影响，并找出相互矛盾的证据';
          document.querySelector('#assistant-create').click();
        })()`);
        for (let attempt = 0; attempt < 50; attempt += 1) {
          const ready = await mainWindow.webContents.executeJavaScript("!document.querySelector('#assistant-workspace').hidden");
          if (ready) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (verifyBrowserUrl) {
        await mainWindow.webContents.executeJavaScript("document.querySelector('[data-view=\"browser\"]').click()");
        await new Promise((resolve) => setTimeout(resolve, 250));
        const browserResult = await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('#browser-homepage').hidden = true;
          const host = document.querySelector('#browser-host');
          host.hidden = false;
          const rect = host.getBoundingClientRect();
          return window.selenyx.browser.show({
            url: ${JSON.stringify(verifyBrowserUrl)},
            bounds: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          });
        })()`);
        let browserState = 'loading';
        for (let attempt = 0; attempt < 350; attempt += 1) {
          browserState = await mainWindow.webContents.executeJavaScript("document.querySelector('#browser-status').hidden ? 'ready' : document.querySelector('#browser-status h3')?.textContent || 'loading'");
          if (browserState === 'ready' || /无法|限制|失败/.test(browserState)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const browserVerification = {
          requestedUrl: verifyBrowserUrl,
          ipc: browserResult,
          state: browserState,
          currentUrl: browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : null,
          attached: browserViewAttached,
          bounds: browserView?.getBounds() ?? null,
        };
        const hostname = new URL(verifyBrowserUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
        fs.writeFileSync(path.join(captureDirectory, `browser-${hostname}.json`), JSON.stringify(browserVerification, null, 2), 'utf8');
        detachBrowserView();
      }

      if (verifyLayoutFile) {
        await mainWindow.webContents.executeJavaScript("document.querySelector('[data-view=\"browser\"]').click()");
        await new Promise((resolve) => setTimeout(resolve, 250));
        const initialRect = await mainWindow.webContents.executeJavaScript(`(() => {
          document.querySelector('#browser-homepage').hidden = true;
          const host = document.querySelector('#browser-host');
          host.hidden = false;
          const rect = host.getBoundingClientRect();
          return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
        })()`);
        const view = ensureBrowserView();
        view.setBounds(validateBounds(initialRect));
        await mainWindow.webContents.executeJavaScript("document.documentElement.style.setProperty('--left-width', '340px'); document.dispatchEvent(new Event('selenyx:layout'))");
        await new Promise((resolve) => setTimeout(resolve, 450));
        const afterLeftRect = await mainWindow.webContents.executeJavaScript(`(() => {
          const rect = document.querySelector('#browser-host').getBoundingClientRect();
          return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
        })()`);
        const afterLeftNative = browserView.getBounds();
        await mainWindow.webContents.executeJavaScript("document.documentElement.style.setProperty('--right-width', '400px'); document.dispatchEvent(new Event('selenyx:layout'))");
        await new Promise((resolve) => setTimeout(resolve, 450));
        const afterRightRect = await mainWindow.webContents.executeJavaScript(`(() => {
          const rect = document.querySelector('#browser-host').getBoundingClientRect();
          return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
        })()`);
        const afterRightNative = browserView.getBounds();
        const layoutVerification = {
          initialRect,
          afterLeftRect,
          afterLeftNative,
          afterRightRect,
          afterRightNative,
          leftChanged: initialRect.x !== afterLeftRect.x && initialRect.width !== afterLeftRect.width,
          rightChanged: afterLeftRect.width !== afterRightRect.width,
          nativeMatchesLeft: JSON.stringify(afterLeftRect) === JSON.stringify(afterLeftNative),
          nativeMatchesRight: JSON.stringify(afterRightRect) === JSON.stringify(afterRightNative),
        };
        fs.mkdirSync(path.dirname(verifyLayoutFile), { recursive: true });
        fs.writeFileSync(verifyLayoutFile, JSON.stringify(layoutVerification, null, 2), 'utf8');
        detachBrowserView();
      }

      if (captureSearch) {
        await mainWindow.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-view="research"]').click();
          document.querySelector('#literature-query').value = ${JSON.stringify(captureSearch)};
          document.querySelector('#search-mode').value = 'broad';
          document.querySelector('#literature-search-form button').click();
        })()`);
        for (let attempt = 0; attempt < 400; attempt += 1) {
          const settled = await mainWindow.webContents.executeJavaScript("!document.querySelector('#literature-search-form button').disabled && document.querySelector('#search-audit').textContent.includes('条可收藏记录')");
          if (settled) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const searchVerification = await mainWindow.webContents.executeJavaScript(`({
          audit: document.querySelector('#search-audit').textContent,
          statuses: [...document.querySelectorAll('#source-statuses .source-status')].map((node) => node.textContent),
          titles: [...document.querySelectorAll('#search-results .result-card h3')].map((node) => node.textContent),
          resultCards: document.querySelectorAll('#search-results .result-card').length,
          runtime: document.querySelector('#runtime-badge').textContent,
        })`);
        fs.writeFileSync(path.join(captureDirectory, 'search-verification.json'), JSON.stringify(searchVerification, null, 2), 'utf8');
      }

      for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
        mainWindow.setSize(width, height);
        await new Promise((resolve) => setTimeout(resolve, 350));
        const image = await mainWindow.webContents.capturePage();
        const suffix = captureSearch ? '-search' : captureView === 'research' ? '' : '-' + captureView;
        fs.writeFileSync(path.join(captureDirectory, 'selenyx-r08' + suffix + '-' + width + 'x' + height + '.png'), image.toPNG());
      }
      fs.writeFileSync(path.join(captureDirectory, 'runtime-state.txt'), runtimeState, 'utf8');
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
