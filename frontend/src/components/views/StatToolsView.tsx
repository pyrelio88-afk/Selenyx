/**
 * Selenyx 统计工具 —— p值计算 / t检验 / 卡方检验 / 样本量 / 置信区间
 * R80: 从空壳替换为全套可用计算器
 */

import { useState } from 'react';

type Tab = 'calculator' | 'tables' | 'methods';

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}

function tCDF(t: number, df: number): number {
  // 近似 t 分布 CDF（使用不完全 Beta 函数的近似）
  const x = df / (df + t * t);
  const betacf = (a: number, b: number, x: number) => {
    const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
    let qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
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
  const betai = (a: number, b: number, x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const lbeta = (a: number, b: number) => {
      let res = 0; for (let i = 1; i < a; i++) res += Math.log(i);
      for (let i = 1; i < b; i++) res += Math.log(i);
      for (let i = 1; i < a + b; i++) res -= Math.log(i);
      return res;
    };
    const bt = Math.exp(lbeta(a, b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  };
  const half = df / 2;
  return 1 - 0.5 * betai(half, 0.5, x);
}

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

function Calculators() {
  const [calc, setCalc] = useState<'pvalue' | 'ttest' | 'chi' | 'samplesize' | 'ci'>('pvalue');

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { key: 'pvalue', label: 'Z→p值' },
          { key: 'ttest', label: 't检验' },
          { key: 'chi', label: '卡方检验' },
          { key: 'samplesize', label: '样本量' },
          { key: 'ci', label: '置信区间' },
        ] as const).map((c) => (
          <button key={c.key} className={`btn btn-sm ${calc === c.key ? 'btn-primary' : ''}`} onClick={() => setCalc(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      {calc === 'pvalue' && <PValueCalc />}
      {calc === 'ttest' && <TTestCalc />}
      {calc === 'chi' && <ChiSquareCalc />}
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
    // 自由度=1 的卡方 p 值（用近似）
    const p = Math.exp(-0.5 * chi) * 0.39894 * 2 / Math.sqrt(chi) * (1 + chi / 12); // 粗近似
    const pVal = chi > 0 ? Math.max(0, 1 - p) : 1;
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
