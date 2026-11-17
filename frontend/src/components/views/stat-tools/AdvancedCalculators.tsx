import { useState } from 'react';
import { normalCDF } from '@lib/stats';
import { ResultBox, InlineChart, getStatColors, parseMatrix, mean, variance, chiSquareCDF, inverseNormalCDF } from './statShared';

export function CronbachCalc() {
  const [data, setData] = useState('3 4 5 3 2\n4 5 4 5 3\n5 5 5 4 4\n2 3 4 2 3\n4 4 5 3 4');
  const [result, setResult] = useState('');

  function calc() {
    const m = parseMatrix(data);
    if (m.length < 2) { setResult('至少需要 2 行（受试者）'); return; }
    const k = m[0].length;
    if (k < 2) { setResult('至少需要 2 列（题项）'); return; }
    if (!m.every((r) => r.length === k)) { setResult('每行列数须一致'); return; }
    // 各题项方差
    const itemVars: number[] = [];
    for (let j = 0; j < k; j++) itemVars.push(variance(m.map((r) => r[j])));
    // 总分方差
    const totals = m.map((r) => r.reduce((a, b) => a + b, 0));
    const varTotal = variance(totals);
    if (varTotal === 0) { setResult('总分方差为 0，无法计算（数据无变异）'); return; }
    const alpha = (k / (k - 1)) * (1 - itemVars.reduce((a, b) => a + b, 0) / varTotal);
    const verdict = alpha >= 0.9 ? '优秀 (≥0.9)' : alpha >= 0.8 ? '良好 (≥0.8)' : alpha >= 0.7 ? '可接受 (≥0.7)' : alpha >= 0.6 ? '勉强 (≥0.6)' : '偏低 (<0.6，需修订题项)';
    setResult(alpha.toFixed(4));
    setResult(alpha.toFixed(4) + ' ｜ ' + verdict);
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Cronbach α 信度系数</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>每行一个受试者，列为各题项得分，用空格/逗号分隔。适用：量表内部一致性信度。</p>
      <textarea className="input" value={data} onChange={(e) => setData(e.target.value)} rows={5} style={{ width: '100%', fontFamily: 'var(--font-mono)', marginBottom: 8 }} />
      <button className="btn btn-primary" onClick={calc}>计算 α</button>
      {result && <ResultBox label="Cronbach α" value={result.split('｜')[0].trim()} note={result.split('｜')[1]?.trim() || ''} />}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        判断标准：≥0.9 优秀 / ≥0.8 良好 / ≥0.7 可接受 / &lt;0.6 需修订。样本量建议 n≥100。
      </div>
    </div>
  );
}

