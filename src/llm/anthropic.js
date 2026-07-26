// Anthropic Messages API（协议不同，单独实现）。
import { BaseProvider } from './base.js';
import { errorFromStatus, LLMError } from './errors.js';

export class AnthropicProvider extends BaseProvider {
  constructor(opts = {}) {
    super({
      name: 'anthropic',
      baseUrl: opts.baseUrl ?? 'https://api.anthropic.com',
      model: opts.model ?? 'claude-3-5-haiku-latest',
      ...opts,
    });
  }

  async complete(messages, { temperature = 0.2, maxTokens = 2000, model } = {}) {
    if (!this.isConfigured()) {
      throw new LLMError('anthropic: missing API key', { provider: this.name });
    }
    // system 消息独立成顶层参数
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const turns = messages.filter((m) => m.role !== 'system');
    const res = await this.transport(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model: model ?? this.model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: turns,
      },
      timeoutMs: this.timeoutMs,
    });
    if (res.status !== 200) {
      throw errorFromStatus(res.status, res.json ?? res.text, this.name);
    }
    const data = res.json ?? {};
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: data.model ?? this.model,
      usage: {
        prompt_tokens: data.usage?.input_tokens ?? 0,
        completion_tokens: data.usage?.output_tokens ?? 0,
        total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  }
}
