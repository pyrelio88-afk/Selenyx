import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalBackendStatus } from '../useLocalBackendStatus';

const harness = vi.hoisted(() => ({
  effect: undefined as (() => void | (() => void)) | undefined,
  update: vi.fn(),
  health: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, harness.update],
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
}));
vi.mock('@services/api', () => ({ localApi: { health: harness.health } }));

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  harness.health.mockReset().mockResolvedValue({ status: 'ok' });
  harness.update.mockReset();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: false });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function BackendStatusProbe() {
  expect(useLocalBackendStatus()).toEqual({ label: '检测本地服务…', tone: 'checking' });
  cleanup = harness.effect!() || undefined;
}

describe('local backend availability', () => {
  it('recovers from a cold backend without Internet or a network-change event', async () => {
    harness.health.mockRejectedValueOnce(new Error('Backend still starting'));
    BackendStatusProbe();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.update).toHaveBeenLastCalledWith({ label: '本机服务未连接', tone: 'offline' });
    await vi.advanceTimersByTimeAsync(1499);
    expect(harness.health).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.health).toHaveBeenCalledTimes(2);
    expect(harness.update).toHaveBeenLastCalledWith({ label: '后端在线', tone: 'online' });
  });

  it('probes healthy loopback even when navigator is offline and rechecks sequentially', async () => {
    BackendStatusProbe();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.update).toHaveBeenLastCalledWith({ label: '后端在线', tone: 'online' });
    await vi.advanceTimersByTimeAsync(14999);
    expect(harness.health).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.health).toHaveBeenCalledTimes(2);
  });

  it('does not overlap probes when network events arrive during a slow request', async () => {
    let resolve!: (value: unknown) => void;
    harness.health.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    BackendStatusProbe();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(harness.health).toHaveBeenCalledTimes(1);
    resolve({ status: 'ok' });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('suppresses a late response and removes timers and listeners after unmount', async () => {
    let resolve!: (value: unknown) => void;
    harness.health.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    BackendStatusProbe();
    cleanup!();
    cleanup = undefined;
    resolve({ status: 'ok' });
    await vi.advanceTimersByTimeAsync(30000);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    expect(harness.health).toHaveBeenCalledTimes(1);
    expect(harness.update).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes a scheduled retry when unmounted', async () => {
    harness.health.mockRejectedValue(new Error('Offline'));
    BackendStatusProbe();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    cleanup!();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(30000);
    expect(harness.health).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
