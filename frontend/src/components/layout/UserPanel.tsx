/**
 * 底部用户区（v4 · WorkBuddy/ClawsGO/Codex 一致范式）
 *
 * 本地应用无账号体系：头像（仙鹤）+ 可编辑昵称；点击弹出浮层——
 * 显示宠物开关 / 外观浅深切换 / 设置（Ctrl+,）/ 检查更新 / 帮助与反馈 / 关于。
 * 设置不进侧边栏导航，统一从这里进。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { Crane } from '@components/ui/Crane';

export function UserPanel({ collapsed }: { collapsed: boolean }) {
  const {
    nickname, setNickname,
    petEnabled, setPetEnabled,
    mode, setMode,
    openSettings,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    bottom: number;
    left: number;
    maxHeight: number;
    width: number;
  } | null>(null);

  const updatePopoverPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 8;
    // The portal is deliberately viewport-constrained as well as sidebar-
    // constrained. This keeps the panel usable if a desktop window becomes
    // unusually narrow instead of letting its right edge escape the viewport.
    const width = Math.min(280, Math.max(0, window.innerWidth - gutter * 2));
    setPopoverPosition({
      // Anchor upward from the trigger so the menu never falls below the
      // desktop viewport. The portal means sidebar scrolling cannot clip it.
      bottom: Math.max(gutter, window.innerHeight - rect.top + gutter),
      left: Math.min(Math.max(rect.left, gutter), window.innerWidth - width - gutter),
      maxHeight: Math.max(0, Math.min(480, rect.top - gutter * 2)),
      width,
    });
  }, []);

  const closePopover = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closePopover();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closePopover();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    const frame = window.requestAnimationFrame(() => nicknameRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
      window.cancelAnimationFrame(frame);
    };
  }, [closePopover, open]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    return () => window.removeEventListener('resize', updatePopoverPosition);
  }, [open, updatePopoverPosition]);

  const go = (section?: 'about') => {
    closePopover(false);
    openSettings(section);
  };

  const popover = open && popoverPosition ? (
    <div
      ref={popoverRef}
      id="user-menu"
      className="user-popover"
      role="menu"
      aria-label="用户菜单"
      style={{ position: 'fixed', ...popoverPosition }}
    >
      <div className="user-popover-header">
        <span className="user-avatar" aria-hidden="true"><Crane size={20} /></span>
        <input
          ref={nicknameRef}
          className="user-nickname"
          value={nickname}
          placeholder="点击设置昵称"
          onChange={(event) => setNickname(event.target.value)}
          aria-label="昵称"
          maxLength={24}
        />
      </div>

      <div className="user-popover-row">
        <span>显示宠物</span>
        <button
          type="button"
          role="switch"
          aria-checked={petEnabled}
          className={`v4-switch ${petEnabled ? 'on' : ''}`}
          onClick={() => setPetEnabled(!petEnabled)}
        >
          <span className="v4-switch-dot" />
        </button>
      </div>
      <div className="user-popover-row">
        <span>外观</span>
        <div className="v4-segmented" role="group" aria-label="外观模式">
          <button type="button" className={mode === 'light' ? 'active' : ''} onClick={() => setMode('light')}>浅色</button>
          <button type="button" className={mode === 'dark' ? 'active' : ''} onClick={() => setMode('dark')}>深色</button>
        </div>
      </div>

      <div className="user-popover-divider" />

      <button type="button" className="user-popover-item" onClick={() => go()}>
        <Icon name="settings" size={15} /> 设置 <kbd>Ctrl+,</kbd>
      </button>
      <a
        className="user-popover-item"
        href="https://github.com/pyrelio88-afk/Selenyx/releases"
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="download" size={15} /> 检查更新
      </a>
      <a
        className="user-popover-item"
        href="https://github.com/pyrelio88-afk/Selenyx/issues"
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="warning" size={15} /> 帮助与反馈
      </a>
      <button type="button" className="user-popover-item" onClick={() => go('about')}>
        <Icon name="dashboard" size={15} /> 关于
      </button>
    </div>
  ) : null;

  return (
    <div className="user-panel" ref={panelRef}>
      <button
        ref={triggerRef}
        type="button"
        className="user-trigger"
        onClick={() => {
          if (open) closePopover();
          else {
            restoreFocusRef.current = false;
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="user-menu"
        title="账户与设置"
      >
        <span className="user-avatar" aria-hidden="true"><Crane size={46} /></span>
        {!collapsed && <span className="user-name">{nickname || '本地研究者'}</span>}
        {!collapsed && <Icon name="chevronDown" size={13} />}
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
