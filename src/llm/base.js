// Provider 基类。
// transport 注入：生产用全局 fetch（Node >=18），测试用 mock——零依赖的关键。
export class BaseProvider {
  constructor({
    name,
    apiKey = '',
    baseUrl = '',
    model = '',
    transport = null,
    timeoutMs = 60000,
  } = {}) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.transport = transport ?? defaultTransport;
  }

  // eslint-disable-next-line no-unused-vars
  async complete(messages, opts = {}) {
    throw new Error(`provider '${this.name}' must implement complete()`);
  }

  isConfigured() {
    return this.apiKey !== '';
  }
}

/** 默认 transport：全局 fetch，统一返回 {status, json, text}。 */
export async function defaultTransport(url, { method = 'GET', headers = {}, body, timeoutMs = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stub provider：无 key 时的诚实替身。
 * 产出明确标注 [stub]，永不假装是模型输出。
 */
export class StubProvider extends BaseProvider {
  constructor(opts = {}) {
    super({ name: 'stub', model: 'stub-model', ...opts });
  }

  async complete(messages) {
    const last = messages[messages.length - 1]?.content ?? '';
    return {
      text: `[{"content": "[stub] no LLM configured; placeholder analysis for: ${String(last).slice(0, 80)}", "confidence": 0.3}]`,
      model: this.model,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      stub: true,
    };
  }

  isConfigured() {
    return true; // stub 永远可用，保证任何环境可跑
  }
}
