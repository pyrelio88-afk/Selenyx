import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { LLMConfig } from '@apptypes/index';
import { SettingsModal } from '../SettingsModal';

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  desktop: true,
  saveNative: vi.fn(),
  setLLMConfig: vi.fn(),
  config: null as LLMConfig | null,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const slot = harness.cursor++;
      if (!(slot in harness.slots)) harness.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [harness.slots[slot], (next: T | ((previous: T) => T)) => {
        harness.slots[slot] = typeof next === 'function' ? (next as (previous: T) => T)(harness.slots[slot] as T) : next;
      }];
    },
    useRef: <T,>(initial: T) => {
      const slot = harness.cursor++;
      if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
      return harness.slots[slot];
    },
    useCallback: <T,>(callback: T) => callback,
    useEffect: (callback: () => void | (() => void)) => { harness.effects.push(callback); },
    useLayoutEffect: vi.fn(),
  };
});
vi.mock('@stores/appStore', () => ({
  useAppStore: () => ({
    settingsOpen: true, settingsSection: 'model', llmConfig: harness.config,
    setLLMConfig: harness.setLLMConfig, projects: [], references: [], tables: [], notes: [],
  }),
}));
vi.mock('@services/nativeRuntime', () => ({
  isDesktopTauri: () => harness.desktop,
  isMobileTauri: () => false,
  saveLocalLLMConfig: harness.saveNative,
}));
vi.mock('@components/settings/MemorySection', () => ({ MemorySection: () => null }));
vi.mock('@services/workspaceBackup', () => ({ WORKSPACE_BACKUP_SCOPE: '' }));

interface ElementProps {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  type?: string;
  role?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
}
type Element = ReactElement<ElementProps>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<ElementProps>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function render() {
  harness.cursor = 0;
  harness.effects = [];
  return SettingsModal();
}
function button(label: string) {
  const result = elements(render()).find((node) => node.type === 'button' && text(node) === label);
  expect(result, `Button ${label}`).toBeDefined();
  return result!;
}
function input(label: string) {
  const parent = elements(render()).find((node) => node.type === 'label' && text(node).trim().startsWith(label));
  const result = elements(parent).find((node) => node.type === 'input' || node.type === 'select');
  expect(result, `Input ${label}`).toBeDefined();
  return result!;
}
function change(label: string, value: string) {
  input(label).props.onChange!({ target: { value } });
}
async function mount() {
  render();
  harness.effects.forEach((effect) => effect());
  await vi.waitFor(() => expect(text(render())).toContain('effective-model'));
}
const previous: LLMConfig = {
  provider: 'openai', apiKey: 'legacy-memory-only', baseUrl: 'https://previous.invalid/v1', model: 'previous-model',
  temperature: 0.3, maxTokens: 4096, tokenBudget: 0, tokensUsed: 7,
};
const effective = { configured: true, baseUrl: 'https://effective.invalid/v1', model: 'effective-model' };
let fetchMock: ReturnType<typeof vi.fn>;
let gatewayFails: boolean;
let gatewayOk: boolean;
let configFails: boolean;

