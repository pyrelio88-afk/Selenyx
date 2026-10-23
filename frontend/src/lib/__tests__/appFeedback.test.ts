import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadStore() {
  vi.resetModules();
  return import('../appFeedback');
}

describe('appFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('notifies subscribers immediately and keeps the latest three toasts', async () => {
    const store = await loadStore();
    const seen: string[][] = [];
    const unsubscribe = store.subscribeToasts((items) => seen.push(items.map((item) => item.message)));

    store.notify('一');
    store.notify('二', 'success');
    store.notify('三', 'error');
    store.notify('四');

    expect(seen[0]).toEqual([]);
    expect(seen[seen.length - 1]).toEqual(['二', '三', '四']);
    unsubscribe();
  });

  it('dismisses a toast and clears its timer', async () => {
    const store = await loadStore();
    const id = store.notify('保存成功', 'success');
    let latest: string[] = [];
    store.subscribeToasts((items) => { latest = items.map((item) => item.message); });

    store.dismissToast(id);

    expect(latest).toEqual([]);
    vi.runAllTimers();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves a confirmation with the chosen answer', async () => {
    const store = await loadStore();
    const pending: Promise<boolean> = store.confirmAction({ title: '删除项目？', danger: true });

    const states: (string | null)[] = [];
    store.subscribeConfirm((value) => states.push(value ? value.request.title : null));
    expect(states).toEqual(['删除项目？']);

    store.resolveConfirm(true);
    await expect(pending).resolves.toBe(true);
    expect(states).toEqual(['删除项目？', null]);
  });

  it('cancels the previous confirmation when a new one replaces it', async () => {
    const store = await loadStore();
    const first = store.confirmAction('第一条');
    const second = store.confirmAction('第二条');

    await expect(first).resolves.toBe(false);
    store.resolveConfirm(false);
    await expect(second).resolves.toBe(false);
  });

  it('auto-dismisses toasts after their duration', async () => {
    const store = await loadStore();
    store.notify('自动消失', 'info', 1000);
    let latest: string[] = [];
    store.subscribeToasts((items) => { latest = items.map((item) => item.message); });

    vi.advanceTimersByTime(999);
    expect(latest).toEqual(['自动消失']);
    vi.advanceTimersByTime(1);
    expect(latest).toEqual([]);
  });
});
