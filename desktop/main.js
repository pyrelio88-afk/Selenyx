const {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  ipcMain,
  safeStorage,
  shell,
  dialog,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { normalizeProjectId, projectDirFor } = require('./projectPaths.cjs');

const APP_VERSION = '0.9.1-rc.1';
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
const verifyCustomSite = process.argv.includes('--verify-custom-site');
const verifyResearchProject = process.argv.includes('--verify-research-project');
const captureProjectModal = process.argv.includes('--capture-project-modal');
const verifyPdfArgument = process.argv.find((item) => item.startsWith('--verify-reader-pdf='));
const verifyPdfFile = verifyPdfArgument ? path.resolve(verifyPdfArgument.slice('--verify-reader-pdf='.length)) : null;

if (captureDirectory) {
  fs.mkdirSync(captureDirectory, { recursive: true });
  app.setPath('userData', path.join(captureDirectory, '.user-data'));
}

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
    projectsIndex: path.join(root, 'projects.json'),
    projectsDir: path.join(root, 'projects'),
    projectsTrashDir: path.join(root, 'project-trash'),
    // legacy single-file workspace (migrated on first boot)
    workspace: path.join(root, 'workspace.json'),
  };
}

function emptyProjectsIndex() {
  return { schemaVersion: 1, activeId: null, projects: [] };
}

function normalizeProjectsIndex(raw) {
  const base = emptyProjectsIndex();
  const src = raw && typeof raw === 'object' ? raw : {};
  const projects = Array.isArray(src.projects)
    ? src.projects.map((item) => ({
      id: normalizeProjectId(item?.id),
      name: String(item?.name || '未命名项目').trim().slice(0, 120) || '未命名项目',
      createdAt: String(item?.createdAt || new Date().toISOString()),
      updatedAt: String(item?.updatedAt || item?.createdAt || new Date().toISOString()),
    })).filter((item) => item.id)
    : [];
  let activeId = typeof src.activeId === 'string' ? src.activeId : null;
  if (activeId && !projects.some((item) => item.id === activeId)) activeId = projects[0]?.id || null;
  return { ...base, activeId, projects };
}

