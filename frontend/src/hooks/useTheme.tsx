/**
 * 主题 Hook — 三主题 × 昼夜双模式
 * 纸间豆绿 / 极简素白 / 墨韵丹青
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
  { key: 'paper-green', name: '纸间豆绿', description: '纸质极简 + 新粗野融合，暖纸白底 + 豆绿强调 + 朱砂点缀' },
  { key: 'minimal-white', name: '极简素白', description: 'Notion 风细边大圆角，素白底 + 灰阶层次' },
  { key: 'ink-classic', name: '墨韵丹青', description: '东方纸感，宣纸米底 + 宋体 + 朱砂印章' },
];
