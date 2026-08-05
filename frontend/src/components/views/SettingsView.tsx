import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { THEME_OPTIONS } from '@hooks/useTheme';
import type { LLMProvider } from '@types/index';
import { Icon } from '@components/ui/Icon';
import { DensityToggle } from '@components/ui/StatusChip';

export function SettingsView() {
  const { theme, setTheme, mode, setMode, density, setDensity, llmConfig, setLLMConfig } = useAppStore();
  const [provider, setProvider] = useState<LLMProvider>(llmConfig?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(llmConfig?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(llmConfig?.baseUrl ?? 'https://api.openai.com/v1');
  const [model, setModel] = useState(llmConfig?.model ?? 'gpt-4o');

  function saveLLM() {
    setLLMConfig({
      provider, apiKey, baseUrl, model,
      temperature: 0.3, maxTokens: 4096,
      tokenBudget: 1000000, tokensUsed: 0,
    });
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
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as LLMProvider)}>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (本地)</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>API Key</label>
            <input className="input" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Base URL</label>
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>模型</label>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveLLM} style={{ alignSelf: 'flex-start' }}>保存配置</button>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          密钥仅存储在本地（OS keychain / localStorage），不会上传任何服务器。
        </p>
      </div>
    </div>
  );
}
