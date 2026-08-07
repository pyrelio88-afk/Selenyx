import type { LLMConfig, LLMProvider } from '@apptypes/index';

const PROVIDERS = new Set<LLMProvider>([
  'openai', 'openrouter', 'anthropic', 'google', 'ollama', 'agnes', 'custom',
]);

export interface EnvironmentLLM {
  config: LLMConfig | null;
  error: string | null;
}

type EnvironmentValues = Record<string, string | undefined>;

/**
 * Reads the optional, build-time AI configuration.  Selenyx deliberately
 * never writes provider credentials to localStorage or a native host.  In a
 * static Vite application VITE_* values are part of the built client, so this
 * is suitable only for a private local build (or a keyless local Ollama).
 */
export function parseEnvironmentLLM(values: EnvironmentValues): EnvironmentLLM {
  const read = (name: string) => (values[name] ?? '').trim();
  const providerValue = read('VITE_LLM_PROVIDER').toLowerCase();
  const baseUrl = read('VITE_LLM_BASE_URL');
  const model = read('VITE_LLM_MODEL');
  const apiKey = read('VITE_LLM_API_KEY');
  const hasAnyValue = Boolean(providerValue || baseUrl || model || apiKey);

  if (!hasAnyValue) return { config: null, error: null };
  if (!PROVIDERS.has(providerValue as LLMProvider)) {
    return { config: null, error: 'VITE_LLM_PROVIDER must be one of: openai, openrouter, anthropic, google, ollama, agnes, custom.' };
  }
  if (!baseUrl || !model) {
    return { config: null, error: 'VITE_LLM_BASE_URL and VITE_LLM_MODEL are required when AI is configured.' };
  }
  const provider = providerValue as LLMProvider;
  if (provider !== 'ollama' && !apiKey) {
    return { config: null, error: 'VITE_LLM_API_KEY is required for remote AI providers. For a keyless local model, use provider=ollama.' };
  }

  return {
    error: null,
    config: {
      provider,
      ...(apiKey ? { apiKey } : {}),
      baseUrl,
      model,
      temperature: 0.3,
      maxTokens: 4096,
      tokenBudget: 1_000_000,
      tokensUsed: 0,
    },
  };
}

export function readEnvironmentLLM(): EnvironmentLLM {
  return parseEnvironmentLLM(import.meta.env);
}
