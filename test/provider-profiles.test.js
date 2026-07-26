import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderHttpError,
  normalizeProviderProfile,
  redactSecret,
  safeErrorDetails,
  testProviderConnection,
  chatWithProvider,
} from '../src/providers/profiles.js';

function profile(overrides = {}) {
  return {
    id: 'p1',
    name: 'Research model',
    baseUrl: 'https://api.example.org/v1',
    model: 'model-1',
    ...overrides,
  };
}

test('provider profile normalizes a remote provider', () => {
  const item = normalizeProviderProfile(profile());
  assert.equal(item.protocol, 'openai-compatible');
  assert.equal(item.isLocal, false);
});

test('provider profile detects localhost', () => {
  const item = normalizeProviderProfile(profile({ baseUrl: 'http://127.0.0.1:11434/v1' }));
  assert.equal(item.isLocal, true);
});

for (const field of ['name', 'baseUrl', 'model']) {
  test(`provider profile requires ${field}`, () => {
    assert.throws(() => normalizeProviderProfile(profile({ [field]: '' })), new RegExp(field));
  });
}

test('redactSecret hides a long key', () => {
  assert.equal(redactSecret('sk-1234567890'), 'sk-••••7890');
});

test('redactSecret fully hides a short key', () => {
  assert.equal(redactSecret('short'), '••••••••');
});

test('safeErrorDetails redacts an OpenAI-style key', () => {
  const output = safeErrorDetails({ message: 'bad sk-abcdefghijklmnop' });
  assert.equal(output.includes('sk-abcdefghijklmnop'), false);
  assert.equal(output.includes('••••'), true);
});

test('connection test performs a real models request', async () => {
  let request;
  const result = await testProviderConnection(profile(), 'secret', {
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ data: [{ id: 'model-1' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(request.url, 'https://api.example.org/v1/models');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(result.models, ['model-1']);
});

for (const status of [401, 403]) {
  test(`connection test preserves HTTP ${status} as auth error`, async () => {
    await assert.rejects(
      testProviderConnection(profile(), 'wrong', {
        fetchImpl: async () => new Response(JSON.stringify({ error: 'bad key' }), { status }),
      }),
      (error) => error instanceof ProviderHttpError && error.status === status && error.code === 'AUTH_ERROR',
    );
  });
}

for (const status of [429, 500]) {
  test(`connection test preserves HTTP ${status}`, async () => {
    await assert.rejects(
      testProviderConnection(profile(), 'key', {
        fetchImpl: async () => new Response(JSON.stringify({ error: 'upstream' }), { status }),
      }),
      (error) => error.status === status && error.code === 'HTTP_ERROR',
    );
  });
}

test('connection test reports a network error honestly', async () => {
  await assert.rejects(
    testProviderConnection(profile(), 'key', {
      fetchImpl: async () => { throw new Error('offline'); },
    }),
    (error) => error.code === 'NETWORK_ERROR' && /offline/.test(error.message),
  );
});

test('remote chat refuses to pretend without a key', async () => {
  await assert.rejects(
    chatWithProvider(profile(), '', [{ role: 'user', content: 'Hello' }]),
    (error) => error.code === 'MISSING_KEY',
  );
});

test('local chat may run without a key', async () => {
  const result = await chatWithProvider(
    profile({ baseUrl: 'http://localhost:11434/v1' }),
    '',
    [{ role: 'user', content: 'Hello' }],
    {
      fetchImpl: async () => new Response(JSON.stringify({
        model: 'model-1',
        choices: [{ message: { content: 'Local answer' } }],
      }), { status: 200 }),
    },
  );
  assert.equal(result.content, 'Local answer');
});

test('chat sends model and messages to the provider', async () => {
  let body;
  await chatWithProvider(profile(), 'key', [{ role: 'user', content: 'Question' }], {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        model: 'model-1',
        choices: [{ message: { content: 'Answer' } }],
      }), { status: 200 });
    },
  });
  assert.equal(body.model, 'model-1');
  assert.equal(body.messages[0].content, 'Question');
});

test('chat rejects a success response without assistant content', async () => {
  await assert.rejects(
    chatWithProvider(profile(), 'key', [{ role: 'user', content: 'Question' }], {
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});
