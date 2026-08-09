/**
 * Selenyx 品牌鹤（展翼丹顶鹤）—— 透明 SVG，替代位图 PNG。
 *
 * 设计：细线勾勒的展翼鹤侧影，头顶一点朱砂。线条用 currentColor（继承
 * 上下文文字色），丹顶用主题 --accent，因此三套主题与日夜模式自动换肤，
 * 无需为每个主题单独出图。
 *
 * 变体：
 *  - `mark`  小型导航鹤：轮廓最简，用于侧栏/顶栏小尺寸（默认）。
 *  - `full`  完整展翼鹤：带羽翼层次与尾羽，用于启动/空状态/品牌页。
 */
import type { CSSProperties } from 'react';

export interface CraneProps {
  variant?: 'mark' | 'full';
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 丹顶颜色，默认取主题 accent */
  crownColor?: string;
  title?: string;
}

export function Crane({
  variant = 'mark',
  size = 28,
  className,
  style,
  crownColor = '#c7483b',
  title,
}: CraneProps) {
  const strokeWidth = variant === 'full' ? 1.5 : 2;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}

      {/* 展开的翅膀：自背部大幅上扬 */}
      <path d="M33 33 C37 24 45 14 56 8 C50 17 45 26 43 35" />
      {variant === 'full' && <path d="M35 34 C41 28 50 22 59 19" />}
      {variant === 'full' && <path d="M36 36 C43 32 51 29 58 28" opacity={0.7} />}

      {/* 身体：流线椭圆 */}
      <path d="M27 38 C25 43 30 47 38 47 C47 47 52 43 51 38 C50 33 44 31 38 32 C32 33 28 35 27 38 Z" />

      {/* S 形长颈：自胸口优雅上扬至头部 */}
      <path d="M29 37 C24 33 20 27 19 21 C18 16 20 13 23 12" />
      <path d="M31 37 C27 33 24 28 23 22" opacity={0.55} />

      {/* 头部与喙 */}
      <path d="M23 12 C24 11 26 11 27 12 L16 15 C18 12 20 11 23 12 Z" />

      {/* 丹顶（朱砂） */}
      <circle cx="23" cy="10.6" r={variant === 'full' ? 2 : 2.2} fill={crownColor} stroke="none" />

      {/* 尾羽 */}
      {variant === 'full' ? (
        <>
          <path d="M51 41 C55 43 57 46 58 49" />
          <path d="M50 44 C53 46 55 48 56 51" opacity={0.7} />
        </>
      ) : (
        <path d="M51 41 C55 43 57 46 58 49" />
      )}

      {/* 细腿（一前一后） */}
      <path d="M35 47 L34 58" />
      <path d="M43 47 L45 58" opacity={0.8} />
    </svg>
  );
}

export default Crane;
