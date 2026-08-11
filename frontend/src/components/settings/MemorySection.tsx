/**
 * 设置弹窗「记忆」分区（V4 模块 F）— 两层记忆的真实管理。
 *
 * 全局记忆：查看 / 编辑 / 清空 / 导出（.md 下载）；
 * 项目记忆：列表 + 展开编辑 / 清空。
 * 记忆永不外发——这里读写的是本机文件，导出由用户自己保存。
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { memoryApi, type ProjectMemoryEntry } from '@services/skills';

export function MemorySection() {
  const [globalMemory, setGlobalMemory] = useState('');
  const [projects, setProjects] = useState<ProjectMemoryEntry[]>([]);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [{ content }, { memories }] = await Promise.all([memoryApi.getGlobal(), memoryApi.listProjects()]);
      setGlobalMemory(content);
      setProjects(memories);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveGlobal = async () => {
    try {
      await memoryApi.saveGlobal(globalMemory);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearGlobal = async () => {
    if (!window.confirm('清空全局记忆？此操作不可撤销。')) return;
    await memoryApi.clearGlobal();
    setGlobalMemory('');
  };

  const exportGlobal = () => {
    const blob = new Blob([globalMemory], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `selenyx-memory-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const startEditProject = async (entry: ProjectMemoryEntry) => {
    if (editingProject === entry.projectId) {
      setEditingProject(null);
      return;
    }
    const { content } = await memoryApi.getProject(entry.projectId);
    setProjectDraft(content);
    setEditingProject(entry.projectId);
  };

  const saveProject = async (projectId: string) => {
    await memoryApi.saveProject(projectId, projectDraft);
    setEditingProject(null);
    await refresh();
  };

  const clearProject = async (entry: ProjectMemoryEntry) => {
    if (!window.confirm(`清空项目「${entry.projectName}」的记忆？`)) return;
    await memoryApi.clearProject(entry.projectId);
    if (editingProject === entry.projectId) setEditingProject(null);
    await refresh();
  };

  return (
    <section aria-label="记忆">
      {offline && (
        <div role="alert" style={{ padding: '10px 14px', marginBottom: 12, border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接，记忆管理不可用。
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>全局记忆</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          跨项目的偏好与结论；agent 任务启动时注入摘要。记忆永不外发，只进 prompt。
        </p>
        <textarea
          value={globalMemory}
          onChange={(e) => setGlobalMemory(e.target.value)}
          rows={7}
          placeholder="还没有全局记忆。agent 运行中会用 write_memory 工具把值得长期记住的要点写进来；也可以直接在这里编辑。"
          aria-label="全局记忆"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => void saveGlobal()} style={{ minHeight: 36 }}>保存</button>
          <button type="button" className="btn" onClick={exportGlobal} disabled={!globalMemory.trim()} style={{ minHeight: 36 }}>
            <Icon name="download" size={13} /> 导出 .md
          </button>
          <button type="button" className="btn" onClick={() => void clearGlobal()} disabled={!globalMemory.trim()} style={{ minHeight: 36, color: 'var(--danger)' }}>清空</button>
          {saved && <span role="status" style={{ fontSize: 12.5, color: 'var(--success)' }}>已保存</span>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>项目记忆</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          各项目自己的记忆（如「该项目聚焦老年谵妄」），只注入该项目的任务。
        </p>
        {projects.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>还没有项目记忆；项目内的 agent 任务会自动积累。</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {projects.map((entry) => (
              <li key={entry.projectId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{entry.projectName}</strong>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn" onClick={() => void startEditProject(entry)} aria-expanded={editingProject === entry.projectId} style={{ minHeight: 28, fontSize: 11, padding: '0 10px' }}>
                    {editingProject === entry.projectId ? '收起' : '查看 / 编辑'}
                  </button>
                  <button type="button" className="btn" onClick={() => void clearProject(entry)} style={{ minHeight: 28, fontSize: 11, padding: '0 10px', color: 'var(--danger)' }}>清空</button>
                </div>
                {editingProject === entry.projectId ? (
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    <textarea
                      value={projectDraft}
                      onChange={(e) => setProjectDraft(e.target.value)}
                      rows={5}
                      aria-label={`项目记忆：${entry.projectName}`}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65 }}
                    />
                    <div>
                      <button type="button" className="btn btn-primary" onClick={() => void saveProject(entry.projectId)} style={{ minHeight: 32, fontSize: 12 }}>保存</button>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.preview}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
