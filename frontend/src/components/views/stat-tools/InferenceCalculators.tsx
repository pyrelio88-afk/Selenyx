import { useState } from 'react';
import {
  normalCDF, chi2SF,
  independentTTest, pairedTFromSummary, oneSampleTFromSummary,
  anova, orRr, diagTest, correlationTest, effectSize,
} from '@lib/stats';
import { Z_TABLE_ENTRIES } from './catalog';
import { ResultBox, InlineChart, getStatColors, StatInput } from './statShared';

export function PValueCalc() {
  const [z, setZ] = useState('1.96');
  const [result, setResult] = useState('');
  function calc() {
    const zVal = parseFloat(z);
    if (isNaN(zVal)) { setResult('请输入有效数值'); return; }
    const p = 2 * (1 - normalCDF(Math.abs(zVal)));
    setResult(p < 0.0001 ? p.toExponential(4) : p.toFixed(4));
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Z 值 → p 值计算器</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 14, minWidth: 50 }}>Z 值</label>
        <input className="input" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') calc(); }} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={calc}>计算</button>
      </div>
      {result && (
        <ResultBox
          label="双尾 p 值"
          value={result}
          note={parseFloat(result) < 0.05 ? '显著 (p < 0.05)' : '不显著 (p ≥ 0.05)'}
        />
      )}
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        <p style={{ fontWeight: 500, marginBottom: 4 }}>常用临界值：</p>
        {Z_TABLE_ENTRIES.map((e) => (
          <div key={e.z}>Z = {e.z} → {e.label} (p = {e.p})</div>
        ))}
      </div>
    </div>
  );
}

export function TTestCalc() {
  const [m1, setM1] = useState(''); const [m2, setM2] = useState('');
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('');
  const [n1, setN1] = useState(''); const [n2, setN2] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);

  function calc() {
    const M1 = parseFloat(m1), M2 = parseFloat(m2), S1 = parseFloat(s1), S2 = parseFloat(s2);
    const N1 = parseInt(n1), N2 = parseInt(n2);
    if ([M1, M2, S1, S2, N1, N2].some(isNaN) || N1 < 2 || N2 < 2) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    // R103: 改用 @lib/stats（合并方差独立 t，scipy 校验）
    const r = independentTTest(M1, M2, S1, S2, N1, N2);
    setResult({
      t: r.t.toFixed(4),
      df: r.df.toString(),
      p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4),
    });
  }

  const inputs = [
    { label: '组1均值', val: m1, set: setM1 }, { label: '组2均值', val: m2, set: setM2 },
    { label: '组1标准差', val: s1, set: setS1 }, { label: '组2标准差', val: s2, set: setS2 },
    { label: '组1样本量', val: n1, set: setN1 }, { label: '组2样本量', val: n2, set: setN2 },
  ];

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>独立样本 t 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>合并方差 t 检验（适用于方差齐性成立时）</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        {inputs.map((inp) => (
          <div key={inp.label}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inp.label}</label>
            <input className="input" value={inp.val} onChange={(e) => inp.set(e.target.value)} style={{ width: '100%' }} />
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="t 统计量" value={result.t} />
          <ResultBox label="自由度 (df)" value={result.df} />
          <ResultBox label="双尾 p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '差异显著 (p < 0.05)' : '差异不显著 (p ≥ 0.05)'} />
        </>
      )}
    </div>
  );
}

