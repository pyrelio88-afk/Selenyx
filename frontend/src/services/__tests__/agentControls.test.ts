/**
 * V4 模块 D 前端：活动态判定（SSE/轮询与动态区共用）。
 */

import { describe, expect, it } from 'vitest';
import { isActiveRun } from '@services/agent';

describe('isActiveRun（模块 D 状态语义）', () => {
  it('运行中/取消中/待确认计划都算活动态', () => {
    expect(isActiveRun('running')).toBe(true);
    expect(isActiveRun('cancelling')).toBe(true);
    expect(isActiveRun('waiting_confirm')).toBe(true);
  });

  it('终态不再活动（轮询停止、SSE 关流）', () => {
    expect(isActiveRun('completed')).toBe(false);
    expect(isActiveRun('failed')).toBe(false);
    expect(isActiveRun('cancelled')).toBe(false);
  });
});
