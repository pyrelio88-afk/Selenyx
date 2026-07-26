import { createHash, randomUUID } from 'node:crypto';

const SOURCE_TYPES = new Set(['article', 'preprint', 'dataset', 'web', 'book', 'user-file']);
const REALITY_TYPES = new Set(['real', 'example', 'user-provided']);
const REVIEW_STATES = new Set(['unreviewed', 'accepted', 'rejected', 'needs-check']);
const EVIDENCE_KINDS = new Set(['finding', 'method', 'population', 'limitation', 'user-hypothesis']);
const RELATION_TYPES = new Set(['supports', 'contradicts', 'qualifies', 'duplicates', 'derived-from', 'not-comparable']);
const RUN_LEVELS = new Set(['L1', 'L2', 'human']);

function requiredString(value, name, max = 10_000) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value.trim().slice(0, max);
}

function optionalString(value, max = 10_000) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function stringArray(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxItems);
}

function isoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('invalid date');
  return date.toISOString();
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach(freeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}

function createResearchProject(input = {}) {
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 200) ?? `project_${randomUUID()}`,
    title: requiredString(input.title, 'title', 500),
    description: optionalString(input.description, 5_000),
    sensitivity: ['public', 'local', 'restricted'].includes(input.sensitivity) ? input.sensitivity : 'local',
    allowedSources: stringArray(input.allowedSources),
    createdAt: isoDate(input.createdAt),
    updatedAt: isoDate(input.updatedAt ?? input.createdAt),
  });
}

function createSourceRecord(input = {}) {
  const sourceType = input.sourceType ?? 'article';
  const reality = input.reality ?? 'real';
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`unsupported sourceType: ${sourceType}`);
  if (!REALITY_TYPES.has(reality)) throw new TypeError(`unsupported reality: ${reality}`);
  const retrieval = input.retrieval ? {
    provider: requiredString(input.retrieval.provider, 'retrieval.provider', 100),
    query: requiredString(input.retrieval.query, 'retrieval.query', 2_000),
    requestedAt: isoDate(input.retrieval.requestedAt),
    httpStatus: Number.isInteger(input.retrieval.httpStatus) ? input.retrieval.httpStatus : null,
    responseHash: optionalString(input.retrieval.responseHash, 128),
  } : null;
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `source_${randomUUID()}`,
    sourceType,
    reality,
    title: requiredString(input.title, 'title', 2_000),
    authors: stringArray(input.authors, 500),
    year: Number.isInteger(input.year) ? input.year : null,
    venue: optionalString(input.venue, 1_000),
    abstract: optionalString(input.abstract, 50_000),
    url: optionalString(input.url, 4_000),
    externalIds: Object.freeze({ ...(input.externalIds ?? {}) }),
    isRetracted: Boolean(input.isRetracted),
    retrieval,
  });
}

function createProvenanceAnchor(input = {}) {
  const excerpt = optionalString(input.excerpt, 5_000);
  const anchor = {
    schemaVersion: 1,
    sourceId: requiredString(input.sourceId, 'sourceId', 300),
    attachmentVersion: optionalString(input.attachmentVersion, 128),
    page: Number.isInteger(input.page) && input.page > 0 ? input.page : null,
    section: optionalString(input.section, 500),
    paragraph: Number.isInteger(input.paragraph) && input.paragraph > 0 ? input.paragraph : null,
    charRange: Array.isArray(input.charRange)
      && input.charRange.length === 2
      && Number.isInteger(input.charRange[0])
      && Number.isInteger(input.charRange[1])
      && input.charRange[0] >= 0
      && input.charRange[1] >= input.charRange[0]
      ? Object.freeze([...input.charRange])
      : null,
    quoteHash: optionalString(input.quoteHash, 128) ?? (excerpt ? sha256(excerpt) : null),
    excerpt,
    locatorStatus: ['valid', 'drifted', 'unresolved'].includes(input.locatorStatus)
      ? input.locatorStatus
      : 'valid',
  };
  if (!anchor.quoteHash) throw new TypeError('anchor requires excerpt or quoteHash');
  return freeze(anchor);
}

function createEvidenceAtom(input = {}) {
  const kind = input.kind ?? 'finding';
  const level = input.extraction?.level ?? 'human';
  const review = input.review ?? 'unreviewed';
  if (!EVIDENCE_KINDS.has(kind)) throw new TypeError(`unsupported evidence kind: ${kind}`);
  if (!RUN_LEVELS.has(level)) throw new TypeError(`unsupported extraction level: ${level}`);
  if (!REVIEW_STATES.has(review)) throw new TypeError(`unsupported review state: ${review}`);
  const anchor = input.anchor ? createProvenanceAnchor(input.anchor) : null;
  if (kind !== 'user-hypothesis' && !anchor) throw new TypeError('evidence requires a provenance anchor');
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `evidence_${randomUUID()}`,
    kind,
    statement: requiredString(input.statement, 'statement', 10_000),
    anchor,
    extraction: {
      level,
      method: requiredString(input.extraction?.method ?? 'manual', 'extraction.method', 300),
      runId: optionalString(input.extraction?.runId, 300),
    },
    review,
    createdAt: isoDate(input.createdAt),
  });
}

