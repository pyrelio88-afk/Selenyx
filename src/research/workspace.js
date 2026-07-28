import { randomUUID } from 'node:crypto';

const SCHEMA_VERSION = 1;
const nowIso = () => new Date().toISOString();
const text = (value, max = 20_000) => String(value ?? '').trim().slice(0, max);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function emptyWorkspace() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name: '未命名研究', createdAt: nowIso() },
    library: [],
    annotations: [],
    evidence: [],
    assistant: { plan: null, history: [] },
    drafts: { writing: '', figureBrief: '', experimentLog: '' },
    sourcePreferences: { international: ['openalex', 'pubmed', 'crossref'], searchTab: 'china' },
    ui: {
      leftWidth: 232, rightWidth: 304, leftCollapsed: false, rightCollapsed: false,
      lastView: 'research', selectedSourceId: null,
      browserSites: [], browserFavorites: [], browserRecent: [],
    },
    updatedAt: nowIso(),
  };
}

function normalizeRecord(input) {
  const source = object(input);
  const title = text(source.title, 1_000);
  if (!title) throw new TypeError('文献标题不能为空');
  const externalIds = object(source.externalIds);
  return {
    ...source,
    id: text(source.id, 300) || `local:${randomUUID()}`,
    title,
    authors: Array.isArray(source.authors) ? source.authors.map((item) => text(item, 200)).filter(Boolean).slice(0, 100) : [],
    year: Number.isInteger(source.year) && source.year > 0 ? source.year : null,
    venue: text(source.venue, 500) || null,
    abstract: text(source.abstract, 100_000) || null,
    url: text(source.url, 4_000) || null,
    sourceType: text(source.sourceType, 80) || 'article',
    reality: source.reality === 'example' ? 'example' : 'real',
    externalIds: Object.fromEntries(Object.entries(externalIds)
      .map(([key, value]) => [text(key, 80), text(value, 500)]).filter(([key, value]) => key && value)),
    savedAt: text(source.savedAt, 80) || nowIso(),
    localPdf: source.localPdf && typeof source.localPdf === 'object' ? {
      id: text(source.localPdf.id, 300),
      name: text(source.localPdf.name, 500),
      bytes: Number(source.localPdf.bytes) || 0,
      importedAt: text(source.localPdf.importedAt, 80) || nowIso(),
    } : null,
  };
}

function identityKeys(record) {
  const ids = object(record.externalIds);
  const keys = [];
  if (ids.doi) keys.push(`doi:${text(ids.doi).toLocaleLowerCase().replace(/^https?:\/\/doi\.org\//, '')}`);
  if (ids.pmid) keys.push(`pmid:${text(ids.pmid)}`);
  if (ids.openAlex) keys.push(`openalex:${text(ids.openAlex).toLocaleLowerCase()}`);
  const title = text(record.title, 1_000).toLocaleLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  keys.push(`title:${title}:${record.year ?? ''}`);
  return keys;
}

function upsertRecord(library, input) {
  const record = normalizeRecord(input);
  const incoming = new Set(identityKeys(record));
  const index = library.findIndex((item) => identityKeys(item).some((key) => incoming.has(key)));
  if (index < 0) return { library: [...library, record], record, merged: false };
  const merged = {
    ...library[index], ...record, id: library[index].id,
    authors: record.authors.length ? record.authors : library[index].authors,
    abstract: record.abstract || library[index].abstract,
    externalIds: { ...library[index].externalIds, ...record.externalIds },
    localPdf: record.localPdf || library[index].localPdf || null,
    savedAt: library[index].savedAt,
  };
  const next = [...library];
  next[index] = merged;
  return { library: next, record: merged, merged: true };
}