export function ChiSquareCalc() {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [c, setC] = useState(''); const [d, setD] = useState('');
  const [result, setResult] = useState<{ chi: string; df: string; p: string } | null>(null);
  const [chartOption, setChartOption] = useState<Record<string, unknown> | null>(null);

  function calc() {
    const A = parseFloat(a), B = parseFloat(b), C = parseFloat(c), D = parseFloat(d);
    if ([A, B, C, D].some(isNaN)) { setResult({ chi: '输入有误', df: '-', p: '-' }); return; }
    const n = A + B + C + D;
    const chi = n * Math.pow(A * D - B * C, 2) / ((A + B) * (C + D) * (A + C) * (B + D));
    // R86: 用精确卡方分布 CDF 替换粗近似
    const pVal = chi > 0 ? Math.max(0, chi2SF(chi, 1)) : 1;
    setResult({
      chi: chi.toFixed(4),
      df: '1',
      p: pVal < 0.0001 ? pVal.toExponential(4) : pVal.toFixed(4),
    });
    // 列联表热力图：标准化残差着色
    const colors = getStatColors();
    // 期望频数 E = 行合计 × 列合计 / 总计
    const eA = (A + B) * (A + C) / n, eB = (A + B) * (B + D) / n;
    const eC = (C + D) * (A + C) / n, eD = (C + D) * (B + D) / n;
    // 标准化残差 = (O - E) / √E
    const rA = eA > 0 ? (A - eA) / Math.sqrt(eA) : 0;
    const rB = eB > 0 ? (B - eB) / Math.sqrt(eB) : 0;
    const rC = eC > 0 ? (C - eC) / Math.sqrt(eC) : 0;
    const rD = eD > 0 ? (D - eD) / Math.sqrt(eD) : 0;
    const maxAbs = Math.max(Math.abs(rA), Math.abs(rB), Math.abs(rC), Math.abs(rD), 0.01);
    const heatData = [
      [0, 0, A, rA], [1, 0, B, rB],
      [0, 1, C, rC], [1, 1, D, rD],
    ];
    setChartOption({
      backgroundColor: 'transparent',
      grid: { left: 60, right: 80, top: 35, bottom: 45 },
      xAxis: {
        type: 'category', data: ['阳性', '阴性'], name: '结局', nameLocation: 'middle', nameGap: 28,
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.textSec, fontSize: 12 },
        splitArea: { show: true, areaStyle: { color: ['transparent', 'rgba(0,0,0,0.02)'] } },
      },
      yAxis: {
        type: 'category', data: ['组 1', '组 2'], name: '分组', nameLocation: 'middle', nameGap: 40,
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.textSec, fontSize: 12 },
        splitArea: { show: true, areaStyle: { color: ['transparent', 'rgba(0,0,0,0.02)'] } },
      },
      visualMap: {
        min: -maxAbs, max: maxAbs,
        calculable: true, orient: 'vertical', right: 10, top: 'center',
        textStyle: { color: colors.textSec, fontSize: 10 },
        inRange: { color: [colors.accent, '#f5f3ed', colors.danger] },
        text: ['高估', '低估'],
        textGap: 8,
      },
      series: [{
        type: 'heatmap', name: '列联表',
        data: heatData.map(([x, y, freq, resid]) => ({ value: [x, y, freq], itemStyle: { color: resid > 0 ? colors.danger : resid < 0 ? colors.accent : '#f5f3ed', opacity: 0.15 + 0.85 * Math.abs(resid) / maxAbs } })),
        label: {
          show: true,
          formatter: (p: { value: number[] }) => {
            const idx = p.value[0] + p.value[1] * 2;
            const freq = [A, B, C, D][idx];
            const resid = [rA, rB, rC, rD][idx];
            const sign = resid >= 0 ? '+' : '';
            return `${freq}\n(${sign}${resid.toFixed(2)})`;
          },
          color: colors.textPri, fontSize: 14, fontWeight: 600,
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
      }],
      tooltip: {
        trigger: 'item',
        formatter: (p: { value: number[]; name: string }) => {
          const idx = p.value[0] + p.value[1] * 2;
          const freq = [A, B, C, D][idx];
          const exp = [eA, eB, eC, eD][idx];
          const resid = [rA, rB, rC, rD][idx];
          const rows = ['组1-阳性', '组1-阴性', '组2-阳性', '组2-阴性'];
          return `${rows[idx]}<br/>观测: ${freq}  期望: ${exp.toFixed(1)}<br/>标准化残差: ${resid >= 0 ? '+' : ''}${resid.toFixed(3)}<br/>|残差| > 2 提示该格贡献显著`;
        },
      },
    });
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>卡方检验（2×2 列联表）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        分类变量关联性检验。计算后自动绘制列联表热力图，颜色深度反映标准化残差——越红表示实际高于预期越多，越绿表示低于预期越多。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div></div>
        <span style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>阳性</span>
        <span style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>阴性</span>
        <span style={{ fontSize: 12 }}>组1</span>
        <input className="input" value={a} onChange={(e) => setA(e.target.value)} placeholder="a" />
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="b" />
        <span style={{ fontSize: 12 }}>组2</span>
        <input className="input" value={c} onChange={(e) => setC(e.target.value)} placeholder="c" />
        <input className="input" value={d} onChange={(e) => setD(e.target.value)} placeholder="d" />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算 + 绘制列联表热力图</button>
      {result && (
        <>
          <ResultBox label="χ² 统计量" value={result.chi} />
          <ResultBox label="自由度 (df)" value={result.df} />
          <ResultBox label="p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '关联显著 (p < 0.05)' : '无显著关联 (p ≥ 0.05)'} />
        </>
      )}
      {chartOption && <InlineChart option={chartOption} height={240} />}
    </div>
  );
}

