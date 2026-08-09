/**
 * 应用内漂浮鹤（Web/移动端降级版桌宠）。
 *
 * 桌面端的真桌宠是 Tauri 透明置顶窗口（desktop/src/pet.rs + public/pet.html）；
 * 非桌面环境用本组件在视口内漫游。pointer-events:none，永不遮挡操作。
 */

import { useEffect, useRef, useState } from 'react';
import { Crane } from '@components/ui/Crane';

interface PetState {
  x: number;
  y: number;
  flip: boolean;
  flying: boolean;
}

export function FloatingCrane() {
  const [state, setState] = useState<PetState>({ x: 0.7, y: 0.7, flip: false, flying: false });
  const targetRef = useRef({ x: 0.3, y: 0.3, flying: false });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 4); // 归一到 60fps 步长
      last = now;
      const current = stateRef.current;
      const target = targetRef.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) {
        // 到达：重新选目标（飞行偏上半屏，步行贴底）
        const flying = Math.random() > 0.5;
        targetRef.current = {
          x: Math.random() * 0.9,
          y: flying ? Math.random() * 0.4 : 0.86 + Math.random() * 0.06,
          flying,
        };
      } else {
        const speed = (target.flying ? 0.0032 : 0.0009) * dt;
        const next = {
          x: current.x + (dx / dist) * speed,
          y: current.y + (dy / dist) * speed,
          flip: Math.abs(dx) > 0.002 ? dx < 0 : current.flip,
          flying: target.flying,
        };
        stateRef.current = next;
        setState(next);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`floating-crane ${state.flying ? 'is-flying' : 'is-walking'}`}
      style={{
        position: 'fixed',
        left: `${state.x * 100}%`,
        top: `${state.y * 100}%`,
        zIndex: 1000,
        pointerEvents: 'none',
        transform: `scaleX(${state.flip ? -1 : 1})`,
        transition: 'transform 120ms ease',
      }}
    >
      <Crane variant="full" size={52} className="floating-crane-svg" />
      <style>{`
        .floating-crane .floating-crane-svg { animation: crane-bob 1.8s ease-in-out infinite; color: var(--text-primary); opacity: .92; }
        .floating-crane.is-flying .floating-crane-svg { animation: crane-fly 700ms ease-in-out infinite; }
        @keyframes crane-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
        @keyframes crane-fly { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-5px) rotate(2deg); } }
        @media (prefers-reduced-motion: reduce) { .floating-crane .floating-crane-svg { animation: none !important; } }
      `}</style>
    </div>
  );
}
