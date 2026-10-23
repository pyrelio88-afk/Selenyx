import { useEffect, useState } from 'react';
import { localApi } from '@services/api';

export type LocalBackendTone = 'checking' | 'online' | 'offline';

export interface LocalBackendStatus {
  label: string;
  tone: LocalBackendTone;
}

export function useLocalBackendStatus(): LocalBackendStatus {
  const [status, setStatus] = useState<LocalBackendStatus>({
    label: '检测本地服务…',
    tone: 'checking',
  });

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (cancelled || checking) return;
      checking = true;
      clearTimeout(timer);
      let delay = 1500;
      try {
        // Internet connectivity does not determine whether loopback is reachable.
        await localApi.health();
        if (!cancelled) setStatus({ label: '后端在线', tone: 'online' });
        delay = 15000;
      } catch {
        if (!cancelled) setStatus({ label: '本机服务未连接', tone: 'offline' });
      } finally {
        checking = false;
        if (!cancelled) timer = setTimeout(check, delay);
      }
    };

    void check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  return status;
}
