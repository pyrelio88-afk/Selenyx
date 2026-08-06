import { useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { streamChat, LLMError, type LLMMessage } from '@services/llm';
import { Icon } from '@components/ui/Icon';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

/** 研究助手系统提示：extractive 原则——不编造引用，只基于用户提供的材料 */
const SYSTEM_PROMPT = [
  '你是 Selenyx 的 AI 研究助手，服务于护理学/医学科研场景。',
  '能力：文献综述梳理、论文批评、研究想法生成、数据提取建议、八段科研流水线各阶段的辅助。',
  '原则：① 不编造文献、作者、年份、DOI 或数据；用户没提供的材料不要假装读过。② 涉及具体文献结论时明确区分「你说的材料」与「你的推断」。③ 回答用中文，结构清晰、直给结论。',
  '当用户在科研流水线某一阶段提问时，优先贴合该阶段的产出物（PICO、检索策略、精读笔记、证据分级、论文初稿等）。',
  '你可以使用 Markdown 格式回复，包括标题、列表、加粗、表格等，使输出更结构化。',
].join('\n');

// R108: 快速操作预设（灵感来自 Codex 命令面板 + Hermes 技能系统）
const QUICK_ACTIONS = [
  { label: '文献综述', aliases: ['综述', '文献梳理', 'review'], category: '研究', icon: 'references' as const, prompt: '请帮我梳理以下文献的核心观点和研究缺口，按主题归类并指出未来研究方向：\n\n（在此粘贴文献摘要或笔记）' },
  { label: '论文批评', aliases: ['批评', '审稿', 'critique'], category: '分析', icon: 'stageReading' as const, prompt: '请从以下维度对这段论文文本进行批评性分析：①研究设计合理性 ②样本代表性 ③统计方法适当性 ④结论可靠性 ⑤伦理考量：\n\n（在此粘贴论文段落）' },
  { label: '研究想法', aliases: ['想法', '选题', 'brainstorm'], category: '研究', icon: 'stageProblem' as const, prompt: '基于以下背景信息，帮我生成 3 个具有可行性和创新性的研究问题，并简要说明每个问题的研究设计思路：\n\n（在此描述你的研究领域和兴趣）' },
  { label: '数据提取', aliases: ['提取', '数据', 'extract'], category: '分析', icon: 'statTools' as const, prompt: '请从以下文本中提取关键数据（样本量、效应量、置信区间、p值等），整理成表格：\n\n（在此粘贴结果部分文本）' },
  { label: 'SBAR 交接', aliases: ['交接', 'SBAR', '交班'], category: '临床', icon: 'clinicalData' as const, prompt: '请基于以下患者信息，按 SBAR 格式（情境-背景-评估-建议）生成一份结构化护理交接报告：\n\n（在此粘贴患者信息）' },
  { label: '伦理审查', aliases: ['伦理', 'ethics', 'IRB'], category: '伦理', icon: 'shield' as const, prompt: '请帮我检查以下研究方案的伦理考量是否完整，列出需要补充的伦理审查材料清单：\n\n（在此粘贴研究方案摘要）' },
  { label: '写作润色', aliases: ['润色', '改写', 'polish'], category: '写作', icon: 'stageWriting' as const, prompt: '请帮我润色以下学术论文段落，要求：①学术表达规范 ②逻辑连贯 ③用词精准 ④保持原意不变：\n\n（在此粘贴需要润色的文本）' },
  { label: '统计咨询', aliases: ['统计', '分析方法', 'stats'], category: '分析', icon: 'statTools' as const, prompt: '请帮我分析以下研究数据应该用什么统计方法，并解释选择理由和前提条件：\n\n（在此描述你的研究设计和数据类型）' },
];

export function AIChatView() {
  const { llmConfig, setLLMConfig, projects, currentProjectId } = useAppStore();
  // R108R3: 对话历史持久化（localStorage，按项目隔离）
  const storageKey = `selenyx_chat_${currentProjectId || 'global'}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // 持久化到 localStorage（最多保留 50 条）
  const saveMessages = (msgs: Msg[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(msgs.slice(-50)));
    } catch { /* 存储满时静默失败 */ }
  };
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const project = projects.find((p) => p.id === currentProjectId);

  function scrollBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }

  // R108R3: 包装 setMessages 自动持久化
  const setMessagesAndSave = (updater: (prev: Msg[]) => Msg[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      saveMessages(next);
      return next;
    });
  };

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!llmConfig) {
      setMessagesAndSave((prev) => [...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '还没配置 LLM。请先到「设置 → AI 配置 (BYOK)」填入你的 API Key，Selenyx 支持 OpenAI / OpenRouter / Anthropic / Google / 本地 Ollama。', error: true },
      ]);
      setInput('');
      scrollBottom();
      return;
    }

    const history: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + (project ? `\n\n当前项目：${project.name}（阶段：${project.currentStage}）。` : '') },
      ...messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    setInput('');
    setBusy(true);
    setMessagesAndSave((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    scrollBottom();

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await streamChat(
        llmConfig,
        history,
        (acc) => {
          setMessagesAndSave((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: 'assistant', content: acc };
            return next;
          });
          scrollBottom();
        },
        abort.signal,
      );
      // 累计 token 用量（写回 store，持久化）
      setLLMConfig({ ...llmConfig, tokensUsed: (llmConfig.tokensUsed ?? 0) + result.tokensUsed });
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const errText = isAbort
        ? '（已停止生成）'
        : e instanceof LLMError
          ? e.message
          : `出错了：${e instanceof Error ? e.message : String(e)}`;
      setMessagesAndSave((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        // 已有部分内容就附上提示；否则整替换为错误
        next[next.length - 1] = last.content
          ? { ...last, content: `${last.content}\n\n${errText}` }
          : { role: 'assistant', content: errText, error: true };
        return next;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
      scrollBottom();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="view-header">
        <h1 className="view-title">AI 助手</h1>
        <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: llmConfig ? 'var(--success)' : 'var(--danger)' }}>
          <span className="pdf-tool-dot" style={{ background: 'currentColor' }} />
          {llmConfig ? `${llmConfig.provider} / ${llmConfig.model}` : '未配置'}
        </span>
        {llmConfig && (llmConfig.tokensUsed ?? 0) > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            已用约 {llmConfig.tokensUsed.toLocaleString()} tokens
          </span>
        )}
      </div>

      {/* R108: 项目上下文指示器（灵感来自 Hermes 持久记忆系统） */}
      {project && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 8, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 12 }}>
          <Icon name="projects" size={14} />
          <span style={{ color: 'var(--text-secondary)' }}>当前项目：</span>
          <span style={{ fontWeight: 600 }}>{project.name}</span>
          <span style={{ color: 'var(--text-muted)' }}>· 阶段：{project.currentStage}</span>
          {project.referenceIds.length > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>· 文献 {project.referenceIds.length} 篇</span>
          )}
        </div>
      )}

      {/* R108: 对话操作栏 */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            className="btn btn-sm"
            onClick={() => { setMessages([]); localStorage.removeItem(storageKey); }}
            style={{ fontSize: 12, padding: '3px 10px' }}
          >清空对话</button>
          <button
            className="btn btn-sm"
            onClick={() => {
              const text = messages.map(m => `[${m.role === 'user' ? '我' : 'AI'}] ${m.content}`).join('\n\n');
              navigator.clipboard?.writeText(text);
            }}
            style={{ fontSize: 12, padding: '3px 10px' }}
          >导出对话</button>
        </div>
      )}

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="empty-state" style={{ marginBottom: 20 }}>
              <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center' }}>
                <Icon name="aiChat" size={44} strokeWidth={1.2} />
              </div>
              <p>AI 研究助手 — 文献综述 / 论文批评 / 想法生成 / 数据提取</p>
              <p style={{ marginTop: 8, fontSize: 13 }}>
                {llmConfig
                  ? '已接入你的 API（BYOK）。浏览器直连 LLM，Key 不出本机。'
                  : '请先在「设置」中配置 LLM API Key（BYOK）。'}
              </p>
            </div>
            {/* R108: 快速操作面板（灵感来自 Codex 命令面板） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, maxWidth: 640, margin: '0 auto' }}>
              {(['研究', '分析', '写作', '临床', '伦理'] as const).map((cat) => {
                const catActions = QUICK_ACTIONS.filter((a) => a.category === cat);
                if (catActions.length === 0) return null;
                return (
                  <div key={cat} style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{cat}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {catActions.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => { setInput(action.prompt); }}
                          title={`别名：${action.aliases.join(' / ')}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                            background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 13,
                            transition: 'all .15s', textAlign: 'left',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
                        >
                          <Icon name={action.icon} size={16} strokeWidth={1.6} />
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '78%',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: msg.role === 'user' ? 'var(--accent)' : msg.error ? 'var(--danger-light, var(--bg-surface))' : 'var(--bg-surface)',
            color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
            border: msg.role === 'assistant' ? `1px solid ${msg.error ? 'var(--danger)' : 'var(--border)'}` : 'none',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.content || (busy && i === messages.length - 1 ? '思考中…' : '')}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="input"
          placeholder={llmConfig ? '输入你的问题…（Enter 发送，Shift+Enter 换行）' : '先在「设置」配置 LLM API Key…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={2}
          style={{ flex: 1, resize: 'none' }}
        />
        {busy ? (
          <button className="btn" onClick={stop} style={{ alignSelf: 'flex-end' }}>停止</button>
        ) : (
          <button className="btn btn-primary" onClick={send} disabled={!input.trim()} style={{ alignSelf: 'flex-end' }}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
