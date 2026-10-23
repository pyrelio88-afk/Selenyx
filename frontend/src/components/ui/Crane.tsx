import type { CSSProperties } from 'react';

export interface CraneProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Crane({ size = 28, className, style, title }: CraneProps) {
  return (
    <img
      src="/brand-crane-cloud-512-v1.png"
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={className}
      style={{ objectFit: 'contain', ...style }}
    />
  );
}

export default Crane;
