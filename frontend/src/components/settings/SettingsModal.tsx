/**
 * 设置弹窗（v4 · WorkBuddy 范式）：模态 + 左轨 9 分区，不再是路由视图。
 *
 * 触发：用户区浮层「设置」或 Ctrl+,；Esc / 遮罩 / × 关闭。
 * 内容由旧 SettingsView 平移重组：通用（后端状态）/ 外观 / 个性化 / 记忆 /
 * 模型（BYOK）/ 助理（桌宠）/ 数据管理 / 快捷键 / 关于。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type SettingsSection } from '@stores/appStore';
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
// 复用旧设置页的卡片网格/统计样式（theme-choice-grid、settings-data-stats 等）
import '../views/settings-workbench.css';

const APP_VERSION = '0.1.0'; // 发布时与 package.json 同步

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
  const closeRef = useRef<HTMLButtonElement>(null);
  const environmentLLM = useMemo(() => readEnvironmentLLM(), []);
  const configuredLLM = llmConfig ?? environmentLLM.config;

  const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as LLMConfig['provider'][];
  const [form, setForm] = useState<{ provider: LLMConfig['provider']; apiKey: string; baseUrl: string; model: string }>({
    provider: llmConfig?.provider ?? 'openrouter',
    apiKey: llmConfig?.apiKey ?? '',
    baseUrl: llmConfig?.baseUrl ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].baseUrl,
    model: llmConfig?.model ?? PROVIDER_DEFAULTS[llmConfig?.provider ?? 'openrouter'].model,
  });
  const [formSaved, setFormSaved] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    closeRef.current?.focus();
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
  }, [settingsOpen]);

  if (!settingsOpen) return null;

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

  const saveInstructions = () => {
    setInstructionsSaved(true);
    window.setTimeout(() => setInstructionsSaved(false), 2400);
  };

  async function testLLM() {
    setTesting(true);
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

  return (
    <div className="settings-overlay" onClick={closeSettings} role="presentation">
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
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
                className={`nav-item settings-modal-tab ${settingsSection === section.key ? 'active' : ''}`}
                onClick={() => openSettings(section.key)}
                aria-current={settingsSection === section.key ? 'true' : undefined}
              >
                <Icon name={section.icon} size={15} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-modal-content">
            {settingsSection === 'general' && (
              <section aria-label="通用">
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>后端服务状态</h3>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{backendHealth}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{backendDetail}</p>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    开发请用 <code>npm run dev:local</code>；桌面版启动时自动拉起本机后端（127.0.0.1:8770）。
                  </p>
                </div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>显示语言</h3>
                  <select disabled value="zh" aria-label="显示语言" style={{ minHeight: 38, minWidth: 180 }}>
                    <option value="zh">简体中文</option>
                  </select>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>多语言在路线图上，当前版本仅简体中文。</p>
                </div>
                <div className="card" style={{ marginBottom: 16 }}>
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
                <div className="card">
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>开机自启</h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    桌面安装版的开机自启由系统管理（Windows：设置 → 应用 → 启动）。开发模式无此项。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'appearance' && (
              <section aria-label="外观">
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
              </section>
            )}

            {settingsSection === 'personality' && (
              <section aria-label="个性化">
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 12, fontSize: 16 }}>回复风格</h3>
                  <div className="v4-segmented" role="group" aria-label="回复风格" style={{ maxWidth: 360 }}>
                    <button type="button" className={replyStyle === 'concise' ? 'active' : ''} onClick={() => setReplyStyle('concise')}>简洁</button>
                    <button type="button" className={replyStyle === 'balanced' ? 'active' : ''} onClick={() => setReplyStyle('balanced')}>均衡</button>
                    <button type="button" className={replyStyle === 'thorough' ? 'active' : ''} onClick={() => setReplyStyle('thorough')}>详尽</button>
                  </div>
                </div>
                <div className="card">
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
                    注入接线随「技能 + 记忆」模块一同接通（见产品计划模块 F）；当前先行保存。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'memory' && (
              <section aria-label="记忆">
                <div className="card v4-placeholder">
                  <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>记忆管理</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    Selenyx 将拥有两层记忆：全局记忆（跨项目的偏好与结论）与项目记忆（如「该项目聚焦老年谵妄」）。
                    agent 任务启动时注入摘要、收尾时追加要点——记忆永不外发，只进 prompt。
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    查看 / 编辑 / 清空 / 导出将在「技能 + 记忆」模块上线后可用（产品计划模块 F）。
                  </p>
                </div>
              </section>
            )}

            {settingsSection === 'model' && (
              <section aria-label="模型">
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>AI 配置（BYOK）</h3>
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
                      {formSaved && <span role="status" style={{ fontSize: 12.5, color: 'var(--success)' }}>已保存，可直接开始任务或对话</span>}
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
                  <h3 style={{ marginBottom: 10, fontSize: 16 }}>用量统计</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    已用 token：<b>{llmConfig?.tokensUsed ?? 0}</b>
                    {llmConfig?.tokenBudget ? ` / 预算 ${llmConfig.tokenBudget}` : '（未设预算）'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>经本机网关的调用会计入用量；预算为 0 表示不限制。</p>
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

            {settingsSection === 'assistant' && (
              <section aria-label="助理">
                <div className="card" style={{ marginBottom: 16 }}>
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
                <div className="card" style={{ marginBottom: 16 }}>
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
                <div className="card">
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
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 8, fontSize: 16 }}>数据目录</h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    本机后端数据（SQLite、RAG 索引）位于用户目录 <code>~/.selenyx/</code>；桌面版可经系统文件管理器打开。
                  </p>
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

            {settingsSection === 'shortcuts' && (
              <section className="card" aria-label="快捷键">
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
                  <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{description}</span>
                    <kbd style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{keys}</kbd>
                  </div>
                ))}
              </section>
            )}

            {settingsSection === 'about' && (
              <section aria-label="关于">
                <div className="card" style={{ marginBottom: 16 }}>
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
      </div>
    </div>
  );
}