function ensureProjectsIndex() {
  const paths = dataPaths();
  fs.mkdirSync(paths.projectsDir, { recursive: true });
  let index = normalizeProjectsIndex(readJson(paths.projectsIndex, null));

  // Migrate legacy workspace.json into first project once.
  if (!index.projects.length) {
    const legacy = paths.workspace;
    const id = crypto.randomUUID();
    const projectDir = projectDirFor(paths.projectsDir, id);
    fs.mkdirSync(projectDir, { recursive: true });
    const target = path.join(projectDir, 'workspace.json');
    if (fs.existsSync(legacy)) {
      try {
        fs.copyFileSync(legacy, target);
      } catch {
        // fall through to empty
      }
    }
    if (!fs.existsSync(target)) {
      // written later when workspace module available; placeholder empty object
      writeJsonAtomic(target, { schemaVersion: 1, meta: { name: '默认项目', createdAt: new Date().toISOString() }, library: [], annotations: [], evidence: [], assistant: { plan: null, history: [] }, drafts: { writing: '', figureBrief: '', experimentLog: '' }, sourcePreferences: { international: ['openalex', 'pubmed', 'crossref'], searchTab: 'china' }, ui: { leftWidth: 232, rightWidth: 304, leftCollapsed: false, rightCollapsed: false, lastView: 'question', selectedSourceId: null, readerState: {}, browserSites: [], browserFavorites: [], browserRecent: [] }, updatedAt: new Date().toISOString() });
    }
    index = {
      schemaVersion: 1,
      activeId: id,
      projects: [{ id, name: '默认项目', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    };
    writeJsonAtomic(paths.projectsIndex, index);
  }

  if (!index.activeId && index.projects[0]) {
    index.activeId = index.projects[0].id;
    writeJsonAtomic(paths.projectsIndex, index);
  }
  return index;
}

function activeWorkspacePath() {
  const paths = dataPaths();
  const index = ensureProjectsIndex();
  const id = index.activeId || index.projects[0]?.id;
  if (!id) throw new Error('没有可用项目');
  const dir = projectDirFor(paths.projectsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'workspace.json');
}

function listProjectsPublic() {
  const index = ensureProjectsIndex();
  return {
    ok: true,
    activeId: index.activeId,
    projects: index.projects.map((item) => ({ ...item, active: item.id === index.activeId })),
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
    if (url && url !== 'about:blank') {
      browserCurrentUrl = url;
      notifyBrowser({ state: 'ready', url, title: browserView.webContents.getTitle() });
    }
  };
  browserView.webContents.on('dom-ready', markBrowserReady);
  browserView.webContents.on('did-stop-loading', markBrowserReady);
  browserView.webContents.on('page-title-updated', (_event, title) => {
    if (!browserViewAttached) return;
    notifyBrowser({ state: 'ready', url: browserView.webContents.getURL(), title });
  });
  browserView.webContents.on('did-navigate', (_event, url) => {
    browserCurrentUrl = url;
    if (browserViewAttached) notifyBrowser({ state: 'loading', url, title: browserView.webContents.getTitle() });
  });
  browserView.webContents.on('did-start-loading', () => {
    if (!browserViewAttached) return;
    notifyBrowser({ state: 'loading', url: browserView.webContents.getURL() });
  });
  browserView.webContents.on('did-finish-load', () => {
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    const url = browserView.webContents.getURL();
    browserCurrentUrl = url;
    notifyBrowser({ state: 'ready', url, title: browserView.webContents.getTitle() });
  });
  browserView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    // -3 ERR_ABORTED is common during redirects; ignore.
    if (errorCode === -3) return;
    if (browserLoadTimer) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    // Renderer decides whether to detach after presenting a visible, actionable failure state.
    notifyBrowser({
      state: 'blocked',
      url: validatedURL || browserCurrentUrl,
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
    const { assistant, workspace } = await modules();
    const current = workspace.normalizeWorkspace(readJson(activeWorkspacePath(), workspace.emptyWorkspace()));
    const acceptedEvidenceCount = current.evidence.filter((item) => item.review === 'accepted').length;
    const unreviewedEvidenceCount = current.evidence.filter((item) => ['unreviewed', 'needs-check'].includes(item.review)).length;
    const context = {
      libraryCount: current.library.length,
      annotationCount: current.annotations.length,
      acceptedEvidenceCount,
      unreviewedEvidenceCount,
      writingLength: String(current.drafts?.writing || '').trim().length,
      experimentLogLength: String(current.drafts?.experimentLog || '').trim().length,
    };
    return { ok: true, plan: assistant.updateResearchPlan(payload.plan, payload.taskId, payload.status, context) };
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
    ensureProjectsIndex();
    return { ok: true, workspace: workspace.normalizeWorkspace(readJson(activeWorkspacePath(), workspace.emptyWorkspace())) };
  });

  registerHandle('workspace:event', async (_event, event = {}) => {
    const { workspace } = await modules();
    ensureProjectsIndex();
    const file = activeWorkspacePath();
    const current = workspace.normalizeWorkspace(readJson(file, workspace.emptyWorkspace()));
    const applied = workspace.applyWorkspaceEvent(current, event);
    writeJsonAtomic(file, applied.state);
    // keep project name in index in sync
    try {
      const index = ensureProjectsIndex();
      const name = applied.state?.meta?.name;
      if (index.activeId && name) {
        index.projects = index.projects.map((item) => item.id === index.activeId
          ? { ...item, name: String(name).slice(0, 120), updatedAt: new Date().toISOString() }
          : item);
        writeJsonAtomic(dataPaths().projectsIndex, index);
      }
    } catch { /* ignore index sync errors */ }
    return { ok: true, workspace: applied.state, result: applied.result };
  });

  registerHandle('projects:list', async () => listProjectsPublic());

  registerHandle('projects:create', async (_event, payload = {}) => {
    const { workspace, assistant } = await modules();
    const paths = dataPaths();
    const index = ensureProjectsIndex();
    const name = String(payload.name || '').trim().slice(0, 120) || `项目 ${new Date().toLocaleString()}`;
    const question = String(payload.question || '').trim().slice(0, 20_000);
    if (!question) throw new TypeError('创建研究项目必须填写核心研究问题');
    const id = crypto.randomUUID();
    const dir = projectDirFor(paths.projectsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    const fresh = workspace.emptyWorkspace();
    fresh.meta = { name, createdAt: new Date().toISOString() };
    fresh.ui = { ...fresh.ui, lastView: 'question' };
    fresh.sourcePreferences = { ...fresh.sourcePreferences, searchTab: 'china' };
    fresh.assistant = {
      plan: assistant.buildResearchPlan(question, { libraryCount: 0, evidenceCount: 0, selectedSourceId: null }),
      history: [{ at: new Date().toISOString(), action: 'plan:set', detail: question.slice(0, 2_000) }],
    };
    writeJsonAtomic(path.join(dir, 'workspace.json'), fresh);
    const now = new Date().toISOString();
    index.projects = [{ id, name, createdAt: now, updatedAt: now }, ...index.projects];
    index.activeId = id;
    writeJsonAtomic(paths.projectsIndex, index);
    return {
      ok: true,
      ...listProjectsPublic(),
      workspace: workspace.normalizeWorkspace(fresh),
    };
  });

  registerHandle('projects:switch', async (_event, payload = {}) => {
    const { workspace } = await modules();
    const paths = dataPaths();
    const index = ensureProjectsIndex();
    const id = normalizeProjectId(payload.id);
    if (!index.projects.some((item) => item.id === id)) throw new TypeError('项目不存在');
    index.activeId = id;
    writeJsonAtomic(paths.projectsIndex, index);
    const file = activeWorkspacePath();
    return {
      ok: true,
      ...listProjectsPublic(),
      workspace: workspace.normalizeWorkspace(readJson(file, workspace.emptyWorkspace())),
    };
  });

  registerHandle('projects:rename', async (_event, payload = {}) => {
    const paths = dataPaths();
    const index = ensureProjectsIndex();
    const id = normalizeProjectId(payload.id || index.activeId);
    const name = String(payload.name || '').trim().slice(0, 120);
    if (!name) throw new TypeError('项目名称不能为空');
    if (!index.projects.some((item) => item.id === id)) throw new TypeError('项目不存在');
    index.projects = index.projects.map((item) => item.id === id
      ? { ...item, name, updatedAt: new Date().toISOString() }
      : item);
    writeJsonAtomic(paths.projectsIndex, index);
    // also patch workspace meta if active
    if (id === index.activeId) {
      const { workspace } = await modules();
      const file = activeWorkspacePath();
      const current = workspace.normalizeWorkspace(readJson(file, workspace.emptyWorkspace()));
      current.meta = { ...(current.meta || {}), name, updatedAt: new Date().toISOString() };
      writeJsonAtomic(file, current);
      return { ok: true, ...listProjectsPublic(), workspace: current };
    }
    return { ok: true, ...listProjectsPublic() };
  });

  registerHandle('projects:remove', async (_event, payload = {}) => {
    const { workspace } = await modules();
    const paths = dataPaths();
    const index = ensureProjectsIndex();
    if (index.projects.length <= 1) throw new Error('至少保留一个项目');
    const id = normalizeProjectId(payload.id);
    if (!index.projects.some((item) => item.id === id)) throw new TypeError('项目不存在');
    const projectDir = projectDirFor(paths.projectsDir, id);
    if (fs.existsSync(projectDir)) {
      try {
        await shell.trashItem(projectDir);
      } catch {
        fs.mkdirSync(paths.projectsTrashDir, { recursive: true });
        fs.renameSync(projectDir, path.join(paths.projectsTrashDir, `${id}-${Date.now()}`));
      }
    }
    index.projects = index.projects.filter((item) => item.id !== id);
    if (index.activeId === id) index.activeId = index.projects[0].id;
    writeJsonAtomic(paths.projectsIndex, index);
    const file = activeWorkspacePath();
    return {
      ok: true,
      ...listProjectsPublic(),
      workspace: workspace.normalizeWorkspace(readJson(file, workspace.emptyWorkspace())),
    };
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
    // Keep loading in place, but surface an actionable slow-site status promptly.
    browserLoadTimer = setTimeout(() => {
      if (navigationId !== browserNavigationId || !browserViewAttached) return;
      notifyBrowser({
        state: 'slow',
        url: browserView?.webContents?.getURL() || url,
        title: browserView?.webContents?.getTitle?.() || '',
        navigationId,
        message: '站点加载较慢，可能受登录、验证码、证书或网络策略限制。内嵌页面仍保留，也可改用系统浏览器。',
        workaround: 'open-external',
      });
    }, 15_000);
    if (view.webContents.getURL() === url && !view.webContents.isLoading()) {
      clearTimeout(browserLoadTimer);
      browserLoadTimer = null;
      notifyBrowser({ state: 'ready', url, title: view.webContents.getTitle(), navigationId });
    } else {
      view.webContents.loadURL(url).catch((error) => {
        if (navigationId !== browserNavigationId || view.webContents.isDestroyed()) return;
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

  registerHandle('browser:reload', async () => {
    if (!browserView || browserView.webContents.isDestroyed()) throw new Error('浏览器未打开');
    browserView.webContents.reload();
    return { ok: true, url: browserView.webContents.getURL() };
  });

  registerHandle('browser:pageMeta', async () => {
    if (!browserView || browserView.webContents.isDestroyed() || !browserViewAttached) {
      return { ok: false, error: { message: '浏览器未打开页面' } };
    }
    const url = browserView.webContents.getURL();
    if (!url || url === 'about:blank') {
      return { ok: false, error: { message: '当前没有可收藏的页面' } };
    }
    let title = browserView.webContents.getTitle() || '';
    try {
      const extracted = await browserView.webContents.executeJavaScript(`(() => {
        const og = document.querySelector('meta[property="og:title"]')?.content
          || document.querySelector('meta[name="citation_title"]')?.content
          || document.querySelector('meta[name="DC.title"]')?.content
          || '';
        const citationAuthors = [...document.querySelectorAll('meta[name="citation_author"]')]
          .map((node) => node.content).filter(Boolean);
        const year = document.querySelector('meta[name="citation_publication_date"]')?.content
          || document.querySelector('meta[name="citation_date"]')?.content
          || '';
        const doi = document.querySelector('meta[name="citation_doi"]')?.content
          || document.querySelector('meta[name="DC.identifier"]')?.content
          || '';
        const abstract = document.querySelector('meta[name="citation_abstract"]')?.content
          || document.querySelector('meta[name="description"]')?.content
          || '';
        const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
          || document.querySelector('meta[name="citation_conference_title"]')?.content
          || '';
        return {
          title: og || document.title || '',
          authors: citationAuthors,
          year,
          doi,
          abstract,
          venue,
          href: location.href,
        };
      })();`, true);
      if (extracted?.title) title = extracted.title;
      return {
        ok: true,
        meta: {
          url: extracted?.href || url,
          title: title || url,
          authors: Array.isArray(extracted?.authors) ? extracted.authors : [],
          year: extracted?.year || '',
          doi: extracted?.doi || '',
          abstract: extracted?.abstract || '',
          venue: extracted?.venue || '',
        },
      };
    } catch {
      return { ok: true, meta: { url, title: title || url, authors: [], year: '', doi: '', abstract: '', venue: '' } };
    }
  });

  registerHandle('external:open', async (_event, payload = {}) => {
    const { urlPolicy } = await modules();
    const url = urlPolicy.validateExternalUrl(payload.url);
    await shell.openExternal(url);
    return { ok: true };
  });

  function papersDir() {
    const dir = path.join(app.getPath('userData'), 'papers');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function resolvePaperPath(id) {
    const safe = path.basename(String(id || ''));
    if (!safe || safe !== String(id || '') || !safe.endsWith('.pdf')) {
      throw new TypeError('非法 PDF 标识');
    }
    const full = path.join(papersDir(), safe);
    if (!full.startsWith(papersDir())) throw new TypeError('路径越界');
    return full;
  }

  registerHandle('papers:import', async (_event, payload = {}) => {
    if (!mainWindow) throw new Error('window is unavailable');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入本地 PDF 到阅读器',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    const sourcePath = result.filePaths[0];
    const stat = fs.statSync(sourcePath);
    if (stat.size > 80 * 1024 * 1024) throw new Error('PDF 超过 80MB，请先压缩再导入');
    const id = `${crypto.randomUUID()}.pdf`;
    const dest = path.join(papersDir(), id);
    fs.copyFileSync(sourcePath, dest);
    return {
      ok: true,
      localPdf: {
        id,
        name: path.basename(sourcePath),
        bytes: stat.size,
        importedAt: new Date().toISOString(),
      },
      suggestedTitle: path.basename(sourcePath, path.extname(sourcePath)),
    };
  });

  registerHandle('papers:read', async (_event, payload = {}) => {
    const full = resolvePaperPath(payload.id);
    if (!fs.existsSync(full)) return { ok: false, error: { message: 'PDF 文件不存在' } };
    const buf = fs.readFileSync(full);
    return { ok: true, base64: buf.toString('base64'), bytes: buf.length };
  });

  registerHandle('papers:exists', async (_event, payload = {}) => {
    try {
      const full = resolvePaperPath(payload.id);
      return { ok: true, exists: fs.existsSync(full) };
    } catch {
      return { ok: true, exists: false };
    }
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
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
      if (verifyResearchProject) {
        const projectVerification = await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('#new-session').click();
          const form = document.querySelector('#project-form');
          form.elements.name.value = '可核验研究项目';
          form.elements.question.value = '开放获取政策如何影响跨学科研究成果的可复核性？';
          form.requestSubmit();
          for (let attempt = 0; attempt < 80; attempt += 1) {
            const response = await window.selenyx.readWorkspace();
            if (response.workspace?.assistant?.plan?.question) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const response = await window.selenyx.readWorkspace();
          return {
            modalHidden: document.querySelector('#project-modal').hidden,
            projectName: response.workspace.meta.name,
            question: response.workspace.assistant?.plan?.question || null,
            taskCount: response.workspace.assistant?.plan?.tasks?.length || 0,
            lastView: response.workspace.ui.lastView,
            questionVisible: document.querySelector('#question-view').classList.contains('active'),
          };
        })()`);
        fs.writeFileSync(path.join(captureDirectory, 'project-verification.json'), JSON.stringify(projectVerification, null, 2), 'utf8');
      }
      if (captureProjectModal) {
        await mainWindow.webContents.executeJavaScript("document.querySelector('#new-session').click()");
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (verifyPdfFile) {
        if (!fs.existsSync(verifyPdfFile)) throw new Error(`PDF 验收文件不存在：${verifyPdfFile}`);
        const readerDemo = path.basename(verifyPdfFile).toLowerCase().includes('attention-is-all-you-need');
        const paperId = readerDemo ? 'attention-is-all-you-need.pdf' : 'verification-paper.pdf';
        const paperDirectory = path.join(app.getPath('userData'), 'papers');
        fs.mkdirSync(paperDirectory, { recursive: true });
        fs.copyFileSync(verifyPdfFile, path.join(paperDirectory, paperId));
        const stat = fs.statSync(verifyPdfFile);
        const record = {
          id: 'local:pdf-verification',
          title: readerDemo ? 'Attention Is All You Need' : 'Selenyx PDF verification paper',
          authors: readerDemo ? ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar et al.'] : ['Selenyx QA'],
          year: readerDemo ? 2017 : 2026,
          venue: readerDemo ? 'arXiv:1706.03762' : 'Local verification fixture',
          abstract: readerDemo ? 'The Transformer architecture based solely on attention mechanisms.' : 'A local two-page PDF used only for deterministic reader verification.',
          url: null,
          sourceType: 'pdf',
          reality: 'real',
          externalIds: {},
          localPdf: { id: paperId, name: path.basename(verifyPdfFile), bytes: stat.size, importedAt: new Date().toISOString() },
        };
        const pdfVerification = await mainWindow.webContents.executeJavaScript(`(async () => {
          const core = await import('./modules/core.js');
          const reader = await import('./modules/reader.js');
          await core.workspaceEvent({ type: 'library:save', record: ${JSON.stringify(record)} });
          core.state.selectedSource = core.state.workspace.library.find((item) => item.id === 'local:pdf-verification');
          await core.workspaceEvent({ type: 'ui:patch', patch: { selectedSourceId: core.state.selectedSource.id, lastView: 'reader' } });
          await core.setView('reader');
          reader.renderReader();
          for (let attempt = 0; attempt < 120; attempt += 1) {
            if (!document.querySelector('#pdf-stage').hidden && document.querySelector('#pdf-canvas').width > 0 && document.querySelectorAll('#pdf-text-layer span').length) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const beforeActionsSnapshot = await window.selenyx.readWorkspace();
          const restoredBeforeActions = {
            readerState: beforeActionsSnapshot.workspace.ui.readerState['local:pdf-verification'] || null,
            annotationCount: beforeActionsSnapshot.workspace.annotations.filter((item) => item.sourceId === 'local:pdf-verification').length,
            evidenceCount: beforeActionsSnapshot.workspace.evidence.filter((item) => item.sourceId === 'local:pdf-verification').length,
          };
          const pageInput = document.querySelector('#reader-page-input');
          pageInput.value = '${readerDemo ? '1' : '2'}';
          pageInput.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 450));
          if (${JSON.stringify(!readerDemo)}) {
            document.querySelector('#reader-rotate').click();
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
          document.querySelector('#reader-fit-width').click();
          await new Promise((resolve) => setTimeout(resolve, 350));
          document.querySelector('#reader-find-input').value = ${JSON.stringify(readerDemo ? 'attention' : 'evidence audit')};
          document.querySelector('#reader-find-next').click();
          for (let attempt = 0; attempt < 80; attempt += 1) {
            if (document.querySelectorAll('#pdf-text-layer .pdf-find-match').length > 0) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const selectText = () => {
            const span = [...document.querySelectorAll('#pdf-text-layer span')].find((node) => node.firstChild && node.textContent.trim().length >= 8);
            if (!span) return null;
            const range = document.createRange();
            range.setStart(span.firstChild, 0);
            range.setEnd(span.firstChild, Math.min(12, span.textContent.length));
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return span.textContent.slice(0, 12);
          };
          const selectedQuote = selectText();
          document.querySelector('[data-reader-action="highlight"]').click();
          for (let attempt = 0; attempt < 80; attempt += 1) {
            const snapshot = await window.selenyx.readWorkspace();
            if (snapshot.workspace.annotations.length) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          selectText();
          document.querySelector('[data-reader-action="evidence"]').click();
          for (let attempt = 0; attempt < 80; attempt += 1) {
            const snapshot = await window.selenyx.readWorkspace();
            if (snapshot.workspace.evidence.length) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          const snapshot = await window.selenyx.readWorkspace();
          const left = document.querySelector('.reader-toolbar-left').getBoundingClientRect();
          const tools = document.querySelector('.reader-tools').getBoundingClientRect();
          const overlaps = !(left.right <= tools.left || tools.right <= left.left || left.bottom <= tools.top || tools.bottom <= left.top);
          return {
            restoredBeforeActions,
            stageVisible: !document.querySelector('#pdf-stage').hidden,
            page: Number(document.querySelector('#reader-page-input').value),
            total: document.querySelector('#reader-page-total').textContent,
            canvas: { width: document.querySelector('#pdf-canvas').width, height: document.querySelector('#pdf-canvas').height },
            textSpanCount: document.querySelectorAll('#pdf-text-layer span').length,
            textSpanDiagnostics: [...document.querySelectorAll('#pdf-text-layer span')].map((node) => ({ text: node.textContent, childNodes: node.childNodes.length, firstNodeType: node.firstChild?.nodeType || null })),
            markedSpanCount: document.querySelectorAll('#pdf-text-layer .pdf-annotated').length,
            findMatchCount: document.querySelectorAll('#pdf-text-layer .pdf-find-match').length,
            selectedQuote,
            annotation: snapshot.workspace.annotations[0] || null,
            evidence: snapshot.workspace.evidence[0] || null,
            readerState: snapshot.workspace.ui.readerState['local:pdf-verification'] || null,
            toolbarOverlaps: overlaps,
          };
        })()`);
        fs.writeFileSync(path.join(captureDirectory, 'pdf-reader-verification.json'), JSON.stringify(pdfVerification, null, 2), 'utf8');
      }
      if (verifyCustomSite) {
        const customSiteVerification = await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-view="browser"]').click();
          await new Promise((resolve) => setTimeout(resolve, 150));
          const before = await window.selenyx.readWorkspace();
          const url = 'https://example.org/';
          const existedBefore = before.workspace.ui.browserSites.some((site) => site.url === url);
          if (!existedBefore) {
            document.querySelector('#browser-add-site').click();
            document.querySelector('#site-name-input').value = '验收自定义站点';
            document.querySelector('#site-url-input').value = url;
            document.querySelector('#site-form').requestSubmit();
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          const after = await window.selenyx.readWorkspace();
          const cardTexts = [...document.querySelectorAll('#browser-sites .site-card')].map((node) => node.textContent);
          return {
            existedBefore,
            persisted: after.workspace.ui.browserSites.some((site) => site.name === '验收自定义站点' && site.url === url),
            domCardVisible: cardTexts.some((text) => text.includes('验收自定义站点')),
            modalHidden: document.querySelector('#site-modal').hidden,
            customSiteCount: after.workspace.ui.browserSites.length,
          };
        })()`);
        fs.writeFileSync(path.join(captureDirectory, 'custom-site-verification.json'), JSON.stringify(customSiteVerification, null, 2), 'utf8');
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
          browserState = await mainWindow.webContents.executeJavaScript("document.querySelector('#browser-status').dataset.state || 'loading'");
          if (['ready', 'blocked', 'slow'].includes(browserState)) break;
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
        await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-view="research"]').click();
          document.querySelector('[data-search-tab="international"]').click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          document.querySelector('#literature-query').value = ${JSON.stringify(captureSearch)};
          document.querySelector('#search-mode').value = 'auto';
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
  if (process.platform === 'win32') app.setAppUserModelId('com.selenyx.desktop');
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
