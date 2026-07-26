// OpenAI 兼容族：一套协议，六家厂商。
// openai / deepseek / moonshot / zhipu / qwen / openrouter 只差 baseUrl 与 model。
import { BaseProvider } from './base.js';
import { errorFromStatus, LLMError } from './errors.js';

export class OpenAICompatibleProvider extends BaseProvider {
  async complete(messages, { temperature = 0.2, maxTokens = 2000, model } = {}) {
    if (!this.isConfigured()) {
      throw new LLMError(`${this.name}: missing API key`, { provider: this.name });
    }
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: model ?? this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    const res = await this.transport(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      timeoutMs: this.timeoutMs,
    });
    if (res.status !== 200) {
      throw errorFromStatus(res.status, res.json ?? res.text, this.name);
    }
    const data = res.json ?? {};
    const text = data.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: data.model ?? body.model,
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}

/** OpenAI 兼容族的出厂配置。 */
export const OPENAI_FAMILY = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyHint: 'sk-...',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyHint: 'sk-...',
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    keyHint: 'sk-...',
  },
  zhipu: {
    label: 'Zhipu (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    keyHint: '<api-key>',
  },
  qwen: {
    label: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    keyHint: 'sk-...',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    keyHint: 'sk-or-...',
  },
};

export function createOpenAIFamilyProvider(vendor, opts = {}) {
  const meta = OPENAI_FAMILY[vendor];
  if (!meta) {
    throw new Error(`unknown OpenAI-family vendor '${vendor}'. Known: ${Object.keys(OPENAI_FAMILY).join(', ')}`);
  }
  return new OpenAICompatibleProvider({
    name: vendor,
    baseUrl: opts.baseUrl ?? meta.baseUrl,
    model: opts.model ?? meta.defaultModel,
    apiKey: opts.apiKey ?? '',
    transport: opts.transport,
    timeoutMs: opts.timeoutMs,
  });
}
