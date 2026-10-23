/**
 * 提示词润色：用本机已配置模型把研究目标改写成可执行的任务说明。
 * 只改写法，不补事实；缺失信息显式标为待补充，避免模型替用户发明研究内容。
 */

import { aiApi } from './api';
import { parseSkillPrefix } from './skills';

export const POLISH_SYSTEM_PROMPT = [
  '你是科研助理的提示词编辑器。把用户的研究目标改写成更清晰、可执行的任务说明。',
  '规则：',
  '1. 保留原意、语言、已有事实与专有名词；不得新增文献、数据、结论或引用。',
  '2. 不替用户做决定；原输入没有的关键信息，用【待补充：…】标出。',
  '3. 按需组织为：研究问题 / 范围与边界 / 需要的证据 / 交付物 / 约束，不要机械套模板。',
  '4. 原输入已足够清晰时只做最小改动，不扩写空话。',
  '5. 只输出改写后的任务说明，不要解释，不要代码块。',
].join('\n');

/** 去掉模型偶尔包上的整段代码围栏，保留内部换行。 */
export function cleanPolishedPrompt(raw: string): string {
  const text = raw.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

const ATTACHMENT_MARKER = '\n\n【附加材料：';

/**
 * 拆出真正交给模型的指令；/技能名 与附件原文不参与改写，成稿时按原样拼回。
 * 只有附件、只有技能名时 target 为空，调用方不得发出润色请求。
 */
export function splitPolishInput(goal: string): { target: string; prefix: string; attachments: string } {
  const marker = goal.indexOf(ATTACHMENT_MARKER);
  const instruction = (marker >= 0 ? goal.slice(0, marker) : goal).trim();
  const attachments = marker >= 0 ? goal.slice(marker) : '';
  const parsed = parseSkillPrefix(instruction);
  const skillOnly = /^\/[^\s/]{1,40}$/.test(instruction);
  return {
    target: skillOnly ? '' : (parsed.skill ? parsed.goal : instruction).trim(),
    prefix: parsed.skill ? `/${parsed.skill} ` : '',
    attachments,
  };
}

export async function polishResearchPrompt(
  goal: string,
  projectId?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const { target, prefix, attachments } = splitPolishInput(goal);
  if (!target) throw new Error('请先写研究目标，再优化；技能名与附件原文会原样保留。');
  const reply = await aiApi.chat(
    [
      { role: 'system', content: POLISH_SYSTEM_PROMPT },
      { role: 'user', content: target },
    ],
    projectId ?? undefined,
    signal,
  );
  const polished = cleanPolishedPrompt(reply.content ?? '');
  if (!polished) throw new Error('模型没有返回可用的提示词。');
  return `${prefix}${polished}${attachments}`;
}
