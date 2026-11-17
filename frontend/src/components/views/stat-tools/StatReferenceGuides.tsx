import { useState } from 'react';
import type { CalcKey } from './catalog';

export function CriticalTables() {
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

/** 公式库 — 统计学常用公式展示（含符号说明、适用条件、示例），与计算器双向跳转 */
export function FormulaLibrary({ onNavigate }: { onNavigate: (k: CalcKey) => void }) {
  const [cat, setCat] = useState('all');

  const categories = ['all', '均值比较', '方差分析', '分类变量', '相关与回归', '诊断与生存', '信度与非参数'];

  const formulas: {
    cat: string; name: string; formula: string; sub?: string;
    symbols: { sym: string; desc: string }[];
    conditions: string; example: string; calc: CalcKey;
  }[] = [
    {
      cat: '均值比较', name: '独立样本 t 检验',
      formula: 't = (M₁ − M₂) / √(sₚ² · (1/n₁ + 1/n₂))',
      sub: 'sₚ² = [(n₁−1)s₁² + (n₂−1)s₂²] / (n₁ + n₂ − 2)',
      symbols: [
        { sym: 'M₁, M₂', desc: '两组样本均值' },
        { sym: 'sₚ²', desc: '合并方差' },
        { sym: 's₁, s₂', desc: '两组标准差' },
        { sym: 'n₁, n₂', desc: '两组样本量' },
      ],
      conditions: '① 两组独立 ② 连续变量近似正态 ③ 方差齐性（Levene 检验）',
      example: '干预组 vs 对照组护理技能 OSCE 评分比较',
      calc: 'ttest',
    },
    {
      cat: '均值比较', name: '配对样本 t 检验',
      formula: 't = d̄ / (s_d / √n)',
      symbols: [
        { sym: 'd̄', desc: '差值均值（后 − 前）' },
        { sym: 's_d', desc: '差值标准差' },
        { sym: 'n', desc: '配对数' },
      ],
      conditions: '① 同一对象前后两次测量 ② 差值近似正态',
      example: 'SBAR 培训前后护生交接评分比较',
      calc: 'pairedt',
    },
    {
      cat: '均值比较', name: '单样本 t 检验',
      formula: 't = (M − μ₀) / (s / √n)',
      symbols: [
        { sym: 'M', desc: '样本均值' },
        { sym: 'μ₀', desc: '已知总体均值/标准值' },
        { sym: 's', desc: '样本标准差' },
        { sym: 'n', desc: '样本量' },
      ],
      conditions: '① 样本来自正态总体 ② 与已知标准值比较',
      example: '本院护士手卫生依从性与国家基线比较',
      calc: 'onesamplet',
    },
    {
      cat: '均值比较', name: 'Cohen\'s d 效应量',
      formula: 'd = (M₁ − M₂) / s_pooled',
      sub: 's_pooled = √[(s₁² + s₂²) / 2]',
      symbols: [
        { sym: 'M₁, M₂', desc: '两组均值' },
        { sym: 's_pooled', desc: '合并标准差' },
      ],
      conditions: 'p 值只回答「有没有差异」，d 回答「差异有多大」。0.2 小 / 0.5 中 / 0.8 大',
      example: '两组样本量不等时用 Hedges\' g 校正',
      calc: 'effectsize',
    },
    {
      cat: '方差分析', name: '单因素方差分析 (ANOVA)',
      formula: 'F = MS_between / MS_within',
      sub: 'MS_between = SS_between / (k−1),  MS_within = SS_within / (N−k)',
      symbols: [
        { sym: 'MS_between', desc: '组间均方' },
        { sym: 'MS_within', desc: '组内均方' },
        { sym: 'k', desc: '组数' },
        { sym: 'N', desc: '总样本量' },
      ],
      conditions: '① 三组及以上 ② 各组正态 ③ 方差齐性 ④ 显著时需事后检验定位差异组',
      example: '三种交接班模式对临床推理得分的影响',
      calc: 'anova',
    },
    {
      cat: '分类变量', name: '卡方检验 (χ²)',
      formula: 'χ² = N · (ad − bc)² / [(a+b)(c+d)(a+c)(b+d)]',
      symbols: [
        { sym: 'a, b, c, d', desc: '2×2 列联表四格频数' },
        { sym: 'N', desc: '总例数 = a+b+c+d' },
      ],
      conditions: '① 分类变量 ② 总例数 ≥ 40 ③ 每格期望频数 ≥ 5（否则用 Fisher 精确检验）',
      example: '不同教育方式对压疮发生率的影响',
      calc: 'chi',
    },
    {
      cat: '分类变量', name: 'OR / RR',
      formula: 'OR = (a/b) / (c/d),  RR = [a/(a+b)] / [c/(c+d)]',
      symbols: [
        { sym: 'OR', desc: '比值比（病例对照研究）' },
        { sym: 'RR', desc: '相对危险度（队列/RCT）' },
      ],
      conditions: 'OR 适用于病例对照；RR 适用于队列与 RCT。含 0 值时用 Haldane 校正',
      example: '跌倒高风险标识与跌倒事件的关联分析',
      calc: 'orrr',
    },
    {
      cat: '相关与回归', name: 'Pearson 相关系数',
      formula: 'r = Σ(xᵢ−x̄)(yᵢ−ȳ) / √[Σ(xᵢ−x̄)² · Σ(yᵢ−ȳ)²]',
      sub: 't = r · √(n−2) / √(1−r²),  r² = 决定系数',
      symbols: [
        { sym: 'r', desc: 'Pearson 相关系数（−1 到 1）' },
        { sym: 'r²', desc: '决定系数（可解释变异比例）' },
        { sym: 'n', desc: '样本量' },
      ],
      conditions: '① 两连续变量 ② 线性关系 ③ 无显著异常值 ④ 正态双变量分布',
      example: '工作年限与临床推理能力评分的线性关联',
      calc: 'correlation',
    },
    {
      cat: '相关与回归', name: '简单线性回归',
      formula: 'ŷ = a + b·x',
      sub: 'b = Σ(xᵢ−x̄)(yᵢ−ȳ) / Σ(xᵢ−x̄)²,  a = ȳ − b·x̄',
      symbols: [
        { sym: 'a', desc: '截距' },
        { sym: 'b', desc: '斜率（x 每变化 1 单位 y 的变化量）' },
        { sym: 'r²', desc: '模型拟合优度' },
      ],
      conditions: '① 因变量连续 ② 线性关系 ③ 残差独立正态等方差',
      example: '用培训时长预测 OSCE 评分',
      calc: 'regression',
    },
    {
      cat: '相关与回归', name: 'Logistic 回归',
      formula: 'ln(OR) = β₁ = ln(ad/bc)',
      sub: 'SE(β₁) = √(1/a + 1/b + 1/c + 1/d),  Wald z = β₁ / SE',
      symbols: [
        { sym: 'OR', desc: '比值比 = exp(β₁)' },
        { sym: 'β₁', desc: '回归系数 = ln(OR)' },
        { sym: 'SE', desc: '标准误' },
      ],
      conditions: '① 二分类结局 ② 独立观测 ③ 样本量充足（每变量 ≥ 10 事件）',
      example: 'AI 辅助训练是否提高 SBAR 交接合格率的 Odds',
      calc: 'logistic',
    },
    {
      cat: '诊断与生存', name: 'ROC 曲线分析',
      formula: 'AUC = Φ((a + b) / √2)',
      sub: 'a = √2 · Φ⁻¹(灵敏度),  b = √2 · Φ⁻¹(特异度)',
      symbols: [
        { sym: 'AUC', desc: '曲线下面积（0.5–1.0）' },
        { sym: 'a, b', desc: '双正态模型参数' },
        { sym: 'J', desc: "Youden's J = 灵敏度 + 特异度 − 1" },
      ],
      conditions: '诊断试验评价金标准。AUC 0.7 可接受 / 0.8 优秀 / 0.9 极好',
      example: '护理评估工具对跌倒风险的判别能力',
      calc: 'roc',
    },
    {
      cat: '诊断与生存', name: 'Kaplan-Meier 生存分析',
      formula: 'Ŝ(t) = ∏_{tᵢ ≤ t} (1 − dᵢ/nᵢ)',
      sub: 'Log-rank: χ² = (O₁ − E₁)² / V',
      symbols: [
        { sym: 'Ŝ(t)', desc: '时刻 t 的累积生存概率' },
        { sym: 'dᵢ', desc: '时刻 tᵢ 的事件数' },
        { sym: 'nᵢ', desc: '时刻 tᵢ 的风险人数' },
      ],
      conditions: '① 生存时间 ② 删失数据 ③ Log-rank 比较两组生存曲线差异',
      example: '不同护理方案对术后患者生存时间的影响',
      calc: 'survival',
    },
    {
      cat: '诊断与生存', name: '诊断试验评价',
      formula: '灵敏度 = TP/(TP+FN),  特异度 = TN/(TN+FP)',
      sub: 'PPV = TP/(TP+FP),  NPV = TN/(TN+FN)',
      symbols: [
        { sym: 'TP', desc: '真阳性' },
        { sym: 'FP', desc: '假阳性' },
        { sym: 'FN', desc: '假阴性' },
        { sym: 'TN', desc: '真阴性' },
      ],
      conditions: '以金标准为参照。LR+ > 10 或 LR− < 0.1 提示诊断价值高',
      example: '护士疼痛评估量表 vs 医生诊断的一致性',
      calc: 'diagtest',
    },
    {
      cat: '信度与非参数', name: 'Cronbach α 信度系数',
      formula: 'α = (k / (k−1)) · (1 − Σσᵢ² / σ_total²)',
      symbols: [
        { sym: 'k', desc: '题项数' },
        { sym: 'σᵢ²', desc: '第 i 题方差' },
        { sym: 'σ_total²', desc: '总分方差' },
      ],
      conditions: '量表内部一致性信度。≥0.9 优秀 / ≥0.8 良好 / ≥0.7 可接受 / <0.6 需修订',
      example: 'SBAR 交接能力自评量表的内部一致性',
      calc: 'cronbach',
    },
    {
      cat: '信度与非参数', name: 'Mann-Whitney U 检验',
      formula: 'U = min(U₁, U₂),  U₁ = R₁ − n₁(n₁+1)/2',
      sub: 'z = (U − μ_U) / σ_U,  μ_U = n₁n₂/2',
      symbols: [
        { sym: 'R₁', desc: '组 1 秩和' },
        { sym: 'U', desc: '检验统计量' },
        { sym: 'z', desc: '正态近似统计量' },
      ],
      conditions: '非参数检验，不要求正态。适用：等级数据/小样本/偏态分布',
      example: '两组 Likert 量表满意度评分比较',
      calc: 'mannwhitney',
    },
  ];

  const filtered = cat === 'all' ? formulas : formulas.filter((f) => f.cat === cat);

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button key={c} className={`btn btn-sm ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>
            {c === 'all' ? '全部公式' : c}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((f) => (
          <div key={f.name} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15 }}>{f.name}</h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{f.cat}</span>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>
              {f.formula}
            </div>
            {f.sub && (
              <div style={{ padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                {f.sub}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 16px', marginBottom: 8 }}>
              {f.symbols.map((s) => (
                <div key={s.sym} style={{ fontSize: 12, lineHeight: 1.6, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <code style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>{s.sym}</code>
                  <span style={{ color: 'var(--text-muted)' }}>— {s.desc}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>适用条件：</span>{f.conditions}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>示例：</span>{f.example}
            </div>
            <button className="btn btn-sm" onClick={() => onNavigate(f.calc)}>→ 打开计算器</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MethodsGuide() {
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
