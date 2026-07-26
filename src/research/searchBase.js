import { createHash } from 'node:crypto';

class LiteratureSearchError extends Error {
  constructor(message, { source, status = null, code = 'SEARCH_FAILED', details = null } = {}) {
    super(message);
    this.name = 'LiteratureSearchError';
    this.source = source;
    this.status = status;
    this.code = code;
    this.details = details;
  }
  toJSON() {
    return {
      name: this.name, message: this.message, source: this.source,
      status: this.status, code: this.code, details: this.details,
    };
  }
}

function clampLimit(value, fallback = 10, max = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(number)));
}

function responseHash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').digest('hex');
}

async function readJsonOrThrow(response, source) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new LiteratureSearchError(`${source} returned invalid JSON`, {
      source, status: response.status, code: 'INVALID_RESPONSE',
    });
  }
  if (!response.ok) {
    throw new LiteratureSearchError(`${source} HTTP ${response.status}`, {
      source, status: response.status, code: 'HTTP_ERROR',
      details: JSON.stringify(payload).slice(0, 1_000),
    });
  }
  return payload;
}

function buildAudit(provider, query, requestedAt, httpStatus, payload) {
  return { provider, query, requestedAt, httpStatus, responseHash: responseHash(payload) };
}

function normalizeDoi(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
}

export { LiteratureSearchError, clampLimit, responseHash, readJsonOrThrow, buildAudit, normalizeDoi };
