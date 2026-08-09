import type { CSSProperties, ReactNode } from 'react';
import { useIsMobile } from '@lib/useIsMobile';
import { usePersistentWorkbenchColumns } from '@lib/usePersistentWorkbenchColumns';
import '../../styles/workbench-three-column.css';

/**
 * 统一三栏工作台骨架（功能守恒重构 · 第一阶段）。
 *
 * 模式：左「对象/目录」— 中「主工作区」— 右「上下文/证据检查器」。
 * 把此前散落在 References / Pipeline / AIChat / Notes 四个视图里的四套
 * grid 定义与多套 resizer 收敛为单一实现；列宽、拖拽、键盘可达与持久化
 * 全部复用 usePersistentWorkbenchColumns。
 *
 * 功能守恒 / 兼容层：组件不包额外 wrapper，直接渲染 left/center/right 作为
 * grid 子项，栏内的语义类名与样式仍由各视图自己的 CSS 提供。可选
 * `leftWidthVar` / `rightWidthVar` 让组件把当前列宽同时写到视图既有的 CSS
 * 变量上，因此迁移一个视图时其样式表可以完全不动、视觉零变化；新视图则
 * 直接用通用变量 --wb-left-w / --wb-right-w。
 */
export interface ThreeColumnWorkbenchProps {
  /** 列宽持久化 key（各视图独立，沿用原 key 不丢失用户已调宽度） */
  storageKey: string;
  initial: { left: number; right: number };
  limits: { left: readonly [number, number]; right: readonly [number, number] };
  /** 左栏：对象/目录（单个元素，自带语义类名，作为 grid 第 1 列） */
  left: ReactNode;
  /** 中栏：主工作区（单个元素，作为 grid 第 2 列） */
  center: ReactNode;
  /** 右栏：上下文/证据检查器（单个元素，作为 grid 第 3 列） */
  right: ReactNode;
  /** 左栏用途名（用于 resizer aria-label，如「阶段轨」「文献列表」） */
  leftLabel: string;
  /** 右栏用途名（用于 resizer aria-label，如「证据检查器」） */
  rightLabel: string;
  /** 追加到 grid 容器的类名（视图级钩子，如窄屏降级选择器 .pipeline-workbench-grid） */
  className?: string;
  /** 视图既有左栏宽 CSS 变量名（兼容层，如 --pipeline-stage-width） */
  leftWidthVar?: string;
  /** 视图既有右栏宽 CSS 变量名（兼容层，如 --pipeline-evidence-width） */
  rightWidthVar?: string;
  /** 中栏最小宽度（grid minmax），默认 360px */
  centerMin?: number;
  /** 右栏最小宽度（grid minmax），默认 240px */
  rightMin?: number;
  /** 移动端隐藏右栏（右栏内容由视图用 BottomSheet 另行呈现），默认 true */
  collapseRightOnMobile?: boolean;
}

export function ThreeColumnWorkbench({
  storageKey,
  initial,
  limits,
  left,
  center,
  right,
  leftLabel,
  rightLabel,
  className,
  leftWidthVar,
  rightWidthVar,
  centerMin,
  rightMin,
  collapseRightOnMobile = true,
}: ThreeColumnWorkbenchProps) {
  const isMobile = useIsMobile();
  const panes = usePersistentWorkbenchColumns({ storageKey, initial, limits });
  const hideRight = collapseRightOnMobile && isMobile;

  const style = {
    '--wb-left-w': `${panes.left}px`,
    '--wb-right-w': `${panes.right}px`,
    ...(centerMin != null ? { '--wb-center-min': `${centerMin}px` } : {}),
    ...(rightMin != null ? { '--wb-right-min': `${rightMin}px` } : {}),
    ...(leftWidthVar ? { [leftWidthVar]: `${panes.left}px` } : {}),
    ...(rightWidthVar ? { [rightWidthVar]: `${panes.right}px` } : {}),
  } as CSSProperties;

  const gridClass = [
    'wb-grid',
    hideRight ? 'wb-grid--no-right' : '',
    panes.dragging ? 'is-resizing' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={gridClass} style={style}>
      <button
        className="workbench-column-resizer is-left"
        aria-label={`调整${leftLabel}宽度`}
        {...panes.leftHandleProps}
      />
      {left}
      {center}
      {!hideRight && (
        <>
          <button
            className="workbench-column-resizer is-right"
            aria-label={`调整${rightLabel}宽度`}
            {...panes.rightHandleProps}
          />
          {right}
        </>
      )}
    </div>
  );
}