function normalizeAssistant(input) {
  const raw = object(input);
  const planRaw = object(raw.plan);
  const tasks = Array.isArray(planRaw.tasks) ? planRaw.tasks.slice(0, 10).map((candidate) => {
    const item = object(candidate);
    return {
      id: text(item.id, 300), stage: text(item.stage, 80), title: text(item.title, 500),
      description: text(item.description, 4_000), route: text(item.route, 80) || null,
      capability: text(item.capability, 120) || null, level: text(item.level, 40) || 'L1',
      evidenceGate: text(item.evidenceGate, 2_000) || null,
      status: ['pending', 'active', 'done', 'blocked'].includes(item.status) ? item.status : 'pending',
    };
  }).filter((item) => item.id && item.title) : [];
  const plan = text(planRaw.id, 300) && text(planRaw.question, 20_000) ? {
    ...planRaw,
    id: text(planRaw.id, 300), question: text(planRaw.question, 20_000),
    intent: text(planRaw.intent, 80) || 'discover', stage: text(planRaw.stage, 80) || 'question',
    tasks,
  } : null;
  const history = Array.isArray(raw.history) ? raw.history.slice(-100).map((candidate) => {
    const item = object(candidate);
    return { at: text(item.at, 80) || nowIso(), action: text(item.action, 200), detail: text(item.detail, 2_000) };
  }).filter((item) => item.action) : [];
  return { plan, history };
}
function normalizeWorkspace(input) {
  const fallback = emptyWorkspace();
  const raw = object(input);
  let library = [];
  for (const candidate of Array.isArray(raw.library) ? raw.library : []) {
    try { library = upsertRecord(library, candidate).library; } catch {}
  }
  return {
      ...fallback, library,
      meta: {
        name: text(object(raw.meta).name, 120) || fallback.meta.name,
        createdAt: text(object(raw.meta).createdAt, 80) || fallback.meta.createdAt,
        updatedAt: text(object(raw.meta).updatedAt, 80) || null,
      },
      annotations: Array.isArray(raw.annotations) ? raw.annotations.filter((item) => object(item).id).slice(0, 20_000) : [],
      evidence: Array.isArray(raw.evidence) ? raw.evidence.filter((item) => object(item).id).slice(0, 20_000) : [],
      assistant: normalizeAssistant(raw.assistant),
      drafts: {
        writing: text(object(raw.drafts).writing, 200_000),
        figureBrief: text(object(raw.drafts).figureBrief, 50_000),
        experimentLog: text(object(raw.drafts).experimentLog, 50_000),
      },
      sourcePreferences: { ...fallback.sourcePreferences, ...object(raw.sourcePreferences) },
      ui: { ...fallback.ui, ...object(raw.ui) },
      updatedAt: text(raw.updatedAt, 80) || fallback.updatedAt,
      schemaVersion: SCHEMA_VERSION,
    };
}

function anchor(input) {
  const value = object(input);
  const start = Math.max(0, Math.trunc(Number(value.start) || 0));
  return { start, end: Math.max(start, Math.trunc(Number(value.end) || start)) };
}

