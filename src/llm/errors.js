// LLM 错误类型。状态码语义化，供 resilience 层做重试决策。
export class LLMError extends Error {
  constructor(message, { provider = '', status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'LLMError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export class AuthError extends LLMError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: false });
    this.name = 'AuthError';
  }
}

export class RateLimitError extends LLMError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: true });
    this.name = 'RateLimitError';
  }
}

export class ProviderError extends LLMError {
  constructor(message, opts = {}) {
    super(message, { retryable: true, ...opts });
    this.name = 'ProviderError';
  }
}

/** 按 HTTP 状态码映射错误类型。 */
export function errorFromStatus(status, body, provider) {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const msg = `${provider} HTTP ${status}: ${text.slice(0, 200)}`;
  if (status === 401 || status === 403) return new AuthError(msg, { provider, status });
  if (status === 429) return new RateLimitError(msg, { provider, status });
  if (status >= 500) return new ProviderError(msg, { provider, status, retryable: true });
  return new LLMError(msg, { provider, status, retryable: false });
}