export function SampleSizeCalc() {
  const [effect, setEffect] = useState('0.5');
  const [alpha, setAlpha] = useState('0.05');
  const [power, setPower] = useState('0.80');
  const [result, setResult] = useState('');

  function calc() {
    const d = parseFloat(effect), a = parseFloat(alpha), pwr = parseFloat(power);
    if ([d, a, pwr].some(isNaN) || d <= 0) { setResult('请输入有效值'); return; }
    const zAlpha = { 0.05: 1.96, 0.01: 2.576, 0.001: 3.291 }[a] || 1.96;
    const zBeta = { 0.80: 0.842, 0.90: 1.282, 0.95: 1.645 }[pwr] || 0.842;
    const n = Math.ceil(2 * Math.pow((zAlpha + zBeta) / d, 2));
    setResult(n.toString());
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>样本量估算</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>两组比较（基于效应量 Cohen d）</p>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>效应量 d（小=0.2, 中=0.5, 大=0.8）</label>
        <input className="input" value={effect} onChange={(e) => setEffect(e.target.value)} />
      </div>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>α 水平</label>
          <select className="input" value={alpha} onChange={(e) => setAlpha(e.target.value)}>
            <option value="0.05">0.05</option>
            <option value="0.01">0.01</option>
            <option value="0.001">0.001</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>检验效能 (1-β)</label>
          <select className="input" value={power} onChange={(e) => setPower(e.target.value)}>
            <option value="0.80">0.80</option>
            <option value="0.90">0.90</option>
            <option value="0.95">0.95</option>
          </select>
        </div>
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <ResultBox label="每组所需样本量" value={result} note={`两组共需 ${parseInt(result) * 2} 例（考虑 20% 失访，建议每组 ${Math.ceil(parseInt(result) * 1.2)} 例）`} />
      )}
    </div>
  );
}

export function CICalc() {
  const [mean, setMean] = useState(''); const [sd, setSd] = useState('');
  const [n, setN] = useState(''); const [level, setLevel] = useState('0.95');
  const [result, setResult] = useState<{ lower: string; upper: string } | null>(null);

  function calc() {
    const m = parseFloat(mean), s = parseFloat(sd), N = parseInt(n);
    if ([m, s, N].some(isNaN) || N < 2) { setResult({ lower: '输入有误', upper: '' }); return; }
    const z = level === '0.99' ? 2.576 : level === '0.90' ? 1.645 : 1.96;
    const se = s / Math.sqrt(N);
    const lower = m - z * se;
    const upper = m + z * se;
    setResult({ lower: lower.toFixed(2), upper: upper.toFixed(2) });
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>置信区间计算</h3>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>样本均值</label>
        <input className="input" value={mean} onChange={(e) => setMean(e.target.value)} />
      </div>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>标准差</label>
          <input className="input" value={sd} onChange={(e) => setSd(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>样本量</label>
          <input className="input" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>置信水平</label>
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="0.90">90%</option>
          <option value="0.95">95%</option>
          <option value="0.99">99%</option>
        </select>
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <ResultBox label={`${level === '0.90' ? '90%' : level === '0.99' ? '99%' : '95%'} CI`} value={`[${result.lower}, ${result.upper}]`} note="均值的置信区间，总体均值有此概率落入此范围" />
      )}
    </div>
  );
}

// === R86 新增计算器 ===


