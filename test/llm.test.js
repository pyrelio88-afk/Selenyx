// LLM 单测：mock transport 覆盖请求/响应/错误全路径
import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider, createOpenAIFamilyProvider, OPENAI_FAMILY } from '../src/llm/openaiFamily.js';
import { AnthropicProvider } from '../src/llm/anthropic.js';
import { StubProvider } from '../src/llm/base.js';
import { AuthError, RateLimitError, ProviderError, errorFromStatus } from '../src/llm/errors.js';
import { withRetry, withBudget, TokenBudget, RateLimiter, FailoverProvider, withRateLimit } from '../src/llm/resilience.js';
import { listProviders, createProvider, providerFromConfig, PROVIDER_NAMES } from '../src/llm/registry.js';

const okResponse = (text, model = 'm') => ({ status: 200, json: { choices: [{ message: { content: text } }], model, usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }, text });

const captureTransport = (responder) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fn, calls };
};

test('llm: openai-family openai request shape and response parse', async () => {
  const { fn, calls } = captureTransport(() => okResponse('hello'));
  const p = new OpenAICompatibleProvider({
    name: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini', transport: fn,
  });
  const r = await p.complete([{ role: 'user', content: 'hi' }]);
  assert.equal(r.text, 'hello');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.match(calls[0].init.headers.Authorization, /^Bearer sk-x/);
  assert.equal(calls[0].init.body.model, 'gpt-4o-mini');
});

test('llm: openai-family 401 maps to AuthError', async () => {
  const p = new OpenAICompatibleProvider({
    name: 'openai', apiKey: 'bad', baseUrl: 'https://api.openai.com/v1', model: 'm',
    transport: async () => ({ status: 401, json: { error: 'unauthorized' }, text: '' }),
  });
  await assert.rejects(p.complete([{ role: 'user', content: 'x' }]), AuthError);
});

test('llm: openai-family 429 maps to RateLimitError (retryable)', async () => {
  const p = new OpenAICompatibleProvider({
    name: 'openai', apiKey: 'sk', baseUrl: 'https://api.openai.com/v1', model: 'm',
    transport: async () => ({ status: 429, json: { error: 'rate' }, text: '' }),
  });
  try { await p.complete([{ role: 'user', content: 'x' }]); assert.fail('should throw'); }
  catch (err) { assert.ok(err instanceof RateLimitError); assert.equal(err.retryable, true); }
});

test('llm: openai-family 500 maps to ProviderError', async () => {
  const p = new OpenAICompatibleProvider({
    name: 'openai', apiKey: 'sk', baseUrl: 'https://api.openai.com/v1', model: 'm',
    transport: async () => ({ status: 500, text: 'oops', json: null }),
  });
  await assert.rejects(p.complete([{ role: 'user', content: 'x' }]), ProviderError);
});

test('llm: anthropic request shape and content parsing', async () => {
  const { fn, calls } = captureTransport(() => ({
    status: 200, json: { model: 'claude-3-5-haiku', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 5, output_tokens: 7 } }, text: '',
  }));
  const p = new AnthropicProvider({ apiKey: 'sk-ant-x', transport: fn });
  const r = await p.complete([{ role: 'system', content: 'be terse' }, { role: 'user', content: 'hi' }]);
  assert.equal(r.text, 'hi');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'sk-ant-x');
  assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].init.body.system, 'be terse');
  assert.equal(calls[0].init.body.messages.length, 1);
  assert.equal(calls[0].init.body.messages[0].role, 'user');
});

test('llm: registry lists 7 providers + stub', () => {
  assert.equal(PROVIDER_NAMES.length, 7);
  const all = listProviders();
  for (const n of ['openai', 'deepseek', 'moonshot', 'zhipu', 'qwen', 'openrouter', 'anthropic']) {
    assert.ok(all.find((p) => p.name === n), `${n} should be listed`);
  }
});

