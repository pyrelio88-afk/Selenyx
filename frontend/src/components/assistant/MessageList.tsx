/** 消息时间线、自动跟随滚动与回到底部控制。 */

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { EmptyState } from './EmptyState';
import { MessageBubble } from './MessageBubble';
import { dayLabel, type Msg } from './chatShared';

export interface MessageListHandle {
  scrollToBottom: (force?: boolean) => void;
}

interface MessageListProps {
  sessionId: string | null;
  messages: Msg[];
  busy: boolean;
  configured: boolean;
  onPickPrompt: (prompt: string) => void;
  onCopy: (content: string) => void;
  onEdit: (index: number) => void;
  onRetry: () => void;
  onBranch: (index: number) => void;
  onOpenRun?: (runId: string) => void;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList({
  sessionId,
  messages,
  busy,
  configured,
  onPickPrompt,
  onCopy,
  onEdit,
  onRetry,
  onBranch,
  onOpenRun,
}, ref) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const stickBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !stickBottomRef.current) return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const list = listRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
      stickBottomRef.current = true;
      setAtBottom(true);
    });
  }, []);

  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom, sessionId]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    stickBottomRef.current = isAtBottom;
    setAtBottom((current) => (current === isAtBottom ? current : isAtBottom));
  };

  return (
    <>
      <div className="aichat-messages" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <EmptyState configured={configured} onPick={onPickPrompt} />
        ) : (
          <div className="aichat-thread">
            {messages.map((message, index) => {
              const showDateSeparator = index === 0 || dayLabel(messages[index - 1].ts) !== dayLabel(message.ts);
              return (
                <Fragment key={`${message.ts}-${index}`}>
                  {showDateSeparator ? <div className="aichat-date-sep">{dayLabel(message.ts)}</div> : null}
                  <MessageBubble
                    msg={message}
                    isLast={index === messages.length - 1}
                    busy={busy}
                    onCopy={() => onCopy(message.content)}
                    onEdit={() => onEdit(index)}
                    onRetry={onRetry}
                    onBranch={() => onBranch(index)}
                    onOpenRun={onOpenRun}
                  />
                </Fragment>
              );
            })}
            {busy && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content ? (
              <div className="aichat-streaming-bar">生成中…</div>
            ) : null}
          </div>
        )}
      </div>
      {messages.length > 0 && !atBottom ? (
        <button type="button" className="aichat-scroll-btn visible" onClick={() => scrollToBottom(true)} title="滚动到底部" aria-label="滚动到最新消息">
          <Icon name="chevronDown" size={18} />
        </button>
      ) : null}
    </>
  );
});
