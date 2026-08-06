/**
 * Selenyx 统计工具 —— p值计算 / t检验 / 卡方检验 / 样本量 / 置信区间
 * R80: 从空壳替换为全套可用计算器
 */

import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@components/layout/BottomSheet';
import { useIsMobile } from '@lib/useIsMobile';
import {
  normalCDF, chi2SF,
  independentTTest, pairedTFromSummary, oneSampleTFromSummary,
  anova, orRr, diagTest, correlationTest, effectSize,
} from '@lib/stats';

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

type CalcKey = 'pvalue' | 'ttest' | 'pairedt' | 'onesamplet' | 'anova' | 'chi' | 'orrr' | 'diagtest' | 'correlation' | 'effectsize' | 'samplesize' | 'ci' | 'cronbach' | 'regression' | 'mannwhitney' | 'logistic' | 'roc' | 'survival';

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
  { key: 'cronbach', label: 'Cronbach α' },
  { key: 'regression', label: '线性回归' },
  { key: 'mannwhitney', label: 'Mann-Whitney U' },
  { key: 'logistic', label: 'Logistic回归' },
  { key: 'roc', label: 'ROC曲线' },
  { key: 'survival', label: '生存分析' },
];

const CALC_DESC: Record<CalcKey, string> = {
  pvalue: 'Z 值转双尾 p 值',
  ttest: '两组独立均值比较',
  pairedt: '前后配对资料比较',
  onesamplet: '样本与总体均值比较',
  anova: '三组及以上均值比较',
  chi: '四格表关联性检验',
  orrr: '比值比 / 相对危险度',
  diagtest: '敏感度 / 特异度评估',
  correlation: 'Pearson 线性相关',
  effectsize: "Cohen's d 等效应量",
  samplesize: '研究所需样本量估算',
  ci: '均值 / 率的置信区间',
  cronbach: '量表内部一致性信度',
  regression: '一元线性回归分析',
  mannwhitney: '非参数秩和检验',
  logistic: '二分类结局建模',
  roc: '诊断界值与曲线下面积',
  survival: 'KM / Cox 生存分析',
};

