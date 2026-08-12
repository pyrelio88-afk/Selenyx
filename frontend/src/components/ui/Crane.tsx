/**
 * Shared Selenyx identity mark.
 *
 * The desktop icons and pet already use the user's cloud-pattern crane.  This
 * component keeps in-app identity surfaces (account/avatar/empty-state use)
 * on that exact same asset instead of a separate symbolic SVG.
 */
import type { CSSProperties } from 'react';

export interface CraneProps {
  /** Retained for call-site compatibility; the bitmap is the unified mark. */
  variant?: 'mark' | 'full';
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Retained for compatibility with previous themed SVG callers. */
  crownColor?: string;
  title?: string;
}

export function Crane({ size = 28, className, style, title }: CraneProps) {
  return (
    <img
      src="/brand-crane-cloud-512-v1.png"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', objectFit: 'contain', ...style }}
      alt={title ?? ''}
      title={title}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}

export default Crane;
