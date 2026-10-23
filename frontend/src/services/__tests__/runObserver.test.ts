import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchRunOutput } from '@components/assistant/StreamController';
import type { AgentRunDetail } from '@services/agent';
import { observeRun, type RunConnectionMode } from '@services/runObserver';

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    super();
    FakeEventSource.instances.push(this);
  }

  // Intentionally allow queued callbacks after close to exercise stale guards.
  open() { this.onopen?.(); }
  fail() { this.onerror?.(); }
  emit(name: string, data: Record<string, unknown> = {}) {
    this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  }
}

function detail(status = 'running', overrides: Partial<AgentRunDetail> = {}): AgentRunDetail {
  return {
    id: 'run-1', goal: 'Observe an existing run', projectId: null,
    status, startedAt: null, completedAt: null, outputText: '', auditLog: [],
    ...overrides,
  };
}

function response(run: AgentRunDetail): Response {
  return { ok: true, json: async () => run } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const fetchMock = vi.fn<typeof fetch>();
let disposers: (() => void)[] = [];

function watch(runId = 'run-1') {
  const onUpdate = vi.fn<(run: AgentRunDetail) => void>();
  const onModeChange = vi.fn<(mode: RunConnectionMode) => void>();
  const onError = vi.fn<(error: unknown) => void>();
  const observer = observeRun(runId, { onUpdate, onModeChange, onError });
  disposers.push(observer.close);
  return {
    ...observer, onUpdate, onModeChange, onError,
    source: FakeEventSource.instances[FakeEventSource.instances.length - 1],
  };
}

function signalAt(index: number): AbortSignal {
  const signal = fetchMock.mock.calls[index][1]?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  return signal!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  FakeEventSource.instances = [];
  fetchMock.mockReset().mockImplementation(async () => response(detail()));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  disposers.forEach((close) => close());
  disposers = [];
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('observeRun', () => {
  it('GETs immediately and settles an already completed run exactly once', async () => {
    const completed = detail('completed', { outputText: 'Persisted final output' });
    fetchMock.mockResolvedValueOnce(response(completed));
    const observer = watch();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent/runs/run-1');
    expect(observer.source.url).toBe('/api/agent/runs/run-1/events');
    signalAt(0);
    observer.onUpdate.mockImplementation(() => observer.refresh());
    await vi.advanceTimersByTimeAsync(0);

    expect(observer.onUpdate).toHaveBeenCalledExactlyOnceWith(completed);
    expect(observer.source.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    observer.source.open();
    observer.source.fail();
    observer.source.emit('status', { status: 'completed', output: 'Not canonical' });
    observer.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observer.onModeChange.mock.calls).toEqual([['connecting']]);
    expect(observer.onError).not.toHaveBeenCalled();
  });

  it('reports live on open and reconciles active events and completion from GET only', async () => {
    const active = detail('running', {
      auditLog: [{ step: 1, kind: 'thought', ts: 'persisted', text: 'Canonical thought' }],
    });
    const completed = detail('completed', { ...active, status: 'completed', outputText: 'Canonical final' });
    fetchMock.mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active))
      .mockResolvedValueOnce(response(completed));
    const observer = watch();
    observer.source.open();
    observer.source.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.onModeChange.mock.calls).toEqual([['connecting'], ['live']]);
    expect(vi.getTimerCount()).toBe(0);

    observer.source.emit('thought', { step: 1, text: 'Duplicate wire thought' });
    observer.source.emit('snapshot', { auditLog: [{ text: 'Unpersisted wire thought' }] });
    expect(observer.onUpdate).toHaveBeenCalledExactlyOnceWith(active);
    await vi.advanceTimersByTimeAsync(300);
    expect(observer.onUpdate.mock.calls).toEqual([[active], [active]]);
    observer.source.emit('status', { status: 'completed', output: 'Wire final' });
    expect(observer.source.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer.onUpdate.mock.calls).toEqual([[active], [active], [completed]]);
    expect(observer.onModeChange).toHaveBeenLastCalledWith('polling');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('coalesces bursts in fixed 300ms windows without starving a continuous stream', async () => {
    const observer = watch();
    await vi.advanceTimersByTimeAsync(0);
    for (let window = 0; window < 3; window++) {
      for (let event = 0; event < 5; event++) {
        observer.source.emit('tool_result', { result: 'Unpersisted' });
        await vi.advanceTimersByTimeAsync(50);
      }
      observer.source.emit('thought');
      await vi.advanceTimersByTimeAsync(49);
      expect(fetchMock).toHaveBeenCalledTimes(window + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(window + 2);
    }
    expect(observer.onUpdate).toHaveBeenCalledTimes(4);
  });

  it('never overlaps slow GETs and retains just one invalidation during a request', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const observer = watch();
    for (let i = 0; i < 10; i++) {
      observer.source.emit('thought');
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    first.resolve(response(detail()));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    second.resolve(response(detail()));
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a manual refresh requested while the initial GET is in flight', async () => {
    const first = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise);
    const observer = watch();
    observer.refresh();
    observer.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledOnce();
    first.resolve(response(detail()));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observer.onUpdate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a failed GET after terminal status and emits terminal detail only once', async () => {
    const error = new Error('Backend restarting');
    const completed = detail('completed', { outputText: 'Recovered persisted output' });
    fetchMock.mockResolvedValueOnce(response(detail())).mockRejectedValueOnce(error)
      .mockResolvedValueOnce(response(completed));
    const observer = watch();
    await vi.advanceTimersByTimeAsync(0);
    observer.source.emit('status', { status: 'completed', output: 'Do not trust this output' });
    await vi.advanceTimersByTimeAsync(300);
    expect(observer.source.close).toHaveBeenCalled();
    expect(observer.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(observer.onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(observer.onUpdate).toHaveBeenLastCalledWith(completed);
    expect(observer.onUpdate).toHaveBeenCalledTimes(2);
    observer.source.emit('status', { status: 'completed' });
    observer.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(observer.onUpdate).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['running', 'cancelling', 'waiting_confirm', 'waiting_evidence'])(
    'keeps polling when terminal status precedes a canonical %s snapshot', async (status) => {
      const active = detail(status);
      const completed = detail('completed');
      fetchMock.mockResolvedValueOnce(response(detail())).mockResolvedValueOnce(response(active))
        .mockResolvedValueOnce(response(completed));
      const observer = watch();
      await vi.advanceTimersByTimeAsync(0);
      observer.source.emit('status', { status: 'completed' });
      await vi.advanceTimersByTimeAsync(300);
      expect(observer.onUpdate).toHaveBeenLastCalledWith(active);
      await vi.advanceTimersByTimeAsync(1500);
      expect(observer.onUpdate).toHaveBeenLastCalledWith(completed);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('uses sequential 1500ms polling after SSE failure, even with slow responses', async () => {
    const slowPoll = deferred<Response>();
    const completed = detail('completed');
    fetchMock.mockResolvedValueOnce(response(detail())).mockReturnValueOnce(slowPoll.promise)
      .mockResolvedValueOnce(response(completed));
    const observer = watch();
    observer.source.open();
    await vi.advanceTimersByTimeAsync(0);
    observer.source.fail();
    observer.source.open();
    observer.source.emit('thought');
    observer.source.fail();
    expect(observer.source.close).toHaveBeenCalled();
    expect(observer.onModeChange.mock.calls).toEqual([['connecting'], ['live'], ['polling']]);
    expect(observer.onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    slowPoll.resolve(response(detail()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(observer.onUpdate).toHaveBeenLastCalledWith(completed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back on an initial GET error and keeps retrying GET without fabricating output', async () => {
    const error = new Error('Offline');
    const completed = detail('failed', { outputText: 'Persisted failure' });
    fetchMock.mockRejectedValueOnce(error).mockRejectedValueOnce(error)
      .mockResolvedValueOnce(response(completed));
    const observer = watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.onUpdate).not.toHaveBeenCalled();
    expect(observer.source.close).toHaveBeenCalled();
    expect(observer.onModeChange).toHaveBeenLastCalledWith('polling');
    await vi.advanceTimersByTimeAsync(1500);
    expect(observer.onUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(observer.onUpdate).toHaveBeenCalledExactlyOnceWith(completed);
    expect(observer.onError).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('/api/agent/runs/run-1');
      expect(init?.method ?? 'GET').toBe('GET');
    }
  });

  it('polls when EventSource cannot be constructed', async () => {
    vi.stubGlobal('EventSource', class { constructor() { throw new Error('SSE unavailable'); } });
    fetchMock.mockResolvedValueOnce(response(detail())).mockResolvedValueOnce(response(detail('completed')));
    const observer = watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.onError).toHaveBeenCalledOnce();
    expect(observer.onModeChange).toHaveBeenLastCalledWith('polling');
    await vi.advanceTimersByTimeAsync(1500);
    expect(observer.onUpdate).toHaveBeenLastCalledWith(detail('completed'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['resolve', 'reject'] as const)('disposal aborts GET and ignores a late old %s after switching runs', async (outcome) => {
    const oldRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(response(detail('completed', { id: 'new-run' })));
    const old = watch('old-run');
    const oldSignal = signalAt(0);
    old.close();
    old.close();
    expect(oldSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(old.source.close).toHaveBeenCalledOnce();
    const current = watch('new-run');
    if (outcome === 'resolve') oldRequest.resolve(response(detail('completed', { id: 'old-run' })));
    else oldRequest.reject(new Error('Late old failure'));
    old.source.open();
    old.source.emit('thought');
    old.source.emit('status', { status: 'completed' });
    old.source.fail();
    old.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(old.onUpdate).not.toHaveBeenCalled();
    expect(old.onError).not.toHaveBeenCalled();
    expect(old.onModeChange.mock.calls).toEqual([['connecting']]);
    expect(current.onUpdate).toHaveBeenCalledExactlyOnceWith(detail('completed', { id: 'new-run' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/agent/runs/old-run', '/api/agent/runs/new-run',
    ]);
  });

  it.each(['throttle', 'poll'])('clears a scheduled %s timer on close', async (timer) => {
    const observer = watch();
    await vi.advanceTimersByTimeAsync(0);
    if (timer === 'throttle') observer.source.emit('thought');
    else observer.source.fail();
    expect(vi.getTimerCount()).toBe(1);
    observer.close();
    expect(vi.getTimerCount()).toBe(0);
    observer.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bounds GETs at 8s, aborts timed-out transport, and ignores late results during recovery', async () => {
    const hungRequest = deferred<Response>();
    const recovery = deferred<Response>();
    fetchMock.mockReturnValueOnce(hungRequest.promise).mockReturnValueOnce(recovery.promise);
    const observer = watch();
    const signal = signalAt(0);
    await vi.advanceTimersByTimeAsync(7999);
    expect(signal.aborted).toBe(false);
    expect(observer.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(observer.onError).toHaveBeenCalledOnce();
    expect(observer.onModeChange).toHaveBeenLastCalledWith('polling');
    expect(observer.source.close).toHaveBeenCalled();
    expect(observer.onUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signalAt(1).aborted).toBe(false);
    hungRequest.resolve(response(detail('completed', { outputText: 'Late timed-out result' })));
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.onUpdate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    const completed = detail('completed', { outputText: 'Fresh recovery snapshot' });
    recovery.resolve(response(completed));
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.onUpdate).toHaveBeenCalledExactlyOnceWith(completed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suppresses further callbacks if a consumer closes during a mode change', async () => {
    const observer = watch();
    observer.onModeChange.mockImplementation((mode) => {
      if (mode === 'polling') observer.close();
    });
    observer.source.fail();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(observer.onUpdate).not.toHaveBeenCalled();
    expect(observer.onError).not.toHaveBeenCalled();
    expect(signalAt(0).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('watchRunOutput shared observer integration', () => {
  it.each(['completed', 'failed', 'cancelled'])('only passes canonical %s output to onTerminal', async (status) => {
    const terminal = detail(status, { outputText: 'Persisted terminal output' });
    fetchMock.mockResolvedValueOnce(response(detail())).mockResolvedValueOnce(response(terminal));
    const onTerminal = vi.fn();
    const close = watchRunOutput({ runId: 'run-1', sessionId: 'session-1', scope: 'global' }, { onTerminal });
    disposers.push(close);
    await vi.advanceTimersByTimeAsync(0);
    expect(onTerminal).not.toHaveBeenCalled();
    const source = FakeEventSource.instances[0];
    source.emit('status', { status, output: 'Unpersisted output' });
    await vi.advanceTimersByTimeAsync(300);
    expect(onTerminal).toHaveBeenCalledExactlyOnceWith(terminal);
    expect(source.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    close();
  });

  it('notifies once per pause when a run waits for plan or evidence, then resumes', async () => {
    const waitingEvidence = detail('waiting_evidence');
    const waitingPlan = detail('waiting_confirm');
    fetchMock
      .mockResolvedValueOnce(response(detail()))
      .mockResolvedValueOnce(response(waitingEvidence))
      .mockResolvedValueOnce(response(waitingEvidence))
      .mockResolvedValueOnce(response(detail()))
      .mockResolvedValueOnce(response(waitingPlan));
    const onTerminal = vi.fn();
    const onWaiting = vi.fn();
    const close = watchRunOutput(
      { runId: 'run-1', sessionId: 'session-1', scope: 'global' },
      { onTerminal, onWaiting },
    );
    disposers.push(close);
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).not.toHaveBeenCalled();
    const source = FakeEventSource.instances[0];
    source.emit('step', { kind: 'evidence_wait' });
    await vi.advanceTimersByTimeAsync(300);
    expect(onWaiting).toHaveBeenCalledExactlyOnceWith(waitingEvidence);
    source.emit('step', { kind: 'evidence_wait' });
    await vi.advanceTimersByTimeAsync(300);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    source.emit('step', { kind: 'evidence_resume' });
    await vi.advanceTimersByTimeAsync(300);
    source.emit('step', { kind: 'waiting' });
    await vi.advanceTimersByTimeAsync(300);
    expect(onWaiting).toHaveBeenCalledTimes(2);
    expect(onWaiting).toHaveBeenLastCalledWith(waitingPlan);
    expect(onTerminal).not.toHaveBeenCalled();
    close();
  });

  it('returns a disposer that aborts the observer request', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const onTerminal = vi.fn();
    const close = watchRunOutput({ runId: 'run-1', sessionId: 'session-1', scope: 'global' }, { onTerminal });
    disposers.push(close);
    close();
    expect(signalAt(0).aborted).toBe(true);
    pending.resolve(response(detail('completed')));
    await vi.advanceTimersByTimeAsync(0);
    expect(onTerminal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
