import type { AgentStep } from '@services/agent';
export const TOOL_LABEL: Record<string, string> = {
  search_library: '检索文献库', list_references: '列出文献', project_context: '读取项目概况', list_evidence: '读取证据链',
  save_evidence: '落证据卡', list_pending_evidence: '查看待裁决证据', ask_expert: '委托专家',
  write_note: '写入笔记', export_artifact: '导出工件', list_notes: '读取笔记列表', read_note: '读取笔记',
  read_memory: '读取记忆', write_memory: '写入记忆',
};

const toolLabel = (tool?: string) => TOOL_LABEL[tool ?? ''] ?? tool ?? '未知工具';

export function formatAgentStepTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp || '时间未记录';
  return date.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function summarizeAgentStep(step: AgentStep): string {
  switch (step.kind) {
    case 'plan':
      return `已记录执行计划${step.items?.length ? `（${step.items.length} 步）` : ''}`;
    case 'thought':
      return step.text ? `思考：${step.text}` : '记录了思考进度';
    case 'tool': {
      const query = typeof step.args?.query === 'string' ? `：查询 ${step.args.query}` : '';
      return `调用工具 ${toolLabel(step.tool)}${query}`;
    }
    case 'observation': {
      const result = step.result !== null && typeof step.result === 'object' && !Array.isArray(step.result)
        ? step.result as Record<string, unknown> : undefined;
      if (typeof result?.error === 'string') return `${toolLabel(step.tool)}：${result.error}`;
      if (typeof result?.answer === 'string') return `专家 ${result.expert ?? ''} 已返回结论：${result.answer}`;
      if (typeof result?.message === 'string') return `${toolLabel(step.tool)}：${result.message}`;
      if (typeof result?.count === 'number') return `${toolLabel(step.tool)}：${result.count} 条结果`;
      return `工具 ${toolLabel(step.tool)} 已返回结果`;
    }
    case 'subagent':
      return `专家 ${step.expert ?? '助手'}${step.tool ? ` 调用 ${toolLabel(step.tool)}` : '处理中'}`;
    case 'review':
      return `${step.critic ?? '批评员'}审阅${step.text ? `：${step.text}` : ''}`;
    case 'coverage': {
      const coverage = step as AgentStep & { supported?: number; sentences?: number };
      return `证据校验：${coverage.supported ?? 0}/${coverage.sentences ?? 0} 条论断有据`;
    }
    case 'steer':
      return step.text ? `已收到你的插话：${step.text}` : '已收到你的插话';
    case 'waiting':
      return step.text ?? '等待人工确认';
    case 'evidence_wait':
      return `等待裁决 ${step.ids?.length ?? 0} 条证据`;
    case 'evidence_resume':
      return '证据裁决已返回，继续校验';
    case 'error':
      return step.message ? `运行错误：${step.message}` : '运行遇到错误';
    case 'final':
      return '已生成最终成果';
    default:
      return '研究进度已保存';
  }
}
