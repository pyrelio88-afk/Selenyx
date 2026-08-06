/**
 * Selenyx 统计工具 —— p值计算 / t检验 / 卡方检验 / 样本量 / 置信区间
 * R80: 从空壳替换为全套可用计算器
 */

import { useState } from 'react';
import { normalCDF, tCDF, chi2SF, fSF } from '@lib/stats';

type Tab = 'calculator' | 'tables' | 'methods';

const Z_TABLE_ENTRIES = [
  { z: 1.645, label: 'α=0.10 (双侧)', p: 0.10 },
  { z: 1.96, label: 'α=0.05 (双侧)', p: 0.05 },
  { z: 2.576, label: 'α=0.01 (双侧)', p: 0.01 },
  { z: 3.291, label: 'α=0.001 (双侧)', p: 0.001 },
];

export function StatToolsView() {
  const [tab, setTab] = useState<Tab>('calculator');

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">统计工具</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['calculator', 'tables', 'methods'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'calculator' ? '统计计算器' : t === 'tables' ? '临界值表' : '方法速查'}
          </button>
        ))}
      </div>

      {tab === 'calculator' && <Calculators />}
      {tab === 'tables' && <CriticalTables />}
      {tab === 'methods' && <MethodsGuide />}
    </div>
  );
}

type CalcKey = 'pvalue' | 'ttest' | 'pairedt' | 'onesamplet' | 'anova' | 'chi' | 'orrr' | 'diagtest' | 'correlation' | 'effectsize' | 'samplesize' | 'ci';

const CALC_LIST: { key: CalcKey; label: string }[] = [
  { key: 'pvalue', label: 'Z→p值' },
  { key: 'ttest', label: '独立t检验' },
  { key: 'pairedt', label: '配对t检验' },
  { key: 'onesamplet', label: '单样本t检验' },
  { key: 'anova', label: '单因素ANOVA' },
  { key: 'chi', label: '卡方检验' },
  { key: 'orrr', label: 'OR/RR' },
  { key: 'diagtest', label: '诊断试验' },
  { key: 'correlation', label: 'Pearson相关' },
  { key: 'effectsize', label: '效应量' },
  { key: 'samplesize', label: '样本量' },
  { key: 'ci', label: '置信区间' },
];

