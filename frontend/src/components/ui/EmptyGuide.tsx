import type { ReactNode } from 'react';

/** 空状态：只讲事，不画凑出来的鸟。 */
export function EmptyGuide({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-guide card">
      <h2>{title}</h2>
      <div className="empty-guide-body">{children}</div>
      {action ? <div className="empty-guide-action">{action}</div> : null}
    </div>
  );
}
