/**
 * 连接器 — 外部服务与本机能力的状态总览（P1 只读 / P6 后端汇总端点）
 *
 * 只读状态卡：本机后端、LLM 网关、Zotero、Ollama、学术检索。
 * 不做 OAuth；每项给出跳转入口（设置/工具箱）。
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { localApi, zoteroApi } from '@services/api';

interface ConnectorState {
  key: string;
  name: string;
  icon: IconName;
  desc: string;
  status: 'checking' | 'ok' | 'off' | 'unavailable';
  detail: string;
  action?: { label: string; view: 'settings' | 'tools' };
}

export function ConnectorsView() {
  const setView = useAppStore((s) => s.setView);
  const [items, setItems] = useState<ConnectorState[]>([
    { key: 'backend', name: '本机后端', icon: 'chip', desc: 'SQLite 存储 / RAG 索引 / 密钥网关', status: 'checking', detail: '检测中…', action: { label: '设置', view: 'settings' } },
    { key: 'llm', name: 'LLM 网关', icon: 'sparkles', desc: 'BYOK 密钥代理（密钥不出本机）', status: 'checking', detail: '检测中…', action: { label: '配置 API', view: 'settings' } },
    { key: 'zotero', name: 'Zotero', icon: 'references', desc: '读取本机 Zotero 文献库（只读）', status: 'checking', detail: '检测中…' },
    { key: 'scholarly', name: '学术检索', icon: 'globe', desc: 'Crossref / arXiv / OpenAlex 元数据', status: 'ok', detail: '经本机后端代理，随检索调用', action: { label: '文献库', view: 'tools' } },
    { key: 'ollama', name: 'Ollama 本地模型', icon: 'chip', desc: '本地运行的开源模型（可选）', status: 'off', detail: '需在设置页按引导安装', action: { label: '查看引导', view: 'settings' } },
  ]);

  useEffect(() => {
    let cancelled = false;
    const patch = (key: string, part: Partial<ConnectorState>) => {
      if (!cancelled) setItems((prev) => prev.map((c) => (c.key === key ? { ...c, ...part } : c)));
    };
    (async () => {
      try {
        const health = await localApi.health();
        patch('backend', { status: 'ok', detail: `运行中 · v${health.version} · SQLite 本机存储` });
        patch('llm', health.llmConfigured
          ? { status: 'ok', detail: '网关已配置密钥，可直接对话' }
          : { status: 'off', detail: '未配置密钥；到设置页配置 API 或使用前端直连' });
      } catch {
        patch('backend', { status: 'unavailable', detail: '未连接；桌面版自动启动，开发用 npm run dev:local' });
        patch('llm', { status: 'unavailable', detail: '后端离线，网关不可用' });
      }
      try {
        const z = await zoteroApi.status();
        patch('zotero', { status: 'ok', detail: `已连接 · API v${z.apiVersion}` });
      } catch {
        patch('zotero', { status: 'off', detail: '未检测到本机 Zotero；启动 Zotero 后可用' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const STATUS_LABEL: Record<ConnectorState['status'], string> = {
    checking: '检测中', ok: '已连接', off: '未启用', unavailable: '不可用',
  };
  const STATUS_COLOR: Record<ConnectorState['status'], string> = {
    checking: 'var(--text-muted)', ok: 'var(--success)', off: 'var(--text-muted)', unavailable: 'var(--danger)',
  };

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">连接器</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Selenyx 与本机能力、外部服务的连接状态。数据默认留在本机。
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {items.map((c) => (
          <div key={c.key} className="card" style={{ padding: 16, display: 'grid', gap: 8, alignContent: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={c.icon} size={20} />
              <strong style={{ fontSize: 14.5, flex: 1 }}>{c.name}</strong>
              <span style={{ fontSize: 11, color: STATUS_COLOR[c.status], fontWeight: 700 }}>{STATUS_LABEL[c.status]}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.desc}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.detail}</p>
            {c.action && (
              <button type="button" className="btn" onClick={() => setView(c.action!.view)} style={{ justifySelf: 'start', minHeight: 32, fontSize: 12 }}>
                {c.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
