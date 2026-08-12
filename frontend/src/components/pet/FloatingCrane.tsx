/** Quiet in-app fallback for the desktop companion window. */
import { useEffect, useRef, useState } from 'react';
import type { PetCompanionSnapshot } from '@components/pet/PetCompanionBridge';
import './pet-companion.css';

interface Point {
  x: number;
  y: number;
}

interface DragState {
  origin: Point;
  startX: number;
  startY: number;
}

const FALLBACK_SNAPSHOT: PetCompanionSnapshot = {
  pendingCount: 0,
  completedToday: 0,
  failedToday: 0,
  runningToday: 0,
  notice: null,
  summaryText: '今日尚无任务运行',
};

function initialPoint(): Point {
  return {
    x: Math.max(12, window.innerWidth - 104),
    y: Math.max(12, window.innerHeight - 154),
  };
}

function clampPoint(point: Point): Point {
  return {
    x: Math.max(8, Math.min(window.innerWidth - 90, point.x)),
    y: Math.max(8, Math.min(window.innerHeight - 90, point.y)),
  };
}

export function FloatingCrane(props: {
  snapshot?: PetCompanionSnapshot;
  onHide?: () => void;
  onShowTasks?: () => void;
} = {}) {
  // HMR can temporarily retain an earlier caller that supplied no companion
  // state. Treat null-ish data as the inert fallback instead of blanking App.
  const snapshot = props.snapshot ?? FALLBACK_SNAPSHOT;
  const onHide = props.onHide ?? (() => {});
  const onShowTasks = props.onShowTasks ?? (() => {});
  const notice = snapshot.notice;
  const [point, setPoint] = useState<Point>(initialPoint);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);
  const userPositionedRef = useRef(false);

  useEffect(() => {
    if (!notice) return;
    setBubbleOpen(true);
    const timer = window.setTimeout(() => setBubbleOpen(false), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    // The fallback has no native window manager. Preserve the quiet default
    // perch across desktop window resizes until the user explicitly drags it.
    const onResize = () => {
      setPoint((current) => (userPositionedRef.current ? clampPoint(current) : initialPoint()));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const summary = snapshot.summaryText;
  const bubbleText = notice?.message ?? summary;
  const bubbleTitle = notice?.status === 'failed' ? '任务需要查看' : '仙鹤伙伴';
  const status = notice?.status;

  return (
    <div className={`floating-crane ${snapshot.pendingCount > 0 ? 'is-waiting' : ''}`} style={{ left: point.x, top: point.y }}>
      {bubbleOpen && !menuOpen && (
        <button type="button" className="floating-crane-bubble" onClick={() => setBubbleOpen((open) => !open)}>
          <strong>{bubbleTitle}</strong>{bubbleText}
        </button>
      )}
      {menuOpen && (
        <div className="floating-crane-menu" role="menu" aria-label="仙鹤伙伴菜单">
          <button type="button" onClick={() => { setMenuOpen(false); onShowTasks(); }}>查看今日任务</button>
          <button type="button" className="floating-crane-menu-stat" tabIndex={-1}>{summary}</button>
          <button type="button" onClick={onHide}>隐藏宠物</button>
        </div>
      )}
      <button
        type="button"
        className="floating-crane-control"
        aria-label="仙鹤伙伴：点击查看今日进展，右键打开菜单"
        onClick={() => {
          if (!draggedRef.current) {
            setMenuOpen(false);
            setBubbleOpen((open) => !open);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setBubbleOpen(false);
          setMenuOpen((open) => !open);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          draggedRef.current = false;
          dragRef.current = { origin: point, startX: event.clientX, startY: event.clientY };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (Math.abs(dx) + Math.abs(dy) > 4) draggedRef.current = true;
          setPoint(clampPoint({ x: drag.origin.x + dx, y: drag.origin.y + dy }));
        }}
        onPointerUp={() => {
          if (draggedRef.current) userPositionedRef.current = true;
          dragRef.current = null;
        }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        <img src="/brand-crane-cloud-512-v1.png" alt="" draggable={false} className="floating-crane-img" />
        {snapshot.pendingCount > 0 && <span className="floating-crane-pending" title={`待裁决证据 ${snapshot.pendingCount} 条`} />}
        <span className={`floating-crane-status${status ? ` is-${status}` : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}
