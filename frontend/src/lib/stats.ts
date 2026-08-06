/**
 * Selenyx 统计计算核心函数 — 从 StatToolsView 抽出以支持 P0-4 Vitest 测试
 * 所有 p 值计算使用精确分布函数（gammaQ / ibeta），避免 1-P 灾难性消去
 */

/** 标准正态分布 CDF */
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}

/** Gammaln (log gamma) — Lanczos approximation */
export function gammaln(x: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** 正则化下不完全伽马函数 P(a, x) */
export function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n <= 300; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-10) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-10) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/** 正则化上不完全伽马函数 Q(a, x) = 1 - P(a, x)
 *  大 x 时直接用连分式算 Q，避免 1-P 的灾难性消去 */
export function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) {
    return 1 - gammaP(a, x);
  }
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/** 卡方分布生存函数 SF = 1 - CDF，直接用 gammaQ 避免消去 */
export function chi2SF(x: number, k: number): number {
  return gammaQ(k / 2, x / 2);
}

/** t 分布 CDF（使用不完全 Beta 函数） */
export function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const half = df / 2;
  return 1 - 0.5 * ibeta(half, 0.5, x);
}

/** 正则化不完全 Beta 函数 I_x(a, b) */
export function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const betacf = (a: number, b: number, x: number): number => {
    const MAXIT = 300, EPS = 3e-10, FPMIN = 1e-30;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** F 分布生存函数 SF = 1 - CDF
 *  利用不完全 Beta 对称性 1-I_x(a,b)=I_{1-x}(b,a) 避免消去 */
export function fSF(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1;
  const x = (d1 * f) / (d1 * f + d2);
  return ibeta(d2 / 2, d1 / 2, 1 - x);
}

// === 高层计算器函数（供测试直接调用） ===

/** t 分布逆 CDF 近似（二分法）— 用于 CI 临界值计算 */
function tInvApprox(df: number, alpha: number): number {
  const target = 1 - alpha;
  let lo = -100, hi = 100;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tCDF(mid, df) < target) lo = mid; else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}

/** 配对 t 检验 */
export function pairedTTest(before: number[], after: number[]): {
  t: number; p: number; df: number; meanDiff: number; sdDiff: number; ci: [number, number];
} {
  const n = before.length;
  if (n < 2) throw new Error('样本量不足，无法计算');
  const diffs = before.map((b, i) => after[i] - b);
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / n;
  const sdDiff = Math.sqrt(diffs.reduce((a, b) => a + (b - meanDiff) ** 2, 0) / (n - 1));
  const df = n - 1;
  // sd=0 边界：差值恒定时，meanDiff=0→无差异(p=1)，meanDiff≠0→完全分离(p=0)
  if (sdDiff === 0) {
    const t = meanDiff === 0 ? 0 : Infinity;
    const p = meanDiff === 0 ? 1 : 0;
    return { t, p, df, meanDiff, sdDiff, ci: [meanDiff, meanDiff] };
  }
  const t = meanDiff / (sdDiff / Math.sqrt(n));
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  const se = sdDiff / Math.sqrt(n);
  const tcrit = tInvApprox(df, 0.025);
  const ci: [number, number] = [meanDiff - tcrit * se, meanDiff + tcrit * se];
  return { t, p, df, meanDiff, sdDiff, ci };
}

/** 单样本 t 检验 */
export function oneSampleTTest(sample: number[], mu0: number): {
  t: number; p: number; df: number;
} {
  const n = sample.length;
  if (n < 2) throw new Error('样本量不足，无法计算');
  const mean = sample.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sample.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  if (sd === 0) {
    return { t: mean === mu0 ? 0 : Infinity, p: mean === mu0 ? 1 : 0, df: n - 1 };
  }
  const t = (mean - mu0) / (sd / Math.sqrt(n));
  const df = n - 1;
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  return { t, p, df };
}

/** 单因素方差分析 */
export function anova(groups: { m: number; s: number; n: number }[]): {
  F: number; p: number; dfBetween: number; dfWithin: number; eta2: number;
} {
  const gs = groups.filter((g) => g.n >= 2 && g.s >= 0);
  if (gs.length < 2) throw new Error('至少需要 2 组有效数据');
  const N = gs.reduce((a, g) => a + g.n, 0);
  const grandMean = gs.reduce((a, g) => a + g.m * g.n, 0) / N;
  const ssb = gs.reduce((a, g) => a + g.n * (g.m - grandMean) ** 2, 0);
  const ssw = gs.reduce((a, g) => a + (g.n - 1) * g.s * g.s, 0);
  const dfB = gs.length - 1, dfW = N - gs.length;
  const eta2 = ssb / (ssb + ssw);
  if (ssw <= 0) return { F: Infinity, p: 0, dfBetween: dfB, dfWithin: dfW, eta2 };
  const F = (ssb / dfB) / (ssw / dfW);
  const p = fSF(F, dfB, dfW);
  return { F, p, dfBetween: dfB, dfWithin: dfW, eta2 };
}

