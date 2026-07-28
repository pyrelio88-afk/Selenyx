import { LiteratureSearchError } from './searchBase.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_ATTEMPTS = 2;

function isRetryable(error) {
  const status = Number(error?.status);
  return error?.code === 'NETWORK_ERROR'
    || error?.code === 'TIMEOUT'
    || status === 408
    || status === 425
    || status === 429
    || status >= 500;
}

function wait(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

async function runSearchWithPolicy(source, operation, options = {}) {
  const timeoutMs = Math.max(500, Math.min(60_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const maxAttempts = Math.max(1, Math.min(3, Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, Math.min(5_000, Number(options.baseDelayMs) || 300));
  const parentSignal = options.signal;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (parentSignal?.aborted) throw parentSignal.reason ?? new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    let timedOut = false;
    const onParentAbort = () => controller.abort(parentSignal.reason);
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException(`${source} timed out`, 'TimeoutError'));
    }, timeoutMs);

    try {
      const result = await operation({ signal: controller.signal, attempt });
      return {
        ...result,
        audit: result?.audit ? { ...result.audit, attempts: attempt, timeoutMs } : result?.audit,
      };
    } catch (error) {
      lastError = timedOut
        ? new LiteratureSearchError(`${source} 请求超时（${timeoutMs}ms）`, {
          source, code: 'TIMEOUT', details: `attempt ${attempt}/${maxAttempts}`,
        })
        : error;
      if (attempt >= maxAttempts || !isRetryable(lastError) || parentSignal?.aborted) throw lastError;
      const retryAfter = Number(lastError?.retryAfterMs);
      const delay = Number.isFinite(retryAfter)
        ? Math.max(0, Math.min(30_000, retryAfter))
        : baseDelayMs * (2 ** (attempt - 1));
      await wait(delay, parentSignal);
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }
  throw lastError;
}

export {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  isRetryable,
  runSearchWithPolicy,
};
