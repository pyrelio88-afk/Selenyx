/**
 * D6 localStorage schema versioning 单测（R102）
 * 覆盖规格验证清单四项，手动 mock localStorage（node 环境无 DOM）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  versionedLoad,
  versionedSave,
  getOnboardingState,
  setOnboardingState,
} from '../storage';

// === 手动 mock localStorage（node 无 DOM） ===
function makeStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  store = makeStore();
  // @ts-expect-error 注入全局 localStorage
  globalThis.localStorage = store;
});

describe('D6 storage versioning', () => {
  it('旧数据（-v1 裸数组）读入自动迁移且不丢字段', () => {
    // 模拟历史 -v1 key 存的是裸数组
    store.setItem(
      'selenyx-pomodoro-events-v1',
      JSON.stringify([{ id: 'x', name: '测试', minutes: 12, kind: 'focus' }]),
    );
    const { items } = versionedLoad<{ items: any[] }>('selenyx-pomodoro-events', { items: [] });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('x');
    expect(items[0].name).toBe('测试');
  });

  it('损坏数据（乱码）回退 defaults 且不抛', () => {
    store.setItem('selenyx-custom-entries', '这不是JSON{{{乱码');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = versionedLoad('selenyx-custom-entries', { items: [{ a: 1 }] });
    expect(result).toEqual({ items: [{ a: 1 }] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('保存 quota 超限不崩（setItem 抛异常时 versionedSave 不抛 + warn）', () => {
    // 让 setItem 抛异常模拟 quota 超限
    store.setItem = () => {
      throw new DOMException('quota exceeded');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => versionedSave('selenyx-pomodoro-events', { items: [] })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('round-trip 一致性 + onboarding 旧 key 兼容', () => {
    // round-trip：存什么读回什么
    versionedSave('selenyx-custom-entries', { items: [{ term: 'T1' }, { term: 'T2' }] });
    const back = versionedLoad('selenyx-custom-entries', { items: [] });
    expect(back.items).toHaveLength(2);
    // 存储里带 __v 字段
    const raw = JSON.parse(store.getItem('selenyx-custom-entries')!);
    expect(raw.__v).toBe(2);

    // onboarding 旧 key（selenyx-onboarding-done 存裸字符串）兼容
    store.setItem('selenyx-onboarding-done', 'skipped');
    expect(getOnboardingState()).toBe('skipped');
    // 新写入走新 key + __v
    setOnboardingState('true');
    const ob = JSON.parse(store.getItem('selenyx-onboarding')!);
    expect(ob.flag).toBe('true');
    expect(ob.__v).toBe(1);
    expect(getOnboardingState()).toBe('true');
  });
});
