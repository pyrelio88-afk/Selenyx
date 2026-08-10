/**
 * 底部用户区（v4 · WorkBuddy/ClawsGO/Codex 一致范式）
 *
 * 本地应用无账号体系：头像（仙鹤）+ 可编辑昵称；点击弹出浮层——
 * 显示宠物开关 / 外观浅深切换 / 设置（Ctrl+,）/ 检查更新 / 帮助与反馈 / 关于。
 * 设置不进侧边栏导航，统一从这里进。
 */

import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const go = (section?: 'about') => {
    setOpen(false);
    openSettings(section);
  };

  return (
    <div className="user-panel" ref={panelRef}>
      {open && (
        <div className="user-popover" role="menu" aria-label="用户菜单">
          <div className="user-popover-header">
            <span className="user-avatar" aria-hidden="true"><Crane size={20} /></span>
            <input
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
      )}

      <button
        type="button"
        className="user-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="账户与设置"
      >
        <span className="user-avatar" aria-hidden="true"><Crane size={18} /></span>
        {!collapsed && <span className="user-name">{nickname || '本地研究者'}</span>}
        {!collapsed && <Icon name="chevronDown" size={13} />}
      </button>
    </div>
  );
}
