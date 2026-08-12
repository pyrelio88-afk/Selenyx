/**
 * 消息气泡：复制 / 编辑重发 / 重新生成 / 分支；流式光标与思考动效。
 * 从 AIChatView.tsx 抽离（V4 模块 H.2）。
 */

import { useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { MarkdownView } from '@components/chat/MarkdownView';
import { nowHHMM, type Msg } from './chatShared';

export function MessageBubble({ msg, isLast, busy, onCopy, onEdit, onRetry, onBranch, onOpenRun }: {
  msg: Msg; isLast: boolean; busy: boolean;
  onCopy: () => void; onEdit: () => void; onRetry: () => void; onBranch: () => void;
  onOpenRun?: (runId: string) => void;
}) {
  const isUser = msg.role === 'user';
  const streaming = !isUser && busy && isLast;
  const thinking = streaming && !msg.content;
  const [copied, setCopied] = useState(false);
  const [assistantAvatarFailed, setAssistantAvatarFailed] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={`aichat-msg ${isUser ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
      <div className="aichat-msg-avatar">
        {isUser ? (
          <Icon name="stageProblem" size={15} strokeWidth={1.7} />
        ) : assistantAvatarFailed ? (
          <Icon name="sparkles" size={15} strokeWidth={1.7} aria-label="Selenyx 助理头像加载失败" />
        ) : (
          <img
            className="aichat-assistant-avatar-image"
            src="/brand-crane-cloud-512-v1.png"
            alt="Selenyx 助理头像"
            onError={() => setAssistantAvatarFailed(true)}
          />
        )}
      </div>
      <div className="aichat-msg-body">
        <div className="aichat-msg-meta">
          <span className="aichat-msg-role">{isUser ? '我' : 'AI 助手'}</span>
          {!isUser && msg.model && <span className="aichat-msg-model">{msg.model}</span>}
          {!isUser && msg.runId && <span className="aichat-msg-model">任务回贴</span>}
          <span className="aichat-msg-time"><Icon name="clock" size={11} /> {nowHHMM(msg.ts)}</span>
        </div>
        <div className="aichat-msg-content">
          {isUser ? (
            <div className="aichat-msg-text">{msg.content}</div>
          ) : thinking ? (
            <div className="aichat-thinking"><span></span><span></span><span></span></div>
          ) : (
            <>
              <MarkdownView content={msg.content} />
              {streaming && <span className="aichat-cursor" />}
            </>
          )}
        </div>
        {!thinking && (
          <div className="aichat-msg-acts">
            <button onClick={handleCopy} title="复制" aria-label={copied ? '消息已复制' : '复制消息'} className={copied ? 'copied' : ''}>
              <Icon name={copied ? 'check' : 'copy'} size={13} />
              {copied && <span>已复制</span>}
            </button>
            {isUser && <button onClick={onEdit} title="编辑并重发" aria-label="编辑并重新发送这条消息"><Icon name="pencil" size={13} /></button>}
            {!isUser && isLast && !busy && !msg.runId && <button onClick={onRetry} title="重新生成" aria-label="重新生成助手回答"><Icon name="retry" size={13} /></button>}
            {!isUser && msg.error && !streaming && !msg.runId && <button onClick={onRetry} title="重试" aria-label="重试生成助手回答" className="aichat-retry-btn"><Icon name="retry" size={13} /> 重试</button>}
            {!isUser && msg.runId && onOpenRun && <button onClick={() => onOpenRun(msg.runId!)} title="打开任务详情" aria-label="打开来源任务详情"><Icon name="target" size={13} /></button>}
            <button onClick={onBranch} title="从此处分支新会话" aria-label="从这条消息创建分支会话"><Icon name="branch" size={13} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
