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
  { key: 'paper-green', name: '纸间豆绿', description: '纸质极简 + 新粗野融合，暖纸白底 + 豆绿强调 + 朱砂点缀' },
  { key: 'minimal-white', name: '瑞士杂志', description: '瑞士杂志风，白底蓝辅 + 网格系统 + 功能主义 + 高对比无装饰' },
  { key: 'ink-classic', name: '墨岩', description: '新粗野主义 × 东方墨韵，粗边框 + 块面阴影 + 宣纸底色' },
];
