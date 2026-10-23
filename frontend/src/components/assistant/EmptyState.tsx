/**
 * 助理空态：只保留安静的问候。研究流程、计划与技能统一放进输入区的加号。
 */

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function EmptyState({ configured }: { configured: boolean }) {
  return (
    <div className="newtask-home aichat-empty-home">
      <header className="newtask-hero">
        <h1>{greeting()}，继续研究</h1>
        <p>{configured ? '输入问题开始；输入 / 可调用本机指令与技能。结论仍须回到证据。' : '先在设置里接好本机 LLM，再开始对话。'}</p>
      </header>
    </div>
  );
}
