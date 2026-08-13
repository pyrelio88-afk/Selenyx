/**
 * 助理空态：与新建任务同一套排印（问候 + 四张卡），点卡填入输入框。
 */
import { Icon, type IconName } from '@components/ui/Icon';

const TEMPLATES: { icon: IconName; title: string; desc: string; prompt: string }[] = [
  { icon: 'stageLiterature', title: '文献综述', desc: '系统检索与评估，梳理领域研究现状与证据。', prompt: '帮我梳理这个项目文献库的核心证据，产出一份结构化综述提纲（含研究缺口）。' },
  { icon: 'stageEvidence', title: '证据梳理', desc: '提取关键证据，建立结构化证据表格。', prompt: '盘点当前项目的证据链：哪些主张证据充分，哪些还缺支撑？给出补强建议。' },
  { icon: 'stageWriting', title: '论文提纲', desc: '构建论文结构与论点，形成写作提纲。', prompt: '基于项目资料生成论文提纲：背景、方法、结果、讨论，每节列出要点与所需证据。' },
  { icon: 'chart', title: '数据解读', desc: '分析数据与可视化，提炼结论与洞察。', prompt: '解读项目数据表中的关键结果：主要发现、异常值、可以写进论文的结论。' },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function EmptyState({ configured, onPick }: { configured: boolean; onPick: (p: string) => void }) {
  return (
    <div className="newtask-home aichat-empty-home">
      <header className="newtask-hero">
        <h1>{greeting()}，继续研究</h1>
        <p>{configured ? '从常用任务开始，或直接在下方输入。结论仍须回到证据。' : '先在设置里接好本机 LLM，再开始对话。'}</p>
      </header>
      <section className="newtask-workflow" aria-labelledby="assistant-templates-heading">
        <h2 id="assistant-templates-heading">从常用研究任务开始</h2>
        <div className="newtask-templates">
          {TEMPLATES.map((template) => (
            <button
              key={template.title}
              type="button"
              className="newtask-template"
              onClick={() => onPick(template.prompt)}
            >
              <span className="newtask-template-icon"><Icon name={template.icon} size={28} /></span>
              <span className="newtask-template-title">{template.title}</span>
              <span className="newtask-template-desc">{template.desc}</span>
              <span className="newtask-template-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} /></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