/** 简单线性回归（社科/经济/理工通用） */
export function RegressionCalc() {
  const [data, setData] = useState('1,2\n2,3.1\n3,4.2\n4,4.8\n5,6.1');
  const [result, setResult] = useState('');

  function calc() {
    const pairs = data.trim().split(/\n+/).map((l) => l.trim().split(/[\s,，]+/).map(Number)).filter((p) => p.length === 2 && p.every((v) => !isNaN(v)));
    const n = pairs.length;
    if (n < 3) { setResult('至少需要 3 组 (x,y) 数据'); return; }
    const xs = pairs.map((p) => p[0]);
    const ys = pairs.map((p) => p[1]);
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
    if (sxx === 0) { setResult('x 无变异，无法拟合'); return; }
    const b = sxy / sxx;        // 斜率
    const a = my - b * mx;      // 截距
    const r = sxy / Math.sqrt(sxx * syy);
    const r2 = r * r;
    const se = Math.sqrt((syy - b * sxy) / (n - 2));
    const t = b / (se / Math.sqrt(sxx));
    const p = 2 * (1 - normalCDF(Math.abs(t)));
    setResult(`${a.toFixed(3)} ｜ 斜率 b=${b.toFixed(4)} ｜ r=${r.toFixed(4)} ｜ r²=${r2.toFixed(4)} ｜ t=${t.toFixed(3)} ｜ p=${p < 0.0001 ? p.toExponential(2) : p.toFixed(4)}`);
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>简单线性回归</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>每行一组 x,y（逗号或空格分隔）。输出：截距 a、斜率 b、相关 r、决定系数 r²、斜率显著性 t/p。</p>
      <textarea className="input" value={data} onChange={(e) => setData(e.target.value)} rows={5} style={{ width: '100%', fontFamily: 'var(--font-mono)', marginBottom: 8 }} />
      <button className="btn btn-primary" onClick={calc}>拟合回归</button>
      {result && <ResultBox label="回归方程 ŷ = a + bx" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}

/** Mann-Whitney U 检验（非参数·两组独立样本比较，不要求正态分布） */
export function MannWhitneyCalc() {
  const [g1, setG1] = useState('7 8 6 9 10 8');
  const [g2, setG2] = useState('4 5 3 6 5 4 5');
  const [result, setResult] = useState('');

  function calc() {
    const a = g1.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    const b = g2.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    if (a.length < 1 || b.length < 1) { setResult('两组均需至少 1 个数据'); return; }
    const n1 = a.length, n2 = b.length;
    // 合并排序编秩（平均秩处理相同值）
    const all = [...a.map((v) => ({ v, g: 1 })), ...b.map((v) => ({ v, g: 2 }))]
      .sort((x, y) => x.v - y.v);
    const ranks: number[] = new Array(all.length).fill(0);
    let i = 0;
    while (i < all.length) {
      let j = i;
      while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
      const avgRank = (i + 1 + j + 1) / 2; // 1-indexed 平均
      for (let k = i; k <= j; k++) ranks[k] = avgRank;
      i = j + 1;
    }
    const R1 = all.reduce((s, o, idx) => s + (o.g === 1 ? ranks[idx] : 0), 0);
    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);
    const muU = (n1 * n2) / 2;
    // 标准差（含相同值校正项）
    const N = n1 + n2;
    let tieTerm = 0;
    // 统计相同值组
    const vCounts: Record<number, number> = {};
    all.forEach((o) => { vCounts[o.v] = (vCounts[o.v] || 0) + 1; });
    Object.values(vCounts).forEach((t) => { tieTerm += (t ** 3 - t); });
    const sigmaU = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tieTerm / (N * (N - 1))));
    let p = '—';
    if (sigmaU > 0) {
      const z = (U - muU) / sigmaU;
      const twoP = 2 * Math.min(normalCDF(z), 1 - normalCDF(z));
      p = twoP < 0.0001 ? twoP.toExponential(2) : twoP.toFixed(4);
    }
    setResult(`U=${U.toFixed(1)} ｜ z=${sigmaU > 0 ? ((U - muU) / sigmaU).toFixed(3) : '—'} ｜ p=${p}`);
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Mann-Whitney U 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>两组独立样本，不要求正态分布。输出 U、z（正态近似）、双尾 p。适用：等级数据/小样本/偏态分布。</p>
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 1</label>
      <input className="input" value={g1} onChange={(e) => setG1(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 2</label>
      <input className="input" value={g2} onChange={(e) => setG2(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <button className="btn btn-primary" onClick={calc}>计算 U</button>
      {result && <ResultBox label="Mann-Whitney U" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}


// ===== R107: P0 全学科统计工具 =====

export function LogisticRegCalc() {
  const [a, setA] = useState('40');
  const [b, setB] = useState('60');
  const [c, setC] = useState('20');
  const [d, setD] = useState('80');
  const [result, setResult] = useState('');
  const [chartOption, setChartOption] = useState<Record<string, unknown> | null>(null);

  function calc() {
    const av = parseFloat(a), bv = parseFloat(b), cv = parseFloat(c), dv = parseFloat(d);
    if ([av, bv, cv, dv].some(isNaN) || av < 0 || bv < 0 || cv < 0 || dv < 0) {
      setResult('请输入非负数值'); return;
    }
    if (av === 0 || bv === 0 || cv === 0 || dv === 0) {
      setResult('四格表不允许有 0 值（如需处理请使用连续性校正）'); return;
    }
    const or = (av * dv) / (bv * cv);
    const logOR = Math.log(or);
    const se = Math.sqrt(1 / av + 1 / bv + 1 / cv + 1 / dv);
    const z = logOR / se;
    const twoP = 2 * Math.min(normalCDF(z), 1 - normalCDF(z));
    const ciLow = Math.exp(logOR - 1.96 * se);
    const ciHigh = Math.exp(logOR + 1.96 * se);
    const p1 = av / (av + bv);
    const p0 = cv / (cv + dv);
    setResult(
      `OR=${or.toFixed(3)} ｜ β₁=ln(OR)=${logOR.toFixed(3)} ｜ SE=${se.toFixed(3)} ｜ Wald z=${z.toFixed(3)} ｜ p=${twoP < 0.0001 ? twoP.toExponential(2) : twoP.toFixed(4)} ｜ 95%CI [${ciLow.toFixed(3)}, ${ciHigh.toFixed(3)}] ｜ 暴露组风险=${(p1 * 100).toFixed(1)}% vs 对照组=${(p0 * 100).toFixed(1)}%`
    );
    // 森林图：OR 点估计 + 95%CI 误差棒 + OR=1 参考线
    const colors = getStatColors();
    const sig = ciLow > 1 || ciHigh < 1;
    const ptColor = sig ? colors.danger : colors.accent;
    const xMin = Math.max(0.05, Math.min(ciLow * 0.7, or * 0.5));
    const xMax = Math.max(ciHigh * 1.3, or * 1.8, 2);
    setChartOption({
      backgroundColor: 'transparent',
      grid: { left: 80, right: 50, top: 25, bottom: 45 },
      xAxis: {
        type: 'value', name: 'OR (95% CI)', nameLocation: 'middle', nameGap: 28,
        min: xMin, max: xMax,
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.textSec, fontSize: 11 },
        splitLine: { lineStyle: { color: colors.border, type: 'dashed', opacity: 0.3 } },
      },
      yAxis: {
        type: 'category', data: ['暴露因素'],
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.textSec, fontSize: 12 },
      },
      series: [{
        type: 'custom', name: 'OR',
        renderItem: (_p: unknown, api: { coord: (d: number[]) => number[]; value: (i: number) => number }) => {
          const orVal = api.value(0), low = api.value(1), high = api.value(2), yCat = api.value(3);
          const pt = api.coord([orVal, yCat]);
          const lp = api.coord([low, yCat]);
          const hp = api.coord([high, yCat]);
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: lp[0], y1: pt[1], x2: hp[0], y2: pt[1] }, style: { stroke: ptColor, lineWidth: 2 } },
              { type: 'line', shape: { x1: lp[0], y1: pt[1] - 6, x2: lp[0], y2: pt[1] + 6 }, style: { stroke: ptColor, lineWidth: 2 } },
              { type: 'line', shape: { x1: hp[0], y1: pt[1] - 6, x2: hp[0], y2: pt[1] + 6 }, style: { stroke: ptColor, lineWidth: 2 } },
              { type: 'polygon', shape: { points: [[pt[0], pt[1] - 7], [pt[0] + 7, pt[1]], [pt[0], pt[1] + 7], [pt[0] - 7, pt[1]]] }, style: { fill: ptColor } },
            ],
          };
        },
        data: [[or, ciLow, ciHigh, 0]],
        encode: { x: [0, 1, 2], y: 3 },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: colors.textSec, type: 'dashed', width: 1 },
          data: [{ xAxis: 1, label: { formatter: 'OR=1', color: colors.textSec, fontSize: 10, position: 'insideEndTop' } }],
        },
      }],
      tooltip: {
        trigger: 'item',
        formatter: () => `OR = ${or.toFixed(3)}<br/>95% CI: [${ciLow.toFixed(3)}, ${ciHigh.toFixed(3)}]<br/>${sig ? '✓ 统计显著（CI 不含 1）' : '✗ 不显著（CI 含 1）'}`,
      },
    });
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Logistic 回归（2×2 表）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        二分类结局的核心方法。输入 2×2 列联表（暴露/非暴露 × 事件/无事件），输出 OR、β₁ 系数、Wald z 检验、p 值与 95% CI。
        适用：流行病学、护理研究、社会科学中的风险因素分析。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div />
        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>事件(+)</div>
        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>无事件(−)</div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>暴露(+)</div>
        <input className="input" value={a} onChange={(e) => setA(e.target.value)} style={{ textAlign: 'center' }} />
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} style={{ textAlign: 'center' }} />
        <div style={{ fontSize: 12, fontWeight: 600 }}>非暴露(−)</div>
        <input className="input" value={c} onChange={(e) => setC(e.target.value)} style={{ textAlign: 'center' }} />
        <input className="input" value={d} onChange={(e) => setD(e.target.value)} style={{ textAlign: 'center' }} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算 Logistic 回归 + 绘制森林图</button>
      {result && <ResultBox label="Logistic 回归" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
      {chartOption && <InlineChart option={chartOption} height={200} />}
    </div>
  );
}

