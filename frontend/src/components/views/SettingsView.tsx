import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { THEME_OPTIONS } from '@hooks/useTheme';
import type { LLMProvider } from '@apptypes/index';
import { Icon, type IconName } from '@components/ui/Icon';
import { DensityToggle } from '@components/ui/StatusChip';
import { testConnection, PROVIDER_DEFAULTS, type TestResult } from '@services/llm';

type SettingsTab = 'appearance' | 'llm' | 'data' | 'shortcuts' | 'about';

const TABS: { key: SettingsTab; label: string; icon: IconName }[] = [
  { key: 'appearance', label: '外观', icon: 'settings' },
  { key: 'llm', label: 'AI 配置', icon: 'aiChat' },
  { key: 'data', label: '数据管理', icon: 'references' },
  { key: 'shortcuts', label: '快捷键', icon: 'pipeline' },
  { key: 'about', label: '关于', icon: 'dashboard' },
];

/** HuggingFace 检索到的适配科研工作台的本地小模型（用户长期需求：去 huggingface 搜索 <1B 开源模型） */
const OLLAMA_MODELS: {
  name: string;
  tag: string;
  params: string;
  desc: string;
  bestFor: string;
  langs: string;
}[] = [
  {
    name: 'Qwen3 0.6B',
    tag: 'qwen3:0.6b',
    params: '600M',
    desc: '通义千问第三代超小模型，100+ 语言支持，1910 万次下载，4GB 显存即可运行',
    bestFor: '文献摘要生成、快速问答',
    langs: '中英日韩法德等 100+',
  },
  {
    name: 'Gemma 3 1B',
    tag: 'gemma3:1b',
    params: '1B',
    desc: 'Google 开源轻量模型，文本理解与生成均衡，CPU 即可推理',
    bestFor: '论文摘要理解、条目分类',
    langs: '多语言',
  },
  {
    name: 'Qwen3 1.7B',
    tag: 'qwen3:1.7b',
    params: '1.7B',
    desc: 'Qwen3 系列中阶，推理能力显著提升，兼顾速度与质量',
    bestFor: '科研流水线段落执行',
    langs: '中英日韩法德等 100+',
  },
  {
    name: 'DeepSeek-R1 1.5B',
    tag: 'deepseek-r1:1.5b',
    params: '1.5B',
    desc: 'DeepSeek-R1 蒸馏版，内置思维链推理，擅长逻辑分析',
    bestFor: '临床推理训练、证据评估',
    langs: '中英',
  },
  {
    name: 'Phi-4-mini',
    tag: 'phi4-mini',
    params: '3.8B',
    desc: '微软开源，MIT 许可，128K 上下文，CPU 可跑，编程与推理强',
    bestFor: '长文献全文精读、代码辅助',
    langs: '英文为主',
  },
  {
    name: 'Qwen2.5 7B',
    tag: 'qwen2.5:7b',
    params: '7B',
    desc: '当前默认推荐，中文能力最强的小型模型之一，需 8GB+ 显存',
    bestFor: '综合科研助手（默认）',
    langs: '中英',
  },
];

