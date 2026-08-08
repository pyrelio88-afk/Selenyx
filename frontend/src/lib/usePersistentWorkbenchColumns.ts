import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export type WorkbenchPane = 'left' | 'right';

export interface PersistentWorkbenchColumnsOptions {
  storageKey: string;
  initial: { left: number; right: number };
  limits: { left: readonly [number, number]; right: readonly [number, number] };
}

interface PaneSizes {
  left: number;
  right: number;
}

export function clampWorkbenchPaneSize(value: unknown, fallback: number, limits: readonly [number, number]) {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(limits[1], Math.max(limits[0], Math.round(numberValue)));
}

function loadPaneSizes(options: PersistentWorkbenchColumnsOptions): PaneSizes {
  try {
    const stored = JSON.parse(localStorage.getItem(options.storageKey) ?? 'null') as Partial<PaneSizes> | null;
    return {
      left: clampWorkbenchPaneSize(stored?.left, options.initial.left, options.limits.left),
      right: clampWorkbenchPaneSize(stored?.right, options.initial.right, options.limits.right),
    };
  } catch {
    return { ...options.initial };
  }
}

/**
 * Stores desktop pane preferences independently from research data. The
 * keyboard handlers make the same adjustment available without a pointer.
 */
export function usePersistentWorkbenchColumns(options: PersistentWorkbenchColumnsOptions) {
  const [sizes, setSizes] = useState<PaneSizes>(() => loadPaneSizes(options));
  const sizesRef = useRef(sizes);
  const [dragging, setDragging] = useState<WorkbenchPane | null>(null);
  const dragStartRef = useRef<{ pane: WorkbenchPane; x: number; width: number } | null>(null);

  const persist = useCallback((next: PaneSizes) => {
    try { localStorage.setItem(options.storageKey, JSON.stringify(next)); } catch { /* browser storage may be disabled */ }
  }, [options.storageKey]);

  const resize = useCallback((pane: WorkbenchPane, candidate: number, shouldPersist = false) => {
    const current = sizesRef.current;
    const next = {
      ...current,
      [pane]: clampWorkbenchPaneSize(candidate, current[pane], options.limits[pane]),
    } as PaneSizes;
    sizesRef.current = next;
    setSizes(next);
    if (shouldPersist) persist(next);
  }, [options.limits, persist]);

  const pointerDown = useCallback((pane: WorkbenchPane) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pane, x: event.clientX, width: sizesRef.current[pane] };
    setDragging(pane);
  }, []);

  const pointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStartRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.x;
    resize(drag.pane, drag.width + (drag.pane === 'left' ? delta : -delta));
  }, [resize]);

  const finishPointer = useCallback(() => {
    dragStartRef.current = null;
    setDragging(null);
    persist(sizesRef.current);
  }, [persist]);

  const keyDown = useCallback((pane: WorkbenchPane) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    resize(pane, sizesRef.current[pane] + (pane === 'left' ? direction : -direction) * step, true);
  }, [resize]);

  const handleProps = useCallback((pane: WorkbenchPane) => ({
    type: 'button' as const,
    role: 'separator' as const,
    tabIndex: 0,
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': options.limits[pane][0],
    'aria-valuemax': options.limits[pane][1],
    'aria-valuenow': sizes[pane],
    'aria-valuetext': `${pane === 'left' ? '左侧栏' : '右侧检查器'}宽度 ${sizes[pane]} 像素`,
    onPointerDown: pointerDown(pane),
    onPointerMove: pointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    onKeyDown: keyDown(pane),
  }), [finishPointer, keyDown, options.limits, pointerDown, pointerMove, sizes]);

  return useMemo(() => ({
    ...sizes,
    dragging,
    leftHandleProps: handleProps('left'),
    rightHandleProps: handleProps('right'),
  }), [dragging, handleProps, sizes]);
}
