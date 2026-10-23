/**
 * 主题 Hook — 四套两字名 × 昼夜双模式
 * 所有主题共用中性底色，仅强调色不同：森林 / 墨白 / 靛蓝 / 朱砂
 */

import { useContext, createContext, type ReactNode } from 'react';
import { useAppStore, type ThemeName, type ThemeMode } from '@stores/appStore';
import { THEME_OPTIONS } from '@lib/themes';

export { THEME_OPTIONS };

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
