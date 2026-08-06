/**
 * BottomSheet — 移动端底部弹层（Spec v1 通用组件）
 * 85% 高度、drag handle、遮罩点击关闭。详情/筛选/表单/模型选择共用。
 * 桌面端不渲染（由 CSS .mobile-only 控制可见性，组件本身始终渲染但样式隐藏）。
 */
import { type ReactNode, useEffect } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bottom-sheet-handle" />
        {title && <div className="bottom-sheet-title">{title}</div>}
        <div className="bottom-sheet-body">{children}</div>
      </div>
    </>
  );
}
