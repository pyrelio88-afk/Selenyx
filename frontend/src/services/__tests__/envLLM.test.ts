import { describe, expect, it } from 'vitest';
import { parseEnvironmentLLM } from '../envLLM';

describe('parseEnvironmentLLM', () => {
  it('leaves AI disabled when no VITE_LLM values exist', () => {
    expect(parseEnvironmentLLM({})).toEqual({ config: null, error: null });
  });

  it('loads a keyless local Ollama configuration', () => {
    const result = parseEnvironmentLLM({
      VITE_LLM_PROVIDER: 'ollama',
      VITE_LLM_BASE_URL: 'http://127.0.0.1:11434/v1',
      VITE_LLM_MODEL: 'qwen3:0.6b',
    });

    expect(result.error).toBeNull();
    expect(result.config).toMatchObject({ provider: 'ollama', model: 'qwen3:0.6b' });
    expect(result.config?.apiKey).toBeUndefined();
  });

  it('rejects an incomplete remote provider configuration', () => {
    const result = parseEnvironmentLLM({
      VITE_LLM_PROVIDER: 'openai',
      VITE_LLM_BASE_URL: 'https://api.openai.com/v1',
      VITE_LLM_MODEL: 'gpt-4.1-mini',
    });

    expect(result.config).toBeNull();
    expect(result.error).toContain('VITE_LLM_API_KEY');
  });
});