export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const { theme, setTheme, mode, setMode, density, setDensity, llmConfig, setLLMConfig, projects, references, tables } = useAppStore();
  const [provider, setProvider] = useState<LLMProvider>(llmConfig?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(llmConfig?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(llmConfig?.baseUrl ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openai'].baseUrl);
  const [model, setModel] = useState(llmConfig?.model ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openai'].model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  function onProviderChange(p: LLMProvider) {
    setProvider(p);
    setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl);
    setModel(PROVIDER_DEFAULTS[p].model);
    setTestResult(null);
  }

  /** 点击推荐模型卡片 → 自动填入 Ollama tag 并切到 Ollama provider */
  function useOllamaModel(tag: string) {
    setProvider('ollama');
    setBaseUrl(PROVIDER_DEFAULTS.ollama.baseUrl);
    setModel(tag);
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

  function exportData() {
    const data = {
      projects, references, tables,
      exportedAt: new Date().toISOString(),
      version: 'R81',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selenyx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.projects) useAppStore.setState({ projects: data.projects });
        if (data.references) useAppStore.setState({ references: data.references });
        if (data.tables) useAppStore.setState({ tables: data.tables });
        alert('数据导入成功');
      } catch {
        alert('导入失败：文件格式不正确');
      }
    };
    input.click();
  }

  function clearData() {
    if (window.confirm('确定要清除所有本地数据吗？此操作不可恢复。')) {
      localStorage.removeItem('selenyx-v2');
      window.location.reload();
    }
  }

  const SHORTCUTS = [
    { keys: 'Enter', desc: 'AI 对话发送消息' },
    { keys: 'Shift + Enter', desc: 'AI 对话换行' },
    { keys: 'Esc', desc: '关闭弹窗' },
    { keys: '点击表头', desc: '多维表格排序' },
    { keys: '双击单元格', desc: '多维表格行内编辑' },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, minHeight: '100%' }}>
      {/* 左侧设置导航 */}
      <div style={{ width: 180, flexShrink: 0 }}>
        <div className="view-header" style={{ marginBottom: 12 }}>
          <h1 className="view-title">设置</h1>
        </div>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`nav-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ width: '100%', marginBottom: 2 }}
          >
            <Icon name={t.icon} size={15} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 右侧设置内容 */}
      <div style={{ flex: 1, maxWidth: 720 }}>
        {/* ===== 外观 ===== */}
        {tab === 'appearance' && (
          <div>
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
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>界面密度</h3>
              <DensityToggle density={density} onChange={setDensity} />
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>紧凑模式信息密度更高，宽松模式留白更舒适。</p>
            </div>
          </div>
        )}

        {/* ===== AI 配置 ===== */}
        {tab === 'llm' && (
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

              {/* Ollama 推荐本地小模型（用户长期需求：HuggingFace <1B 模型集成） */}
              {provider === 'ollama' && (
                <div style={{
                  padding: 14, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>推荐本地模型</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>点击卡片自动填入，需先 ollama pull 拉取</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {OLLAMA_MODELS.map((m) => (
                      <button
                        key={m.tag}
                        onClick={() => useOllamaModel(m.tag)}
                        style={{
                          textAlign: 'left', padding: 10, borderRadius: 'var(--radius-sm)',
                          background: model === m.tag ? 'var(--accent-light)' : 'var(--bg-surface)',
                          border: `1px solid ${model === m.tag ? 'var(--accent)' : 'var(--border)'}`,
                          cursor: 'pointer', transition: 'border-color .15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 3,
                            background: 'var(--accent)', color: '#fff', fontWeight: 600,
                          }}>{m.params}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 4 }}>{m.desc}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          适合：{m.bestFor} · {m.langs}
                        </div>
                        {model === m.tag && (
                          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>✓ 已选中</div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    模型来源：HuggingFace 开源社区。数据均基于 2026 年 8 月公开信息。安装命令：<code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>ollama pull &lt;模型名&gt;</code>
                  </p>
                </div>
              )}

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
        )}

        {/* ===== 数据管理 ===== */}
        {tab === 'data' && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>数据统计</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ padding: 12, background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{projects.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>项目</div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{references.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>文献</div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{tables.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>表格</div>
                </div>
              </div>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>备份与恢复</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                所有数据存储在浏览器 localStorage 中。建议定期导出备份，防止浏览器清除数据导致丢失。
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={exportData}>
                  <Icon name="download" size={14} /> 导出数据
                </button>
                <button className="btn" onClick={importData}>
                  <Icon name="import" size={14} /> 导入数据
                </button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 16, color: 'var(--danger)' }}>危险区域</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                清除所有本地数据（项目、文献、表格、设置）。此操作不可恢复。
              </p>
              <button className="btn btn-danger-ghost" onClick={clearData}>清除所有数据</button>
            </div>
          </div>
        )}

        {/* ===== 快捷键 ===== */}
        {tab === 'shortcuts' && (
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>快捷键</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.desc}</span>
                  <kbd style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12,
                    background: 'var(--bg-canvas)', border: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 关于 ===== */}
        {tab === 'about' && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>Selenyx 科研工作台</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                开源科研工作台——八段科研流水线（问题→文献→全文→筛选→精读→证据→综合→写作），
                支持 BYOK 接入任意 LLM、多维表格数据管理、文献管理、临床数据查询、统计计算。
              </p>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <p>版本：R80 (multi-dim tables + clinical data + stat tools)</p>
                <p>技术栈：React 19 + Vite + TypeScript + Zustand</p>
                <p>部署：妙搭单文件 HTML（2.7MB, gzip 855KB）</p>
                <p>许可：开源（GitHub push 待用户授权）</p>
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>数据源</h3>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <p>文献检索：OpenAlex + PubMed + Crossref + arXiv</p>
                <p>护理诊断：NANDA-I 2024-2026（39 条全量内置）</p>
                <p>检验参考值：临床检验标准参考范围（40+ 项）</p>
                <p>统计分布：Z / t / 卡方 / F 精确临界值 + 12 个计算器</p>
                <p>LLM：BYOK（OpenAI / OpenRouter / Anthropic / Google / Ollama）</p>
                <p>学科数据：13 学科门类 2900+ 术语（持续扩充中）</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
