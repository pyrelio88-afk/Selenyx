/**
 * Selenyx BYOK LLM 服务 — 浏览器直连（R79）
 *
 * 关键架构决策：妙搭部署的是纯静态站点，跑不了 Python 后端。
 * 因此 BYOK 的正确实现是「浏览器直连 LLM 提供商」——用户的 API Key
 * 只存在本机 localStorage（zustand persist），请求从浏览器直接发往
 * OpenAI / OpenRouter / Anthropic / Google / Ollama，不经任何中转服务器。
 * 这既符合 BYOK「key 不出用户设备」的本意，也让静态部署真正可用。
 *
 * 支持：OpenAI 兼容（openai/openrouter/ollama/custom → /chat/completions）、
 * Anthropic（/v1/messages）、Google Gemini（:generateContent / :streamGenerateContent）。
 */

import type { LLMConfig } from '@apptypes/index';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResult {
  content: string;
  /** 本次消耗 token（usage 缺失时为估算值） */
  tokensUsed: number;
  /** 是否为估算（无 usage 字段时按字符粗估） */
  estimated: boolean;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'cors' | 'network' | 'rate_limit' | 'bad_request' | 'not_found' | 'unknown',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** 粗估 token（中英文混合约 1 token ≈ 1.5 字符，仅作 fallback） */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 1.5));
}

/** 把 HTTP 错误翻译成用户能懂的中文 */
function mapError(status: number, body: string, provider: string): LLMError {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    return new LLMError(`API Key 无效或权限不足（${provider}）。请到「设置」检查 Key 是否填写正确、是否已过期。`, 'auth', status);
  }
  if (status === 429) {
    return new LLMError('请求太频繁或额度已用完（429）。稍等片刻再试，或检查该 Key 的用量上限/余额。', 'rate_limit', status);
  }
  if (status === 404) {
    return new LLMError(`模型或接口不存在（404）。请检查「设置」里的模型名与 Base URL 是否匹配（当前 provider：${provider}）。`, 'not_found', status);
  }
  if (status === 400) {
    const msg = lower.includes('context') || lower.includes('token')
      ? '内容太长超出模型上下文（400）。请缩短输入或减少携带的文献。'
      : `请求参数有误（400）：${body.slice(0, 160)}`;
    return new LLMError(msg, 'bad_request', status);
  }
  return new LLMError(`LLM 服务返回错误（${status}）：${body.slice(0, 160)}`, 'unknown', status);
}

/** 网络/CORS 失败翻译（fetch 抛 TypeError 时） */
function mapNetworkError(e: unknown, baseUrl: string): LLMError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new LLMError(
      `连不上 ${baseUrl}。可能原因：① 网络不通 ② 该服务不允许浏览器跨域直连（CORS）③ Base URL 填错。` +
      `本地 Ollama 需先设 OLLAMA_ORIGINS 允许跨域。`,
      'cors',
    );
  }
  return new LLMError(`网络请求失败：${msg}`, 'network');
}

// ============================================================
// 各家请求构造
// ============================================================

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** 从流式 chunk 里抠出增量文本 */
  parseStreamDelta: (json: any) => string;
  /** 从完整响应里抠出文本 + usage */
  parseFull: (json: any) => { content: string; tokensUsed: number | null };
}

function isOpenAICompat(p: LLMConfig['provider']): boolean {
  return p === 'openai' || p === 'openrouter' || p === 'ollama' || p === 'custom';
}

function prepare(config: LLMConfig, messages: LLMMessage[], stream: boolean): PreparedRequest {
  const { provider, apiKey, baseUrl, model, temperature, maxTokens } = config;
  const root = baseUrl.replace(/\/+$/, '');

  if (isOpenAICompat(provider)) {
    return {
      url: `${root}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        // OpenRouter 建议带的标识头（可选，不填不报错）
        ...(provider === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'Selenyx' } : {}),
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
      parseStreamDelta: (j) => j?.choices?.[0]?.delta?.content ?? '',
      parseFull: (j) => ({
        content: j?.choices?.[0]?.message?.content ?? '',
        tokensUsed: j?.usage?.total_tokens ?? null,
      }),
    };
  }

  if (provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const turns = messages.filter((m) => m.role !== 'system');
    return {
      url: `${root}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // 允许浏览器直连（Anthropic 官方 CORS 开关）
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: turns.map((m) => ({ role: m.role, content: m.content })),
        stream,
      }),
      parseStreamDelta: (j) => (j?.type === 'content_block_delta' ? j?.delta?.text ?? '' : ''),
      parseFull: (j) => ({
        content: (j?.content ?? []).map((b: any) => b?.text ?? '').join(''),
        tokensUsed: j?.usage ? (j.usage.input_tokens ?? 0) + (j.usage.output_tokens ?? 0) : null,
      }),
    };
  }

  // google gemini
  const sysText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return {
    url: `${root}/v1beta/models/${encodeURIComponent(model)}:${action}`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents,
      ...(sysText ? { systemInstruction: { parts: [{ text: sysText }] } } : {}),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    parseStreamDelta: (j) => (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''),
    parseFull: (j) => ({
      content: (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''),
      tokensUsed: j?.usageMetadata?.totalTokenCount ?? null,
    }),
  };
}