function Calculators() {
  const [calc, setCalc] = useState<CalcKey>('pvalue');

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {CALC_LIST.map((c) => (
          <button key={c.key} className={`btn btn-sm ${calc === c.key ? 'btn-primary' : ''}`} onClick={() => setCalc(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      {calc === 'pvalue' && <PValueCalc />}
      {calc === 'ttest' && <TTestCalc />}
      {calc === 'pairedt' && <PairedTTestCalc />}
      {calc === 'onesamplet' && <OneSampleTTestCalc />}
      {calc === 'anova' && <AnovaCalc />}
      {calc === 'chi' && <ChiSquareCalc />}
      {calc === 'orrr' && <OrrrCalc />}
      {calc === 'diagtest' && <DiagTestCalc />}
      {calc === 'correlation' && <CorrelationCalc />}
      {calc === 'effectsize' && <EffectSizeCalc />}
      {calc === 'samplesize' && <SampleSizeCalc />}
      {calc === 'ci' && <CICalc />}
    </>
  );
}

function ResultBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', marginTop: 12 }}>
      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label} = </span>
      <strong style={{ fontSize: 18 }}>{value}</strong>
      {note && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>{note}</div>}
    </div>
  );
}

function PValueCalc() {
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

function TTestCalc() {
  const [m1, setM1] = useState(''); const [m2, setM2] = useState('');
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('');
  const [n1, setN1] = useState(''); const [n2, setN2] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);

  function calc() {
    const M1 = parseFloat(m1), M2 = parseFloat(m2), S1 = parseFloat(s1), S2 = parseFloat(s2);
    const N1 = parseInt(n1), N2 = parseInt(n2);
    if ([M1, M2, S1, S2, N1, N2].some(isNaN) || N1 < 2 || N2 < 2) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    // 合并方差 t 检验
    const sp2 = ((N1 - 1) * S1 * S1 + (N2 - 1) * S2 * S2) / (N1 + N2 - 2);
    const se = Math.sqrt(sp2 * (1 / N1 + 1 / N2));
    const t = (M1 - M2) / se;
    const df = N1 + N2 - 2;
    const p = 2 * (1 - tCDF(Math.abs(t), df));
    setResult({
      t: t.toFixed(4),
      df: df.toString(),
      p: p < 0.0001 ? p.toExponential(4) : p.toFixed(4),
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>合并方差 t 检验（适用于方差齐性成立时）</p>
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

function ChiSquareCalc() {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [c, setC] = useState(''); const [d, setD] = useState('');
  const [result, setResult] = useState<{ chi: string; df: string; p: string } | null>(null);

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
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>卡方检验（2×2 列联表）</h3>
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
      <button className="btn btn-primary" onClick={calc}>计算</button>
      {result && (
        <>
          <ResultBox label="χ² 统计量" value={result.chi} />
          <ResultBox label="自由度 (df)" value={result.df} />
          <ResultBox label="p 值" value={result.p} note={parseFloat(result.p) < 0.05 ? '关联显著 (p < 0.05)' : '无显著关联 (p ≥ 0.05)'} />
        </>
      )}
    </div>
  );
}

function SampleSizeCalc() {
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>两组比较（基于效应量 Cohen d）</p>
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

function CICalc() {
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

function StatInput({ label, val, set }: { label: string; val: string; set: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <input className="input" value={val} onChange={(e) => set(e.target.value)} style={{ width: '100%' }} />
    </div>
  );
}

function PairedTTestCalc() {
  const [md, setMd] = useState(''); const [sd, setSd] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);
  function calc() {
    const MD = parseFloat(md), SD = parseFloat(sd), N = parseInt(n);
    if ([MD, SD, N].some(isNaN) || N < 2 || SD <= 0) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    const t = MD / (SD / Math.sqrt(N));
    const df = N - 1;
    const p = 2 * (1 - tCDF(Math.abs(t), df));
    setResult({ t: t.toFixed(4), df: String(df), p: p < 0.0001 ? p.toExponential(4) : p.toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>配对样本 t 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>适用于同一组对象前后两次测量（如干预前/后）。t = 差值均值 / (差值标准差 / √n)</p>
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

function OneSampleTTestCalc() {
  const [m, setM] = useState(''); const [mu, setMu] = useState(''); const [sd, setSd] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; df: string; p: string } | null>(null);
  function calc() {
    const M = parseFloat(m), MU = parseFloat(mu), SD = parseFloat(sd), N = parseInt(n);
    if ([M, MU, SD, N].some(isNaN) || N < 2 || SD <= 0) { setResult({ t: '输入有误', df: '-', p: '-' }); return; }
    const t = (M - MU) / (SD / Math.sqrt(N));
    const df = N - 1;
    const p = 2 * (1 - tCDF(Math.abs(t), df));
    setResult({ t: t.toFixed(4), df: String(df), p: p < 0.0001 ? p.toExponential(4) : p.toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>单样本 t 检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>检验样本均值与已知总体均值（或标准值）是否有差异</p>
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

function AnovaCalc() {
  const [groups, setGroups] = useState([{ m: '', s: '', n: '' }, { m: '', s: '', n: '' }, { m: '', s: '', n: '' }]);
  const [result, setResult] = useState<{ f: string; df: string; p: string; eta: string } | null>(null);
  function setGroup(i: number, key: 'm' | 's' | 'n', v: string) {
    setGroups(groups.map((g, j) => (j === i ? { ...g, [key]: v } : g)));
  }
  function calc() {
    const gs = groups.map((g) => ({ m: parseFloat(g.m), s: parseFloat(g.s), n: parseInt(g.n) }))
      .filter((g) => !isNaN(g.m) && !isNaN(g.s) && !isNaN(g.n) && g.n >= 2 && g.s >= 0);
    if (gs.length < 2) { setResult({ f: '至少需要 2 组有效数据', df: '-', p: '-', eta: '-' }); return; }
    const N = gs.reduce((a, g) => a + g.n, 0);
    const grandMean = gs.reduce((a, g) => a + g.m * g.n, 0) / N;
    const ssb = gs.reduce((a, g) => a + g.n * Math.pow(g.m - grandMean, 2), 0);
    const ssw = gs.reduce((a, g) => a + (g.n - 1) * g.s * g.s, 0);
    const dfb = gs.length - 1, dfw = N - gs.length;
    if (ssw <= 0 || dfw <= 0) { setResult({ f: '组内方差为 0', df: '-', p: '-', eta: '-' }); return; }
    const F = (ssb / dfb) / (ssw / dfw);
    const p = fSF(F, dfb, dfw);
    const eta2 = ssb / (ssb + ssw);
    setResult({
      f: F.toFixed(4), df: `${dfb}, ${dfw}`,
      p: p < 0.0001 ? p.toExponential(4) : p.toFixed(4),
      eta: eta2.toFixed(4),
    });
  }
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>单因素方差分析（One-way ANOVA）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>比较三组及以上均值。留空的组不参与计算；显著时需做事后检验（如 Bonferroni）定位差异组。</p>
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

function OrrrCalc() {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [c, setC] = useState(''); const [d, setD] = useState('');
  const [result, setResult] = useState<{ or: string; orCi: string; rr: string; rrCi: string } | null>(null);
  function calc() {
    const A = parseFloat(a), B = parseFloat(b), C = parseFloat(c), D = parseFloat(d);
    if ([A, B, C, D].some(isNaN) || A < 0 || B < 0 || C < 0 || D < 0) { setResult({ or: '输入有误（须为非负数）', orCi: '', rr: '', rrCi: '' }); return; }
    // Haldane-Anscombe 校正：含零格时全表 +0.5，避免除零
    const hasZero = A === 0 || B === 0 || C === 0 || D === 0;
    const a2 = A + (hasZero ? 0.5 : 0);
    const b2 = B + (hasZero ? 0.5 : 0);
    const c2 = C + (hasZero ? 0.5 : 0);
    const d2 = D + (hasZero ? 0.5 : 0);
    const OR = (a2 * d2) / (b2 * c2);
    const seLogOr = Math.sqrt(1 / a2 + 1 / b2 + 1 / c2 + 1 / d2);
    const orLo = Math.exp(Math.log(OR) - 1.96 * seLogOr), orHi = Math.exp(Math.log(OR) + 1.96 * seLogOr);
    const RR = (a2 / (a2 + b2)) / (c2 / (c2 + d2));
    const seLogRr = Math.sqrt(1 / a2 - 1 / (a2 + b2) + 1 / c2 - 1 / (c2 + d2));
    const rrLo = Math.exp(Math.log(RR) - 1.96 * seLogRr), rrHi = Math.exp(Math.log(RR) + 1.96 * seLogRr);
    const tag = hasZero ? ' (Haldane 校正)' : '';
    setResult({
      or: OR.toFixed(3) + tag, orCi: `[${orLo.toFixed(3)}, ${orHi.toFixed(3)}]`,
      rr: RR.toFixed(3) + tag, rrCi: `[${rrLo.toFixed(3)}, ${rrHi.toFixed(3)}]`,
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>OR / RR 计算（2×2 表）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>a=暴露且发病 b=暴露未发病 c=未暴露发病 d=未暴露未发病。OR 用于病例对照研究，RR 用于队列/ RCT。</p>
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

function DiagTestCalc() {
  const [tp, setTp] = useState(''); const [fp, setFp] = useState(''); const [fn, setFn] = useState(''); const [tn, setTn] = useState('');
  const [result, setResult] = useState<{ sens: string; spec: string; ppv: string; npv: string; acc: string; lr: string } | null>(null);
  function calc() {
    const TP = parseFloat(tp), FP = parseFloat(fp), FN = parseFloat(fn), TN = parseFloat(tn);
    if ([TP, FP, FN, TN].some(isNaN) || TP < 0 || FP < 0 || FN < 0 || TN < 0) { setResult({ sens: '输入有误（须为非负数）', spec: '', ppv: '', npv: '', acc: '', lr: '' }); return; }
    const total = TP + FP + FN + TN;
    if (total === 0) { setResult({ sens: '总样本量为 0', spec: '', ppv: '', npv: '', acc: '', lr: '' }); return; }
    const sens = TP + FN > 0 ? TP / (TP + FN) : NaN;
    const spec = TN + FP > 0 ? TN / (TN + FP) : NaN;
    const ppv = TP + FP > 0 ? TP / (TP + FP) : NaN;
    const npv = TN + FN > 0 ? TN / (TN + FN) : NaN;
    const acc = (TP + TN) / total;
    // LR+ = sens / (1-spec); spec=1 → ∞；LR- = (1-sens)/spec; spec=0 → ∞
    const lrP = !isNaN(sens) && spec < 1 ? sens / (1 - spec) : Infinity;
    const lrN = !isNaN(sens) && spec > 0 ? (1 - sens) / spec : Infinity;
    const fmt = (v: number) => isNaN(v) ? '无法计算' : (v * 100).toFixed(1) + '%';
    setResult({
      sens: fmt(sens), spec: fmt(spec),
      ppv: fmt(ppv), npv: fmt(npv),
      acc: fmt(acc),
      lr: `LR+ = ${isFinite(lrP) ? lrP.toFixed(2) : '∞'} · LR- = ${isFinite(lrN) ? lrN.toFixed(2) : '∞'}`,
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>诊断试验评价</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>以金标准为参照：TP=真阳性 FP=假阳性 FN=假阴性 TN=真阴性</p>
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

function CorrelationCalc() {
  const [r, setR] = useState(''); const [n, setN] = useState('');
  const [result, setResult] = useState<{ t: string; p: string; r2: string } | null>(null);
  function calc() {
    const R = parseFloat(r), N = parseInt(n);
    if (isNaN(R) || isNaN(N) || Math.abs(R) >= 1 || N < 3) { setResult({ t: '输入有误（|r| < 1, n ≥ 3）', p: '-', r2: '-' }); return; }
    const t = R * Math.sqrt((N - 2) / (1 - R * R));
    const p = 2 * (1 - tCDF(Math.abs(t), N - 2));
    setResult({ t: t.toFixed(4), p: p < 0.0001 ? p.toExponential(4) : p.toFixed(4), r2: (R * R).toFixed(4) });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Pearson 相关系数检验</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>检验相关系数 r 是否显著不为 0。|r|: 0.3 弱 / 0.5 中 / 0.7 强</p>
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

function EffectSizeCalc() {
  const [m1, setM1] = useState(''); const [m2, setM2] = useState('');
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('');
  const [n1, setN1] = useState(''); const [n2, setN2] = useState('');
  const [result, setResult] = useState<{ d: string; interp: string } | null>(null);
  function calc() {
    const M1 = parseFloat(m1), M2 = parseFloat(m2), S1 = parseFloat(s1), S2 = parseFloat(s2);
    const N1 = parseInt(n1), N2 = parseInt(n2);
    if ([M1, M2, S1, S2, N1, N2].some(isNaN) || N1 < 2 || N2 < 2) { setResult({ d: '输入有误', interp: '' }); return; }
    const sp = Math.sqrt(((N1 - 1) * S1 * S1 + (N2 - 1) * S2 * S2) / (N1 + N2 - 2));
    const d = (M1 - M2) / sp;
    const abs = Math.abs(d);
    setResult({
      d: d.toFixed(3),
      interp: abs < 0.2 ? '微小效应' : abs < 0.5 ? '小效应' : abs < 0.8 ? '中等效应' : '大效应',
    });
  }
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>效应量 Cohen&apos;s d</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>p 值只回答「有没有差异」，效应量回答「差异有多大」——论文报告应两者都给</p>
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
        <ResultBox label="Cohen's d" value={result.d} note={result.interp ? `${result.interp}（0.2 小 / 0.5 中 / 0.8 大）` : ''} />
      )}
    </div>
  );
}

function CriticalTables() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Z 分布常用临界值</h3>
        <table className="data-table">
          <thead><tr><th>Z 值</th><th>显著性水平</th><th>双尾 p 值</th></tr></thead>
          <tbody>
            <tr><td>1.645</td><td>α = 0.10</td><td>0.10</td></tr>
            <tr><td>1.96</td><td>α = 0.05</td><td>0.05</td></tr>
            <tr><td>2.326</td><td>α = 0.02</td><td>0.02</td></tr>
            <tr><td>2.576</td><td>α = 0.01</td><td>0.01</td></tr>
            <tr><td>3.291</td><td>α = 0.001</td><td>0.001</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>t 分布临界值（α = 0.05, 双尾）</h3>
        <table className="data-table">
          <thead><tr><th>自由度 df</th><th>t 值</th></tr></thead>
          <tbody>
            {[1, 5, 10, 15, 20, 30, 40, 60, 120, 999].map((df) => (
              <tr key={df}>
                <td>{df === 999 ? '∞' : df}</td>
                <td style={{ fontFamily: 'monospace' }}>
                  {df === 1 ? '12.706' : df === 5 ? '2.571' : df === 10 ? '2.228' : df === 15 ? '2.131' : df === 20 ? '2.086' : df === 30 ? '2.042' : df === 40 ? '2.021' : df === 60 ? '2.000' : df === 120 ? '1.980' : '1.960'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>χ² 分布临界值（df = 1）</h3>
        <table className="data-table">
          <thead><tr><th>α 水平</th><th>χ² 临界值</th></tr></thead>
          <tbody>
            <tr><td>0.10</td><td>2.706</td></tr>
            <tr><td>0.05</td><td>3.841</td></tr>
            <tr><td>0.01</td><td>6.635</td></tr>
            <tr><td>0.001</td><td>10.828</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>GRADE 证据质量分级</h3>
        <table className="data-table">
          <thead><tr><th>等级</th><th>含义</th></tr></thead>
          <tbody>
            <tr><td>A (高)</td><td>非常确信效应估计值接近真实值</td></tr>
            <tr><td>B (中)</td><td>对效应估计值有中等信心</td></tr>
            <tr><td>C (低)</td><td>对效应估计值信心有限</td></tr>
            <tr><td>D (极低)</td><td>对效应估计值几乎没有信心</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MethodsGuide() {
  const methods = [
    { name: '描述性统计', when: '数据探索、基线特征描述', tools: 'SPSS: 描述 / R: summary() / Python: df.describe()' },
    { name: '独立样本 t 检验', when: '两组连续变量均值比较', tools: 'SPSS: 独立样本t检验 / R: t.test() / Python: scipy.stats.ttest_ind()' },
    { name: '配对 t 检验', when: '同一组前后测量比较', tools: 'SPSS: 配对样本t检验 / R: t.test(paired=T) / Python: ttest_rel()' },
    { name: '方差分析(ANOVA)', when: '三组及以上均值比较', tools: 'SPSS: 单因素ANOVA / R: aov() / Python: f_oneway()' },
    { name: '卡方检验', when: '分类变量关联性分析', tools: 'SPSS: 交叉表 / R: chisq.test() / Python: chi2_contingency()' },
    { name: 'Fisher 精确检验', when: '小样本(<5)列联表', tools: 'R: fisher.test() / Python: fisher_exact()' },
    { name: 'Mann-Whitney U', when: '两组非正态连续变量', tools: 'R: wilcox.test() / Python: mannwhitneyu()' },
    { name: 'Wilcoxon 符号秩', when: '配对非正态数据', tools: 'R: wilcox.test(paired=T) / Python: wilcoxon()' },
    { name: 'Kruskal-Wallis', when: '三组及以上非正态', tools: 'R: kruskal.test() / Python: kruskal()' },
    { name: 'Pearson 相关', when: '两个连续变量线性关系', tools: 'R: cor.test() / Python: pearsonr()' },
    { name: 'Spearman 相关', when: '等级变量或非线性关系', tools: 'R: cor.test(method="spearman") / Python: spearmanr()' },
    { name: '线性回归', when: '连续结局变量的预测', tools: 'R: lm() / Python: sklearn.linear_model' },
    { name: 'Logistic 回归', when: '二分类结局预测', tools: 'R: glm(family=binomial) / Python: LogisticRegression' },
    { name: 'Cox 比例风险', when: '生存分析', tools: 'R: coxph() / Python: lifelines.CoxPHFitter' },
    { name: 'Kappa 一致性', when: '两名评分者一致性', tools: 'R: kappa2() / Python: sklearn.metrics.cohen_kappa_score' },
  ];

  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr><th>方法</th><th>适用场景</th><th>SPSS / R / Python</th></tr>
        </thead>
        <tbody>
          {methods.map((m) => (
            <tr key={m.name}>
              <td style={{ fontWeight: 500 }}>{m.name}</td>
              <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{m.when}</td>
              <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.tools}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
