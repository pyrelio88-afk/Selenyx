/** Theme identity: crisp neutral surfaces with expressive scholarly accents. */
export const THEME_KEYS = ['forest', 'mono', 'minimal-white', 'ink-classic'] as const;
export type ThemeName = (typeof THEME_KEYS)[number];

export interface ThemeOption {
  key: ThemeName;
  /** Product-facing names stay exactly two characters. */
  name: string;
  description: string;
  swatch: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { key: 'forest', name: '森林', description: 'Qoder 森林抹茶绿，温润克制地落在主操作、导航高亮与进度', swatch: '#386b52' },
  { key: 'mono', name: '墨白', description: '纯粹黑白学术中性，不引入彩色视觉干扰', swatch: '#242926' },
  { key: 'minimal-white', name: '靛蓝', description: '清朗靛蓝点缀关键交互、焦点环与状态标记', swatch: '#2b5ca8' },
  { key: 'ink-classic', name: '朱砂', description: '传统朱砂印色聚焦核心落锤操作与待审标记', swatch: '#b33932' },
];

export function normalizeTheme(value: unknown): ThemeName {
  return typeof value === 'string' && (THEME_KEYS as readonly string[]).includes(value)
    ? value as ThemeName
    : 'forest';
}
