import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { normalCDF } from '@lib/stats';
import { LineChart, ScatterChart, HeatmapChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, ScatterChart, HeatmapChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, TitleComponent, MarkLineComponent, SVGRenderer]);

export function ResultBox({ label, value, note }: { label: string; value: string; note?: string }) {
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
export function InlineChart({ option, height = 260 }: { option: Record<string, unknown>; height?: number }) {
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
export function getStatColors() {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim() || '#7a9b6a';
  const danger = cs.getPropertyValue('--danger').trim() || '#c0432b';
  const textPri = cs.getPropertyValue('--text-primary').trim() || '#2c2a26';
  const textSec = cs.getPropertyValue('--text-secondary').trim() || '#6b6760';
  const border = cs.getPropertyValue('--border').trim() || '#d8d4ca';
  return { accent, danger, textPri, textSec, border };
}

export function StatInput({ label, val, set }: { label: string; val: string; set: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <input className="input" value={val} onChange={(e) => set(e.target.value)} style={{ width: '100%' }} />
    </div>
  );
}


export function parseMatrix(text: string): number[][] {
  return text.trim().split(/\n+/).map((line) =>
    line.trim().split(/[\s,，\t]+/).map(Number).filter((n) => !isNaN(n))
  ).filter((row) => row.length > 0);
}

export function mean(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length; }
export function variance(arr: number[]): number {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1 || 1);
}

/** Cronbach α 信度系数（心理测量/教育测评/量表开发） */

export function inverseNormalCDF(p: number): number {
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
export function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  // Wilson-Hilferty transformation to normal
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const zNorm = z / Math.sqrt(2 / (9 * df));
  return normalCDF(zNorm);
}
