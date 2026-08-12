/**
 * 对话流控制与 agent 回贴监听。
 *
 * UI 只描述如何把消息写入某个会话；网络流、取消和 SSE/轮询兜底统一在这里，
 * 以避免每个助理入口重复注册异步控制器。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LLMConfig } from '@apptypes/index';
import { agentApi, isActiveRun, subscribeRunEvents, type AgentRunDetail } from '@services/agent';
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
        onScrollToBottom(true);
      }
    }
  }, [llmConfig, onDelta, onError, onFinish, onScrollToBottom, onStart, onUsage]);

  return { busy, runCompletion, stop };
}

interface RunWatchOptions {
  onTerminal: (run: AgentRunDetail) => void;
}

/**
 * Watches a converted agent run. EventSource remains the low-latency path;
 * a single interval is created only after its connection fails.
 */
export function watchRunOutput(link: PendingRunBacklink, { onTerminal }: RunWatchOptions): () => void {
  let disposed = false;
  let settled = false;
  let polling = false;
  let pollTimer: number | null = null;
  let closeEvents: (() => void) | null = null;

  const clear = () => {
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = null;
    closeEvents?.();
    closeEvents = null;
  };

  const checkTerminal = async () => {
    try {
      const run = await agentApi.get(link.runId);
      if (disposed || settled || isActiveRun(run.status)) return;
      settled = true;
      clear();
      onTerminal(run);
    } catch {
      // Keep a fallback interval alive. A temporary local-backend restart must
      // not turn a pending output into a fabricated assistant response.
    }
  };

  const startPolling = () => {
    if (disposed || polling) return;
    polling = true;
    closeEvents?.();
    closeEvents = null;
    void checkTerminal();
    pollTimer = window.setInterval(() => void checkTerminal(), 1500);
  };

  closeEvents = subscribeRunEvents(link.runId, {
    onStatus: () => void checkTerminal(),
    onError: startPolling,
  });

  return () => {
    disposed = true;
    clear();
  };
}