export function ROCCalc() {
  const [sens, setSens] = useState('0.85');
  const [spec, setSpec] = useState('0.80');
  const [result, setResult] = useState('');
  const [chartOption, setChartOption] = useState<Record<string, unknown> | null>(null);

  function calc() {
    const se = parseFloat(sens), sp = parseFloat(spec);
    if (isNaN(se) || isNaN(sp) || se < 0 || se > 1 || sp < 0 || sp > 1) {
      setResult('灵敏度和特异度须在 0–1 之间'); return;
    }
    const a = Math.sqrt(2) * inverseNormalCDF(se);
    const b = Math.sqrt(2) * inverseNormalCDF(sp);
    const auc = normalCDF((a + b) / Math.sqrt(2));
    const youdenJ = se + sp - 1;
    const ppv = se / (se + (1 - sp));
    const npv = sp / (sp + (1 - se));
    const lrPos = se / (1 - sp);
    const lrNeg = (1 - se) / sp;
    setResult(
      `AUC≈${auc.toFixed(3)} ｜ Youden J=${youdenJ.toFixed(3)} ｜ LR+=${lrPos.toFixed(2)} ｜ LR−=${lrNeg.toFixed(2)} ｜ 灵敏度=${(se * 100).toFixed(1)}% ｜ 特异度=${(sp * 100).toFixed(1)}% ｜ PPV≈${(ppv * 100).toFixed(1)}% ｜ NPV≈${(npv * 100).toFixed(1)}%（50%患病率假设）`
    );
    // 生成 ROC 曲线（binormal 模型）
    const c = getStatColors();
    const rocPoints: [number, number][] = [];
    for (let fpr = 0; fpr <= 1.001; fpr += 0.02) {
      const tpr = normalCDF(a - b * inverseNormalCDF(1 - fpr));
      rocPoints.push([fpr, Math.max(0, Math.min(1, tpr))]);
    }
    setChartOption({
      backgroundColor: 'transparent',
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'value', min: 0, max: 1, name: '1 − 特异度 (FPR)', nameLocation: 'middle', nameGap: 25, axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.textSec, fontSize: 11 }, splitLine: { lineStyle: { color: c.border, type: 'dashed', opacity: 0.3 } } },
      yAxis: { type: 'value', min: 0, max: 1, name: '灵敏度 (TPR)', axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.textSec, fontSize: 11 }, splitLine: { lineStyle: { color: c.border, type: 'dashed', opacity: 0.3 } } },
      series: [
        { type: 'line', data: [[0, 0], [1, 1]], lineStyle: { color: c.textSec, type: 'dashed', width: 1 }, symbol: 'none', silent: true },
        { type: 'line', data: rocPoints, lineStyle: { color: c.accent, width: 2.5 }, symbol: 'none', areaStyle: { color: c.accent, opacity: 0.12 }, name: `AUC=${auc.toFixed(3)}` },
        { type: 'scatter', data: [[1 - sp, se]], symbolSize: 12, itemStyle: { color: c.danger }, name: `工作点 (Se=${(se * 100).toFixed(0)}%, Sp=${(sp * 100).toFixed(0)}%)` },
      ],
      tooltip: { trigger: 'item', formatter: (p: { data: number[] }) => `FPR=${p.data[0].toFixed(2)}, TPR=${p.data[1].toFixed(2)}` },
    });
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>ROC 曲线分析</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        输入灵敏度和特异度，估算 AUC（曲线下面积）、Youden's J 指数、似然比。
        AUC 是诊断试验准确性的金标准：0.5=无判别力，0.7–0.8=可接受，0.8–0.9=优秀，&gt;0.9=极好。
        适用：诊断试验评价、预测模型验证、护理评估工具效能分析。
      </p>
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>灵敏度 (Sensitivity)</label>
      <input className="input" value={sens} onChange={(e) => setSens(e.target.value)} style={{ width: '100%', marginBottom: 8 }} placeholder="0.00–1.00" />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>特异度 (Specificity)</label>
      <input className="input" value={spec} onChange={(e) => setSpec(e.target.value)} style={{ width: '100%', marginBottom: 8 }} placeholder="0.00–1.00" />
      <button className="btn btn-primary" onClick={calc}>计算 + 绘制 ROC 曲线</button>
      {result && <ResultBox label="ROC 分析" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
      {chartOption && <InlineChart option={chartOption} height={280} />}
    </div>
  );
}

