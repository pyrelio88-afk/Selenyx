import { useState } from 'react';
import { useAppStore } from '@stores/appStore';

export function AIChatView() {
  const { llmConfig } = useAppStore();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');

  function send() {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');
    // TODO: 调用 aiApi.chat()
    setTimeout(() => {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: llmConfig
          ? `已收到你的问题：「${input}」。AI 功能正在接入中，后端 Python FastAPI 服务负责 LLM 调用与 extractive retrieval。`
          : '请先在「设置」中配置 LLM API Key（BYOK）。Selenyx 支持 OpenAI / OpenRouter / Anthropic / Google / Ollama。',
      }]);
    }, 500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="view-header">
        <h1 className="view-title">AI 助手</h1>
        <span style={{ fontSize: 13, color: llmConfig ? 'var(--success)' : 'var(--danger)' }}>
          {llmConfig ? `● ${llmConfig.provider} / ${llmConfig.model}` : '● 未配置'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div className="empty-state" style={{ marginTop: 48 }}>
            <div className="icon">🤖</div>
            <p>AI 研究助手 — 文献综述 / 论文批评 / 想法生成 / 数据提取</p>
            <p style={{ marginTop: 8, fontSize: 13 }}>所有 AI 运行经审批门控、审计日志、extractive retrieval（不编造引用）</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '70%',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
            color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
            border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            {msg.content}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="输入你的问题..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={send}>发送</button>
      </div>
    </div>
  );
}
