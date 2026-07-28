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

const APP_VERSION = '0.8.0-rc.1';
let mainWindow = null;
let browserView = null;
let browserLoadTimer = null;
let moduleCache = null;
const captureArgument = process.argv.find((item) => item.startsWith('--capture-ui='));
const captureDirectory = captureArgument ? path.resolve(captureArgument.slice('--capture-ui='.length)) : null;

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
  const root = engineRoot();
  const [skills, profile, search, registry, workspace, providers, urlPolicy] = await Promise.all([
    import(pathToFileURL(path.join(root, 'skills', 'index.js')).href),
    import(pathToFileURL(path.join(root, 'scholar', 'profile.js')).href),
    import(pathToFileURL(path.join(root, 'research', 'search.js')).href),
    import(pathToFileURL(path.join(root, 'research', 'sourceRegistry.js')).href),
    import(pathToFileURL(path.join(root, 'research', 'workspace.js')).href),
    import(pathToFileURL(path.join(root, 'providers', 'profiles.js')).href),
    import(pathToFileURL(path.join(root, 'security', 'urlPolicy.js')).href),
  ]);
  moduleCache = { skills, profile, search, registry, workspace, providers, urlPolicy };
  return moduleCache;
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

function closeBrowserView() {
  if (browserLoadTimer) clearTimeout(browserLoadTimer);
  browserLoadTimer = null;
  if (mainWindow && browserView) mainWindow.contentView.removeChildView(browserView);
  if (browserView && !browserView.webContents.isDestroyed()) browserView.webContents.close();
  browserView = null;
}

function ensureBrowserView() {
  if (browserView) return browserView;
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
  browserView.webContents.on('did-start-loading', () => {
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
  return browserView;
}

function validateBounds(payload = {}) {
  const bounds = {
    x: Math.max(0, Math.trunc(Number(payload.x) || 0)),
    y: Math.max(0, Math.trunc(Number(payload.y) || 0)),
    width: Math.max(320, Math.trunc(Number(payload.width) || 320)),
    height: Math.max(240, Math.trunc(Number(payload.height) || 240)),
  };
  const content = mainWindow?.getContentBounds();
  if (content) {
    bounds.width = Math.min(bounds.width, Math.max(320, content.width - bounds.x));
    bounds.height = Math.min(bounds.height, Math.max(240, content.height - bounds.y));
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
    const { skills } = await modules();
    const skill = skills.getSkill(payload.id);
    if (!skill) throw new TypeError(`unknown skill: ${payload.id}`);
    // Desktop never accepts a renderer-provided provider object or Key.
    return { ok: true, result: await skill.fn(payload.input) };
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

  registerHandle('literature:search', async (_event, payload = {}) => {
    const query = String(payload.query ?? '').trim();
    if (!query) throw new TypeError('search query is required');
    const { search, registry } = await modules();
    const requested = [...new Set(Array.isArray(payload.sources) && payload.sources.length
      ? payload.sources.map(String) : ['openalex', 'pubmed', 'crossref'])];
    const known = requested.filter((id) => registry.getSourceMeta(id));
    const settled = await Promise.allSettled(known.map((id) => registry.searchSource(id, query, {
      limit: payload.limit, page: payload.page,
    })));
    const records = [];
    const sourceResults = [];
    const errors = [];
    const links = [];
    settled.forEach((entry, index) => {
      const source = known[index];
      if (entry.status === 'rejected') {
        const error = entry.reason;
        errors.push({
          source, name: error?.name ?? 'Error', message: String(error?.message ?? error),
          code: error?.code ?? 'SEARCH_FAILED', status: Number.isInteger(error?.status) ? error.status : null,
        });
        sourceResults.push({ source, status: error?.status === 429 ? 'rate-limited' : 'failed', httpStatus: error?.status ?? null, count: 0, error: String(error?.message ?? error) });
        return;
      }
      const value = entry.value;
      if (value.kind === 'link') {
        const link = { ...value };
        links.push(link);
        sourceResults.push({ source, status: 'site-link', httpStatus: null, count: 0, error: null, audit: { provider: source, mode: link.mode, url: link.url, honesty: link.honesty } });
        return;
      }
      records.push(...(value.records ?? []));
      sourceResults.push({
        source, status: value.records?.length ? 'complete' : 'zero', httpStatus: value.audit?.httpStatus ?? null,
        count: value.records?.length ?? 0, total: value.total ?? 0, error: null, audit: value.audit ?? null,
      });
    });
    return { ok: true, result: {
      query, sources: known, records: search.deduplicateRecords(records), sourceResults, errors, links,
      isPartial: errors.length > 0 && sourceResults.some((item) => ['complete', 'zero'].includes(item.status)),
      isFailure: errors.length > 0 && !sourceResults.some((item) => ['complete', 'zero'].includes(item.status)),
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
    view.setBounds(validateBounds(payload.bounds));
    browserLoadTimer = setTimeout(() => {
      notifyBrowser({
        state: 'blocked',
        url,
        message: '站点长时间没有完成加载，可能受登录、网络或站点策略限制。',
        workaround: 'open-external',
      });
    }, 15_000);
    await view.webContents.loadURL(url);
    return { ok: true, url };
  });

  registerHandle('browser:bounds', async (_event, payload = {}) => {
    if (browserView) browserView.setBounds(validateBounds(payload));
    return { ok: true };
  });

  registerHandle('browser:hide', async () => {
    closeBrowserView();
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
      for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
        mainWindow.setSize(width, height);
        await new Promise((resolve) => setTimeout(resolve, 450));
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.join(captureDirectory, 'selenyx-r08-' + width + 'x' + height + '.png'), image.toPNG());
      }
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