test('llm: createProvider openai-family vendor uses correct base', () => {
  const p = createProvider('deepseek', { apiKey: 'k' });
  assert.equal(p.baseUrl, OPENAI_FAMILY.deepseek.baseUrl);
  assert.equal(p.model, OPENAI_FAMILY.deepseek.defaultModel);
});

test('llm: createProvider stub returns StubProvider', () => {
  const p = createProvider('stub');
  assert.ok(p instanceof StubProvider);
  assert.equal(p.isConfigured(), true);
});

test('llm: providerFromConfig falls back to stub when no key', () => {
  const p = providerFromConfig({ provider: 'openai' });
  assert.ok(p instanceof StubProvider);
});

test('llm: providerFromConfig uses configured key', () => {
  const p = providerFromConfig({ provider: 'deepseek', apiKey: 'k', model: 'deepseek-reasoner' });
  assert.equal(p.apiKey, 'k');
  assert.equal(p.model, 'deepseek-reasoner');
});

test('llm: withRetry retries 429 then succeeds', async () => {
  let attempt = 0;
  const inner = new StubProvider();
  const p = withRetry({
    name: 'mock', isConfigured: () => true,
    complete: async () => {
      attempt += 1;
      if (attempt < 3) throw new RateLimitError('rate', { provider: 'mock' });
      return okResponse('done').json ? { text: 'done' } : { text: 'done' };
    },
  }, { retries: 3, baseDelayMs: 1 });
  const r = await p.complete([{ role: 'user', content: 'x' }]);
  assert.equal(r.text, 'done');
  assert.equal(attempt, 3);
});

test('llm: withRetry does not retry AuthError', async () => {
  let attempt = 0;
  const p = withRetry({
    name: 'mock', isConfigured: () => true,
    complete: async () => { attempt += 1; throw new AuthError('no', { provider: 'mock' }); },
  }, { retries: 3, baseDelayMs: 1 });
  await assert.rejects(p.complete([{ role: 'user', content: 'x' }]), AuthError);
  assert.equal(attempt, 1);
});

test('llm: withBudget rejects when over limit', async () => {
  const budget = new TokenBudget(5);
  const p = withBudget({
    name: 'mock', isConfigured: () => true,
    complete: async () => ({ text: 'ok', usage: { total_tokens: 10 } }),
  }, budget);
  await assert.rejects(p.complete([{ role: 'user', content: 'x' }]), /token budget/);
});

test('llm: failover falls over to next provider', async () => {
  const failing = { name: 'a', isConfigured: () => true, complete: async () => { throw new RateLimitError('r', { provider: 'a' }); } };
  const ok = { name: 'b', isConfigured: () => true, complete: async () => ({ text: 'backup' }) };
  const fp = new FailoverProvider([failing, ok]);
  const r = await fp.complete([{ role: 'user', content: 'x' }]);
  assert.equal(r.text, 'backup');
});

test('llm: failover throws last error when all fail', async () => {
  const fp = new FailoverProvider([
    { name: 'a', isConfigured: () => true, complete: async () => { throw new AuthError('a'); } },
    { name: 'b', isConfigured: () => true, complete: async () => { throw new RateLimitError('b'); } },
  ]);
  await assert.rejects(fp.complete([{ role: 'user', content: 'x' }]), RateLimitError);
});

test('llm: rate limiter is created with positive capacity', () => {
  const rl = new RateLimiter(60);
  assert.ok(rl.capacity > 0);
  assert.ok(typeof rl.acquire === 'function');
});

test('llm: errorFromStatus maps all codes', () => {
  assert.ok(errorFromStatus(401, '', 'p') instanceof AuthError);
  assert.ok(errorFromStatus(403, '', 'p') instanceof AuthError);
  assert.ok(errorFromStatus(429, '', 'p') instanceof RateLimitError);
  assert.ok(errorFromStatus(500, '', 'p') instanceof ProviderError);
  assert.ok(errorFromStatus(400, '', 'p').name === 'LLMError');
});
