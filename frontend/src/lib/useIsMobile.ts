/**
 * useIsMobile — 移动端断点检测（Selenyx Mobile Spec v1）
 * 断点 768px：≤768px 视为移动端（与 MobileShell/TopBar 显示阈值一致）。
 * SSR 安全：首次渲染按 window 是否存在判定，避免 hydration 不匹配。
 */
import { useEffect, useState } from 'react';

const MQ = '(max-width: 768px)';

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia(MQ).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return mobile;
}
