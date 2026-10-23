import { useEffect, useRef, useState } from 'react';
import { Icon } from '@components/ui/Icon';
import {
  dismissToast,
  resolveConfirm,
  subscribeConfirm,
  subscribeToasts,
  type ConfirmRequest,
  type ToastItem,
} from '@lib/appFeedback';

interface PendingConfirmState {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

const TOAST_ICON = { info: 'sparkles', success: 'check', error: 'warning' } as const;

export function AppFeedback() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<PendingConfirmState | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => subscribeToasts(setToasts), []);
  useEffect(() => subscribeConfirm(setPending), []);

  useEffect(() => {
    if (!pending) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (pending.request.danger ? cancelRef.current : confirmRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        resolveConfirm(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const first = cancelRef.current;
      const second = confirmRef.current;
      if (!first || !second) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        second.focus();
      } else if (!event.shiftKey && document.activeElement === second) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus({ preventScroll: true });
    };
  }, [pending]);

  return (
    <>
      <div className="feedback-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`feedback-toast is-${toast.tone}`} role="status">
            <Icon name={TOAST_ICON[toast.tone]} size={15} />
            <span>{toast.message}</span>
            <button type="button" className="feedback-toast-close" onClick={() => dismissToast(toast.id)} aria-label="关闭提示">
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>

      {pending && (
        <div
          className="feedback-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) resolveConfirm(false);
          }}
        >
          <div className="feedback-confirm-card" role="dialog" aria-modal="true" aria-labelledby="feedback-confirm-title">
            <div className={`feedback-confirm-icon ${pending.request.danger ? 'is-danger' : ''}`}>
              <Icon name={pending.request.danger ? 'warning' : 'shield'} size={19} />
            </div>
            <div className="feedback-confirm-copy">
              <h2 id="feedback-confirm-title">{pending.request.title}</h2>
              {pending.request.message && <p>{pending.request.message}</p>}
            </div>
            <div className="feedback-confirm-actions">
              <button ref={cancelRef} type="button" className="btn" onClick={() => resolveConfirm(false)}>
                {pending.request.cancelLabel ?? '取消'}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`btn ${pending.request.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => resolveConfirm(true)}
              >
                {pending.request.confirmLabel ?? (pending.request.danger ? '确认删除' : '确认')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
