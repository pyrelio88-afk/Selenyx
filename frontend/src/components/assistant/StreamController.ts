/**
 * 对话流控制与 agent 回贴监听。
 *
 * UI 只描述如何把消息写入某个会话；网络流、取消和 SSE/轮询兜底统一在这里，
 * 以避免每个助理入口重复注册异步控制器。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LLMConfig } from '@apptypes/index';
import { isActiveRun, type AgentRunDetail } from '@services/agent';
import { observeRun } from '@services/runObserver';
import { LLMError, streamChat, type LLMMessage } from '@services/llm';

export interface PendingRunBacklink {
  runId: string;
  sessionId: string;
  scope: string;
}

export interface ChatStreamTarget {
  sessionId: string;
  scope: string;
}

interface ChatStreamControllerOptions {
  llmConfig: LLMConfig | null;
  onStart: (appendUser: { content: string } | undefined, model: string, target: ChatStreamTarget) => void;
  onDelta: (content: string, target: ChatStreamTarget) => void;
  onError: (message: string, isAbort: boolean, target: ChatStreamTarget) => void;
  onUsage: (tokensUsed: number, config: LLMConfig) => void;
  onFinish: () => void;
  onScrollToBottom: (force?: boolean) => void;
}

function streamErrorMessage(error: unknown): { message: string; isAbort: boolean } {
  const isAbort = error instanceof DOMException && error.name === 'AbortError';
  if (isAbort) return { message: '（已停止生成）', isAbort: true };
  if (error instanceof LLMError) return { message: error.message, isAbort: false };
  return { message: `出错了：${error instanceof Error ? error.message : String(error)}`, isAbort: false };
}

/** Handles one browser-local LLM stream at a time and exposes cancellation. */
export function useChatStreamController({
  llmConfig,
  onStart,
  onDelta,
  onError,
  onUsage,
  onFinish,
  onScrollToBottom,
}: ChatStreamControllerOptions) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingContentRef = useRef('');
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runCompletion = useCallback(async (
    history: LLMMessage[],
    appendUser: { content: string } | undefined,
    target: ChatStreamTarget,
  ) => {
    const config = llmConfig;
    if (!config || busyRef.current) return;

    busyRef.current = true;
    pendingContentRef.current = '';
    setBusy(true);
    onStart(appendUser, config.model, target);
    onScrollToBottom(true);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const result = await streamChat(config, history, (content) => {
        pendingContentRef.current = content;
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          onDelta(pendingContentRef.current, target);
          onScrollToBottom();
        });
      }, abort.signal);
      if (mountedRef.current) onUsage(result.tokensUsed, config);
    } catch (error) {
      const mapped = streamErrorMessage(error);
      if (mountedRef.current) onError(mapped.message, mapped.isAbort, target);
    } finally {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        // A fast final chunk can arrive between animation frames. Flush it
        // synchronously instead of losing the terminal text when the stream
        // resolves before the scheduled paint.
        if (mountedRef.current) onDelta(pendingContentRef.current, target);
      }
      abortRef.current = null;
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
      if (mountedRef.current) {
        onFinish();
        onScrollToBottom();
      }
    }
  }, [llmConfig, onDelta, onError, onFinish, onScrollToBottom, onStart, onUsage]);

  return { busy, runCompletion, stop };
}

interface RunWatchOptions {
  onTerminal: (run: AgentRunDetail) => void;
  onWaiting?: (run: AgentRunDetail) => void;
}

/** Watches persisted terminal output through the shared SSE/polling observer. */
export function watchRunOutput(link: PendingRunBacklink, { onTerminal, onWaiting }: RunWatchOptions): () => void {
  let notifiedStatus = '';
  return observeRun(link.runId, {
    onUpdate: (run) => {
      if (!isActiveRun(run.status)) {
        onTerminal(run);
        return;
      }
      const waiting = run.status === 'waiting_evidence' || run.status === 'waiting_confirm';
      if (!waiting) {
        notifiedStatus = '';
        return;
      }
      if (onWaiting && notifiedStatus !== run.status) {
        notifiedStatus = run.status;
        onWaiting(run);
      }
    },
  }).close;
}
