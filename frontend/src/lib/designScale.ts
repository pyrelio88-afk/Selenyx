/**
 * v0.03 排印刻度：8pt 网格 + 字号阶梯 + 行高。
 * 视图层应引用这些常量 / CSS token，禁止再发明 11.5 / 14 / 22 等散值。
 */
export const SPACE_PT = 8;

export const TYPE_SCALE = {
  xs: 11,
  sm: 12,
  base: 13.5,
  md: 16,
  lg: 20,
  xl: 26,
  '2xl': 32,
} as const;

export const LEADING = {
  normal: 1.5,
  reading: 1.65,
  relaxed: 1.7,
} as const;

export const RADIUS = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const MOTION_MS = {
  instant: 100,
  fast: 150,
  base: 200,
  slow: 280,
} as const;

export const CINNABAR = '#c7483b';

export function space(n: number): number {
  return SPACE_PT * n;
}

export function isOnGrid(px: number): boolean {
  return px % (SPACE_PT / 2) === 0;
}
