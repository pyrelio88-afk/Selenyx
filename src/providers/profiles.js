import { randomUUID } from 'node:crypto';
import { joinApiPath, validateProviderBaseUrl } from '../security/urlPolicy.js';

class ProviderHttpError extends Error {
  constructor(message, { status = null, code = 'PROVIDER_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name, message: this.message, status: this.status,
      code: this.code, details: this.details,
    };
  }
}

function cleanText(value, name, max) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim().slice(0, max);
}

function normalizeProviderProfile(input = {}) {
  return Object.freeze({
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `provider_${randomUUID()}`,
    name: cleanText(input.name, 'name', 100),
    baseUrl: validateProviderBaseUrl(input.baseUrl),
    model: cleanText(input.model, 'model', 300),
    protocol: input.protocol === 'anthropic' ? 'anthropic' : 'openai-compatible',
    credentialRef: typeof input.credentialRef === 'string' && input.credentialRef.trim()
      ? input.credentialRef.trim()
      : null,
    isLocal: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(input.baseUrl),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function redactSecret(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 3)}••••${text.slice(-4)}`;
}

function safeErrorDetails(payload) {
  if (payload == null) return null;
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return raw
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1••••')
    .replace(/("?(?:api[_-]?key|authorization)"?\s*[:=]\s*"?)([^",\s}]+)/gi, '$1••••')
    .slice(0, 1_000);
}

async function parseProviderResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new ProviderHttpError(`Provider HTTP ${response.status}`, {
      status: response.status,
      code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR',
      details: safeErrorDetails(payload),
    });
  }
  return payload;
}

async function testProviderConnection(profileInput, apiKey, { fetchImpl = globalThis.fetch, signal } = {}) {
  const profile = normalizeProviderProfile(profileInput);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(joinApiPath(profile.baseUrl, 'models'), { method: 'GET', headers, signal });
  } catch (error) {
    throw new ProviderHttpError(`Provider network error: ${error.message}`, { code: 'NETWORK_ERROR' });
  }
  const payload = await parseProviderResponse(response);
  return {
    ok: true,
    status: response.status,
    providerId: profile.id,
    models: Array.isArray(payload?.data)
      ? payload.data.map((item) => item?.id).filter(Boolean).slice(0, 100)
      : [],
  };
}

async function chatWithProvider(profileInput, apiKey, messages, {
  fetchImpl = globalThis.fetch, signal, temperature = 0.2, maxTokens = 2_048,
} = {}) {
  const profile = normalizeProviderProfile(profileInput);
  if (!Array.isArray(messages) || messages.length === 0) throw new TypeError('messages are required');
  if (!apiKey && !profile.isLocal) throw new ProviderHttpError('API key is missing', { code: 'MISSING_KEY' });
  const safeMessages = messages.map((message) => ({
    role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
    content: cleanText(message?.content, 'message.content', 100_000),
  }));
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(joinApiPath(profile.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: profile.model, messages: safeMessages, temperature, max_tokens: maxTokens,
      }),
      signal,
    });
  } catch (error) {
    throw new ProviderHttpError(`Provider network error: ${error.message}`, { code: 'NETWORK_ERROR' });
  }
  const payload = await parseProviderResponse(response);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new ProviderHttpError('Provider response did not contain assistant content', {
      status: response.status, code: 'INVALID_RESPONSE', details: safeErrorDetails(payload),
    });
  }
  return {
    ok: true,
    status: response.status,
    content,
    model: payload.model ?? profile.model,
    usage: payload.usage ?? null,
  };
}

export {
  ProviderHttpError, normalizeProviderProfile, redactSecret, safeErrorDetails,
  parseProviderResponse, testProviderConnection, chatWithProvider,
};
