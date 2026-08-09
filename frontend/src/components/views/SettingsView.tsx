import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '@stores/appStore';
import { THEME_OPTIONS } from '@hooks/useTheme';
import { Icon, type IconName } from '@components/ui/Icon';
import { DensityToggle } from '@components/ui/StatusChip';
import { testConnection, PROVIDER_DEFAULTS, type TestResult } from '@services/llm';
import type { LLMConfig } from '@apptypes/index';
import { readEnvironmentLLM } from '@services/envLLM';
import { aiApi, localApi } from '@services/api';
import {
  clearSelenyxBrowserStorage,
  createWorkspaceBackupJson,
  restoreWorkspaceBackup,
} from '@services/workspaceBackup';
import './settings-workbench.css';

type SettingsTab = 'appearance' | 'llm' | 'data' | 'shortcuts' | 'about';

const TABS: { key: SettingsTab; label: string; icon: IconName }[] = [
  { key: 'appearance', label: '外观', icon: 'settings' },
  { key: 'llm', label: 'AI 配置', icon: 'aiChat' },
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

function downloadWorkspace(json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `selenyx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [backendHealth, setBackendHealth] = useState<string>('检测中…');
  const [backendDetail, setBackendDetail] = useState('');
  const appState = useAppStore();
  const {
    theme, setTheme, mode, setMode, density, setDensity, llmConfig, setLLMConfig,
    petEnabled, setPetEnabled,
    projects, references, tables, notes,
  } = appState;
  const environmentLLM = useMemo(() => readEnvironmentLLM(), []);
  const configuredLLM = llmConfig ?? environmentLLM.config;

  /* ---- 界面直填 API 配置（BYOK） ---- */
  const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as LLMConfig['provider'][];
  const [form, setForm] = useState<{ provider: LLMConfig['provider']; apiKey: string; baseUrl: string; model: string }>({
    provider: llmConfig?.provider ?? 'openrouter',
    apiKey: llmConfig?.apiKey ?? '',
    baseUrl: llmConfig?.baseUrl ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].baseUrl,
    model: llmConfig?.model ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].model,
  });
  const [formSaved, setFormSaved] = useState(false);

  const applyProvider = (provider: LLMConfig['provider']) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm((f) => ({ ...f, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
  };

  const saveForm = () => {
    setLLMConfig({
      provider: form.provider,
      apiKey: form.apiKey.trim() || undefined,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      temperature: llmConfig?.temperature ?? 0.3,
      maxTokens: llmConfig?.maxTokens ?? 4096,
      tokenBudget: llmConfig?.tokenBudget ?? 0,
      tokensUsed: llmConfig?.tokensUsed ?? 0,
    });
    setFormSaved(true);
    window.setTimeout(() => setFormSaved(false), 2400);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await localApi.health();
        if (cancelled) return;
        setBackendHealth('在线');
        setBackendDetail(`存储 ${health.storage} · LLM 网关 ${health.llmConfigured ? '已配置' : '未配置'}`);
      } catch (error) {
        if (cancelled) return;
        setBackendHealth('离线（前端本地降级）');
        setBackendDetail(error instanceof Error ? error.message : '无法连接 127.0.0.1:8770');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function testLLM() {
    setTesting(true);
    // Prefer backend gateway when available so Agnes keys stay off the browser.
    try {
      const gateway = await aiApi.testConnection();
      setTestResult({ ok: true, model: gateway.model, latencyMs: 0 });
    } catch (gatewayError) {
      if (configuredLLM) {
        setTestResult(await testConnection(configuredLLM));
      } else {
        setTestResult({
          ok: false,
          model: 'unconfigured',
          latencyMs: 0,
          error: gatewayError instanceof Error ? gatewayError.message : '后端网关与前端均未配置 AI',
        });
      }
    }
    setTesting(false);
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
        restoreWorkspaceBackup(await file.text());
        alert('数据导入成功。');
      } catch (error) {
        alert(`导入失败：${error instanceof Error ? error.message : '文件格式不正确'}`);
      }
    };
    input.click();
  }

  function clearData() {
    if (!window.confirm('确定要清除当前浏览器中的全部 Selenyx 数据吗？此操作不可恢复，请先导出 JSON 备份。')) return;
    clearSelenyxBrowserStorage();
    window.location.reload();
  }

  function moveTab(current: SettingsTab, direction: -1 | 1) {
    const index = TABS.findIndex((item) => item.key === current);
    const next = TABS[(index + direction + TABS.length) % TABS.length];
    setTab(next.key);
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${next.key}`)?.focus();
    });
  }

  return (
    <div className="settings-workbench">
      <nav className="settings-rail" aria-label="设置分类">
        <div className="view-header settings-heading"><h1 className="view-title">设置</h1></div>
        <div className="settings-tabs" role="tablist" aria-label="设置分类">
          {TABS.map((item) => (
            <button
              key={item.key}
              id={`settings-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={`settings-panel-${item.key}`}
              tabIndex={tab === item.key ? 0 : -1}
              className={`nav-item settings-tab ${tab === item.key ? 'active' : ''}`}
              onClick={() => setTab(item.key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveTab(item.key, 1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveTab(item.key, -1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  setTab(TABS[0].key);
                  window.requestAnimationFrame(() => document.getElementById(`settings-tab-${TABS[0].key}`)?.focus());
                } else if (event.key === 'End') {
                  event.preventDefault();
                  const last = TABS[TABS.length - 1];
                  setTab(last.key);
                  window.requestAnimationFrame(() => document.getElementById(`settings-tab-${last.key}`)?.focus());
                }
              }}
            >
              <Icon name={item.icon} size={15} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="settings-content">
        {tab === 'appearance' && (
          <section id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance">
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>主题</h3>
              <div className="theme-choice-grid">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`btn theme-choice ${theme === option.key ? 'btn-primary' : ''}`}
                    onClick={() => setTheme(option.key)}
                    aria-pressed={theme === option.key}
                    style={{ flex: 1, textAlign: 'left', flexDirection: 'column', padding: 12 }}
                  >
                    <span style={{ fontWeight: 600 }}>{option.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 400, display: 'block', marginTop: 4 }}>{option.description}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={`btn ${mode === 'light' ? 'btn-primary' : ''}`} onClick={() => setMode('light')}><Icon name="sun" size={16} /> 日间</button>
                <button type="button" className={`btn ${mode === 'dark' ? 'btn-primary' : ''}`} onClick={() => setMode('dark')}><Icon name="moon" size={16} /> 夜间</button>
              </div>
              <p className="settings-appearance-note">
                主题只改变颜色、边框、字形与密度，不会改变页面结构或本机研究数据。
              </p>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>界面密度</h3>
              <DensityToggle density={density} onChange={setDensity} />
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>紧凑模式显示更多信息；宽松模式提供更大的留白。</p>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>仙鹤桌宠</h3>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                在屏幕上放养一只仙鹤：桌面端为透明置顶小窗（随机踱步与飞行），网页端降级为应用内右下角漂浮。关闭后立即收起。
              </p>
              <button
                type="button"
                className={`btn ${petEnabled ? 'btn-primary' : ''}`}
                onClick={() => setPetEnabled(!petEnabled)}
                aria-pressed={petEnabled}
              >
                {petEnabled ? '已开启 · 点击收起' : '已关闭 · 点击放养'}
              </button>
            </div>
          </section>
        )}

        {tab === 'llm' && (
          <section id="settings-panel-llm" role="tabpanel" aria-labelledby="settings-tab-llm">
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10, fontSize: 16 }}>本地后端服务</h3>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{backendHealth}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{backendDetail}</p>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                开发请用 <code>npm run dev:local</code>。密钥放在 <code>backend/.env.local</code>（如 Agnes：
                <code>SELENYX_LLM_BASE_URL=https://apihub.agnes-ai.com/v1</code>）。
              </p>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10, fontSize: 16 }}>AI 配置</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 12px' }}>
                推荐把密钥写在后端环境文件，由本机网关代理。也可在 <code>frontend/.env.local</code> 设置
                <code>VITE_LLM_*</code>（仅私有本机开发；会进入前端构建产物，勿分发）。
              </p>
              <div style={{ display: 'grid', gap: 10, marginBottom: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-canvas)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    提供商
                    <select value={form.provider} onChange={(e) => applyProvider(e.target.value as LLMConfig['provider'])} style={{ minHeight: 40 }}>
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>{p} — {PROVIDER_DEFAULTS[p].hint}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    API Key
                    <input
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder={form.provider === 'ollama' ? '本地模型可留空' : 'sk-…'}
                      autoComplete="off"
                      style={{ minHeight: 40 }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    Base URL
                    <input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://…" style={{ minHeight: 40 }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    模型
                    <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="模型名" style={{ minHeight: 40 }} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={saveForm} disabled={!form.baseUrl.trim() || !form.model.trim()} style={{ minHeight: 38 }}>
                    保存配置
                  </button>
                  {formSaved && <span role="status" style={{ fontSize: 12.5, color: 'var(--success)' }}>已保存，可直接到总览与 Selenyx 对话</span>}
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  密钥只进入本机内存与本地配置，不经任何第三方中转；为安全起见刷新页面后需重新填入 Key（Base URL 与模型会记住）。也可写入 <code>backend/.env.local</code> 由本机网关持久代理。
                </p>
              </div>
              {environmentLLM.error && (
                <div role="alert" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--danger-light, var(--bg-canvas))', border: '1px solid var(--danger)', fontSize: 13 }}>
                  环境变量配置无效：{environmentLLM.error}
                </div>
              )}
              {!environmentLLM.error && configuredLLM && (
                <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', margin: '0 0 14px', fontSize: 13 }}>
                  <dt style={{ color: 'var(--text-muted)' }}>提供商</dt><dd style={{ margin: 0 }}>{configuredLLM.provider}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Base URL</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{configuredLLM.baseUrl}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>模型</dt><dd style={{ margin: 0 }}>{configuredLLM.model}</dd>
                </dl>
              )}
              {!environmentLLM.error && !configuredLLM && (
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-canvas)', border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}>
                  前端未配置 AI；若后端已配置 <code>SELENYX_LLM_*</code>，仍可通过本机网关对话。其余本地功能可离线使用。
                </div>
              )}
              <button type="button" className="btn btn-primary" disabled={testing} onClick={() => { void testLLM(); }} style={{ marginBottom: 8 }}>
                {testing ? '测试中…' : '测试连接（后端网关优先）'}
              </button>
              {testResult && (
                <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, lineHeight: 1.5, background: testResult.ok ? 'var(--accent-light)' : 'var(--danger-light, var(--bg-canvas))', border: `1px solid ${testResult.ok ? 'var(--accent)' : 'var(--danger)'}` }}>
                  {testResult.ok ? `连接成功：${testResult.model}${testResult.latencyMs ? `（${testResult.latencyMs}ms）` : ''}` : `连接失败：${testResult.error}`}
                </div>
              )}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
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

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10, fontSize: 16 }}>推荐：本机 Ollama（无云端密钥）</h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                先由用户自行安装 Ollama 并执行 <code>ollama pull &lt;模型&gt;</code>；Selenyx 只在您主动开启 AI 时连接。
                未安装 Ollama 或尚未拉取模型时，项目、文献、PDF/OCR、统计和基于本机哈希的检索仍可使用。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
                {OLLAMA_MODELS.map(([name, tag, description]) => (
                  <div key={tag} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <strong style={{ display: 'block', fontSize: 13 }}>{name}</strong>
                    <code style={{ display: 'block', margin: '4px 0', fontSize: 11 }}>{tag}</code>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{description}</span>
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

            <div className="card" style={{ borderColor: 'var(--warning, #b7791f)' }}>
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>密钥安全</h3>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                长期密钥放后端 <code>SELENYX_LLM_API_KEY</code>。<code>VITE_*</code> 会嵌入浏览器产物，只能用于私有本机调试，绝不分发。
              </p>
            </div>
          </section>
        )}

        {tab === 'data' && (
          <section id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data">
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>数据统计</h3>
              <div className="settings-data-stats">
                {[
                  ['项目', projects.length], ['文献', references.length], ['表格', tables.length], ['笔记', notes.length],
                ].map(([label, count]) => (
                  <div key={String(label)} style={{ padding: 12, background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{count}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>备份与恢复</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                工作区保存在当前浏览器或 WebView 的本地存储中。导出的 JSON 包含项目、文献、笔记和聊天记录，但不包含任何 API Key；恢复前会验证文件结构。
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={exportData}><Icon name="download" size={14} /> 导出 JSON</button>
                <button type="button" className="btn" onClick={importData}><Icon name="import" size={14} /> 选择 JSON 恢复</button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 16, color: 'var(--danger)' }}>危险区域</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                清除当前浏览器/WebView 内的 Selenyx 工作区缓存。请先导出 JSON；这不会删除您电脑上历史版本可能遗留的任何文件。
              </p>
              <button type="button" className="btn btn-danger-ghost" onClick={clearData}>清除所有本地数据</button>
            </div>
          </section>
        )}

        {tab === 'shortcuts' && (
          <section id="settings-panel-shortcuts" role="tabpanel" aria-labelledby="settings-tab-shortcuts" className="card">
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>快捷键</h3>
            {[
              ['Enter', 'AI 对话发送消息'], ['Shift + Enter', 'AI 对话换行'], ['Esc', '关闭弹窗或菜单'], ['点击表头', '多维表格排序'], ['双击单元格', '多维表格行内编辑'],
            ].map(([keys, description]) => (
              <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{description}</span>
                <kbd style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{keys}</kbd>
              </div>
            ))}
          </section>
        )}

        {tab === 'about' && (
          <section id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about">
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>Selenyx</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Selenyx · 本地优先的科研工作区。前端缓存保证离线可用；本机服务负责文献持久镜像、RAG、证据链、学术连接器与 AI 密钥网关。
              </p>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 8, fontSize: 16 }}>隐私边界</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <li>后端仅监听 127.0.0.1，不接受局域网连接。</li>
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
  );
}
