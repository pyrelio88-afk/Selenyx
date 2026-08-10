/**
 * 助理空态：未配置提示 + 快捷操作面板。
 * 从 AIChatView.tsx 抽离（V4 模块 H.2），与新建任务页模板卡共用数据源。
 */

import { Icon } from '@components/ui/Icon';
import { CATEGORIES, QUICK_ACTIONS } from './chatShared';

export function EmptyState({ configured, onPick }: { configured: boolean; onPick: (p: string) => void }) {
  return (
    <div className="aichat-empty">
      <div className="aichat-empty-icon"><Icon name="sparkles" size={40} strokeWidth={1.2} /></div>
      <h2>AI 研究助手</h2>
      <p>{configured ? '已接入你的 API（BYOK）· 桌面端经本机服务连接，Key 不离开设备' : '请先在「设置」中配置 LLM API Key（BYOK）'}</p>
      <p className="aichat-empty-sub">文献综述 / 论文批评 / 想法生成 / 数据提取 / SBAR 交接 · 输入 / 召唤更多指令</p>
      <div className="aichat-quick">
        {CATEGORIES.map((cat) => {
          const acts = QUICK_ACTIONS.filter((a) => a.category === cat);
          if (!acts.length) return null;
          return (
            <div className="aichat-quick-cat" key={cat}>
              <span className="aichat-quick-label">{cat}</span>
              <div className="aichat-quick-items">
                {acts.map((a) => (
                  <button key={a.label} className="aichat-quick-item" onClick={() => onPick(a.prompt)} title={`别名：${a.aliases.join(' / ')}`}>
                    <Icon name={a.icon} size={15} strokeWidth={1.6} />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
