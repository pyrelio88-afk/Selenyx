/**
 * 连接器 — 本机能力状态、显式学术探测与可配置 MCP server。
 *
 * MCP 表单保持在页面流内（不是会被卡片裁剪的浮层）；stdio 参数一行一个，
 * 后端会把它们作为 argv 传给 create_subprocess_exec，而不是 shell 字符串。
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from '@components/ui/Icon';
import {
  connectorsApi,
  parseMcpArgs,
  type AcademicProbe,
  type ConnectorOverview,
  type ConnectorStatus,
  type McpServer,
  type McpServerInput,
} from '@services/connectors';

type McpDraft = {
  name: string;
  transport: 'stdio' | 'sse';
  command: string;
  argsText: string;
  url: string;
  timeoutSeconds: string;
  enabled: boolean;
};

const EMPTY_DRAFT: McpDraft = {
  name: '', transport: 'stdio', command: '', argsText: '', url: '', timeoutSeconds: '10', enabled: true,
};

const CONNECTOR_ICONS: Record<string, IconName> = {
  backend: 'chip',
  'llm-gateway': 'sparkles',
  embedding: 'chip',
  zotero: 'references',
  scholarly: 'globe',
  mcp: 'link',
};

const STATUS_LABEL: Record<ConnectorStatus, string> = {
  ok: '已连接',
  off: '未启用',
  error: '需处理',
  unknown: '未探测',
  disabled: '已禁用',
};

const STATUS_COLOR: Record<ConnectorStatus, string> = {
  ok: 'var(--success)',
  off: 'var(--text-muted)',
  error: 'var(--danger)',
  unknown: 'var(--text-muted)',
  disabled: 'var(--text-muted)',
};

const CARD_GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12,
};

const LONG_TEXT: React.CSSProperties = {
  minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
};

function statusLabel(status: ConnectorStatus): string {
  return STATUS_LABEL[status] ?? '未知';
}

function toDraft(server: McpServer): McpDraft {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command,
    argsText: server.args.join('\n'),
    url: server.url,
    timeoutSeconds: String(server.timeoutSeconds),
    enabled: server.enabled,
  };
}

function buildPayload(draft: McpDraft): McpServerInput | null {
  const timeoutSeconds = Number(draft.timeoutSeconds);
  if (!draft.name.trim() || !Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 30) return null;
  return {
    name: draft.name.trim(),
    transport: draft.transport,
    command: draft.command.trim(),
    args: parseMcpArgs(draft.argsText),
    url: draft.url.trim(),
    timeoutSeconds,
    enabled: draft.enabled,
  };
}

function ConnectorCard({ item }: { item: { key: string; name: string; status: ConnectorStatus; detail: string } }) {
  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon name={CONNECTOR_ICONS[item.key] ?? 'link'} size={20} />
        <strong style={{ fontSize: 14.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</strong>
        <span style={{ fontSize: 11, color: STATUS_COLOR[item.status], fontWeight: 700, flexShrink: 0 }}>{statusLabel(item.status)}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, ...LONG_TEXT }}>{item.detail}</p>
    </div>
  );
}

function McpCard({
  server, busy, onProbe, onEdit, onRemove,
}: {
  server: McpServer;
  busy: boolean;
  onProbe: (server: McpServer) => void;
  onEdit: (server: McpServer) => void;
  onRemove: (server: McpServer) => void;
}) {
  const endpoint = server.transport === 'stdio'
    ? [server.command, ...server.args].filter(Boolean).join(' ')
    : server.url;
  const serverVersion = [server.serverInfo?.name, server.serverInfo?.version].filter(Boolean).join(' · ');
  return (
    <article className="card" style={{ padding: 16, display: 'grid', gap: 9, alignContent: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon name="link" size={20} />
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14.5 }} title={server.name}>{server.name}</strong>
        <span style={{ fontSize: 11, color: STATUS_COLOR[server.status], fontWeight: 700, flexShrink: 0 }}>{statusLabel(server.status)}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)' }}>
        <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>{server.transport === 'stdio' ? 'stdio（本机）' : 'HTTP / SSE'}</span>
        {!server.enabled && <span style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>已禁用</span>}
        {serverVersion && <span title={serverVersion} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{serverVersion}</span>}
      </div>
      <p title={endpoint} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-secondary)', ...LONG_TEXT }}>
        {endpoint || '尚未填写端点'}
      </p>
      {server.lastError && <p role="alert" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: 'var(--danger)', ...LONG_TEXT }}>{server.lastError}</p>}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
        {server.capabilities.length === 0 ? (
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>尚未取得工具能力；探测后才会加入 agent 白名单。</span>
        ) : server.capabilities.map((capability) => (
          <span key={capability.tool} title={capability.tool} style={{ maxWidth: '100%', fontSize: 10.5, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {capability.name}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
        <button type="button" className="btn btn-primary" onClick={() => onProbe(server)} disabled={busy} style={{ minHeight: 34, fontSize: 12 }}>
          <Icon name="retry" size={13} /> {busy ? '探测中…' : '探测'}
        </button>
        <button type="button" className="btn" onClick={() => onEdit(server)} disabled={busy} style={{ minHeight: 34, fontSize: 12 }}>
          <Icon name="pencil" size={13} /> 编辑
        </button>
        <button type="button" className="btn" onClick={() => onRemove(server)} disabled={busy} style={{ minHeight: 34, fontSize: 12, color: 'var(--danger)' }}>
          <Icon name="trash" size={13} /> 删除
        </button>
      </div>
    </article>
  );
}

export function ConnectorsView() {
  const [overview, setOverview] = useState<ConnectorOverview | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [academicProbe, setAcademicProbe] = useState<AcademicProbe | null>(null);
  const [offline, setOffline] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpDraft>(EMPTY_DRAFT);
  const [actionError, setActionError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await connectorsApi.overview();
      setOverview(payload);
      setServers(payload.mcpServers);
      setAcademicProbe(payload.academicProbe);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setActionError('');
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (server: McpServer) => {
    setActionError('');
    setDraft(toDraft(server));
    setEditingId(server.id);
    setShowForm(true);
  };

  const submit = async () => {
    const payload = buildPayload(draft);
    if (!payload) {
      setActionError('请填写名称，并将超时设为 1–30 秒。');
      return;
    }
    setBusyKey('form');
    setActionError('');
    try {
      const saved = editingId
        ? await connectorsApi.updateMcp(editingId, payload)
        : await connectorsApi.createMcp(payload);
      setServers((previous) => editingId
        ? previous.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...previous]);
      resetForm();
    } catch (error) {
      setActionError(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const probeAcademic = async () => {
    setBusyKey('academic');
    setActionError('');
    try {
      const result = await connectorsApi.probeAcademic(true);
      setAcademicProbe(result);
      setOverview((previous) => previous ? { ...previous, academicProbe: result } : previous);
    } catch (error) {
      setActionError(`学术检索探测失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const probeServer = async (server: McpServer) => {
    setBusyKey(`probe:${server.id}`);
    setActionError('');
    try {
      const result = await connectorsApi.probeMcp(server.id);
      setServers((previous) => previous.map((item) => (item.id === server.id ? result.server : item)));
      if (!result.ok) setActionError(`${server.name}：${result.detail}`);
    } catch (error) {
      setActionError(`探测失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const removeServer = async (server: McpServer) => {
    if (!window.confirm(`删除 MCP server「${server.name}」？此操作不会删除其本机程序。`)) return;
    setBusyKey(`remove:${server.id}`);
    setActionError('');
    try {
      await connectorsApi.removeMcp(server.id);
      setServers((previous) => previous.filter((item) => item.id !== server.id));
      if (editingId === server.id) resetForm();
    } catch (error) {
      setActionError(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const builtinItems = [
    {
      key: 'backend', name: '本机后端', status: offline ? 'error' as ConnectorStatus : 'ok' as ConnectorStatus,
      detail: offline ? '未连接；桌面版会自动启动本机后端。' : 'SQLite、RAG 与连接器配置均保留在本机。',
    },
    ...(overview?.connectors ?? []),
  ];

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }}>
      <div className="view-header" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="view-title">连接器</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)', ...LONG_TEXT }}>
            本机优先：MCP 配置、能力快照与诊断均只留在这台电脑；远程端点只在你点击探测或 agent 调用时访问。
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={startCreate} style={{ minHeight: 38, flexShrink: 0 }}>
          <Icon name="plus" size={15} /> 添加 MCP server
        </button>
      </div>

      {offline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)', ...LONG_TEXT }}>
          本机后端未连接，无法读取或修改连接器。桌面版会自动启动后端；开发环境请运行 <code>npm run dev:local</code>。
        </div>
      )}
      {actionError && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--danger)', ...LONG_TEXT }}>
          {actionError}
        </div>
      )}

      <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>本机与研究服务</h2>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>状态不会上传任何本机数据。</span>
        </div>
        <div style={CARD_GRID}>{builtinItems.map((item) => <ConnectorCard key={item.key} item={item} />)}</div>
      </section>

      <section className="card" style={{ padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>学术检索真实探测</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', ...LONG_TEXT }}>
              OpenAlex、Crossref、PubMed、arXiv 各使用一个轻量请求；单源超时 3 秒，结果缓存 60 秒。
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void probeAcademic()} disabled={busyKey === 'academic'} style={{ minHeight: 36, flexShrink: 0 }}>
            <Icon name="retry" size={14} /> {busyKey === 'academic' ? '探测中…' : '探测学术检索'}
          </button>
        </div>
        {!academicProbe ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>尚未探测。点击按钮后才会访问公开学术 API。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 8 }}>
            {academicProbe.connectors.map((item) => (
              <div key={item.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '9px 10px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                  <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{item.name}</strong>
                  <span style={{ color: item.status === 'ok' ? 'var(--success)' : 'var(--danger)', fontSize: 11, flexShrink: 0 }}>{item.status === 'ok' ? '可达' : item.status === 'timeout' ? '超时' : '失败'}</span>
                </div>
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 11.5, ...LONG_TEXT }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15 }}>MCP server</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>探测成功的工具会以 <code>mcp:&lt;server-id&gt;/&lt;tool&gt;</code> 加入主 agent 白名单。</p>
          </div>
          {!showForm && <button type="button" className="btn" onClick={startCreate} style={{ minHeight: 34 }}><Icon name="plus" size={13} /> 添加</button>}
        </div>

        {showForm && (
          <div className="card" style={{ padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 14.5 }}>{editingId ? '编辑 MCP server' : '添加 MCP server'}</h3>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>保存后请显式探测；未探测的工具不会交给 agent。</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 5, minWidth: 0, fontSize: 12 }}>名称
                <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="如：本机文献分析" aria-label="MCP server 名称" style={{ minWidth: 0, minHeight: 38 }} />
              </label>
              <label style={{ display: 'grid', gap: 5, minWidth: 0, fontSize: 12 }}>传输
                <select value={draft.transport} onChange={(event) => setDraft((prev) => ({ ...prev, transport: event.target.value as McpDraft['transport'] }))} aria-label="MCP 传输" style={{ minHeight: 38 }}>
                  <option value="stdio">stdio（本机进程）</option>
                  <option value="sse">HTTP / SSE（公网端点）</option>
                </select>
              </label>
            </div>
            {draft.transport === 'stdio' ? (
              <>
                <label style={{ display: 'grid', gap: 5, minWidth: 0, fontSize: 12 }}>可执行文件绝对路径
                  <input value={draft.command} onChange={(event) => setDraft((prev) => ({ ...prev, command: event.target.value }))} placeholder="C:\\Tools\\my-mcp.exe" aria-label="stdio command" style={{ minWidth: 0, minHeight: 38 }} />
                </label>
                <label style={{ display: 'grid', gap: 5, minWidth: 0, fontSize: 12 }}>参数（一行一个；不使用 shell）
                  <textarea value={draft.argsText} onChange={(event) => setDraft((prev) => ({ ...prev, argsText: event.target.value }))} rows={3} placeholder={'--project\nD:\\Research'} aria-label="stdio 参数" style={{ minWidth: 0, resize: 'vertical' }} />
                </label>
              </>
            ) : (
              <label style={{ display: 'grid', gap: 5, minWidth: 0, fontSize: 12 }}>公开 HTTP / SSE URL
                <input value={draft.url} onChange={(event) => setDraft((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://mcp.example.org/mcp" aria-label="MCP SSE URL" style={{ minWidth: 0, minHeight: 38 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 11.5, ...LONG_TEXT }}>为防 SSRF，回环、内网、本地域名、重定向、URL token 与自定义请求头均不支持；本机服务请改用 stdio。</span>
              </label>
            )}
            <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 5, width: 150, fontSize: 12 }}>超时（秒）
                <input type="number" min={1} max={30} value={draft.timeoutSeconds} onChange={(event) => setDraft((prev) => ({ ...prev, timeoutSeconds: event.target.value }))} aria-label="MCP 超时秒数" style={{ minHeight: 38 }} />
              </label>
              <label style={{ display: 'flex', gap: 7, alignItems: 'center', minHeight: 38, fontSize: 12 }}>
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} /> 启用此 server
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busyKey === 'form'} style={{ minHeight: 38 }}>
                {busyKey === 'form' ? '保存中…' : editingId ? '保存修改' : '保存 server'}
              </button>
              <button type="button" className="btn" onClick={resetForm} disabled={busyKey === 'form'} style={{ minHeight: 38 }}>取消</button>
            </div>
          </div>
        )}

        {servers.length === 0 ? (
          <div className="card" style={{ padding: 18, color: 'var(--text-muted)', fontSize: 12.5 }}>尚未配置 MCP server。添加后先点击“探测”，能力才会进入 agent 白名单。</div>
        ) : (
          <div style={CARD_GRID}>
            {servers.map((server) => (
              <McpCard
                key={server.id}
                server={server}
                busy={busyKey === `probe:${server.id}` || busyKey === `remove:${server.id}`}
                onProbe={(item) => void probeServer(item)}
                onEdit={startEdit}
                onRemove={(item) => void removeServer(item)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