function Calculators() {
  const [calc, setCalc] = useState<CalcKey>('pvalue');
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const calcRef = useRef<HTMLDivElement>(null);
  const activeCalc = CALC_LIST.find((c) => c.key === calc)!;

  useEffect(() => {
    if (!isMobile) return;
    const node = calcRef.current;
    if (!node) return;
    node.querySelectorAll('input.input').forEach((el) => {
      (el as HTMLInputElement).setAttribute('inputmode', 'decimal');
    });
  }, [isMobile, calc, sheetOpen]);

  const calcBody = (
    <div className="stattools-calc" ref={calcRef}>
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
      {calc === 'cronbach' && <CronbachCalc />}
      {calc === 'regression' && <RegressionCalc />}
      {calc === 'mannwhitney' && <MannWhitneyCalc />}
      {calc === 'logistic' && <LogisticRegCalc />}
      {calc === 'roc' && <ROCCalc />}
      {calc === 'survival' && <SurvivalCalc />}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div className="stat-calc-list">
          {CALC_LIST.map((c) => (
            <button
              key={c.key}
              className={`stat-calc-item ${calc === c.key ? 'active' : ''}`}
              onClick={() => {
                setCalc(c.key);
                setSheetOpen(true);
              }}
            >
              <span className="stat-calc-name">{c.label}</span>
              <span className="stat-calc-desc">{CALC_DESC[c.key]}</span>
            </button>
          ))}
        </div>
        {sheetOpen && (
          <BottomSheet open onClose={() => setSheetOpen(false)} title={activeCalc.label}>
            {calcBody}
          </BottomSheet>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {CALC_LIST.map((c) => (
          <button key={c.key} className={`btn btn-sm ${calc === c.key ? 'btn-primary' : ''}`} onClick={() => setCalc(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      {calcBody}
    </>
  );
}

function ResultBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', marginTop: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label} = </span>
      <strong style={{ fontSize: 20, color: 'var(--accent)' }}>{value}</strong>
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
    // R103: 改用 @lib/stats
    const r = pairedTFromSummary(MD, SD, N);
    setResult({ t: r.t.toFixed(4), df: String(r.df), p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4) });
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
    // R103: 改用 @lib/stats
    const r = oneSampleTFromSummary(M, MU, SD, N);
    setResult({ t: r.t.toFixed(4), df: String(r.df), p: r.p < 0.0001 ? r.p.toExponential(4) : r.p.toFixed(4) });
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
    // R103: 改用 @lib/stats
    const ct = correlationTest(R, N);
    setResult({ t: ct.t.toFixed(4), p: ct.p < 0.0001 ? ct.p.toExponential(4) : ct.p.toFixed(4), r2: (R * R).toFixed(4) });
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
        <>
          <ResultBox label="Cohen's d" value={result.d} note={result.interp ? `${result.interp}（0.2 小 / 0.5 中 / 0.8 大）` : ''} />
          <ResultBox label="Hedges' g" value={result.g} note="小样本校正后的 d，n<20 时更准确" />
        </>
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


// ===== R105 新增计算器：Cronbach α / 线性回归 / Mann-Whitney U（全学科覆盖扩展）=====

/** 解析数字矩阵：每行一组受试者，列=题项，支持空格/制表/逗号分隔 */
function parseMatrix(text: string): number[][] {
  return text.trim().split(/\n+/).map((line) =>
    line.trim().split(/[\s,，\t]+/).map(Number).filter((n) => !isNaN(n))
  ).filter((row) => row.length > 0);
}

function mean(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function variance(arr: number[]): number {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1 || 1);
}

/** Cronbach α 信度系数（心理测量/教育测评/量表开发） */
function CronbachCalc() {
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>每行一个受试者，列为各题项得分，用空格/逗号分隔。适用：量表内部一致性信度。</p>
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
function RegressionCalc() {
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>每行一组 x,y（逗号或空格分隔）。输出：截距 a、斜率 b、相关 r、决定系数 r²、斜率显著性 t/p。</p>
      <textarea className="input" value={data} onChange={(e) => setData(e.target.value)} rows={5} style={{ width: '100%', fontFamily: 'var(--font-mono)', marginBottom: 8 }} />
      <button className="btn btn-primary" onClick={calc}>拟合回归</button>
      {result && <ResultBox label="回归方程 ŷ = a + bx" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}

/** Mann-Whitney U 检验（非参数·两组独立样本比较，不要求正态分布） */
function MannWhitneyCalc() {
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>两组独立样本，不要求正态分布。输出 U、z（正态近似）、双尾 p。适用：等级数据/小样本/偏态分布。</p>
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

function LogisticRegCalc() {
  const [a, setA] = useState('40');
  const [b, setB] = useState('60');
  const [c, setC] = useState('20');
  const [d, setD] = useState('80');
  const [result, setResult] = useState('');

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
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Logistic 回归（2×2 表）</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
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
      <button className="btn btn-primary" onClick={calc}>计算 Logistic 回归</button>
      {result && <ResultBox label="Logistic 回归" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}

function ROCCalc() {
  const [sens, setSens] = useState('0.85');
  const [spec, setSpec] = useState('0.80');
  const [result, setResult] = useState('');

  function calc() {
    const se = parseFloat(sens), sp = parseFloat(spec);
    if (isNaN(se) || isNaN(sp) || se < 0 || se > 1 || sp < 0 || sp > 1) {
      setResult('灵敏度和特异度须在 0–1 之间'); return;
    }
    // Binormal AUC approximation
    const a = Math.sqrt(2) * inverseNormalCDF(se);
    const b = Math.sqrt(2) * inverseNormalCDF(sp);
    const auc = normalCDF((a + b) / Math.sqrt(2));
    const youdenJ = se + sp - 1;
    const ppv = se / (se + (1 - sp)); // assuming prevalence-adjusted would need prevalence input
    const npv = sp / (sp + (1 - se));
    const lrPos = se / (1 - sp);
    const lrNeg = (1 - se) / sp;
    setResult(
      `AUC≈${auc.toFixed(3)} ｜ Youden J=${youdenJ.toFixed(3)} ｜ LR+=${lrPos.toFixed(2)} ｜ LR−=${lrNeg.toFixed(2)} ｜ 灵敏度=${(se * 100).toFixed(1)}% ｜ 特异度=${(sp * 100).toFixed(1)}% ｜ PPV≈${(ppv * 100).toFixed(1)}% ｜ NPV≈${(npv * 100).toFixed(1)}%（50%患病率假设）`
    );
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>ROC 曲线分析</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        输入灵敏度和特异度，估算 AUC（曲线下面积）、Youden's J 指数、似然比。
        AUC 是诊断试验准确性的金标准：0.5=无判别力，0.7–0.8=可接受，0.8–0.9=优秀，&gt;0.9=极好。
        适用：诊断试验评价、预测模型验证、护理评估工具效能分析。
      </p>
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>灵敏度 (Sensitivity)</label>
      <input className="input" value={sens} onChange={(e) => setSens(e.target.value)} style={{ width: '100%', marginBottom: 8 }} placeholder="0.00–1.00" />
      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>特异度 (Specificity)</label>
      <input className="input" value={spec} onChange={(e) => setSpec(e.target.value)} style={{ width: '100%', marginBottom: 8 }} placeholder="0.00–1.00" />
      <button className="btn btn-primary" onClick={calc}>计算 ROC 指标</button>
      {result && <ResultBox label="ROC 分析" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}

function SurvivalCalc() {
  const [g1times, setG1times] = useState('6 8 10 12 15 18 22 25 30 35');
  const [g1events, setG1events] = useState('1 1 1 0 1 1 0 1 1 0');
  const [g2times, setG2times] = useState('4 6 8 10 12 14 16 20 24 28');
  const [g2events, setG2events] = useState('1 1 1 1 1 1 0 1 0 1');
  const [result, setResult] = useState('');

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
    // Median survival (simple interpolation)
    function medianSurvival(times: number[], events: number[]): string {
      let cumSurv = 1.0;
      const sorted = times.map((t, i) => ({ t, e: events[i] })).sort((a, b) => a.t - b.t);
      const uniqueTimes = [...new Set(sorted.map((x) => x.t))].sort((a, b) => a - b);
      for (const t of uniqueTimes) {
        const atRisk = sorted.filter((x) => x.t >= t).length;
        const events = sorted.filter((x) => x.t === t && x.e === 1).length;
        if (atRisk > 0) cumSurv *= (1 - events / atRisk);
        if (cumSurv <= 0.5) return t.toString();
      }
      return '未达到';
    }
    const med1 = medianSurvival(t1, e1);
    const med2 = medianSurvival(t2, e2);
    setResult(
      `Log-rank χ²=${chiSq.toFixed(3)} ｜ p=${p < 0.0001 ? p.toExponential(2) : p.toFixed(4)} ｜ 组1中位生存=${med1} ｜ 组2中位生存=${med2} ｜ O₁-E₁=${(O1 - E1).toFixed(2)}`
    );
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Kaplan-Meier 生存分析</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        输入两组生存时间和事件指示（1=事件发生，0=删失），执行 Log-rank 检验比较两组生存曲线。
        输出 χ² 统计量、p 值和各组中位生存时间。
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
      <button className="btn btn-primary" onClick={calc}>执行 Log-rank 检验</button>
      {result && <ResultBox label="生存分析" value={result.split('｜')[0].trim()} note={result.split('｜').slice(1).join('｜').trim()} />}
    </div>
  );
}

/** 逆正态分布 CDF（Beasley-Springer-Moro 近似） */
function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 0.0276438810333863, 0.0038405729373609, 0.0003951896511919, 0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return q * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) / ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let val: number;
  if (r <= 5) {
    const rr = r - 1.6;
    val = (((((((c[8] * rr + c[7]) * rr + c[6]) * rr + c[5]) * rr + c[4]) * rr + c[3]) * rr + c[2]) * rr + c[1]) * rr + c[0];
  } else {
    const rr = r - 5;
    val = (((((((c[8] * rr + c[7]) * rr + c[6]) * rr + c[5]) * rr + c[4]) * rr + c[3]) * rr + c[2]) * rr + c[1]) * rr + c[0];
  }
  return q < 0 ? -val : val;
}

/** 卡方分布 CDF（ Wilson-Hilferty 近似） */
function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  // Wilson-Hilferty transformation to normal
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const zNorm = z / Math.sqrt(2 / (9 * df));
  return normalCDF(zNorm);
}
