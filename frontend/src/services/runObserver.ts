import { agentApi, isActiveRun, subscribeRunEvents, type AgentRunDetail } from './agent';

export type RunConnectionMode = 'connecting' | 'live' | 'polling';

const REFRESH_THROTTLE_MS = 300;
const POLL_INTERVAL_MS = 1500;
const REQUEST_TIMEOUT_MS = 8000;

/** SSE only invalidates persisted detail; it is not a second, append-only log. */
export function observeRun(runId: string, options: {
  onUpdate: (run: AgentRunDetail) => void;
  onModeChange?: (mode: RunConnectionMode) => void;
  onError?: (error: unknown) => void;
}): { refresh: () => void; close: () => void } {
  let closed = false;
  let mode: RunConnectionMode = 'connecting';
  let closeEvents: (() => void) | null = null;
  let inFlight: AbortController | null = null;
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let lastRequestAt = -Infinity;

  function stopEvents() {
    const stop = closeEvents;
    closeEvents = null;
    stop?.();
  }

  function close() {
    if (closed) return;
    closed = true;
    pending = false;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    if (requestTimeout !== null) clearTimeout(requestTimeout);
    refreshTimer = null;
    requestTimeout = null;
    inFlight?.abort();
    inFlight = null;
    stopEvents();
  }

  function setMode(next: RunConnectionMode) {
    if (closed || mode === next) return;
    mode = next;
    options.onModeChange?.(next);
  }

  function startPolling() {
    stopEvents();
    setMode('polling');
  }

  function scheduleNext() {
    if (closed || inFlight || refreshTimer !== null) return;
    if (!pending && mode !== 'polling') return;
    // Anchor throttling to the last GET, not the latest event: a busy stream
    // cannot postpone canonical updates indefinitely.
    const delay = pending
      ? Math.max(0, lastRequestAt + REFRESH_THROTTLE_MS - Date.now())
      : POLL_INTERVAL_MS;
    if (delay === 0) {
      fetchRun();
    } else {
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        fetchRun();
      }, delay);
    }
  }

  function refresh() {
    if (closed) return;
    // A manual refresh supersedes a scheduled poll, but never resets a
    // pending throttle window or creates another concurrent request.
    if (!pending && refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    pending = true;
    scheduleNext();
  }

  function finishRequest(request: AbortController): boolean {
    // Also reject late results from an aborted/timed-out request, even when
    // the underlying transport ignores AbortSignal.
    if (closed || inFlight !== request) return false;
    if (requestTimeout !== null) clearTimeout(requestTimeout);
    requestTimeout = null;
    inFlight = null;
    return true;
  }

  function failRequest(request: AbortController, error: unknown) {
    if (!finishRequest(request)) return;
    startPolling();
    scheduleNext();
    if (!closed) options.onError?.(error);
  }

  function fetchRun() {
    if (closed || inFlight) return;
    pending = false;
    lastRequestAt = Date.now();
    const request = new AbortController();
    inFlight = request;
    requestTimeout = setTimeout(() => {
      request.abort();
      failRequest(request, new Error('Run detail request timed out after 8000ms.'));
    }, REQUEST_TIMEOUT_MS);
    void agentApi.get(runId, request.signal).then((run) => {
      if (!finishRequest(request)) return;
      if (!isActiveRun(run.status)) {
        // Close before calling out so reentrant refreshes cannot redeliver a
        // terminal snapshot. Wire status/output alone can never settle a run.
        close();
        options.onUpdate(run);
        return;
      }
      options.onUpdate(run);
      scheduleNext();
    }, (error: unknown) => failRequest(request, error));
  }

  options.onModeChange?.('connecting');
  refresh();
  try {
    closeEvents = subscribeRunEvents(runId, {
      onOpen: () => {
        if (mode !== 'polling') setMode('live');
      },
      onEvent: () => {
        if (mode !== 'polling') refresh();
      },
      onStatus: () => {
        if (closed || mode === 'polling') return;
        // The server closes SSE after status. Keep polling until persisted
        // detail is terminal, including after a failed final GET.
        startPolling();
        refresh();
      },
      onError: () => {
        if (closed || mode === 'polling') return;
        startPolling();
        scheduleNext();
        if (!closed) options.onError?.(new Error('Run event stream disconnected.'));
      },
    });
  } catch (error) {
    startPolling();
    scheduleNext();
    if (!closed) options.onError?.(error);
  }

  return { refresh, close };
}
