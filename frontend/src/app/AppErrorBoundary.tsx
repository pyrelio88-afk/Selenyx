import { Component, type ReactNode } from 'react';
import { clearSelenyxBrowserStorage } from '@services/workspaceBackup';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-crash-screen" role="alert">
        <h2>页面渲染异常</h2>
        <p className="app-crash-message">{this.state.error?.message || '未知错误'}</p>
        <p className="app-crash-guidance">
          如反复出现，可清除 Selenyx 的浏览器本地数据后重启；请先导出重要工作区。
        </p>
        <div className="app-crash-actions">
          <button type="button" className="btn btn-primary" onClick={() => { clearSelenyxBrowserStorage(); location.reload(); }}>
            清空数据并重载
          </button>
          <button type="button" className="btn" onClick={() => location.reload()}>仅刷新页面</button>
        </div>
      </div>
    );
  }
}