export function PairedTTestCalc() {
  const [md, setMd] = useState(''); const [sd, setSd] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);
  function calc() {
    const MD = parseFloat(md), SD = parseFloat(sd), N = parseInt(n);
    if ([MD, SD, N].some(isNaN) || N < 2 || SD <= 0) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    // R103: 改用 @lib/stats
    const r = pairedTFromSummary(MD, SD, N);
    setResult({ t: r.t.toFixed(4), df: String(r.df), p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>配对样本 t 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>适用于同一组对象前后两次测量（如干预前/后）。t = 差值均值 / (差值标准差 / √n)</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <StatInput label="差值均值（后-前）" val={md} set={setMd} />
        <StatInput label="差值标准差" val={sd} set={setSd} />
        <StatInput label="对子数 n" val={n} set={setN} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="t 统计量" value={result.t} />
          <ResultBox label="自由度 (df)" value={result.df} />
          <ResultBox label="双尾 p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '前后差异显著 (p < 0.05)' : '前后差异不显著 (p ≥ 0.05)'} />
        </>
      )}
    </div>
  );
}

export function OneSampleTTestCalc() {
  const [m, setM] = useState(''); const [mu, setMu] = useState(''); const [sd, setSd] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);
  function calc() {
    const M = parseFloat(m), MU = parseFloat(mu), SD = parseFloat(sd), N = parseInt(n);
    if ([M, MU, SD, N].some(isNaN) || N < 2 || SD <= 0) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    // R103: 改用 @lib/stats
    const r = oneSampleTFromSummary(M, MU, SD, N);
    setResult({ t: r.t.toFixed(4), df: String(r.df), p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>单样本 t 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>检验样本均值与已知总体均值（或标准值）是否有差异</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <StatInput label="样本均值" val={m} set={setM} />
        <StatInput label="总体均值/标准值" val={mu} set={setMu} />
        <StatInput label="样本标准差" val={sd} set={setSd} />
        <StatInput label="样本量 n" val={n} set={setN} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="t 统计量" value={result.t} />
          <ResultBox label="自由度 (df)" value={result.df} />
          <ResultBox label="双尾 p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '与总体均值差异显著 (p < 0.05)' : '与总体均值无显著差异 (p ≥ 0.05)'} />
        </>
      )}
    </div>
  );
}

