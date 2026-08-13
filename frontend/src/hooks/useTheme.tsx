/**
 * 主题 Hook — 四套四字名 × 昼夜双模式
 * 墨白经典 / 纸间豆绿 / 瑞士杂志 / 粗野主义
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
    name: '黑白经典',
    description: '浅灰栏、纯白主区、黑字细线，WorkBuddy 那种',
  },
  {
    key: 'paper-green',
    name: '纸间豆绿',
    description: '近白纸底，豆青只点按钮',
  },
  {
    key: 'minimal-white',
    name: '瑞士杂志',
    description: '白底浅灰栏，花青只点主按钮和左边线',
  },
  {
    key: 'ink-classic',
    name: '粗野主义',
    description: '白底、墨框、硬阴影、朱砂块，不是牙色黄底',
  },
];
