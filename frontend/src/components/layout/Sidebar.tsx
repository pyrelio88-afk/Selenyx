import { useEffect, useState } from 'react';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { Icon, NAV_ICONS } from '@components/ui/Icon';
import { localApi } from '@services/api';

/**
 * 主导航按「证据门科研流水线」编排（Claude Scholar / nature-skills / Zotero 类工具对齐）：
 * 立题 → 文献 → 阅读/证据 → 分析工具 → 对话与设置
 * 禁止 skill 超市 / 飞书式平行功能墙做主入口。
 */
export interface NavGroup {
  label: string;
  items: { key: ViewKey; label: string; hint?: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '科研闭环',
    items: [
      { key: 'dashboard', label: '总览', hint: '进度与倒数日' },
      { key: 'projects', label: '立题 · 项目', hint: '研究问题优先，框架可选' },
      { key: 'pipeline', label: '八段流水线', hint: '问题→证据→写作' },
      { key: 'references', label: '文献库', hint: '检索 · 导入 · 全文' },
      { key: 'notes', label: '阅读笔记', hint: '摘录与批注' },
    ],
  },
  {
    label: '分析与资料',
    items: [
      { key: 'tables', label: '数据表格', hint: '筛选与对照' },
      { key: 'statTools', label: '统计计算', hint: '检验与效应量' },
      { key: 'clinicalData', label: '学科资料', hint: '名词 · 标准 · 公式' },
      { key: 'tools', label: '工具箱', hint: 'DOI · 引用 · 设计' },
    ],
  },
  {
    label: '助手',
    items: [
      { key: 'aiChat', label: 'AI 对话', hint: '本地网关 / BYOK' },
      { key: 'skills', label: '科研能力', hint: 'Nature 级技能映射' },
      { key: 'settings', label: '设置', hint: '后端 · 主题 · 备份' },
    ],
  },
];

export function Sidebar() {
  const {
    currentView, setView, mode, toggleMode,
    projects, currentProjectId, references,
  } = useAppStore();
  const isDark = mode === 'dark';
  const activeProject = projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null;
  const [backendLabel, setBackendLabel] = useState('检测本地服务…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await localApi.health();
        if (!cancelled) setBackendLabel(`后端在线 · v${health.version}`);
      } catch {
        if (!cancelled) setBackendLabel('后端离线 · 前端降级');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function openProjects() {
    setView('projects');
  }

  return (
    <aside className="sidebar workspace-sidebar">
      <div className="workspace-brand">
        <div className="workspace-brand-mark" aria-hidden="true"><Icon name="moon" size={19} strokeWidth={1.9} /></div>
        <div>
          <div className="workspace-brand-name">Selenyx</div>
          <div className="workspace-brand-subtitle">本地科研工作台</div>
        </div>
      </div>

      <button className="workspace-switcher" onClick={openProjects} aria-label="切换或管理科研项目">
        <span className="workspace-switcher-avatar">研</span>
        <span className="workspace-switcher-copy">
          <strong>{activeProject?.name || '未选择项目'}</strong>
          <small>{activeProject ? `流水线 · ${activeProject.currentStage || 'problem'}` : '先创建项目名称，框架可选'}</small>
        </span>
        <Icon name="chevronDown" size={15} />
      </button>

      <div className="workspace-actions">
        <button className="workspace-primary-action" onClick={openProjects}>
          <Icon name="plus" size={16} />
          新建项目
        </button>
        <button className="workspace-quick-action" onClick={() => setView('references')} title="前往文献库">
          <Icon name="references" size={16} />
          <span>文献</span>
          <b>{references.length}</b>
        </button>
        <button className="workspace-quick-action" onClick={() => setView('pipeline')} title="进入八段流水线">
          <Icon name="pipeline" size={16} />
          <span>流水线</span>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="科研工作台导航">
        {NAV_GROUPS.map((group, gi) => (
          <section key={gi} className="workspace-nav-group" aria-label={group.label || '工作台'}>
            {group.label && (
              <div className="nav-group-label">{group.label}</div>
            )}
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${currentView === item.key ? 'active' : ''}`}
                onClick={() => setView(item.key)}
                aria-current={currentView === item.key ? 'page' : undefined}
                title={item.hint}
              >
                <span className="icon">
                  <Icon name={NAV_ICONS[item.key]} size={18} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>

      <div className="workspace-sidebar-footer">
        <div className="workspace-local-status" title="数据默认留在本机；后端提供 RAG/学术 API/密钥网关">
          <span className="workspace-status-dot" aria-hidden="true" />
          {backendLabel}
        </div>
        <button
          className="icon-btn"
          onClick={toggleMode}
          aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
          title={isDark ? '日间模式' : '夜间模式'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </aside>
  );
}