/** 独立样本 t 检验（合并方差，摘要量输入） */
export function independentTTest(
  m1: number, m2: number, s1: number, s2: number, n1: number, n2: number,
): { t: number; p: number; df: number } {
  if (n1 < 2 || n2 < 2) throw new Error('样本量不足，无法计算');
  const sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
  const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
  if (se === 0) {
    return { t: m1 === m2 ? 0 : Infinity, p: m1 === m2 ? 1 : 0, df: n1 + n2 - 2 };
  }
  const t = (m1 - m2) / se;
  const df = n1 + n2 - 2;
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  return { t, p, df };
}

/** 配对 t 检验（摘要量输入：差值均值/差值标准差/对子数） */
export function pairedTFromSummary(
  meanDiff: number, sdDiff: number, n: number,
): { t: number; p: number; df: number } {
  if (n < 2) throw new Error('样本量不足，无法计算');
  const df = n - 1;
  if (sdDiff === 0) {
    return { t: meanDiff === 0 ? 0 : Infinity, p: meanDiff === 0 ? 1 : 0, df };
  }
  const t = meanDiff / (sdDiff / Math.sqrt(n));
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  return { t, p, df };
}

/** 单样本 t 检验（摘要量输入：样本均值/总体均值/标准差/样本量） */
export function oneSampleTFromSummary(
  mean: number, mu0: number, sd: number, n: number,
): { t: number; p: number; df: number } {
  if (n < 2) throw new Error('样本量不足，无法计算');
  const df = n - 1;
  if (sd === 0) {
    return { t: mean === mu0 ? 0 : Infinity, p: mean === mu0 ? 1 : 0, df };
  }
  const t = (mean - mu0) / (sd / Math.sqrt(n));
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  return { t, p, df };
}

/** OR/RR 计算（含 Haldane 校正） */
export function orRr(a: number, b: number, c: number, d: number): {
  OR: number; orCI: [number, number]; RR: number; rrCI: [number, number];
} {
  const hasZero = a === 0 || b === 0 || c === 0 || d === 0;
  const a2 = a + (hasZero ? 0.5 : 0);
  const b2 = b + (hasZero ? 0.5 : 0);
  const c2 = c + (hasZero ? 0.5 : 0);
  const d2 = d + (hasZero ? 0.5 : 0);
  const OR = (a2 * d2) / (b2 * c2);
  const seLogOr = Math.sqrt(1 / a2 + 1 / b2 + 1 / c2 + 1 / d2);
  const orCI: [number, number] = [Math.exp(Math.log(OR) - 1.96 * seLogOr), Math.exp(Math.log(OR) + 1.96 * seLogOr)];
  const RR = (a2 / (a2 + b2)) / (c2 / (c2 + d2));
  const seLogRr = Math.sqrt(1 / a2 - 1 / (a2 + b2) + 1 / c2 - 1 / (c2 + d2));
  const rrCI: [number, number] = [Math.exp(Math.log(RR) - 1.96 * seLogRr), Math.exp(Math.log(RR) + 1.96 * seLogRr)];
  return { OR, orCI, RR, rrCI };
}

/** 诊断试验四格表 */
export function diagTest(tp: number, fp: number, fn: number, tn: number): {
  sensitivity: number; specificity: number; ppv: number; npv: number; lrPlus: number; lrMinus: number; accuracy: number;
} {
  const total = tp + fp + fn + tn;
  const sens = tp + fn > 0 ? tp / (tp + fn) : NaN;
  const spec = tn + fp > 0 ? tn / (tn + fp) : NaN;
  const ppv = tp + fp > 0 ? tp / (tp + fp) : NaN;
  const npv = tn + fn > 0 ? tn / (tn + fn) : NaN;
  const lrPlus = !isNaN(sens) && spec < 1 ? sens / (1 - spec) : Infinity;
  const lrMinus = !isNaN(sens) && spec > 0 ? (1 - sens) / spec : Infinity;
  const accuracy = total > 0 ? (tp + tn) / total : NaN;
  return { sensitivity: sens, specificity: spec, ppv, npv, lrPlus, lrMinus, accuracy };
}

/** Pearson 相关系数检验 */
export function correlationTest(r: number, n: number): {
  t: number; p: number; df: number;
} {
  if (n < 3) throw new Error('n < 3 无法检验显著性');
  if (Math.abs(r) >= 1) return { t: Infinity, p: 0, df: n - 2 };
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - tCDF(Math.abs(t), n - 2));
  return { t, p, df: n - 2 };
}

/** Cohen's d 效应量 */
export function effectSize(
  m1: number, m2: number, s1: number, s2: number, n1: number, n2: number,
): { d: number; hedgesG: number; pooledSd: number } {
  if (n1 + n2 - 2 <= 0) throw new Error('样本量不足');
  const pooledSd = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
  const d = (m1 - m2) / pooledSd;
  const correction = 1 - 3 / (4 * (n1 + n2) - 9);
  const hedgesG = d * correction;
  return { d, hedgesG, pooledSd };
}