function applyWorkspaceEvent(current, event) {
  const state = normalizeWorkspace(current);
  const action = object(event);
  let result = null;
  if (action.type === 'library:save') {
    const saved = upsertRecord(state.library, action.record);
    state.library = saved.library;
    result = { record: saved.record, merged: saved.merged };
  } else if (action.type === 'library:remove') {
    state.library = state.library.filter((item) => item.id !== text(action.id, 300));
  } else if (action.type === 'annotation:add') {
    const item = object(action.annotation);
    if (!text(item.sourceId) || !text(item.content)) throw new TypeError('批注必须包含来源和内容');
    result = {
      id: text(item.id, 300) || `annotation:${randomUUID()}`, sourceId: text(item.sourceId, 300),
      content: text(item.content), quote: text(item.quote), anchor: anchor(item.anchor),
      style: ['highlight', 'underline', 'note'].includes(item.style) ? item.style : 'note',
      page: Number.isInteger(item.page) && item.page > 0 ? item.page : null,
      createdAt: text(item.createdAt, 80) || nowIso(),
    };
    state.annotations.push(result);
  } else if (action.type === 'evidence:add') {
    const item = object(action.evidence);
    if (!text(item.sourceId) || !text(item.quote)) throw new TypeError('证据必须包含来源和原文');
    result = {
      id: text(item.id, 300) || `evidence:${randomUUID()}`, sourceId: text(item.sourceId, 300),
      quote: text(item.quote, 50_000), anchor: anchor(item.anchor),
      method: ['selection', 'abstract', 'manual'].includes(item.method) ? item.method : 'manual',
      review: ['unreviewed', 'accepted', 'rejected', 'needs-check'].includes(item.review) ? item.review : 'unreviewed',
      relation: ['supports', 'contradicts', 'qualifies'].includes(item.relation) ? item.relation : 'supports',
      createdAt: text(item.createdAt, 80) || nowIso(),
    };
    state.evidence.push(result);
  } else if (action.type === 'evidence:review') {
    const review = ['unreviewed', 'accepted', 'rejected', 'needs-check'].includes(action.review) ? action.review : 'unreviewed';
    state.evidence = state.evidence.map((item) => item.id === action.id ? { ...item, review } : item);
  } else if (action.type === 'evidence:relation') {
    const relation = ['supports', 'contradicts', 'qualifies'].includes(action.relation) ? action.relation : 'supports';
    state.evidence = state.evidence.map((item) => item.id === action.id ? { ...item, relation } : item);
  } else if (action.type === 'workspace:reset') {
    const keepUi = {
      leftWidth: state.ui.leftWidth,
      rightWidth: state.ui.rightWidth,
      leftCollapsed: state.ui.leftCollapsed,
      rightCollapsed: state.ui.rightCollapsed,
      browserSites: state.ui.browserSites,
      browserFavorites: state.ui.browserFavorites,
    };
    const next = emptyWorkspace();
    next.ui = { ...next.ui, ...keepUi, lastView: 'research' };
    next.drafts = { writing: '', figureBrief: '', experimentLog: '' };
    next.meta = {
      name: text(action.name, 120) || `研究 ${new Date().toLocaleString()}`,
      createdAt: nowIso(),
    };
    Object.assign(state, next);
    result = { name: next.meta.name };
  } else if (action.type === 'project:rename') {
    state.meta = { ...(state.meta || {}), name: text(action.name, 120) || '未命名研究', updatedAt: nowIso() };
    result = state.meta;
  } else if (action.type === 'assistant:set') {
    state.assistant = normalizeAssistant({
      plan: action.plan,
      history: [...state.assistant.history, { at: nowIso(), action: 'plan:set', detail: text(action.plan?.question, 2_000) }],
    });
    result = state.assistant.plan;
  } else if (action.type === 'assistant:clear') {
    state.assistant = { plan: null, history: [...state.assistant.history, { at: nowIso(), action: 'plan:clear', detail: '' }].slice(-100) };
  } else if (action.type === 'preferences:patch') {
    state.sourcePreferences = { ...state.sourcePreferences, ...object(action.patch) };
  } else if (action.type === 'ui:patch') {
    state.ui = { ...state.ui, ...object(action.patch) };
  } else if (action.type === 'draft:patch') {
    state.drafts = { ...(state.drafts || { writing: '', figureBrief: '', experimentLog: '' }), ...object(action.patch) };
    result = state.drafts;
  } else if (action.type === 'library:attachPdf') {
    const id = text(action.id, 300);
    const localPdf = object(action.localPdf);
    if (!id || !text(localPdf.id)) throw new TypeError('attachPdf 需要文献 id 与 localPdf');
    state.library = state.library.map((item) => item.id === id ? {
      ...item,
      localPdf: {
        id: text(localPdf.id, 300),
        name: text(localPdf.name, 500) || 'paper.pdf',
        bytes: Number(localPdf.bytes) || 0,
        importedAt: text(localPdf.importedAt, 80) || nowIso(),
      },
    } : item);
    result = state.library.find((item) => item.id === id) || null;
  } else {
    throw new TypeError(`unknown workspace event: ${text(action.type, 100)}`);
  }
  state.updatedAt = nowIso();
  return { state, result };
}

export {
  SCHEMA_VERSION, emptyWorkspace, normalizeWorkspace, normalizeRecord,
  identityKeys, upsertRecord, normalizeAssistant, applyWorkspaceEvent,
};

