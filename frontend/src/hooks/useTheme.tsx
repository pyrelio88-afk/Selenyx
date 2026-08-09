/**
 * 主题 Hook — 三主题 × 昼夜双模式
 * 纸间豆绿 / 瑞士 / 墨岩（新粗野主义）
 */

import { useContext, createContext, type ReactNode } from 'react';
import { useAppStore, type ThemeName, type ThemeMode } from '@stores/appStore';

interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  toggleMode: () => void;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, mode, setTheme, toggleMode } = useAppStore();
  return (
    <ThemeContext.Provider value={{ theme, mode, toggleMode, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export const THEME_OPTIONS: { key: ThemeName; name: string; description: string }[] = [
  {
    key: 'mono',
    name: '墨白',
    description: '黑白极简、1px 细线、零阴影，焦点清晰',
  },
  {
    key: 'paper-green',
    name: '纸间豆绿',
    description: '暖纸白、豆绿强调、克制的 1.5px 边线与硬影',
  },
  {
    key: 'minimal-white',
    name: '瑞士蓝',
    description: '白底蓝辅、严格网格、小圆角与无装饰阴影',
  },
  {
    key: 'ink-classic',
    name: '墨岩·新粗野',
    description: '东方墨色、朱砂状态、粗边框与块面硬影',
  },
];
