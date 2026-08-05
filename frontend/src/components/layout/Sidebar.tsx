import type { ViewKey } from '../../App';
import { useAppStore } from '@stores/appStore';

interface SidebarProps {
  current: ViewKey;
  onNavigate: (v: ViewKey) => void;
}

const NAV_ITEMS: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: '总览', icon: '◆' },
  { key: 'references', label: '文献库', icon: '📚' },
  { key: 'pipeline', label: '科研流水线', icon: '🔗' },
  { key: 'projects', label: '项目', icon: '📁' },
  { key: 'statTools', label: '统计工具', icon: '📊' },
  { key: 'clinicalData', label: '临床数据', icon: '⚕️' },
  { key: 'aiChat', label: 'AI 助手', icon: '🤖' },
  { key: 'settings', label: '设置', icon: '⚙️' },
];

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const { mode, toggleMode } = useAppStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Selenyx</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${current === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '8px 12px' }}>
        <button className="nav-item" onClick={toggleMode}>
          <span className="icon">{mode === 'light' ? '🌙' : '☀️'}</span>
          <span>{mode === 'light' ? '夜间模式' : '日间模式'}</span>
        </button>
      </div>
    </aside>
  );
}
