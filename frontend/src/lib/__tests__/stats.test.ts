/**
 * P0-4 统计核心函数测试（R102 补齐）
 * 参考值全部由 Python scipy.stats 现场计算（见每行注释），
 * 统计量用 toBeCloseTo，p 值用相对误差（< 1e-2，scipy 双精度 vs Lanczos 近似）。
 */
import { describe, it, expect } from 'vitest';
import {
  normalCDF, chi2SF, tCDF, fSF,
  pairedTTest, oneSampleTTest, anova, orRr, diagTest, correlationTest, effectSize,
} from '../stats';

// 相对误差断言（p 值等小量绝对误差没意义）
function expectRel(actual: number, expected: number, relTol = 1e-2) {
  if (expected === 0) { expect(actual).toBe(0); return; }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(relTol);
}

describe('stats 核心分布（vs scipy）', () => {
  it('normalCDF：0→0.5，1.96→0.9750', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 4);
    expect(normalCDF(1.96)).toBeCloseTo(0.9750, 3); // scipy 0.975002
  });
  it('chi2SF：3.841/1df→0.0500，16.919/9df→0.0500', () => {
    expectRel(chi2SF(3.841, 1), 0.05001);
    expectRel(chi2SF(16.919, 9), 0.0500);
  });
  it('tCDF：2.306/8df→0.9750', () => {
    expectRel(tCDF(2.306, 8), 0.97500);
  });
  it('fSF：5.32/(3,16)→0.00980', () => {
    expectRel(fSF(5.32, 3, 16), 0.009804);
  });
});

describe('stats 高阶计算器（vs scipy）', () => {
  it('pairedTTest：血压干预前后 t=-6.505 p=3.3e-4 df=7', () => {
    const r = pairedTTest(
      [145, 158, 132, 167, 149, 152, 138, 160],
      [138, 150, 130, 159, 141, 148, 135, 155],
    );
    expect(r.t).toBeCloseTo(-6.5049, 3);   // scipy ttest_rel(after,before)
    expect(r.df).toBe(7);
    expectRel(r.p, 0.0003326, 1e-2);
    expect(r.ci[0]).toBeLessThan(r.meanDiff);
    expect(r.ci[1]).toBeGreaterThan(r.meanDiff);
  });

  it('oneSampleTTest：t=1.732 p=0.1269', () => {
    const r = oneSampleTTest([5.2, 4.8, 5.5, 5.1, 4.9, 5.3, 5.0, 5.4], 5.0);
    expect(r.t).toBeCloseTo(1.7321, 3);    // scipy ttest_1samp
    expectRel(r.p, 0.12687, 1e-2);
    expect(r.df).toBe(7);
  });

  it('anova：三组 F≈47.4 p≈2.0e-6', () => {
    const r = anova([
      { m: 87.2, s: 1.9235, n: 5 },
      { m: 80.0, s: 1.5811, n: 5 },
      { m: 92.2, s: 2.3875, n: 5 },
    ]);
    expectRel(r.F, 47.41, 1e-2);           // scipy f_oneway
    expectRel(r.p, 2.009e-6, 5e-2);
    expect(r.dfBetween).toBe(2);
    expect(r.dfWithin).toBe(12);
  });

  it('orRr：无零格 OR=3.5 RR=2.0', () => {
    const r = orRr(60, 40, 30, 70);         // 60*70/(40*30), (60/100)/(30/100)
    expect(r.OR).toBeCloseTo(3.5, 2);
    expect(r.RR).toBeCloseTo(2.0, 2);
    expect(r.orCI[0]).toBeLessThan(3.5);
    expect(r.orCI[1]).toBeGreaterThan(3.5);
  });

  it('diagTest：sens=0.8421 spec=0.8095 ppv=0.8 npv=0.85', () => {
    const r = diagTest(80, 20, 15, 85);   // TP80 FP20 FN15 TN85
    expect(r.sensitivity).toBeCloseTo(0.8421, 4);   // 80/95
    expect(r.specificity).toBeCloseTo(0.8095, 4);   // 85/105
    expect(r.ppv).toBeCloseTo(0.8, 4);              // 80/100
    expect(r.npv).toBeCloseTo(0.85, 4);             // 85/100
    expect(r.lrPlus).toBeGreaterThan(0);
    expect(r.lrMinus).toBeGreaterThan(0);
  });

  it('correlationTest：r=0.7 n=20 → t=4.159 p=5.9e-4', () => {
    const r = correlationTest(0.7, 20);
    expect(r.t).toBeCloseTo(4.1586, 3);
    expectRel(r.p, 0.000590, 1e-2);
    expect(r.df).toBe(18);
  });

  it('effectSize：d=1.1486 hedgesG=1.1336 pooledSd=2.0025', () => {
    const r = effectSize(10.5, 8.2, 2.1, 1.9, 30, 30);
    expect(r.pooledSd).toBeCloseTo(2.0025, 3);
    expect(r.d).toBeCloseTo(1.1486, 3);
    expect(r.hedgesG).toBeCloseTo(1.1336, 3);
  });
});

describe('stats 边界与防御', () => {
  it('配对差值恒为常数（sd=0）：无差异 p=1，有差异 p=0', () => {
    const same = pairedTTest([5, 5, 5], [5, 5, 5]);
    expect(same.p).toBe(1);
    const diff = pairedTTest([5, 5, 5], [7, 7, 7]);
    expect(diff.p).toBe(0);
  });
  it('样本量不足抛错', () => {
    expect(() => pairedTTest([1], [2])).toThrow();
    expect(() => oneSampleTTest([5], 5)).toThrow();
    expect(() => correlationTest(0.5, 2)).toThrow();
    expect(() => anova([{ m: 1, s: 1, n: 5 }])).toThrow();
  });
  it('orRr 零格 Haldane 校正不崩且 OR 有限', () => {
    const r = orRr(0, 40, 30, 70);          // a=0 触发 +0.5 校正
    expect(isFinite(r.OR)).toBe(true);
    expect(r.OR).toBeGreaterThan(0);
  });
});