beforeEach(() => {
  harness.slots = [];
  harness.desktop = true;
  harness.config = { ...previous };
  harness.saveNative.mockReset().mockResolvedValue(undefined);
  harness.setLLMConfig.mockReset().mockImplementation((config: LLMConfig) => { harness.config = config; });
  gatewayFails = false;
  gatewayOk = true;
  configFails = false;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET');
    if (url.endsWith('/ai/config')) return new Response(JSON.stringify(effective), { status: configFails ? 503 : 200 });
    if (url.endsWith('/ai/magpie/models')) return new Response(JSON.stringify({ models: ['deepseek/deepseek-flash', 'openrouter/nvidia/nemotron-3.5-lightning:free'] }));
    if (url.endsWith('/health')) return new Response(JSON.stringify({ storage: 'fixture', llmConfigured: true }));
    if (url.endsWith('/ai/test')) return new Response(JSON.stringify({ ok: gatewayOk, model: 'gateway-test-model' }), { status: gatewayFails ? 503 : 200 });
    throw new Error(`Unexpected outbound request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('SettingsModal desktop model configuration', () => {
  it('awaits native persistence, clears the input, and stores only safe metadata without equating it to effective config', async () => {
    await mount();
    expect(input('API Key').props.value).toBe('');
    change('API Key', ' fixture-secret ');
    change('Base URL', ' https://saved.invalid/v1 ');
    change('模型', ' saved-model ');
    let finish!: () => void;
    harness.saveNative.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    button('保存配置').props.onClick!();
    expect(button('保存中…').props.disabled).toBe(true);
    expect(button('测试连接').props.disabled).toBe(true);
    expect(input('模型').props.disabled).toBe(true);
    expect(harness.setLLMConfig).not.toHaveBeenCalled();
    expect(harness.config).toEqual(previous);
    expect(harness.saveNative).toHaveBeenCalledWith({ apiKey: 'fixture-secret', baseUrl: 'https://saved.invalid/v1', model: 'saved-model' });
    finish();
    await vi.waitFor(() => expect(harness.setLLMConfig).toHaveBeenCalledTimes(1));
    expect(harness.config).toEqual({ ...previous, apiKey: undefined, baseUrl: 'https://saved.invalid/v1', model: 'saved-model' });
    expect(JSON.stringify(harness.setLLMConfig.mock.calls)).not.toContain('fixture-secret');
    expect(input('API Key').props.value).toBe('');
    expect(text(render())).toContain('已保存到本机私有配置');
    await vi.waitFor(() => expect(text(render())).toContain('effective-model'));
    expect(input('模型').props.value).toBe(' saved-model ');
    expect(text(render())).toContain('环境变量可能覆盖');
    change('模型', 'new-unsaved-model');
    expect(text(render())).not.toContain('已保存到本机私有配置');
  });

  it('keeps previous state and the retry input on failed native save without leaking error secrets', async () => {
    await mount();
    harness.saveNative.mockRejectedValue(new Error('fixture-secret'));
    change('API Key', 'fixture-secret');
    change('模型', 'failed-model');
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain('保存失败'));
    expect(harness.config).toEqual(previous);
    expect(harness.setLLMConfig).not.toHaveBeenCalled();
    expect(input('API Key').props.value).toBe('fixture-secret');
    expect(text(render())).not.toContain('fixture-secret');
    expect(text(render())).not.toContain('已保存到本机私有配置');
    expect(button('保存配置').props.disabled).toBe(false);
  });

  it.each(['', '   '])('omits a blank remote key (%j) so native preserves its private key', async (key) => {
    await mount();
    change('API Key', key);
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(harness.setLLMConfig).toHaveBeenCalledTimes(1));
    expect(harness.saveNative).toHaveBeenCalledWith({ baseUrl: previous.baseUrl, model: previous.model });
    expect(harness.saveNative.mock.calls[0][0]).not.toHaveProperty('apiKey');
  });

  it('explicitly clears the native key for Ollama, including a previously entered draft key', async () => {
    await mount();
    change('API Key', 'remote-draft-key');
    change('提供商', 'ollama');
    expect(input('API Key').props.disabled).toBe(true);
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(harness.setLLMConfig).toHaveBeenCalledTimes(1));
    expect(harness.saveNative.mock.calls[0][0]).toMatchObject({ apiKey: '', baseUrl: 'http://localhost:11434/v1' });
    expect(harness.config?.apiKey).toBeUndefined();
  });

  it('reads the local Magpie directory without saving or calling a model until explicitly requested', async () => {
    await mount();
    change('API Key', 'remote-draft-key');
    change('提供商', 'magpie');
    render();
    harness.effects.forEach((effect) => effect());
    await vi.waitFor(() => expect(text(render())).toContain('目录列出 2 个模型'));
    expect(input('API Key').props.disabled).toBe(true);
    expect(input('Base URL').props.disabled).toBe(true);
    expect(button('保存配置').props.disabled).toBe(true);
    expect(harness.saveNative).not.toHaveBeenCalled();
    expect(harness.setLLMConfig).not.toHaveBeenCalled();
    const picker = input('Magpie 本机模型目录');
    picker.props.onChange!({ target: { value: 'deepseek/deepseek-flash' } });
    expect(input('模型').props.value).toBe('deepseek/deepseek-flash');
    expect(harness.saveNative).not.toHaveBeenCalled();
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(harness.setLLMConfig).toHaveBeenCalledTimes(1));
    expect(harness.saveNative).toHaveBeenCalledWith({ apiKey: '', baseUrl: 'http://127.0.0.1:3425/v1', model: 'deepseek/deepseek-flash' });
    expect(harness.config?.apiKey).toBeUndefined();
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''))).not.toContain('/api/ai/test');
  });

  it.each(['anthropic', 'google'] as const)('requires explicit selection when legacy provider %s is unsupported', async (provider) => {
    harness.config = { ...previous, provider };
    await mount();
    expect(input('提供商').props.value).toBe('');
    const choices = elements(input('提供商')).filter((node) => node.type === 'option').map((node) => node.props.value);
    expect(choices).not.toContain('anthropic');
    expect(choices).not.toContain('google');
    expect(button('保存配置').props.disabled).toBe(true);
    button('保存配置').props.onClick!();
    expect(harness.saveNative).not.toHaveBeenCalled();
    expect(harness.setLLMConfig).not.toHaveBeenCalled();
  });

  it('reports unknown effective state when metadata refresh fails after a successful save', async () => {
    await mount();
    configFails = true;
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain('当前生效状态未知'));
    expect(text(render())).toContain('已保存到本机私有配置');
    expect(text(render())).not.toContain('effective-model');
    expect(button('刷新后端配置').props.disabled).toBe(false);
    configFails = false;
    button('刷新后端配置').props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain('effective-model'));
  });

  it.each([true, false])('reports gateway failure with zero external requests (desktop=%s)', async (desktop) => {
    harness.desktop = desktop;
    await mount();
    gatewayFails = true;
    change('API Key', 'unsaved-test-secret');
    fetchMock.mockClear();
    button('测试连接').props.onClick!();
    expect(button('测试中…').props.disabled).toBe(true);
    await vi.waitFor(() => expect(text(render())).toContain('后端连接失败'));
    expect(text(render())).not.toContain('后端连接成功');
    expect(harness.saveNative).not.toHaveBeenCalled();
    expect(harness.setLLMConfig).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''))).toEqual(['/api/ai/test', '/api/ai/config']);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('secret');
  });

  it('does not treat an HTTP 200 with ok=false as a successful gateway test', async () => {
    await mount();
    gatewayOk = false;
    button('测试连接').props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain('后端网关未通过连接测试'));
    expect(text(render())).not.toContain('后端连接成功');
  });

  it('shows the model actually returned by the backend connection test', async () => {
    await mount();
    change('模型', 'unsaved-model');
    button('测试连接').props.onClick!();
    await vi.waitFor(() => expect(text(render())).toContain('后端连接成功：gateway-test-model'));
    expect(harness.saveNative).not.toHaveBeenCalled();
  });

  it('keeps browser-only configuration transient and explicitly separate from research backend settings', async () => {
    harness.desktop = false;
    await mount();
    change('API Key', 'browser-fixture-key');
    button('保存配置').props.onClick!();
    await vi.waitFor(() => expect(harness.setLLMConfig).toHaveBeenCalledTimes(1));
    expect(harness.config?.apiKey).toBe('browser-fixture-key');
    expect(harness.saveNative).not.toHaveBeenCalled();
    expect(text(render())).toContain('研究后端未更改');
    expect(text(render())).toContain('不会配置研究任务后端');
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
  });
});