export function AnovaCalc() {
  const [groups, setGroups] = useState([{ m: '', s: '', n: '' }, { m: '', s: '', n: '' }, { m: '', s: '', n: '' }]);
  const [result, setResult] = useState<{ f: string; df: string; p: string; eta: string } | null>(null);
  function setGroup(i: number, key: 'm' | 's' | 'n', v: string) {
    setGroups(groups.map((g, j) => (j === i ? { ...g, [key]: v } : g)));
  }
  function calc() {
    const gs = groups.map((g) => ({ m: parseFloat(g.m), s: parseFloat(g.s), n: parseInt(g.n) }))
      .filter((g) => !isNaN(g.m) && !isNaN(g.s) && !isNaN(g.n) && g.n >= 2 && g.s >= 0);
    if (gs.length < 2) { setResult({ f: '至少需要 2 组有效数据', df: '-', p: '-', eta: '-' }); return; }
    // R103: 改用 @lib/stats
    let r;
    try { r = anova(gs); } catch { setResult({ f: '计算出错', df: '-', p: '-', eta: '-' }); return; }
    if (!isFinite(r.F)) { setResult({ f: '组内方差为 0', df: '-', p: '-', eta: '-' }); return; }
    setResult({
      f: r.F.toFixed(4), df: `${r.dfBetween}, ${r.dfWithin}`,
      p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4),
      eta: r.eta2.toFixed(4),
    });
  }
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>单因素方差分析（One-way ANOVA）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>比较三组及以上均值。留空的组不参与计算；显著时需做事后检验（如 Bonferroni）定位差异组。</p>
      {groups.map((g, i) => (
        <div key={i} className="grid grid-3" style={{ gap: 8, marginBottom: 8 }}>
          <StatInput label={`组${i + 1} 均值`} val={g.m} set={(v) => setGroup(i, 'm', v)} />
          <StatInput label={`组${i + 1} 标准差`} val={g.s} set={(v) => setGroup(i, 's', v)} />
          <StatInput label={`组${i + 1} 样本量`} val={g.n} set={(v) => setGroup(i, 'n', v)} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button className="btn btn-sm" onClick={() => setGroups([...groups, { m: '', s: '', n: '' }])}>+ 加一组</button>
        {groups.length > 2 && <button className="btn btn-sm" onClick={() => setGroups(groups.slice(0, -1))}>- 减一组</button>}
        <button className="btn btn-primary" onClick={calc}>计算</button>
      </div>
      {result && (
        <>
          <ResultBox label="F 统计量" value={result.f} />
          <ResultBox label="自由度 (组间, 组内)" value={result.df} />
          <ResultBox label="p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '组间差异显著 (p < 0.05)' : '组间差异不显著 (p ≥ 0.05)'} />
          <ResultBox label="η²（效应量）" value={result.eta} note="0.01 小 / 0.06 中 / 0.14 大" />
        </>
      )}
    </div>
  );
}

export function OrrrCalc() {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [c, setC] = useState(''); const [d, setD] = useState('');
  const [result, setResult] = useState<{ or: string; orCi: string; rr: string; rrCi: string } | null>(null);
  function calc() {
    const A = parseFloat(a), B = parseFloat(b), C = parseFloat(c), D = parseFloat(d);
    if ([A, B, C, D].some(isNaN) || A < 0 || B < 0 || C < 0 || D < 0) { setResult({ or: '输入有误（须为非负数）', orCi: '', rr: '', rrCi: '' }); return; }
    // R103: 改用 @lib/stats（含 Haldane 校正）
    const r = orRr(A, B, C, D);
    const hasZero = A === 0 || B === 0 || C === 0 || D === 0;
    const tag = hasZero ? ' (Haldane 校正)' : '';
    setResult({
      or: r.OR.toFixed(3) + tag, orCi: `[${r.orCI[0].toFixed(3)}, ${r.orCI[1].toFixed(3)}]`,
      rr: r.RR.toFixed(3) + tag, rrCi: `[${r.rrCI[0].toFixed(3)}, ${r.rrCI[1].toFixed(3)}]`,
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>OR / RR 计算（2×2 表）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>a=暴露且发病 b=暴露未发病 c=未暴露发病 d=未暴露未发病。OR 用于病例对照研究，RR 用于队列/ RCT。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div></div>
        <span style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>发病/阳性</span>
        <span style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>未发病/阴性</span>
        <span style={{ fontSize: 12 }}>暴露</span>
        <input className="input" value={a} onChange={(e) => setA(e.target.value)} placeholder="a" />
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="b" />
        <span style={{ fontSize: 12 }}>未暴露</span>
        <input className="input" value={c} onChange={(e) => setC(e.target.value)} placeholder="c" />
        <input className="input" value={d} onChange={(e) => setD(e.target.value)} placeholder="d" />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="OR（比值比）" value={result.or} note={result.orCi ? `95% CI ${result.orCi} · ${parseFloat(result.or) > 1 ? '危险因素' : parseFloat(result.or) < 1 ? '保护因素' : '无关联'}` : ''} />
          <ResultBox label="RR（相对危险度）" value={result.rr} note={result.rrCi ? `95% CI ${result.rrCi}` : ''} />
        </>
      )}
    </div>
  );
}

export function DiagTestCalc() {
  const [tp, setTp] = useState(''); const [fp, setFp] = useState(''); const [fn, setFn] = useState(''); const [tn, setTn] = useState('');
  const [result, setResult] = useState<{ sens: string; spec: string; ppv: string; npv: string; acc: string; lr: string } | null>(null);
  function calc() {
    const TP = parseFloat(tp), FP = parseFloat(fp), FN = parseFloat(fn), TN = parseFloat(tn);
    if ([TP, FP, FN, TN].some(isNaN) || TP < 0 || FP < 0 || FN < 0 || TN < 0) { setResult({ sens: '输入有误（须为非负数）', spec: '', ppv: '', npv: '', acc: '', lr: '' }); return; }
    const total = TP + FP + FN + TN;
    if (total === 0) { setResult({ sens: '总样本量为 0', spec: '', ppv: '', npv: '', acc: '', lr: '' }); return; }
    // R103: 改用 @lib/stats
    const r = diagTest(TP, FP, FN, TN);
    const fmt = (v: number) => isNaN(v) ? '无法计算' : (v * 100).toFixed(1) + '%';
    setResult({
      sens: fmt(r.sensitivity), spec: fmt(r.specificity),
      ppv: fmt(r.ppv), npv: fmt(r.npv),
      acc: fmt(r.accuracy),
      lr: `LR+ = ${isFinite(r.lrPlus) ? r.lrPlus.toFixed(2) : '∞'} · LR- = ${isFinite(r.lrMinus) ? r.lrMinus.toFixed(2) : '∞'}`,
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>诊断试验评价</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>以金标准为参照：TP=真阳性 FP=假阳性 FN=假阴性 TN=真阴性</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <StatInput label="真阳性 TP" val={tp} set={setTp} />
        <StatInput label="假阳性 FP" val={fp} set={setFp} />
        <StatInput label="假阴性 FN" val={fn} set={setFn} />
        <StatInput label="真阴性 TN" val={tn} set={setTn} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="灵敏度 / 特异度" value={`${result.sens} / ${result.spec}`} />
          <ResultBox label="阳性/阴性预测值" value={`${result.ppv} / ${result.npv}`} />
          <ResultBox label="准确率" value={result.acc} />
          <ResultBox label="似然比" value={result.lr} note="LR+ > 10 或 LR- < 0.1 提示诊断价值高" />
        </>
      )}
    </div>
  );
}

export function CorrelationCalc() {
  const [r, setR] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; p: string; r2: string } | null>(null);
  function calc() {
    const R = parseFloat(r), N = parseInt(n);
    if (isNaN(R) || isNaN(N) || Math.abs(R) >= 1 || N < 3) { setResult({ t: '输入有误（|r| < 1, n ≥ 3）', p: '-', r2: '-' }); return; }
    // R103: 改用 @lib/stats
    const ct = correlationTest(R, N);
    setResult({ t: ct.t.toFixed(4), p: ct.p < 0.0001 ? ct.p.toExponential(4) : ct.p.toFixed(4), r2: (R * R).toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Pearson 相关系数检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>检验相关系数 r 是否显著不为 0。|r|: 0.3 弱 / 0.5 中 / 0.7 强</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <StatInput label="相关系数 r" val={r} set={setR} />
        <StatInput label="样本量 n" val={n} set={setN} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="t 统计量" value={result.t} />
          <ResultBox label="双尾 p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '相关显著 (p < 0.05)' : '相关不显著 (p ≥ 0.05)'} />
          <ResultBox label="决定系数 r²" value={result.r2} note="一个变量可解释另一个变量变异的比例" />
        </>
      )}
    </div>
  );
}