function createEvidenceRelation(input = {}) {
  const type = requiredString(input.type, 'type', 100);
  if (!RELATION_TYPES.has(type)) throw new TypeError(`unsupported evidence relation: ${type}`);
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `relation_${randomUUID()}`,
    type,
    sourceId: requiredString(input.sourceId, 'sourceId', 300),
    targetId: requiredString(input.targetId, 'targetId', 300),
    rationale: optionalString(input.rationale, 5_000),
    review: REVIEW_STATES.has(input.review) ? input.review : 'unreviewed',
  });
}

function createClaim(input = {}) {
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `claim_${randomUUID()}`,
    statement: requiredString(input.statement, 'statement', 10_000),
    scope: optionalString(input.scope, 5_000),
    supportingEvidenceIds: stringArray(input.supportingEvidenceIds),
    contradictingEvidenceIds: stringArray(input.contradictingEvidenceIds),
    qualifiers: stringArray(input.qualifiers),
    review: REVIEW_STATES.has(input.review) ? input.review : 'unreviewed',
  });
}

function createContradictionCase(input = {}) {
  const evidenceIds = stringArray(input.evidenceIds);
  if (evidenceIds.length < 2) throw new TypeError('contradiction requires at least two evidence ids');
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `contradiction_${randomUUID()}`,
    evidenceIds,
    explanation: optionalString(input.explanation, 10_000),
    missingInformation: stringArray(input.missingInformation),
    resolution: ['unresolved', 'conditional-coexistence', 'evidence-tilts', 'not-comparable']
      .includes(input.resolution) ? input.resolution : 'unresolved',
    reviewedByHuman: Boolean(input.reviewedByHuman),
  });
}

function createRun(input = {}) {
  const level = input.level ?? 'L1';
  if (!RUN_LEVELS.has(level)) throw new TypeError(`unsupported run level: ${level}`);
  return freeze({
    schemaVersion: 1,
    id: optionalString(input.id, 300) ?? `run_${randomUUID()}`,
    level,
    operation: requiredString(input.operation, 'operation', 300),
    provider: optionalString(input.provider, 300),
    model: optionalString(input.model, 300),
    startedAt: isoDate(input.startedAt),
    finishedAt: input.finishedAt ? isoDate(input.finishedAt) : null,
    inputIds: stringArray(input.inputIds, 10_000),
    outputIds: stringArray(input.outputIds, 10_000),
    status: ['running', 'succeeded', 'failed', 'cancelled'].includes(input.status) ? input.status : 'running',
    error: optionalString(input.error, 5_000),
  });
}

function validateEvidenceChain({ sources = [], evidence = [], claims = [], relations = [] } = {}) {
  const issues = [];
  const sourceIds = new Set(sources.map((item) => item.id));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const claimIds = new Set(claims.map((item) => item.id));
  for (const item of evidence) {
    if (item.kind !== 'user-hypothesis' && !item.anchor) issues.push({ code: 'EVIDENCE_WITHOUT_ANCHOR', id: item.id });
    else if (item.anchor && !sourceIds.has(item.anchor.sourceId)) {
      issues.push({ code: 'UNKNOWN_SOURCE', id: item.id, sourceId: item.anchor.sourceId });
    }
  }
  for (const claim of claims) {
    for (const id of [...claim.supportingEvidenceIds, ...claim.contradictingEvidenceIds]) {
      if (!evidenceIds.has(id)) issues.push({ code: 'UNKNOWN_EVIDENCE', id: claim.id, evidenceId: id });
    }
  }
  const graphIds = new Set([...evidenceIds, ...claimIds]);
  for (const relation of relations) {
    if (!graphIds.has(relation.sourceId)) issues.push({ code: 'UNKNOWN_RELATION_SOURCE', id: relation.id });
    if (!graphIds.has(relation.targetId)) issues.push({ code: 'UNKNOWN_RELATION_TARGET', id: relation.id });
  }
  return { ok: issues.length === 0, issues };
}

export {
  SOURCE_TYPES, REALITY_TYPES, REVIEW_STATES, EVIDENCE_KINDS, RELATION_TYPES, RUN_LEVELS,
  sha256, createResearchProject, createSourceRecord, createProvenanceAnchor, createEvidenceAtom,
  createEvidenceRelation, createClaim, createContradictionCase, createRun, validateEvidenceChain,
};