// ============================================================
// 非流式调用
// ============================================================

export async function chat(config: LLMConfig, messages: LLMMessage[]): Promise<LLMResult> {
  const req = prepare(config, messages, false);
  let res: Response;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
  } catch (e) {
    throw mapNetworkError(e, config.baseUrl);
  }
  if (!res.ok) throw mapError(res.status, await res.text().catch(() => ''), config.provider);
  const json = await res.json().catch(() => ({}));
  const { content, tokensUsed } = req.parseFull(json);
  const used = tokensUsed ?? estimateTokens(messages.map((m) => m.content).join('') + content);
  return { content, tokensUsed: used, estimated: tokensUsed == null };
}

// ============================================================
// 流式调用（SSE）
// ============================================================

/**
 * 流式对话：每个增量回调 onDelta，返回完整结果。
 * onDelta 抛出或 abort 信号触发会中断读取。
 */
export async function streamChat(
  config: LLMConfig,
  messages: LLMMessage[],
  onDelta: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  const req = prepare(config, messages, true);
  let res: Response;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw mapNetworkError(e, config.baseUrl);
  }
  if (!res.ok) throw mapError(res.status, await res.text().catch(() => ''), config.provider);
  if (!res.body) {
    // 无 body 则退回非流式解析
    const json = await res.json().catch(() => ({}));
    const { content, tokensUsed } = req.parseFull(json);
    onDelta(content);
    return { content, tokensUsed: tokensUsed ?? estimateTokens(content), estimated: tokensUsed == null };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';

  const handleDataLine = (line: string): boolean => {
    // 返回 false 表示收到 [DONE]
    const payload = line.replace(/^data:\s*/, '').trim();
    if (!payload) return true;
    if (payload === '[DONE]') return false;
    try {
      const json = JSON.parse(payload);
      const delta = req.parseStreamDelta(json);
      if (delta) {
        full += delta;
        onDelta(full);
      }
    } catch {
      /* 半行/心跳注释忽略 */
    }
    return true;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data:')) {
          if (!handleDataLine(line)) { try { await reader.cancel(); } catch { /* */ } return finish(); }
        }
      }
    }
    if (buf.startsWith('data:')) handleDataLine(buf);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    // 读流中断但已有部分内容时，返回已收到的部分而不是整体失败
    if (full) return finish(true);
    throw mapNetworkError(e, config.baseUrl);
  }

  function finish(_partial = false): LLMResult {
    const used = estimateTokens(messages.map((m) => m.content).join('') + full);
    return { content: full, tokensUsed: used, estimated: true };
  }
  return finish();
}

// ============================================================
// 连接测试
// ============================================================

export interface TestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

/** 测连通性：发一条极短消息，验证 Key + BaseURL + 模型名 + CORS 全链路 */
export async function testConnection(config: LLMConfig): Promise<TestResult> {
  const start = Date.now();
  try {
    await chat(config, [
      { role: 'user', content: 'ping' },
    ]);
    return { ok: true, model: config.model, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      model: config.model,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** provider 默认 baseUrl（供设置页占位/自动补全） */
export const PROVIDER_DEFAULTS: Record<LLMConfig['provider'], { baseUrl: string; model: string; hint: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: '官方 API，支持浏览器直连' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', hint: '一个 Key 调多家模型，支持浏览器直连' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', hint: '已自动加浏览器直连头' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', hint: '免费额度友好' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', hint: '本地跑，需设 OLLAMA_ORIGINS=* 允许跨域' },
  custom: { baseUrl: '', model: '', hint: '任何 OpenAI 兼容端点（/chat/completions）' },
};
