/**
 * 设置弹窗（v4 · WorkBuddy 范式）：模态 + 左轨 9 分区，不再是路由视图。
 *
 * 触发：用户区浮层「设置」或 Ctrl+,；Esc / 遮罩 / × 关闭。
 * 内容由旧 SettingsView 平移重组：通用（后端状态）/ 外观 / 个性化 / 记忆 /
 * 模型（BYOK）/ 助理（桌宠）/ 数据管理 / 快捷键 / 关于。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore, type SettingsSection } from '@stores/appStore';
import { THEME_OPTIONS } from '@hooks/useTheme';
import { Icon, type IconName } from '@components/ui/Icon';
import { DensityToggle } from '@components/ui/StatusChip';
import { PROVIDER_DEFAULTS, type TestResult } from '@services/llm';
import type { LLMConfig } from '@apptypes/index';
import { isDesktopTauri, saveLocalLLMConfig } from '@services/nativeRuntime';
import { aiApi, localApi } from '@services/api';
import { MemorySection } from '@components/settings/MemorySection';
import {
  clearSelenyxBrowserStorage,
  createWorkspaceBackupJson,
  restoreWorkspaceBackup,
  WORKSPACE_BACKUP_SCOPE,
} from '@services/workspaceBackup';
import { APP_VERSION } from '@lib/appVersion';
import { rawErrorText, serviceErrorMessage } from '@lib/userFacingError';
import { confirmAction, notify } from '@lib/appFeedback';
// 复用旧设置页的卡片网格/统计样式（theme-choice-grid、settings-data-stats 等）
import '../views/settings-workbench.css';

const SECTIONS: { key: SettingsSection; label: string; icon: IconName }[] = [
  { key: 'general', label: '通用', icon: 'settings' },
  { key: 'appearance', label: '外观', icon: 'sun' },
  { key: 'personality', label: '个性化', icon: 'pencil' },
  { key: 'memory', label: '记忆', icon: 'notes' },
  { key: 'model', label: '模型', icon: 'aiChat' },
  { key: 'assistant', label: '助理', icon: 'sparkles' },
  { key: 'data', label: '数据管理', icon: 'references' },
  { key: 'shortcuts', label: '快捷键', icon: 'pipeline' },
  { key: 'about', label: '关于', icon: 'dashboard' },
];

const OLLAMA_MODELS = [
  ['Qwen3 0.6B', 'qwen3:0.6b', '轻量中文/多语种起步模型'],
  ['Gemma 3 1B', 'gemma3:1b', '轻量通用文本理解'],
  ['Qwen3 1.7B', 'qwen3:1.7b', '速度与推理能力的平衡'],
  ['Qwen2.5 7B', 'qwen2.5:7b', '较强的综合研究辅助'],
] as const;

const AGNES_MODELS = [
  ['2.5 Flash', 'agnes-2.5-flash'],
  ['2.5 Pro', 'agnes-2.5-pro'],
  ['2.5 Pro Alpha', 'agnes-2.5-pro-alpha'],
] as const;

const GATEWAY_PROVIDERS: LLMConfig['provider'][] = ['openai', 'openrouter', 'ollama', 'magpie', 'agnes', 'custom'];
type ModelForm = { provider: LLMConfig['provider'] | ''; apiKey: string; baseUrl: string; model: string };
type BackendConfig = Awaited<ReturnType<typeof aiApi.config>>;

function downloadWorkspace(json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `selenyx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsModal() {
  const {
    settingsOpen, settingsSection, closeSettings, openSettings,
    theme, setTheme, mode, setMode, density, setDensity,
    fontScale, setFontScale,
    llmConfig, setLLMConfig,
    petEnabled, setPetEnabled, petNotifyDone, setPetNotifyDone, petNotifyPending, setPetNotifyPending,
    replyStyle, setReplyStyle, customInstructions, setCustomInstructions,
    projects, references, tables, notes, setView,
  } = useAppStore();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [backendHealth, setBackendHealth] = useState<string>('检测中…');
  const [backendDetail, setBackendDetail] = useState('');
  const [backendDetailTitle, setBackendDetailTitle] = useState('');
  const [healthTick, setHealthTick] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const desktop = isDesktopTauri();
  const providers = desktop ? GATEWAY_PROVIDERS : Object.keys(PROVIDER_DEFAULTS) as LLMConfig['provider'][];
  const unsupportedProvider = desktop && llmConfig && !GATEWAY_PROVIDERS.includes(llmConfig.provider);
  const [form, setForm] = useState<ModelForm>(() => ({
    provider: unsupportedProvider ? '' : llmConfig?.provider ?? 'openrouter',
    apiKey: desktop ? '' : llmConfig?.apiKey ?? '',
    baseUrl: unsupportedProvider ? '' : llmConfig?.baseUrl ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].baseUrl,
    model: unsupportedProvider ? '' : llmConfig?.model ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].model,
  }));
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const configRequest = useRef(0);
  const [magpieModels, setMagpieModels] = useState<string[]>([]);
  const [magpieStatus, setMagpieStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  const refreshBackendConfig = useCallback(async () => {
    const request = ++configRequest.current;
    setConfigStatus('loading');
    setBackendConfig(null);
    try {
      const config = await aiApi.config(AbortSignal.timeout(8000));
      if (request !== configRequest.current) return;
      setBackendConfig(config);
      setConfigStatus('ready');
    } catch {
      if (request !== configRequest.current) return;
      setConfigStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== 'model') return;
    void refreshBackendConfig();
    return () => { configRequest.current += 1; };
  }, [settingsOpen, settingsSection, refreshBackendConfig]);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== 'model' || form.provider !== 'magpie') return;
    const controller = new AbortController();
    setMagpieStatus('loading');
    setMagpieModels([]);
    void aiApi.magpieModels(controller.signal).then(({ models }) => {
      if (controller.signal.aborted) return;
      setMagpieModels(models);
      setMagpieStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setMagpieStatus('error');
    });
    return () => controller.abort();
  }, [settingsOpen, settingsSection, form.provider]);

  useEffect(() => {
    if (!settingsOpen) {
      setForm((current) => ({ ...current, apiKey: '' }));
      setTestResult(null);
    }
  }, [settingsOpen]);

  useLayoutEffect(() => {
    if (!settingsOpen || !modalRef.current) return;
    const modal = modalRef.current;
    const previousFocus = document.activeElement;
    // The account menu unmounts before this effect. Its persistent trigger is
    // the return target when the menu item has already yielded focus to body.
    const returnTarget = previousFocus instanceof HTMLElement && previousFocus !== document.body
      ? previousFocus
      : document.querySelector<HTMLElement>('[aria-controls="user-menu"]');
    let lastFocused: HTMLElement | null = null;

    const isAvailable = (element: HTMLElement) => element.isConnected
      && !element.matches(':disabled')
      && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible';
    const getTabStops = () => Array.from(modal.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable="true"], [tabindex]',
    )).filter((element) => element.tabIndex >= 0 && isAvailable(element));

    const containFocus = (event: FocusEvent) => {
      if (document.querySelector('.feedback-confirm-overlay')) return;
      if (event.target instanceof HTMLElement && modal.contains(event.target)) {
        lastFocused = event.target;
        return;
      }
      const target = lastFocused && modal.contains(lastFocused) && isAvailable(lastFocused)
        ? lastFocused
        : getTabStops()[0] ?? modal;
      target.focus({ preventScroll: true });
    };
    const containTab = (event: KeyboardEvent) => {
      if (document.querySelector('.feedback-confirm-overlay')) return;
      // Escape and the application shortcuts remain owned by App.tsx.
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      // Re-query for each key press: sections, disabled actions and memory
      // editors can change while the dialog stays open.
      const tabStops = getTabStops();
      const first = tabStops[0];
      const last = tabStops[tabStops.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        modal.focus();
      } else if (!tabStops.some((element) => element === active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('focusin', containFocus, true);
    document.addEventListener('keydown', containTab, true);
    (closeRef.current ?? modal).focus({ preventScroll: true });
    return () => {
      document.removeEventListener('focusin', containFocus, true);
      document.removeEventListener('keydown', containTab, true);
      if (returnTarget && isAvailable(returnTarget)) {
        returnTarget.focus({ preventScroll: true });
        if (document.activeElement === returnTarget) return;
      }
      // A navigation action may have removed the opener; use the stable main
      // landmark instead of leaving keyboard focus on the detached dialog.
      document.querySelector<HTMLElement>('#workspace-main')?.focus({ preventScroll: true });
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    setBackendHealth('检测中…');
    (async () => {
      try {
        const health = await localApi.health();
        if (cancelled) return;
        setBackendHealth('在线');
        setBackendDetailTitle('');
        setBackendDetail(`存储 ${health.storage} · LLM 网关 ${health.llmConfigured ? '已配置' : '未配置'}`);
      } catch (error) {
        if (cancelled) return;
        setBackendHealth('离线（前端本地降级）');
        setBackendDetailTitle(rawErrorText(error));
        setBackendDetail(serviceErrorMessage(error, '无法连接本机后端'));
      }
    })();
    return () => { cancelled = true; };
  }, [settingsOpen, healthTick]);

  if (!settingsOpen) return null;

  const saving = saveStatus === 'saving';
  const updateForm = (patch: Partial<ModelForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaveStatus('idle');
    setTestResult(null);
  };
  const applyProvider = (provider: LLMConfig['provider']) => {
    if (desktop && !GATEWAY_PROVIDERS.includes(provider)) return;
    const defaults = PROVIDER_DEFAULTS[provider];
    updateForm({ provider, apiKey: '', baseUrl: defaults.baseUrl, model: defaults.model });
  };

  const saveForm = async () => {
    if (saving || testing || !form.provider || !form.baseUrl.trim() || !form.model.trim()) return;
    if (desktop && !GATEWAY_PROVIDERS.includes(form.provider)) return;
    const baseUrl = form.provider === 'magpie' ? PROVIDER_DEFAULTS.magpie.baseUrl : form.baseUrl.trim();
    const model = form.model.trim();
    const apiKey = form.provider === 'ollama' || form.provider === 'magpie' ? '' : form.apiKey.trim() || undefined;
    setSaveStatus('saving');
    setTestResult(null);
    try {
      if (desktop) {
        await saveLocalLLMConfig({ baseUrl, model, ...(apiKey !== undefined ? { apiKey } : {}) });
      }
      setLLMConfig({
        provider: form.provider,
        apiKey: desktop ? undefined : apiKey,
        baseUrl,
        model,
        temperature: llmConfig?.temperature ?? 0.3,
        maxTokens: llmConfig?.maxTokens ?? 4096,
        tokenBudget: llmConfig?.tokenBudget ?? 0,
        tokensUsed: llmConfig?.tokensUsed ?? 0,
      });
      setForm((current) => ({ ...current, apiKey: '' }));
      setSaveStatus('saved');
      if (desktop) void refreshBackendConfig();
    } catch {
      setSaveStatus('error');
    }
  };

  const saveInstructions = () => {
    setInstructionsSaved(true);
    window.setTimeout(() => setInstructionsSaved(false), 2400);
  };

  async function testLLM() {
    if (saving || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const gateway = await aiApi.testConnection();
      setTestResult({
        ok: gateway.ok,
        model: gateway.model,
        latencyMs: 0,
        error: gateway.ok ? undefined : '后端网关未通过连接测试',
      });
    } catch {
      setTestResult({
        ok: false,
        model: 'unconfigured',
        latencyMs: 0,
        error: '后端网关不可用或模型调用失败，请检查后端服务、凭据与模型配置。未尝试浏览器直连。',
      });
    } finally {
      setTesting(false);
      void refreshBackendConfig();
    }
  }

  function exportData() {
    downloadWorkspace(createWorkspaceBackupJson());
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await restoreWorkspaceBackup(await file.text());
        notify('JSON 工作区已合并；未删除现有项目或本机后端数据。', 'success');
      } catch (error) {
        notify(`导入失败：${serviceErrorMessage(error, '文件格式不正确')}`, 'error');
      }
    };
    input.click();
  }

  async function clearData() {
    const confirmed = await confirmAction({
      title: '清除本机工作区数据？',
      message: '会清空当前浏览器中保存的全部 Selenyx 数据，且不可恢复；建议先导出 JSON 备份。',
      danger: true,
      confirmLabel: '确认清除',
    });
    if (!confirmed) return;
    clearSelenyxBrowserStorage();
    window.location.reload();
  }

  return (
    <div className="settings-overlay" onClick={closeSettings} role="presentation">
      <div
        ref={modalRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-modal-header">
          <h2>设置</h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={closeSettings} aria-label="关闭设置">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="settings-modal-body">
          <nav className="settings-modal-rail" aria-label="设置分区">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`settings-modal-tab ${settingsSection === section.key ? 'active' : ''}`}
                onClick={() => openSettings(section.key)}
                aria-current={settingsSection === section.key ? 'true' : undefined}
              >
                <Icon name={section.icon} size={16} />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-modal-content">
            {settingsSection === 'general' && (
              <section aria-label="通用">
                <div className="settings-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>后端服务状态</h3>
                    <button
                      type="button"
                      className="btn"
                      style={{ minHeight: 32, fontSize: 12.5 }}
                      onClick={() => setHealthTick((tick) => tick + 1)}
                      disabled={backendHealth === '检测中…'}
                    >
                      {backendHealth === '检测中…' ? '检测中…' : '重新检测'}
                    </button>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{backendHealth}</p>
                  <p title={backendDetailTitle || undefined} style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{backendDetail}</p>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    桌面版启动时自动拉起<strong>当前这台电脑</strong>上的本机后端（只听本机回环）。开发时分开启动后端即可。
                  </p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>显示语言</h3>
                  <select disabled value="zh" aria-label="显示语言" style={{ minHeight: 38, minWidth: 180 }}>
                    <option value="zh">简体中文</option>
                  </select>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>多语言在路线图上，当前版本仅简体中文。</p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>字体大小</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="range"
                      min={0.9}
                      max={1.15}
                      step={0.05}
                      value={fontScale}
                      onChange={(event) => setFontScale(Number(event.target.value))}
                      aria-label="界面缩放"
                      style={{ flex: 1, maxWidth: 260 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 44 }}>{Math.round(fontScale * 100)}%</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>整体缩放界面字号与控件，即时生效。</p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>开机自启</h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    桌面安装版的开机自启由系统管理（Windows：设置 → 应用 → 启动）。开发模式无此项。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'appearance' && (
              <section aria-label="外观">
                <div className="settings-group">
                  <h3 style={{ marginBottom: 16, fontSize: 16 }}>主题</h3>
                  <div className="theme-choice-grid">
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`theme-choice ${theme === option.key ? 'is-active' : ''}`}
                        onClick={() => setTheme(option.key)}
                        aria-pressed={theme === option.key}
                      >
                        <span className="theme-choice-head">
                          <span className="theme-choice-swatch" style={{ background: option.swatch }} aria-hidden="true" />
                          <span className="theme-choice-name">{option.name}</span>
                        </span>
                        <span className="theme-choice-desc">{option.description}</span>
                      </button>
                    ))}
                  </div>
                  <div className="settings-control-row" role="group" aria-label="显示模式">
                    <button type="button" className={`btn ${mode === 'light' ? 'btn-primary' : ''}`} aria-pressed={mode === 'light'} onClick={() => setMode('light')}><Icon name="sun" size={16} /> 日间</button>
                    <button type="button" className={`btn ${mode === 'dark' ? 'btn-primary' : ''}`} aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}><Icon name="moon" size={16} /> 夜间</button>
                  </div>
                  <p className="settings-appearance-note">
                    主题只改变强调色：按钮、图标、进度条与焦点环。页面底色、文字和边框始终保持中性，不铺大面积色块。
                  </p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 16, fontSize: 16 }}>界面密度</h3>
                  <DensityToggle density={density} onChange={setDensity} />
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>紧凑模式显示更多信息；宽松模式提供更大的留白。</p>
                </div>
              </section>
            )}

            {settingsSection === 'personality' && (
              <section aria-label="个性化">
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>回复风格</h3>
                  <div className="v4-segmented" role="group" aria-label="回复风格" style={{ maxWidth: 360 }}>
                    <button type="button" className={replyStyle === 'concise' ? 'active' : ''} aria-pressed={replyStyle === 'concise'} onClick={() => setReplyStyle('concise')}>简洁</button>
                    <button type="button" className={replyStyle === 'balanced' ? 'active' : ''} aria-pressed={replyStyle === 'balanced'} onClick={() => setReplyStyle('balanced')}>均衡</button>
                    <button type="button" className={replyStyle === 'thorough' ? 'active' : ''} aria-pressed={replyStyle === 'thorough'} onClick={() => setReplyStyle('thorough')}>详尽</button>
                  </div>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>自定义指令</h3>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    写给 Selenyx 的长期要求（如「回答用中文」「结论先给」）。将注入所有对话与 agent 任务的 system 后缀。
                  </p>
                  <textarea
                    value={customInstructions}
                    onChange={(event) => setCustomInstructions(event.target.value)}
                    rows={5}
                    maxLength={1500}
                    placeholder="例如：所有输出使用简体中文；引用必须给出处；不确定就明说不知道。"
                    style={{ width: '100%', resize: 'vertical' }}
                    aria-label="自定义指令"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={saveInstructions} style={{ minHeight: 36 }}>保存</button>
                    {instructionsSaved && <span role="status" style={{ fontSize: 12.5, color: 'var(--success)' }}>已保存</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>{customInstructions.length}/1500</span>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    已接通：每次 agent 任务启动时，这段指令会作为 system 后缀注入（≤1500 字）。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'memory' && <MemorySection />}

            {settingsSection === 'model' && (
              <section aria-label="模型">
                <div className="settings-group settings-llm-card">
                  <h3>AI 配置（BYOK）</h3>
                  <p className="settings-llm-lead">
                    {desktop
                      ? '研究任务由 Python 后端执行。保存会先写入桌面本机私有配置；密钥不会存入前端状态或浏览器存储。'
                      : '浏览器开发模式：此表单仅设置旧版聊天的临时前端连接，不会配置研究任务后端。研究任务仍由 Python 后端执行，请在后端配置 SELENYX_LLM_*。'}
                  </p>
                  {desktop && <p className="settings-llm-note">仅支持 OpenAI 兼容接口；不支持 Anthropic / Gemini 原生协议。远程提供商的 API Key 留空会保留本机已有私钥；切换提供商时请确认密钥适用。Ollama 和 Magpie 保存时会清除本机私钥。</p>}
                  {unsupportedProvider && <p role="alert">原前端提供商不受研究网关支持，请重新选择兼容提供商。</p>}
                  <h4>待保存配置</h4>
                  <div className="settings-llm-form">
                    <label>
                      提供商
                      <select disabled={saving || testing} value={form.provider} onChange={(e) => applyProvider(e.target.value as LLMConfig['provider'])}>
                        {!form.provider && <option value="" disabled>请选择兼容提供商</option>}
                        {providers.map((p) => (
                          <option key={p} value={p}>{p} — {PROVIDER_DEFAULTS[p].hint}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      API Key
                      <input
                        type="password"
                        disabled={saving || testing || form.provider === 'ollama' || form.provider === 'magpie'}
                        value={form.apiKey}
                        onChange={(e) => updateForm({ apiKey: e.target.value })}
                        placeholder={form.provider === 'ollama' || form.provider === 'magpie' ? '不使用密钥，保存时清除' : desktop ? '留空保留本机私钥' : 'sk-…'}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Base URL
                      <input disabled={saving || testing || form.provider === 'magpie'} value={form.baseUrl} onChange={(e) => updateForm({ baseUrl: e.target.value })} placeholder="https://…" />
                    </label>
                    <label>
                      模型
                      <input disabled={saving || testing} value={form.model} onChange={(e) => updateForm({ model: e.target.value })} placeholder="模型名" />
                    </label>
                    {form.provider === 'magpie' && (
                      <div>
                        <label>
                          Magpie 本机模型目录
                          <select disabled={saving || testing || magpieStatus !== 'ready' || magpieModels.length === 0} value={magpieModels.includes(form.model) ? form.model : ''} onChange={(e) => updateForm({ model: e.target.value })}>
                            <option value="">从目录选择模型</option>
                            {magpieModels.map((id) => <option key={id} value={id}>{id}</option>)}
                          </select>
                        </label>
                        {magpieStatus === 'loading' && <p role="status">正在读取本机模型目录…</p>}
                        {magpieStatus === 'error' && <p role="alert">无法读取 Magpie 模型目录；请检查本机服务，或手动填写模型 ID。</p>}
                        {magpieStatus === 'ready' && <p className="settings-appearance-note">目录列出 {magpieModels.length} 个模型；仅代表可见，不保证可调用。选择后点击保存，再测试当前生效模型。</p>}
                      </div>
                    )}
                    <div className="settings-llm-actions">
                      <button type="button" className="btn btn-primary" onClick={() => { void saveForm(); }} disabled={saving || testing || !form.provider || !form.baseUrl.trim() || !form.model.trim()}>
                        {saving ? '保存中…' : '保存配置'}
                      </button>
                      {saveStatus === 'saved' && <span role="status">{desktop ? '已保存到本机私有配置；后端生效情况见下方。' : '已设置临时前端连接；研究后端未更改。'}</span>}
                      {saveStatus === 'error' && <span role="alert">保存失败：{desktop ? '无法写入本机私有配置，请检查桌面权限后重试。' : '无法更新前端配置，请重试。'}原配置未更改。</span>}
                    </div>
                  </div>
                  <section aria-label="后端当前生效配置" style={{ marginTop: 16, overflowWrap: 'anywhere' }}>
                    <h4>后端当前生效配置</h4>
                    <p className="settings-appearance-note">独立读取 Python 网关；环境变量可能覆盖本机保存值。表单内容和保存成功不代表当前生效配置，已配置也不代表连接测试通过。</p>
                    {configStatus === 'loading' && <p role="status">正在读取后端配置…</p>}
                    {configStatus === 'error' && <p role="alert">无法读取后端配置，当前生效状态未知。请检查后端服务后刷新。</p>}
                    {configStatus === 'ready' && backendConfig && (
                      <dl>
                        <dt>网关配置状态</dt><dd>{backendConfig.configured ? '已配置' : '未配置'}</dd>
                        <dt>Base URL</dt><dd>{backendConfig.baseUrl || '未设置'}</dd>
                        <dt>模型</dt><dd>{backendConfig.model || '未设置'}</dd>
                      </dl>
                    )}
                    <button type="button" className="btn" disabled={saving || testing || configStatus === 'loading'} onClick={() => { setTestResult(null); void refreshBackendConfig(); }}>刷新后端配置</button>
                  </section>
                  <button type="button" className="btn" disabled={saving || testing} onClick={() => { void testLLM(); }} style={{ marginTop: 12 }}>
                    {testing ? '测试中…' : '测试连接'}
                  </button>
                  <p className="settings-appearance-note">仅测试研究任务实际使用的后端网关，不测试未保存表单或前端连接，失败不会尝试浏览器直连。</p>
                  {testResult && (
                    <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, lineHeight: 1.5, background: testResult.ok ? 'var(--accent-light)' : 'var(--danger-light, var(--bg-canvas))', border: `1px solid ${testResult.ok ? 'var(--accent)' : 'var(--danger)'}` }}>
                      {testResult.ok ? `后端连接成功：${testResult.model}` : `后端连接失败：${testResult.error}`}
                    </div>
                  )}
                </div>

                <div className="settings-group">
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>用量统计</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    已用 token：<b>{llmConfig?.tokensUsed ?? 0}</b>
                    {llmConfig?.tokenBudget ? ` / 预算 ${llmConfig.tokenBudget}` : '（未设预算）'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>此处显示前端记录的 token 用量，不代表服务商账单；预算为 0 表示不限制。</p>
                </div>

                <div className="settings-group">
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>Agnes AI（OpenAI 兼容）</h3>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Base URL：<code>https://apihub.agnes-ai.com/v1</code>。平台控制台：platform.agnes-ai.com。推荐模型：
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {AGNES_MODELS.map(([name, id]) => (
                      <code key={id} style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>{name} · {id}</code>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    实测：models 列表可用；chat 在部分网络环境下可能超时，请优先经本地后端网关并加大超时。
                  </p>
                </div>

                <div className="settings-group">
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>推荐：本机 Ollama（无云端密钥）</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    先由用户自行安装 Ollama 并执行 <code>ollama pull &lt;模型&gt;</code>；Selenyx 只在您主动开启 AI 时连接。
                    未安装 Ollama 或尚未拉取模型时，项目、文献、PDF/OCR、统计和基于本机哈希的检索仍可使用。
                  </p>
                  <div className="settings-model-list">
                    {OLLAMA_MODELS.map(([name, tag, description]) => (
                      <div key={tag} className="settings-model-option">
                        <strong>{name}</strong>
                        <code>{tag}</code>
                        <span>{description}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <a
                      className="btn"
                      href="https://ollama.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Icon name="link" size={14} /> 下载 Ollama（官网）
                    </a>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      安装包不附带 Ollama 或任何 AI 模型。点击前往 ollama.com 下载官方安装器；装好后执行 <code>ollama pull &lt;模型&gt;</code>，Selenyx 即可连接本机推理。
                    </p>
                  </div>
                </div>

                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>密钥安全</h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    长期密钥放后端 <code>SELENYX_LLM_API_KEY</code>。<code>VITE_*</code> 会嵌入浏览器产物，只能用于私有本机调试，绝不分发。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'assistant' && (
              <section aria-label="助理">
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>仙鹤桌宠</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    仙鹤桌宠只在桌面客户端以独立透明窗口出现，不嵌进网页每个角落。浏览器 / Hermes 预览里不会再画一只角落鹤。任务完成或失败时桌面窗显示短气泡。
                  </p>
                  <button
                    type="button"
                    className={`btn ${petEnabled ? 'btn-primary' : ''}`}
                    onClick={() => setPetEnabled(!petEnabled)}
                    aria-pressed={petEnabled}
                  >
                    {petEnabled ? '已开启 · 点击收起' : '已关闭 · 点击开启'}
                  </button>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>桌宠行为</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <input type="checkbox" checked={petNotifyDone} onChange={(e) => setPetNotifyDone(e.target.checked)} />
                    任务完成 / 失败时飞来报喜（气泡提醒）
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={petNotifyPending} onChange={(e) => setPetNotifyPending(e.target.checked)} />
                    有待裁决证据时头顶黄点静立提醒
                  </label>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    行为提醒随「自动化 2.0 + 仙鹤伙伴」模块生效（产品计划模块 G）；开关先行保存。
                  </p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>自定义专家</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    专家是带独立人格的 subagent（文献综述员 / 批评员等），可被 agent 委托，也可单独对话。
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { closeSettings(); setView('experts'); }}
                    style={{ minHeight: 36 }}
                  >
                    <Icon name="sparkles" size={14} /> 管理专家
                  </button>
                </div>
              </section>
            )}

            {settingsSection === 'data' && (
              <section aria-label="数据管理">
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>数据统计</h3>
                  <div className="settings-data-stats">
                    {[
                      ['项目', projects.length], ['文献', references.length], ['表格', tables.length], ['笔记', notes.length],
                    ].map(([label, count]) => (
                      <div key={String(label)} className="settings-data-stat">
                        <strong>{count}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>备份与恢复</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                    工作区保存在当前浏览器或 WebView 的本地存储中。导出的 JSON 包含前端项目、文献、笔记和聊天记录，但不包含任何 API Key。{WORKSPACE_BACKUP_SCOPE} 恢复仅补充当前工作区缺失的记录，不会覆盖本地同 ID 编辑，也不会删除当前项目或本机后端数据。
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={exportData}><Icon name="download" size={14} /> 导出 JSON</button>
                    <button type="button" className="btn" onClick={importData}><Icon name="import" size={14} /> 选择 JSON 合并恢复</button>
                  </div>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>数据目录</h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    本机后端数据（SQLite、RAG 索引）位于用户目录 <code>~/.selenyx/</code>；桌面版可经系统文件管理器打开。
                  </p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16, color: 'var(--danger)' }}>危险区域</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                    清除当前浏览器/WebView 内的 Selenyx 工作区数据与偏好设置。请先导出 JSON；本机后端和电脑上的文件不会被删除。
                  </p>
                  <button type="button" className="btn btn-danger-ghost" onClick={clearData}>清除浏览器工作区数据</button>
                </div>
              </section>
            )}

            {settingsSection === 'shortcuts' && (
              <section className="settings-group" aria-label="快捷键">
                <h3 style={{ marginBottom: 16, fontSize: 16 }}>快捷键</h3>
                {[
                  ['Ctrl + ,', '打开 / 关闭设置弹窗'],
                  ['Ctrl + N', '回到新建任务主页'],
                  ['Esc', '关闭弹窗、菜单或停止生成'],
                  ['Enter', 'AI 对话发送消息'],
                  ['Shift + Enter', 'AI 对话换行'],
                  ['J / K', '证据卡接受 / 驳回（证据门上线后可用）'],
                  ['点击表头', '多维表格排序'],
                  ['双击单元格', '多维表格行内编辑'],
                ].map(([keys, description]) => (
                  <div key={keys} className="settings-shortcut-row">
                    <span>{description}</span>
                    <kbd>{keys}</kbd>
                  </div>
                ))}
              </section>
            )}

            {settingsSection === 'about' && (
              <section aria-label="关于">
                <div className="settings-group">
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>Selenyx v{APP_VERSION}</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    Selenyx · 本地优先的科研工作区：别人交付一份报告，Selenyx 交付一条证据链。
                    前端缓存保证离线可用；本机服务负责文献持久镜像、RAG、证据链、学术连接器与 AI 密钥网关。
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a className="btn" href="https://github.com/pyrelio88-afk/Selenyx/releases" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <Icon name="download" size={14} /> 检查更新
                    </a>
                    <a className="btn" href="https://github.com/pyrelio88-afk/Selenyx" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <Icon name="link" size={14} /> 源码与文档
                    </a>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>开源许可：MIT。</p>
                </div>
                <div className="settings-group">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>隐私边界</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <li>后端只听当前使用者这台机器的本机回环，不接受局域网连接，也不写死某一台电脑的地址。</li>
                    <li>文献完整对象在前端缓存与本机 SQLite 间对账；后端离线时仍可继续编辑。</li>
                    <li>不自动上传工作区内容。</li>
                    <li>JSON 备份由您明确导出和保存。</li>
                    <li>第三方服务请求仅由您主动触发。</li>
                  </ul>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
