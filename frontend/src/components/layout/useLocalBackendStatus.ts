import { useEffect, useState } from 'react';
import { localApi } from '@services/api';

export type LocalBackendTone = 'checking' | 'online' | 'offline';

export interface LocalBackendStatus {
  label: string;
  tone: LocalBackendTone;
}

/** Shared shell status so desktop and mobile never disagree about local mode. */
export function useLocalBackendStatus(): LocalBackendStatus {
  const [status, setStatus] = useState<LocalBackendStatus>({
    label: '检测本地服务…',
    tone: 'checking',
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setStatus({ label: '网络离线 · 本地数据可用', tone: 'offline' });
        return;
      }
      setStatus({ label: '检测本地服务…', tone: 'checking' });
      try {
        await localApi.health();
        if (!cancelled) setStatus({ label: '后端在线', tone: 'online' });
      } catch {
        if (!cancelled) setStatus({ label: '后端离线 · 前端降级', tone: 'offline' });
      }
    };

    void check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      cancelled = true;
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  return status;
}
