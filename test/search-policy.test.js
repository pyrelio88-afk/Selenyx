import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteratureSearchError } from '../src/research/searchBase.js';
import { isRetryable, runSearchWithPolicy } from '../src/research/fetchPolicy.js';

test('search policy retries transient network failure and records attempts', async () => {
  let calls = 0;
  const result = await runSearchWithPolicy('openalex', async () => {
    calls += 1;
    if (calls === 1) throw new LiteratureSearchError('offline', { source: 'openalex', code: 'NETWORK_ERROR' });
    return { records: [], audit: { httpStatus: 200 } };
  }, { timeoutMs: 500, maxAttempts: 2, baseDelayMs: 1 });
  assert.equal(calls, 2);
  assert.equal(result.audit.attempts, 2);
});

test('search policy retries 429 and 5xx but not ordinary 4xx', () => {
  assert.equal(isRetryable({ status: 429 }), true);
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 401 }), false);
});

test('search policy converts a hanging source into a timeout error', async () => {
  await assert.rejects(
    runSearchWithPolicy('pubmed', ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), { timeoutMs: 500, maxAttempts: 1 }),
    (error) => error.code === 'TIMEOUT' && error.source === 'pubmed',
  );
});

test('search policy does not retry a permanent 401', async () => {
  let calls = 0;
  await assert.rejects(
    runSearchWithPolicy('core', async () => {
      calls += 1;
      throw new LiteratureSearchError('unauthorized', { source: 'core', status: 401, code: 'HTTP_ERROR' });
    }, { timeoutMs: 500, maxAttempts: 3, baseDelayMs: 1 }),
    (error) => error.status === 401,
  );
  assert.equal(calls, 1);
});
