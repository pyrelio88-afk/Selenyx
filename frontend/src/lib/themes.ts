/** Theme identity: neutral chrome everywhere; themes only change the accent. */
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
  { key: 'forest', name: '森林', description: '抹茶绿只落在按钮、焦点与进度', swatch: '#4b6f5a' },
  { key: 'mono', name: '墨白', description: '纯中性黑白，不引入彩色', swatch: '#262626' },
  { key: 'minimal-white', name: '靛蓝', description: '靛蓝只落在主操作与状态', swatch: '#2e5fa3' },
  { key: 'ink-classic', name: '朱砂', description: '朱砂只落在关键操作与标记', swatch: '#b13833' },
];

export function normalizeTheme(value: unknown): ThemeName {
  return typeof value === 'string' && (THEME_KEYS as readonly string[]).includes(value)
    ? value as ThemeName
    : 'forest';
}
