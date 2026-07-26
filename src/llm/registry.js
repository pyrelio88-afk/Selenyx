// Provider 注册表：7 家厂商 + stub。
// createProvider 是唯一入口——CLI / onboarding / manager 都走这里。
import { StubProvider } from './base.js';
import { createOpenAIFamilyProvider, OPENAI_FAMILY } from './openaiFamily.js';
import { AnthropicProvider } from './anthropic.js';

export const PROVIDER_META = {
  ...Object.fromEntries(
    Object.entries(OPENAI_FAMILY).map(([k, v]) => [k, { label: v.label, keyHint: v.keyHint, family: 'openai' }]),
  ),
  anthropic: { label: 'Anthropic (Claude)', keyHint: 'sk-ant-...', family: 'anthropic' },
};

export const PROVIDER_NAMES = Object.keys(PROVIDER_META);

export function listProviders() {
  return PROVIDER_NAMES.map((name) => ({ name, ...PROVIDER_META[name] }));
}

/**
 * 创建 provider。
 * @param name 厂商名（'stub' 返回 StubProvider）
 * @param opts { apiKey, model, baseUrl, transport, timeoutMs }
 */
export function createProvider(name, opts = {}) {
  if (!name || name === 'stub') return new StubProvider(opts);
  if (PROVIDER_META[name]?.family === 'anthropic') {
    return new AnthropicProvider(opts);
  }
  if (PROVIDER_META[name]?.family === 'openai') {
    return createOpenAIFamilyProvider(name, opts);
  }
  throw new Error(`unknown provider '${name}'. Registered: ${['stub', ...PROVIDER_NAMES].join(', ')}`);
}

/** 从配置对象创建（配置缺 key → stub，诚实降级不报错）。 */
export function providerFromConfig(config = {}) {
  const name = config.provider ?? 'stub';
  if (name === 'stub' || !config.apiKey) return new StubProvider();
  return createProvider(name, {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
  });
}
