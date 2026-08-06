/**
 * Selenyx 工具箱 — 图表（数据可视化）
 *
 * 面向科研场景的轻量图表工具：柱状/折线/散点/饼图环形/面积/箱线/森林/热力。
 * - 图表库：ECharts 5（tree-shaken，仅引入用到的图表/组件 + SVGRenderer）
 * - 配色：运行时读取 Selenyx 设计 token（--accent / --success / --warning / --danger …），
 *   随三主题 × 明暗自动切换，零硬编码颜色
 * - 数据输入：可编辑表格 + CSV 粘贴导入
 * - 导出：PNG（getDataURL）/ SVG（renderToSVGString），供论文与 PPT 使用
 *
 * 选型理由（vs uPlot / Chart.js / Plotly）：
 *  uPlot ~30KB gzip 但仅线/面/散点，无饼图/箱线/热力/森林，需手写 4 类渲染；
 *  Chart.js ~75KB + 多个插件，仍无原生箱线/热力/森林，且 canvas-only 不利 SVG 导出；
 *  Plotly ~1MB gzip 直接撑爆单文件预算；
 *  ECharts tree-shaken ~200KB gzip，八类图原生支持（custom series 实现森林图），
 *  SVGRenderer 天然支持 SVG 导出 + getDataURL 出 PNG，体积-功能平衡最优。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, ScatterChart, PieChart,
  BoxplotChart, HeatmapChart, CustomChart,
} from 'echarts/charts';
import {
  GridComponent, TitleComponent, TooltipComponent,
  LegendComponent, VisualMapComponent, MarkLineComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { Icon, type IconName } from '@components/ui/Icon';
import { useAppStore } from '@stores/appStore';

echarts.use([
  BarChart, LineChart, ScatterChart, PieChart,
  BoxplotChart, HeatmapChart, CustomChart,
  GridComponent, TitleComponent, TooltipComponent,
  LegendComponent, VisualMapComponent, MarkLineComponent,
  SVGRenderer,
]);

type ChartType =
  | 'bar' | 'line' | 'area' | 'scatter'
  | 'pie' | 'donut' | 'boxplot' | 'forest' | 'heatmap';

interface ChartTypeMeta { key: ChartType; label: string; icon: IconName; hint: string }

const CHART_TYPES: ChartTypeMeta[] = [
  { key: 'bar', label: '柱状图', icon: 'chart', hint: '类别对比' },
  { key: 'line', label: '折线图', icon: 'chart', hint: '趋势变化' },
  { key: 'area', label: '面积图', icon: 'chart', hint: '累积趋势' },
  { key: 'scatter', label: '散点图', icon: 'chart', hint: '相关关系' },
  { key: 'pie', label: '饼图', icon: 'chart', hint: '占比构成' },
  { key: 'donut', label: '环形图', icon: 'chart', hint: '占比构成' },
  { key: 'boxplot', label: '箱线图', icon: 'chart', hint: '分布对比' },
  { key: 'forest', label: '森林图', icon: 'chart', hint: 'Meta 分析' },
  { key: 'heatmap', label: '热力图', icon: 'chart', hint: '矩阵强度' },
];

// 是否支持动态增删数据列
function dynamicCols(t: ChartType) {
  return t === 'bar' || t === 'line' || t === 'area' || t === 'scatter' || t === 'heatmap';
}

function defaultHeaders(t: ChartType): string[] {
  switch (t) {
    case 'pie': case 'donut': return ['名称', '数值'];
    case 'boxplot': return ['组别', '数据（逗号分隔）'];
    case 'forest': return ['研究', '效应量', 'CI下限', 'CI上限', '权重%'];
    case 'heatmap': return ['行标签', '组A', '组B', '组C'];
    default: return ['类别', '系列A', '系列B'];
  }
}

function defaultRows(t: ChartType): string[][] {
  switch (t) {
    case 'pie': case 'donut':
      return [['对照组', '45'], ['干预组', '62'], ['未达标', '18']];
    case 'boxplot':
      return [
        ['对照组', '62,65,68,70,71,73,75,78,80,82'],
        ['干预组', '70,74,76,78,80,82,84,86,88,92'],
      ];
    case 'forest':
      return [
        ['Wang 2023', '0.62', '0.41', '0.94', '32.1'],
        ['Li 2024', '0.55', '0.33', '0.92', '28.5'],
        ['Chen 2024', '0.71', '0.48', '1.05', '24.6'],
        ['Zhao 2025', '0.48', '0.27', '0.85', '14.8'],
      ];
    case 'heatmap':
      return [
        ['心衰', '8', '12', '5'],
        ['心律失常', '15', '9', '3'],
        ['高血压', '20', '14', '7'],
      ];
    default:
      return [
        ['第1周', '45', '38'],
        ['第2周', '52', '44'],
        ['第3周', '61', '50'],
        ['第4周', '68', '59'],
        ['第5周', '74', '66'],
      ];
  }
}

// ===== 颜色 / 主题工具：全部从 CSS 变量派生，零硬编码 =====
function readVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseColor(c: string): [number, number, number] {
  if (!c) return [122, 155, 106];
  const s = c.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  }
  return [122, 155, 106];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function rgba(c: string, alpha: number): string {
  const [r, g, b] = parseColor(c);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface ChartTheme {
  palette: string[];
  text: string;
  subText: string;
  axisLine: string;
  splitLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  canvasBg: string;
}

function getChartTheme(): ChartTheme {
  const accent = readVar('--accent');
  const success = readVar('--success');
  const warning = readVar('--warning');
  const danger = readVar('--danger');
  const textPrimary = readVar('--text-primary');
  const textSecondary = readVar('--text-secondary');
  const border = readVar('--border');
  const bgSurface = readVar('--bg-surface');
  const bgCanvas = readVar('--bg-canvas');

  const a = parseColor(accent);
  const tp = parseColor(textPrimary);
  // 基础 4 色 + 由 accent 向 text-primary 过渡的 3 个深浅色，共 7 色，覆盖绝大多数科研图
  const palette = [
    accent,
    success,
    warning,
    danger,
    mix(a, tp, 0.35),
    mix(a, tp, 0.65),
    mix(a, tp, 0.9),
  ].filter(Boolean);

  return {
    palette,
    text: textPrimary || '#333',
    subText: textSecondary || '#888',
    axisLine: border || '#ccc',
    splitLine: rgba(border || '#ddd', 0.6),
    tooltipBg: bgSurface || '#fff',
    tooltipBorder: border || '#ddd',
    canvasBg: bgCanvas || '#fff',
  };
}

// ===== CSV 解析（支持引号字段） =====
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ===== 统计：四分位数（线性插值，与统计计算器一致） =====
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function boxSummary(raw: string): [number, number, number, number, number] | null {
  const vals = raw.split(/[,，\s]+/).map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));
  if (vals.length === 0) return null;
  vals.sort((x, y) => x - y);
  return [
    vals[0],
    quantile(vals, 0.25),
    quantile(vals, 0.5),
    quantile(vals, 0.75),
    vals[vals.length - 1],
  ];
}

function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ===== 图表配置 =====
interface ChartConfig {
  title: string;
  xLabel: string;
  yLabel: string;
  legend: boolean;
  stacked: boolean;
  smooth: boolean;
  refLine: boolean;
  refValue: string;
}

const AXIS_TYPES: ChartType[] = ['bar', 'line', 'area', 'scatter', 'boxplot', 'forest'];

// ===== 主组件 =====
export function ChartTool() {
  const [type, setType] = useState<ChartType>('bar');
  const [headers, setHeaders] = useState<string[]>(defaultHeaders('bar'));
  const [rows, setRows] = useState<string[][]>(defaultRows('bar'));
  const [cfg, setCfg] = useState<ChartConfig>({
    title: '', xLabel: '', yLabel: '', legend: true, stacked: false, smooth: false,
    refLine: true, refValue: '1',
  });
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');

  const theme = useAppStore((s) => s.theme);
  const mode = useAppStore((s) => s.mode);

  const chartDivRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);

  // 切换图表类型 → 重置为该类型的示例数据
  function switchType(t: ChartType) {
    setType(t);
    setHeaders(defaultHeaders(t));
    setRows(defaultRows(t));
    if (t === 'forest') setCfg((c) => ({ ...c, refValue: '1' }));
  }

  // 数据编辑
  function updateCell(ri: number, ci: number, val: string) {
    setRows((prev) => prev.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? val : c)) : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, headers.map(() => '')]);
  }
  function removeRow(ri: number) {
    setRows((prev) => prev.filter((_, i) => i !== ri));
  }
  function addCol() {
    const name = `系列${String.fromCharCode(65 + headers.length)}`;
    setHeaders((prev) => [...prev, name]);
    setRows((prev) => prev.map((r) => [...r, '']));
  }
  function removeCol(ci: number) {
    if (headers.length <= 2) return;
    setHeaders((prev) => prev.filter((_, j) => j !== ci));
    setRows((prev) => prev.map((r) => r.filter((_, j) => j !== ci)));
  }
  function updateHeader(ci: number, val: string) {
    setHeaders((prev) => prev.map((h, j) => (j === ci ? val : h)));
  }

  function importCSV() {
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) return;
    const w = Math.max(...parsed.map((r) => r.length));
    const norm = parsed.map((r) => {
      const out = [...r];
      while (out.length < w) out.push('');
      return out;
    });
    setHeaders(norm[0].map((h, j) => h.trim() || `列${j + 1}`));
    setRows(norm.slice(1));
    setCsvOpen(false);
    setCsvText('');
  }

  function loadSample() {
    setHeaders(defaultHeaders(type));
    setRows(defaultRows(type));
  }

  // 构建 ECharts option
  const option = useMemo(() => {
    return buildOption(type, headers, rows, cfg);
  }, [type, headers, rows, cfg]);

  // 渲染 / 主题切换时重绘
  useEffect(() => {
    if (!chartDivRef.current) return;
    if (!instRef.current) {
      instRef.current = echarts.init(chartDivRef.current, null, { renderer: 'svg' });
    }
    instRef.current.setOption(option, true);
  }, [option]);

  // 主题/明暗变化 → 重读 token 后重绘
  useEffect(() => {
    if (instRef.current) instRef.current.setOption(option, true);
  }, [theme, mode, option]);

  // 自适应
  useEffect(() => {
    const onResize = () => instRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      instRef.current?.dispose();
      instRef.current = null;
    };
  }, []);

  function exportPNG() {
    if (!instRef.current) return;
    const ct = getChartTheme();
    const url = instRef.current.getDataURL({
      type: 'png', pixelRatio: 2, backgroundColor: ct.canvasBg,
    });
    triggerDownload(url, `selenyx-chart-${type}.png`);
  }

  function exportSVG() {
    if (!instRef.current) return;
    const svg = instRef.current.renderToSVGString();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `selenyx-chart-${type}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const ct = getChartTheme();
  const dyn = dynamicCols(type);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 图表类型选择 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CHART_TYPES.map((t) => (
            <button
              key={t.key}
              className={`btn btn-sm ${type === t.key ? 'btn-primary' : ''}`}
              onClick={() => switchType(t.key)}
              title={t.hint}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px' }}
            >
              <Icon name={t.icon} size={14} strokeWidth={1.8} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'start' }}>
        {/* 图表渲染区 */}
        <div className="card" style={{ padding: 16 }}>
          <div ref={chartDivRef} style={{ width: '100%', height: 460 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={exportPNG} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="download" size={14} /> 导出 PNG
            </button>
            <button className="btn btn-sm" onClick={exportSVG} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="download" size={14} /> 导出 SVG
            </button>
          </div>
        </div>

        {/* 配置面板 */}
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>图表配置</div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            标题
            <input className="input" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} placeholder="图表标题" />
          </label>
          {AXIS_TYPES.includes(type) && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                {type === 'scatter' ? 'X 轴（数值）' : 'X 轴标签'}
                <input className="input" value={cfg.xLabel} onChange={(e) => setCfg({ ...cfg, xLabel: e.target.value })} placeholder="如：时间" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Y 轴标签
                <input className="input" value={cfg.yLabel} onChange={(e) => setCfg({ ...cfg, yLabel: e.target.value })} placeholder="如：得分" />
              </label>
            </>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.legend} onChange={(e) => setCfg({ ...cfg, legend: e.target.checked })} /> 显示图例
          </label>
          {(type === 'bar' || type === 'line' || type === 'area') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.stacked} onChange={(e) => setCfg({ ...cfg, stacked: e.target.checked })} /> 堆叠
            </label>
          )}
          {(type === 'line' || type === 'area') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.smooth} onChange={(e) => setCfg({ ...cfg, smooth: e.target.checked })} /> 平滑曲线
            </label>
          )}
          {type === 'forest' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.refLine} onChange={(e) => setCfg({ ...cfg, refLine: e.target.checked })} /> 无效线
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                无效线位置（OR/RR=1，MD=0）
                <input className="input" value={cfg.refValue} onChange={(e) => setCfg({ ...cfg, refValue: e.target.value })} />
              </label>
            </>
          )}
          <div style={{ fontSize: 11, color: ct.subText, marginTop: 4 }}>
            配色自动跟随当前主题（{theme} · {mode === 'dark' ? '暗' : '明'}），切换主题/明暗图表即时重绘。
          </div>
        </div>
      </div>

      {/* 数据输入区 */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>数据</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setCsvOpen((v) => !v)}>CSV 导入</button>
            <button className="btn btn-sm" onClick={loadSample}>载入示例</button>
            <button className="btn btn-sm" onClick={addRow}>+ 行</button>
            {dyn && <button className="btn btn-sm" onClick={addCol}>+ 列</button>}
          </div>
        </div>

        {csvOpen && (
          <div style={{ marginBottom: 12 }}>
            <textarea
              className="input"
              placeholder={'粘贴 CSV（首行为表头，逗号分隔），例如：\n类别,系列A,系列B\n第1周,45,38\n第2周,52,44'}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ width: '100%', minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={importCSV}>导入并替换</button>
              <button className="btn btn-sm" onClick={() => { setCsvOpen(false); setCsvText(''); }}>取消</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
            <thead>
              <tr>
                <th style={{ width: 36, padding: '4px', borderBottom: '2px solid var(--border)' }} />
                {headers.map((h, ci) => (
                  <th key={ci} style={{ padding: 0, borderBottom: '2px solid var(--border)', minWidth: 90 }}>
                    <input
                      value={h}
                      onChange={(e) => updateHeader(ci, e.target.value)}
                      style={{ width: '100%', border: 'none', padding: '6px 8px', background: 'transparent', fontWeight: 600, fontSize: 12 }}
                    />
                    {dyn && headers.length > 2 && ci > 0 && (
                      <button onClick={() => removeCol(ci)} title="删除列" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '0 8px 2px' }}>×</button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => removeRow(ri)} title="删除行" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>×</button>
                  </td>
                  {headers.map((_, ci) => (
                    <td key={ci} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                      <input
                        value={r[ci] ?? ''}
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        style={{ width: '100%', border: 'none', padding: '6px 8px', background: 'transparent', fontSize: 12, fontFamily: ci === 0 ? 'inherit' : 'var(--font-mono)' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 16 }}>暂无数据，点击「+ 行」或「载入示例」开始</div>
        )}
      </div>
    </div>
  );
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ===== Option 构建器 =====
function baseGrid(cfg: ChartConfig) {
  return {
    left: 64, right: 28, top: cfg.title ? 56 : 36, bottom: 56,
    containLabel: true,
  };
}

function commonAxis(ct: ChartTheme) {
  const axisLine = { lineStyle: { color: ct.axisLine } };
  const axisLabel = { color: ct.subText, fontSize: 11 };
  const splitLine = { lineStyle: { color: ct.splitLine } };
  return { axisLine, axisLabel, splitLine };
}

function buildOption(
  type: ChartType, headers: string[], rows: string[][], cfg: ChartConfig,
): echarts.EChartsCoreOption {
  const ct = getChartTheme();
  const titleComp = cfg.title ? { text: cfg.title, left: 'center', textStyle: { color: ct.text, fontSize: 15, fontWeight: 600 } } : undefined;
  const legendComp = cfg.legend ? { top: cfg.title ? 30 : 6, textStyle: { color: ct.subText } } : undefined;
  const tooltip = { trigger: 'item' as const, backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, textStyle: { color: ct.text } };
  const ax = commonAxis(ct);

  // 类别型：bar / line / area
  if (type === 'bar' || type === 'line' || type === 'area') {
    const cats = rows.map((r) => r[0] ?? '');
    const seriesNames = headers.slice(1);
    const series = seriesNames.map((name, si) => {
      const color = ct.palette[si % ct.palette.length];
      if (type === 'bar') {
        return {
          name, type: 'bar' as const, stack: cfg.stacked ? 'total' : undefined,
          data: rows.map((r) => toNum(r[si + 1])),
          itemStyle: { color, borderRadius: type === 'bar' ? [3, 3, 0, 0] : 0 },
        };
      }
      // line / area
      return {
        name, type: 'line' as const, stack: cfg.stacked ? 'total' : undefined,
        smooth: cfg.smooth,
        data: rows.map((r) => toNum(r[si + 1])),
        itemStyle: { color },
        lineStyle: { color, width: 2 },
        symbol: 'circle', symbolSize: 6,
        areaStyle: type === 'area' ? { color: rgba(color, 0.18) } : undefined,
      };
    });
    return {
      title: titleComp, legend: legendComp, tooltip: { ...tooltip, trigger: 'axis' as const },
      grid: baseGrid(cfg),
      xAxis: { type: 'category' as const, data: cats, name: cfg.xLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel },
      yAxis: { type: 'value' as const, name: cfg.yLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel, splitLine: ax.splitLine },
      color: ct.palette,
      series,
    };
  }

  // 散点图：X 数值
  if (type === 'scatter') {
    const seriesNames = headers.slice(1);
    const series = seriesNames.map((name, si) => {
      const color = ct.palette[si % ct.palette.length];
      return {
        name, type: 'scatter' as const,
        data: rows.map((r) => [toNum(r[0]), toNum(r[si + 1])]),
        symbolSize: 8, itemStyle: { color, opacity: 0.8 },
      };
    });
    return {
      title: titleComp, legend: legendComp, tooltip: { ...tooltip, trigger: 'axis' as const },
      grid: baseGrid(cfg),
      xAxis: { type: 'value' as const, name: cfg.xLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel, splitLine: ax.splitLine },
      yAxis: { type: 'value' as const, name: cfg.yLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel, splitLine: ax.splitLine },
      color: ct.palette,
      series,
    };
  }

  // 饼图 / 环形图
  if (type === 'pie' || type === 'donut') {
    const data = rows.map((r) => ({ name: r[0] ?? '', value: toNum(r[1]) })).filter((d) => d.name);
    return {
      title: titleComp, legend: legendComp, tooltip,
      color: ct.palette,
      series: [{
        type: 'pie' as const,
        radius: type === 'donut' ? ['42%', '68%'] : '68%',
        center: ['50%', '55%'],
        data,
        label: { color: ct.subText, fontSize: 11 },
        itemStyle: { borderColor: ct.canvasBg, borderWidth: 2 },
      }],
    };
  }

  // 箱线图
  if (type === 'boxplot') {
    const cats = rows.map((r) => r[0] ?? '');
    const boxData = rows.map((r) => boxSummary(r[1] ?? ''));
    const valid = boxData.filter(Boolean) as [number, number, number, number, number][];
    const min = valid.length ? Math.min(...valid.map((b) => b[0])) : 0;
    const max = valid.length ? Math.max(...valid.map((b) => b[4])) : 1;
    return {
      title: titleComp, legend: undefined, tooltip: { ...tooltip, trigger: 'item' as const },
      grid: baseGrid(cfg),
      xAxis: { type: 'category' as const, data: cats, name: cfg.xLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel },
      yAxis: { type: 'value' as const, name: cfg.yLabel, nameTextStyle: { color: ct.subText }, ...ax.axisLine, axisLabel: ax.axisLabel, splitLine: ax.splitLine, min: Math.floor(min), max: Math.ceil(max) },
      series: [{
        type: 'boxplot' as const,
        data: boxData,
        itemStyle: { color: rgba(ct.palette[0], 0.35), borderColor: ct.palette[0] },
      }],
    };
  }

  // 森林图（custom series）
  if (type === 'forest') {
    return buildForest(rows, cfg, ct, titleComp);
  }

  // 热力图
  if (type === 'heatmap') {
    return buildHeatmap(headers, rows, cfg, ct, titleComp, legendComp);
  }

  return {};
}

function buildForest(
  rows: string[][], cfg: ChartConfig, ct: ChartTheme, titleComp: unknown,
): echarts.EChartsCoreOption {
  const studies = rows.map((r) => r[0] ?? `研究${rows.indexOf(r) + 1}`);
  // 计算合并效应（固定效应，逆方差加权）
  const items = rows.map((r) => {
    const eff = toNum(r[1]); const lo = toNum(r[2]); const hi = toNum(r[3]);
    const w = toNum(r[4]);
    const se = eff !== 0 && lo !== hi ? Math.abs(Math.log(hi) - Math.log(lo)) / (2 * 1.96) : 1;
    const varLog = se * se;
    return { eff, lo, hi, w: w > 0 ? w : 1 / varLog, varLog };
  });
  const totalW = items.reduce((s, x) => s + x.w, 0) || 1;
  const pooledLog = items.reduce((s, x) => s + Math.log(x.eff) * x.w, 0) / totalW;
  const pooledVar = 1 / totalW;
  const pooled = Math.exp(pooledLog);
  const pooledLo = Math.exp(pooledLog - 1.96 * Math.sqrt(pooledVar));
  const pooledHi = Math.exp(pooledLog + 1.96 * Math.sqrt(pooledVar));

  const allVals = items.flatMap((x) => [x.lo, x.hi]).concat([pooledLo, pooledHi, toNum(cfg.refValue)]);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const pad = (dataMax - dataMin) * 0.12 || 0.5;

  // custom data：[catIdx, eff, lo, hi, weight, isPooled]
  const customData = items.map((x, i) => [i, x.eff, x.lo, x.hi, x.w, 0]);
  customData.push([items.length, pooled, pooledLo, pooledHi, 0, 1]);

  const cats = [...studies, '合并效应'];
  const accent = ct.palette[0];

  const renderItem = (_params: unknown, api: { value: (i: number) => number; coord: (p: number[]) => number[] }) => {
    const catIdx = api.value(0);
    const eff = api.value(1);
    const lo = api.value(2);
    const hi = api.value(3);
    const w = api.value(4);
    const isPooled = api.value(5) === 1;
    const [, y] = api.coord([0, catIdx]);
    const xLo = api.coord([lo, catIdx])[0];
    const xHi = api.coord([hi, catIdx])[0];
    const xEff = api.coord([eff, catIdx])[0];
    if (isPooled) {
      // 菱形
      const dHalf = 7;
      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: xLo, y1: y, x2: xHi, y2: y }, style: { stroke: accent, lineWidth: 2 } },
          {
            type: 'path',
            shape: { pathData: `M ${xEff} ${y - dHalf} L ${xHi} ${y} L ${xEff} ${y + dHalf} L ${xLo} ${y} Z` },
            style: { fill: accent, stroke: accent },
          },
        ],
      };
    }
    const maxW = Math.max(...items.map((x) => x.w));
    const size = maxW > 0 ? 6 + (w / maxW) * 18 : 8;
    return {
      type: 'group',
      children: [
        { type: 'line', shape: { x1: xLo, y1: y, x2: xHi, y2: y }, style: { stroke: accent, lineWidth: 1.4 } },
        { type: 'line', shape: { x1: xLo, y1: y - 4, x2: xLo, y2: y + 4 }, style: { stroke: accent, lineWidth: 1 } },
        { type: 'line', shape: { x1: xHi, y1: y - 4, x2: xHi, y2: y + 4 }, style: { stroke: accent, lineWidth: 1 } },
        { type: 'rect', shape: { x: xEff - size / 2, y: y - size / 2, width: size, height: size }, style: { fill: accent } },
      ],
    };
  };

  return {
    title: titleComp as object,
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, textStyle: { color: ct.text },
      formatter: (p: { dataIndex: number }) => {
        const d = customData[p.dataIndex];
        if (!d) return '';
        if (d[5] === 1) {
          return `<b>合并效应</b><br/>效应量: ${d[1].toFixed(2)}<br/>95% CI: [${d[2].toFixed(2)}, ${d[3].toFixed(2)}]`;
        }
        return `<b>${cats[d[0]]}</b><br/>效应量: ${d[1].toFixed(2)}<br/>95% CI: [${d[2].toFixed(2)}, ${d[3].toFixed(2)}]<br/>权重: ${((d[4] / totalW) * 100).toFixed(1)}%`;
      },
    },
    grid: { left: 110, right: 40, top: cfg.title ? 56 : 30, bottom: 56, containLabel: false },
    xAxis: {
      type: 'value', name: cfg.xLabel || '效应量 (95% CI)', nameLocation: 'middle', nameGap: 32,
      nameTextStyle: { color: ct.subText },
      min: Math.max(0, dataMin - pad), max: dataMax + pad,
      ...commonAxis(ct).axisLine, axisLabel: commonAxis(ct).axisLabel, splitLine: commonAxis(ct).splitLine,
    },
    yAxis: {
      type: 'category', data: cats, inverse: true,
      ...commonAxis(ct).axisLine, axisLabel: { color: ct.subText, fontSize: 11 },
    },
    series: [
      {
        type: 'line',
        data: [],
        silent: true,
        markLine: cfg.refLine
          ? {
              symbol: 'none',
              label: { formatter: `无效线 ${toNum(cfg.refValue)}`, color: ct.subText, fontSize: 10 },
              lineStyle: { color: ct.palette[3] || ct.palette[0], type: 'dashed', width: 1.5 },
              data: [{ xAxis: toNum(cfg.refValue) }],
            }
          : undefined,
      },
      {
        type: 'custom',
        renderItem: renderItem as never,
        encode: { x: [1, 2, 3], y: 0 },
        data: customData,
        clip: true,
      },
    ],
  } as echarts.EChartsCoreOption;
}

