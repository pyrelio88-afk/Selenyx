import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { THEME_OPTIONS } from '@hooks/useTheme';
import type { LLMProvider } from '@types/index';
import { Icon } from '@components/ui/Icon';
import { DensityToggle } from '@components/ui/StatusChip';
import { testConnection, PROVIDER_DEFAULTS, type TestResult } from '@services/llm';

export function SettingsView() {
  const { theme, setTheme, mode, setMode, density, setDensity, llmConfig, setLLMConfig } = useAppStore();
  const [provider, setProvider] = useState<LLMProvider>(llmConfig?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(llmConfig?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(llmConfig?.baseUrl ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openai'].baseUrl);
  const [model, setModel] = useState(llmConfig?.model ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openai'].model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  function onProviderChange(p: LLMProvider) {
    setProvider(p);
    // 切换提供商时自动带出默认 baseUrl 与模型（可被手改覆盖）
    setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl);
    setModel(PROVIDER_DEFAULTS[p].model);
    setTestResult(null);
  }

  function buildConfig() {
    return {
      provider, apiKey, baseUrl, model,
      temperature: 0.3, maxTokens: 4096,
      tokenBudget: 1000000, tokensUsed: llmConfig?.tokensUsed ?? 0,
    };
  }

  function saveLLM() {
    setLLMConfig(buildConfig());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveAndTest() {
    const cfg = buildConfig();
    setLLMConfig(cfg);
    setTesting(true);
    setTestResult(null);
    const r = await testConnection(cfg);
    setTestResult(r);
    setTesting(false);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="view-header">
        <h1 className="view-title">设置</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>主题</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`btn ${theme === opt.key ? 'btn-primary' : ''}`}
              onClick={() => setTheme(opt.key)}
              style={{ flex: 1, textAlign: 'center', flexDirection: 'column', padding: 12 }}
            >
              <span style={{ fontWeight: 600 }}>{opt.name}</span>
              <span style={{ fontSize: 11, fontWeight: 400, display: 'block', marginTop: 4 }}>{opt.description}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${mode === 'light' ? 'btn-primary' : ''}`} onClick={() => setMode('light')}><Icon name="sun" size={16} /> 日间</button>
          <button className={`btn ${mode === 'dark' ? 'btn-primary' : ''}`} onClick={() => setMode('dark')}><Icon name="moon" size={16} /> 夜间</button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>界面密度</label>
          <DensityToggle density={density} onChange={setDensity} />
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>紧凑模式信息密度更高，宽松模式留白更舒适。</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>AI 配置 (BYOK)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>LLM 提供商</label>
            <select className="input" value={provider} onChange={(e) => onProviderChange(e.target.value as LLMProvider)}>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (本地)</option>
              <option value="custom">自定义</option>
            </select>
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{PROVIDER_DEFAULTS[provider].hint}</p>
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>API Key</label>
            <input className="input" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Base URL</label>
            <input className="input" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null); }} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>模型</label>
            <input className="input" value={model} onChange={(e) => { setModel(e.target.value); setTestResult(null); }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={saveLLM}>保存配置</button>
            <button className="btn" onClick={saveAndTest} disabled={testing || !apiKey}>
              {testing ? '测试中…' : '保存并测试连接'}
            </button>
            {saved && !testResult && <span style={{ fontSize: 13, color: 'var(--success)' }}><Icon name="check" size={14} /> 已保存</span>}
          </div>
          {testResult && (
            <div style={{
              padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, lineHeight: 1.5,
              background: testResult.ok ? 'var(--accent-light)' : 'var(--danger-light, var(--bg-surface))',
              border: `1px solid ${testResult.ok ? 'var(--accent)' : 'var(--danger)'}`,
              color: 'var(--text-primary)',
            }}>
              {testResult.ok
                ? `连接成功 ✓ 模型 ${testResult.model} 可用，延迟 ${testResult.latencyMs}ms。现在可以去「AI 助手」对话了。`
                : `连接失败：${testResult.error}`}
            </div>
          )}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          密钥仅存储在本地浏览器（localStorage），请求由浏览器直连 LLM 提供商，不经过任何中转服务器。
        </p>
      </div>
    </div>
  );
}
