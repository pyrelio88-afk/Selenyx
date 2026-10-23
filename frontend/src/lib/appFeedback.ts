export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

type ToastListener = (items: ToastItem[]) => void;
type ConfirmListener = (pending: PendingConfirm | null) => void;

const toastListeners = new Set<ToastListener>();
const confirmListeners = new Set<ConfirmListener>();
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();
let toasts: ToastItem[] = [];
let pendingConfirm: PendingConfirm | null = null;
let toastSeq = 0;

function emitToasts() {
  for (const listener of toastListeners) listener([...toasts]);
}

function emitConfirm() {
  for (const listener of confirmListeners) listener(pendingConfirm);
}

export function subscribeToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  listener([...toasts]);
  return () => { toastListeners.delete(listener); };
}

export function subscribeConfirm(listener: ConfirmListener): () => void {
  confirmListeners.add(listener);
  listener(pendingConfirm);
  return () => { confirmListeners.delete(listener); };
}

export function dismissToast(id: number) {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  toasts = toasts.filter((item) => item.id !== id);
  emitToasts();
}

export function notify(message: string, tone: ToastTone = 'info', duration = 3600): number {
  const id = ++toastSeq;
  toasts = [...toasts.slice(-2), { id, message, tone }];
  emitToasts();
  dismissTimers.set(id, setTimeout(() => dismissToast(id), duration));
  return id;
}

export function resolveConfirm(confirmed: boolean) {
  const current = pendingConfirm;
  pendingConfirm = null;
  emitConfirm();
  current?.resolve(confirmed);
}

/** 页面内确认框，替代 window.confirm；同一时刻只保留一个请求。 */
export function confirmAction(request: ConfirmRequest | string): Promise<boolean> {
  if (pendingConfirm) resolveConfirm(false);
  return new Promise((resolve) => {
    pendingConfirm = { request: typeof request === 'string' ? { title: request } : request, resolve };
    emitConfirm();
  });
}
