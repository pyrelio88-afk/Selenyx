/**
 * Selenyx 统计工具 —— p值计算 / t检验 / 卡方检验 / 样本量 / 置信区间
 * R80: 从空壳替换为全套可用计算器
 * R110: 统计-图表深度融合（ROC/KM/森林图/热力图可视化）+ 公式库 + 文字对齐修复
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, HeatmapChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import {
  normalCDF, chi2SF,
  independentTTest, pairedTFromSummary, oneSampleTFromSummary,
  anova, orRr, diagTest, correlationTest, effectSize,
} from '@lib/stats';
import { Icon } from '@components/ui/Icon';
import '../../styles/stattools-workbench.css';

echarts.use([LineChart, ScatterChart, HeatmapChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, TitleComponent, MarkLineComponent, SVGRenderer]);

type Tab = 'calculator' | 'tables' | 'formula' | 'methods';

const Z_TABLE_ENTRIES = [
  { z: 1.645, label: 'α=0.10 (双侧)', p: 0.10 },
  { z: 1.96, label: 'α=0.05 (双侧)', p: 0.05 },
  { z: 2.576, label: 'α=0.01 (双侧)', p: 0.01 },
  { z: 3.291, label: 'α=0.001 (双侧)', p: 0.001 },
];

export function StatToolsView() {
  const [tab, setTab] = useState<Tab>('calculator');
  const [calcKey, setCalcKey] = useState<CalcKey>('pvalue');
  const [query, setQuery] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const catalogRef = useRef<HTMLElement>(null);
  const canvasHeadingRef = useRef<HTMLHeadingElement>(null);

  const filteredGroups = useMemo(() => filterStatToolGroups(query), [query]);
  const activeMeta = tab === 'calculator'
    ? CALC_LIST.find((item) => item.key === calcKey)!
    : RESOURCE_LIST.find((item) => item.tab === tab)!;
  const activeGroupLabel = tab === 'calculator'
    ? CALC_LIST.find((item) => item.key === calcKey)!.groupLabel
    : '参考资料';

  function openWorkspace() {
    setWorkspaceOpen(true);
    requestAnimationFrame(() => canvasHeadingRef.current?.focus());
  }

  function navigateToCalc(k: CalcKey) {
    setCalcKey(k);
    setTab('calculator');
    openWorkspace();
  }

  function navigateToResource(nextTab: Exclude<Tab, 'calculator'>) {
    setTab(nextTab);
    openWorkspace();
  }

  function returnToCatalog() {
    setWorkspaceOpen(false);
    requestAnimationFrame(() => catalogRef.current?.focus());
  }

  return (
    <div className={`stattools-view ${workspaceOpen ? 'is-workspace-open' : ''}`}>
      <header className="stattools-view-header">
        <div>
          <h1>统计工具</h1>
          <p>选择一种方法，在独立画布中完成输入、计算与结果判读；所有计算均在本机运行。</p>
        </div>
        <button type="button" className="stattools-formula-shortcut" onClick={() => navigateToResource('formula')}>
          <Icon name="references" size={15} /> 公式与方法依据
        </button>
      </header>

      <div className="stattools-shell">
        <aside ref={catalogRef} className="stattools-catalog" aria-label="统计工具目录" tabIndex={-1}>
          <label className="stattools-search">
            <span className="sr-only">搜索统计工具</span>
            <Icon name="search" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索方法、用途或结果…" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清空统计工具搜索"><Icon name="close" size={14} /></button>
            )}
          </label>

          <nav className="stattools-nav" aria-label="统计方法分类">
            {filteredGroups.map((group) => (
              <section key={group.id} className="stattools-nav-group" aria-labelledby={`stattools-group-${group.id}`}>
                <h2 id={`stattools-group-${group.id}`}>{group.label}</h2>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={tab === 'calculator' && calcKey === item.key ? 'active' : ''}
                    onClick={() => navigateToCalc(item.key)}
                    aria-current={tab === 'calculator' && calcKey === item.key ? 'page' : undefined}
                  >
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            ))}

            {filteredGroups.length === 0 && <div className="stattools-no-results">没有匹配的统计工具。可尝试“诊断”“效应量”或“生存”。</div>}

            {!query && (
              <section className="stattools-nav-group" aria-labelledby="stattools-group-reference">
                <h2 id="stattools-group-reference">参考资料</h2>
                {RESOURCE_LIST.map((item) => (
                  <button
                    type="button"
                    key={item.tab}
                    className={tab === item.tab ? 'active' : ''}
                    onClick={() => navigateToResource(item.tab)}
                    aria-current={tab === item.tab ? 'page' : undefined}
                  >
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            )}
          </nav>
        </aside>

        <main className="stattools-canvas" aria-labelledby="stattools-active-title">
          <header className="stattools-canvas-header">
            <button type="button" className="stattools-mobile-back" onClick={returnToCatalog}>
              <Icon name="chevronLeft" size={17} /> 返回工具目录
            </button>
            <div>
              <span>{activeGroupLabel}</span>
              <h2 id="stattools-active-title" ref={canvasHeadingRef} tabIndex={-1}>{activeMeta.label}</h2>
              <p>{activeMeta.description}</p>
            </div>
          </header>
          <div className="stattools-canvas-scroll">
            {tab === 'calculator' && <Calculators calc={calcKey} />}
            {tab === 'tables' && <CriticalTables />}
            {tab === 'formula' && <FormulaLibrary onNavigate={navigateToCalc} />}
            {tab === 'methods' && <MethodsGuide />}
          </div>
        </main>
      </div>
    </div>
  );
}

export type CalcKey = 'pvalue' | 'ttest' | 'pairedt' | 'onesamplet' | 'anova' | 'chi' | 'orrr' | 'diagtest' | 'correlation' | 'effectsize' | 'samplesize' | 'ci' | 'cronbach' | 'regression' | 'mannwhitney' | 'logistic' | 'roc' | 'survival';

type CalcGroupId = 'description' | 'inference' | 'association' | 'diagnostic' | 'design';
interface CalcMeta { key: CalcKey; label: string; description: string; group: CalcGroupId; groupLabel: string }

export const CALC_LIST: CalcMeta[] = [
  { key: 'pvalue', label: 'Z → p 值', description: '由标准正态统计量计算双尾概率', group: 'inference', groupLabel: '基础推断' },
  { key: 'ttest', label: '独立样本 t 检验', description: '比较两个独立组的均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'pairedt', label: '配对 t 检验', description: '比较配对或重复测量均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'onesamplet', label: '单样本 t 检验', description: '样本均值与已知总体均值比较', group: 'inference', groupLabel: '基础推断' },
  { key: 'anova', label: '单因素 ANOVA', description: '比较三个及以上独立组均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'chi', label: '卡方检验', description: '检验分类变量关联并绘制热力图', group: 'inference', groupLabel: '基础推断' },
  { key: 'mannwhitney', label: 'Mann–Whitney U', description: '两个独立样本的非参数比较', group: 'inference', groupLabel: '基础推断' },
  { key: 'ci', label: '置信区间', description: '描述估计值的不确定性范围', group: 'description', groupLabel: '描述与估计' },
  { key: 'orrr', label: 'OR / RR', description: '病例对照与队列研究效应指标', group: 'association', groupLabel: '关联与效应' },
  { key: 'correlation', label: 'Pearson 相关', description: '连续变量线性相关及显著性', group: 'association', groupLabel: '关联与效应' },
  { key: 'effectsize', label: '效应量', description: '描述 Cohen d 与组间差异强度', group: 'description', groupLabel: '描述与估计' },
  { key: 'regression', label: '线性回归', description: '估计连续结局的线性关系', group: 'association', groupLabel: '关联与效应' },
  { key: 'logistic', label: 'Logistic 回归', description: '二分类结局、OR 与森林图', group: 'association', groupLabel: '关联与效应' },
  { key: 'diagtest', label: '诊断试验', description: '灵敏度、特异度与预测值', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'cronbach', label: 'Cronbach α', description: '量表内部一致性信度', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'roc', label: 'ROC 曲线', description: '判别能力、AUC 与工作点', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'samplesize', label: '样本量估算', description: '按效应量、α 与效能规划样本', group: 'design', groupLabel: '研究设计与时间结局' },
  { key: 'survival', label: '生存分析', description: 'Kaplan–Meier 与 Log-rank 检验', group: 'design', groupLabel: '研究设计与时间结局' },
];

const GROUP_ORDER: Array<{ id: CalcGroupId; label: string }> = [
  { id: 'description', label: '描述与估计' },
  { id: 'inference', label: '基础推断' },
  { id: 'association', label: '关联与效应' },
  { id: 'diagnostic', label: '诊断与测量' },
  { id: 'design', label: '研究设计与时间结局' },
];

const RESOURCE_LIST = [
  { tab: 'tables' as const, label: '临界值表', description: 't、χ² 等常用临界值' },
  { tab: 'formula' as const, label: '公式库', description: '公式、变量定义与适用条件' },
  { tab: 'methods' as const, label: '方法速查', description: '按问题和数据类型选择方法' },
];

export function filterStatToolGroups(query: string) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return GROUP_ORDER.map((group) => ({
    ...group,
    items: CALC_LIST.filter((item) => item.group === group.id && (
      !normalized || `${item.label} ${item.description} ${item.groupLabel}`.toLocaleLowerCase('zh-CN').includes(normalized)
    )),
  })).filter((group) => group.items.length > 0);
}

function Calculators({ calc }: { calc: CalcKey }) {
  return (
    <>
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
    </>
  );
}

function ResultBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <section className="stattools-result" role="status" aria-live="polite" aria-label={`${label}计算结果`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>{label} =</span>
        <strong style={{ fontSize: 18, lineHeight: 1.4 }}>{value}</strong>
      </div>
      {note && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{note}</div>}
    </section>
  );
}

/** 内联图表组件 — 统计结果一键可视化 */
function InlineChart({ option, height = 260 }: { option: Record<string, unknown>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) {
      instRef.current = echarts.init(ref.current, undefined, { renderer: 'svg' });
    }
    instRef.current.setOption(option, true);
    const onResize = () => instRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [option]);

  useEffect(() => () => { instRef.current?.dispose(); }, []);

  return <div ref={ref} role="img" aria-label="统计计算结果图表" style={{ width: '100%', height, marginTop: 12 }} />;
}

/** 从 CSS 变量获取图表配色 */
function getStatColors() {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim() || '#7a9b6a';
  const danger = cs.getPropertyValue('--danger').trim() || '#c0432b';
  const textPri = cs.getPropertyValue('--text-primary').trim() || '#2c2a26';
  const textSec = cs.getPropertyValue('--text-secondary').trim() || '#6b6760';
  const border = cs.getPropertyValue('--border').trim() || '#d8d4ca';
  return { accent, danger, textPri, textSec, border };
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

function ChiSquareCalc() {
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

/** 公式库 — 统计学常用公式展示（含符号说明、适用条件、示例），与计算器双向跳转 */
function FormulaLibrary({ onNavigate }: { onNavigate: (k: CalcKey) => void }) {
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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>每行一组 x,y（逗号或空格分隔）。输出：截距 a、斜率 b、相关 r、决定系数 r²、斜率显著性 t/p。</p>
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

function LogisticRegCalc() {
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

function ROCCalc() {
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

function SurvivalCalc() {
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
