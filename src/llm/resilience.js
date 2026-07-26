// Resilience — 韧性包装：重试 / 限流 / 预算 / 故障转移。
// 全部是装饰器：包一层 provider，不改协议。
import { LLMError } from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 指数退避重试：只重试 retryable 错误（429 / 5xx / 网络层）。 */
export function withRetry(provider, { retries = 2, baseDelayMs = 500 } = {}) {
  return {
    ...provider,
    name: `${provider.name}+retry`,
    isConfigured: () => provider.isConfigured(),
    async complete(messages, opts = {}) {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await provider.complete(messages, opts);
        } catch (err) {
          lastErr = err;
          const retryable = err instanceof LLMError ? err.retryable : true;
          if (!retryable || attempt === retries) break;
          await sleep(baseDelayMs * 2 ** attempt);
        }
      }
      throw lastErr;
    },
  };
}

/** 令牌桶限流：每分钟 requestsPerMinute 个请求。 */
export class RateLimiter {
  constructor(requestsPerMinute = 60) {
    this.capacity = Math.max(1, requestsPerMinute);
    this.tokens = this.capacity;
    this.refillPerMs = this.capacity / 60000;
    this.last = Date.now();
  }

  async acquire() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = (1 - this.tokens) / this.refillPerMs;
    await sleep(waitMs);
    this.tokens = 0;
  }
}

export function withRateLimit(provider, limiter) {
  return {
    ...provider,
    name: `${provider.name}+rl`,
    isConfigured: () => provider.isConfigured(),
    async complete(messages, opts = {}) {
      await limiter.acquire();
      return provider.complete(messages, opts);
    },
  };
}

/** Token 预算：累计用量超上限即抛错，防止失控烧钱。 */
export class TokenBudget {
  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens;
    this.used = 0;
  }

  charge(usage = {}) {
    this.used += usage.total_tokens ?? 0;
    if (this.used > this.maxTokens) {
      throw new LLMError(
        `token budget exceeded: ${this.used} > ${this.maxTokens}`,
        { retryable: false },
      );
    }
  }
}

export function withBudget(provider, budget) {
  return {
    ...provider,
    name: `${provider.name}+budget`,
    isConfigured: () => provider.isConfigured(),
    async complete(messages, opts = {}) {
      const result = await provider.complete(messages, opts);
      budget.charge(result.usage);
      return result;
    },
  };
}

/** 故障转移：按序尝试，全部失败抛最后一个错。 */
export class FailoverProvider {
  constructor(providers) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new Error('FailoverProvider needs at least one provider');
    }
    this.providers = providers;
    this.name = `failover(${providers.map((p) => p.name).join(',')})`;
  }

  isConfigured() {
    return this.providers.some((p) => p.isConfigured());
  }

  async complete(messages, opts = {}) {
    let lastErr;
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        return await provider.complete(messages, opts);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new LLMError('no configured provider in failover chain');
  }
}
