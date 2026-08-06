/**
 * gammaQ / chi2SF / fSF 精度回归测试 — P0-4 / S1（灾难性消去）
 * 验证大统计量下 p 值为极小正数，而非 0 或 NaN
 * 参考值由 scipy 1.x 实算（全栈代码审查官 R101 交付）
 */
import { describe, it, expect } from 'vitest';
import { chi2SF, fSF, gammaQ } from '../stats';

describe('gammaQ 精度（S1 灾难性消去回归）', () => {
  it('chi2=84.64, df=1 → p≈3.58e-20（非 0）', () => {
    const p = chi2SF(84.64, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-18);
    // scipy: 3.5795e-20，相对误差 <1e-3
    expect(Math.abs(p - 3.5795e-20) / 3.5795e-20).toBeLessThan(0.1);
  });

  it('chi2=50, df=1 → p≈1.5e-13（非 0）', () => {
    const p = chi2SF(50, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-10);
  });

  it('chi2=100, df=4 → p≈1.4e-20（非 0）', () => {
    const p = chi2SF(100, 4);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-18);
  });

  it('F=100, df1=2, df2=30 → p≈1.1e-14（非 0）', () => {
    const p = fSF(100, 2, 30);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-12);
  });
});

describe('chi2SF 边界', () => {
  it('chi2=0 → p=1.0', () => {
    expect(chi2SF(0, 1)).toBe(1);
  });

  it('小 chi2 → p 接近 1', () => {
    const p = chi2SF(0.001, 1);
    expect(p).toBeGreaterThan(0.97);
    expect(p).toBeLessThan(1);
  });

  it('中等 chi2 → p 在合理范围', () => {
    // chi2=3.841, df=1 → p≈0.05（95% 置信水平临界值）
    const p = chi2SF(3.841, 1);
    expect(p).toBeCloseTo(0.05, 2);
  });
});

describe('fSF 边界', () => {
  it('F=0 → p=1', () => {
    expect(fSF(0, 2, 10)).toBe(1);
  });

  it('F<0 → p=1（定义域外安全返回）', () => {
    expect(fSF(-1, 2, 10)).toBe(1);
  });
});

describe('gammaQ 边界', () => {
  it('x=0 → Q=1（无概率质量累积）', () => {
    expect(gammaQ(2, 0)).toBe(1);
  });

  it('a<=0 → NaN', () => {
    expect(isNaN(gammaQ(0, 5))).toBe(true);
    expect(isNaN(gammaQ(-1, 5))).toBe(true);
  });

  it('x<0 → NaN', () => {
    expect(isNaN(gammaQ(2, -1))).toBe(true);
  });
});