export function SurvivalCalc() {
  const [g1times, setG1times] = useState('6 8 10 12 15 18 22 25 30 35');
  const [g1events, setG1events] = useState('1 1 1 0 1 1 0 1 1 0');
  const [g2times, setG2times] = useState('4 6 8 10 12 14 16 20 24 28');
  const [g2events, setG2events] = useState('1 1 1 1 1 1 0 1 0 1');
  const [result, setResult] = useState('');
  const [chartOption, setChartOption] = useState<Record<string, unknown> | null>(null);

  function calc() {
    const t1 = g1times.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    const e1 = g1events.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    const t2 = g2times.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    const e2 = g2events.trim().split(/[\s,，]+/).map(Number).filter((v) => !isNaN(v));
    if (t1.length !== e1.length || t2.length !== e2.length || t1.length < 2 || t2.length < 2) {
      setResult('时间与事件数须一一对应，且每组至少 2 个观测'); return;
    }
    // Log-rank test
    const allTimes = [...new Set([...t1, ...t2])].sort((a, b) => a - b);
    let O1 = 0, E1 = 0, V = 0;
    for (const t of allTimes) {
      const n1 = t1.filter((x) => x >= t).length;
      const n2 = t2.filter((x) => x >= t).length;
      const d1 = t1.reduce((s, x, i) => s + (x === t && e1[i] === 1 ? 1 : 0), 0);
      const d2 = t2.reduce((s, x, i) => s + (x === t && e2[i] === 1 ? 1 : 0), 0);
      const d = d1 + d2;
      const n = n1 + n2;
      if (n < 2 || d === 0) continue;
      O1 += d1;
      E1 += (n1 / n) * d;
      V += (n1 * n2 * d * (n - d)) / (n * n * (n - 1));
    }
    if (V <= 0) { setResult('方差为 0，无法计算'); return; }
    const chiSq = ((O1 - E1) ** 2) / V;
    const p = 1 - chiSquareCDF(chiSq, 1);
    // K-M 生存曲线计算
    function kmCurve(times: number[], events: number[]): [number, number][] {
      const sorted = times.map((t, i) => ({ t, e: events[i] })).sort((a, b) => a.t - b.t);
      const uniqueTimes = [...new Set(sorted.filter((x) => x.e === 1).map((x) => x.t))].sort((a, b) => a - b);
      const points: [number, number][] = [[0, 1.0]];
      let cumSurv = 1.0;
      for (const t of uniqueTimes) {
        const atRisk = sorted.filter((x) => x.t >= t).length;
        const ev = sorted.filter((x) => x.t === t && x.e === 1).length;
        if (atRisk > 0) cumSurv *= (1 - ev / atRisk);
        points.push([t, cumSurv]);
      }
      const lastT = sorted[sorted.length - 1]?.t || 0;
      points.push([lastT + 1, cumSurv]);
      return points;
    }
    function medianSurvival(times: number[], events: number[]): string {
      const curve = kmCurve(times, events);
      for (const [t, s] of curve) { if (s <= 0.5) return t.toString(); }
      return '未达到';
    }
    const med1 = medianSurvival(t1, e1);
    const med2 = medianSurvival(t2, e2);
    setResult(
      `Log-rank χ²=${chiSq.toFixed(3)} ｜ p=${p < 0.0001 ? p.toExponential(2) : p.toFixed(4)} ｜ 组1中位生存=${med1} ｜ 组2中位生存=${med2} ｜ O₁-E₁=${(O1 - E1).toFixed(2)}`
    );
    // 生成 K-M 曲线
    const c = getStatColors();
    const curve1 = kmCurve(t1, e1);
    const curve2 = kmCurve(t2, e2);
    setChartOption({
      backgroundColor: 'transparent',
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'value', min: 0, name: '时间', nameLocation: 'middle', nameGap: 25, axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.textSec, fontSize: 11 }, splitLine: { lineStyle: { color: c.border, type: 'dashed', opacity: 0.3 } } },
      yAxis: { type: 'value', min: 0, max: 1, name: '生存概率', axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.textSec, fontSize: 11 }, splitLine: { lineStyle: { color: c.border, type: 'dashed', opacity: 0.3 } } },
      legend: { data: ['组 1', '组 2'], textStyle: { color: c.textSec, fontSize: 11 }, top: 4 },
      series: [
        { type: 'line', data: curve1, name: '组 1', step: 'end', lineStyle: { color: c.accent, width: 2.5 }, symbol: 'none' },
        { type: 'line', data: curve2, name: '组 2', step: 'end', lineStyle: { color: c.danger, width: 2.5 }, symbol: 'none' },
      ],
      tooltip: { trigger: 'axis', formatter: (params: Array<{ data: number[]; seriesName: string }>) => params.map((p) => `${p.seriesName}: t=${p.data[0]}, S=${p.data[1].toFixed(3)}`).join('<br/>') },
    });
  }

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Kaplan-Meier 生存分析</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        输入两组生存时间和事件指示（1=事件发生，0=删失），执行 Log-rank 检验比较两组生存曲线。
        输出 χ² 统计量、p 值和各组中位生存时间。计算后自动绘制 K-M 生存曲线。
        适用：肿瘤学、慢性病管理、护理结局随访研究。
      </p>
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 1 生存时间（空格/逗号分隔）</label>
      <input className="input" value={g1times} onChange={(e) => setG1times(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 1 事件指示（1=事件 0=删失）</label>
      <input className="input" value={g1events} onChange={(e) => setG1events(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 2 生存时间</label>
      <input className="input" value={g2times} onChange={(e) => setG2times(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>组 2 事件指示</label>
      <input className="input" value={g2events} onChange={(e) => setG2events(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <button className="btn btn-primary" onClick={calc}>执行 Log-rank 检验 + 绘制 K-M 曲线</button>
      {result && <ResultBox label="生存分析" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
      {chartOption && <InlineChart option={chartOption} height={280} />}
    </div>
  );
}

/** 逆正态分布 CDF（Beasley-Springer-Moro 近似） */