export function EffectSizeCalc() {
  const [m1, setM1] = useState(''); const [m2, setM2] = useState('');
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('');
  const [n1, setN1] = useState(''); const [n2, setN2] = useState('');
  const [result, setResult] = useState<{ d: string; g: string; interp: string } | null>(null);
  function calc() {
    const M1 = parseFloat(m1), M2 = parseFloat(m2), S1 = parseFloat(s1), S2 = parseFloat(s2);
    const N1 = parseInt(n1), N2 = parseInt(n2);
    if ([M1, M2, S1, S2, N1, N2].some(isNaN) || N1 < 2 || N2 < 2) { setResult({ d: '输入有误', g: '-', interp: '' }); return; }
    // R103: 改用 @lib/stats
    const r = effectSize(M1, M2, S1, S2, N1, N2);
    const abs = Math.abs(r.d);
    setResult({
      d: r.d.toFixed(3),
      g: r.hedgesG.toFixed(3),
      interp: abs < 0.2 ? '微小效应' : abs < 0.5 ? '小效应' : abs < 0.8 ? '中等效应' : '大效应',
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>效应量 Cohen&apos;s d</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>p 值只回答「有没有差异」，效应量回答「差异有多大」——论文报告应两者都给</p>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
        <StatInput label="组1均值" val={m1} set={setM1} />
        <StatInput label="组2均值" val={m2} set={setM2} />
        <StatInput label="组1标准差" val={s1} set={setS1} />
        <StatInput label="组2标准差" val={s2} set={setS2} />
        <StatInput label="组1样本量" val={n1} set={setN1} />
        <StatInput label="组2样本量" val={n2} set={setN2} />
      </div>
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="Cohen's d" value={result.d} note={result.interp ? `${result.interp}（0.2 小 / 0.5 中 / 0.8 大）` : ''} />
          <ResultBox label="Hedges' g" value={result.g} note="小样本校正后的 d，n<20 时更准确" />
        </>
      )}
    </div>
  );
}