function buildHeatmap(
  headers: string[], rows: string[][], cfg: ChartConfig, ct: ChartTheme, titleComp: unknown, legendComp: unknown,
): echarts.EChartsCoreOption {
  const xCats = headers.slice(1);
  const yCats = rows.map((r) => r[0] ?? '');
  const data: [number, number, number][] = [];
  let min = Infinity; let max = -Infinity;
  rows.forEach((r, ri) => {
    headers.slice(1).forEach((_, ci) => {
      const v = toNum(r[ci + 1]);
      data.push([ci, ri, v]);
      if (v < min) min = v;
      if (v > max) max = v;
    });
  });
  if (!isFinite(min)) { min = 0; max = 1; }

  return {
    title: titleComp as object,
    legend: legendComp as object,
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, textStyle: { color: ct.text },
      formatter: (p: { value: number[] }) => `${yCats[p.value[1]]} · ${xCats[p.value[0]]}<br/><b>${p.value[2]}</b>`,
    },
    grid: { left: 80, right: 24, top: cfg.title ? 56 : 30, bottom: 56, containLabel: true },
    xAxis: { type: 'category', data: xCats, splitArea: { show: true }, ...commonAxis(ct).axisLine, axisLabel: commonAxis(ct).axisLabel },
    yAxis: { type: 'category', data: yCats, splitArea: { show: true }, ...commonAxis(ct).axisLine, axisLabel: commonAxis(ct).axisLabel },
    visualMap: {
      min, max, calculable: true, orient: 'horizontal', left: 'center', bottom: 8,
      textStyle: { color: ct.subText },
      inRange: { color: [rgba(ct.palette[0], 0.15), ct.palette[0], ct.palette[3] || ct.palette[0]] },
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: true, color: ct.text, fontSize: 11 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: rgba(ct.text, 0.3) } },
    }],
  } as echarts.EChartsCoreOption;
}
