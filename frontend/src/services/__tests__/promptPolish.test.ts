import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanPolishedPrompt, polishResearchPrompt, splitPolishInput } from '@services/promptPolish';

const harness = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('@services/api', () => ({ aiApi: { chat: harness.chat } }));

const reply = (content: string) => ({ content, role: 'assistant' });

describe('提示词润色', () => {
  beforeEach(() => {
    harness.chat.mockReset();
  });

  it('把研究目标交给本机模型，并带上只改写法不改事实的系统约束', async () => {
    harness.chat.mockResolvedValue(reply('研究问题：…\n交付物：…'));
    const controller = new AbortController();

    await expect(polishResearchPrompt('  梳理证据  ', 'proj-1', controller.signal))
      .resolves.toBe('研究问题：…\n交付物：…');

    const [messages, projectId, signal] = harness.chat.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('不得新增文献、数据、结论或引用');
    expect(messages[1]).toEqual({ role: 'user', content: '梳理证据' });
    expect(projectId).toBe('proj-1');
    expect(signal).toBe(controller.signal);
  });

  it('脱掉整段代码围栏但保留内部换行', () => {
    expect(cleanPolishedPrompt('```markdown\n第一行\n第二行\n```')).toBe('第一行\n第二行');
    expect(cleanPolishedPrompt('普通文本')).toBe('普通文本');
  });

  it('模型返回空内容时抛错，不覆盖用户原文', async () => {
    harness.chat.mockResolvedValue(reply('   '));
    await expect(polishResearchPrompt('原目标')).rejects.toThrow('模型没有返回可用的提示词');
  });

  it('只润色指令，/技能名 与附件原文原样保留', async () => {
    harness.chat.mockResolvedValue(reply('更清晰的指令'));
    const goal = '/文献速读 帮我梳理证据\n\n【附加材料：notes.txt】\n原文不能被改写';

    await expect(polishResearchPrompt(goal)).resolves.toBe(
      '/文献速读 更清晰的指令\n\n【附加材料：notes.txt】\n原文不能被改写',
    );
    expect(harness.chat.mock.calls[0][0][1]).toEqual({ role: 'user', content: '帮我梳理证据' });
  });

  it('只有附件或只有技能名时不发模型请求', async () => {
    await expect(polishResearchPrompt('\n\n【附加材料：notes.txt】\n原文')).rejects.toThrow('请先写研究目标');
    await expect(polishResearchPrompt('/文献速读')).rejects.toThrow('请先写研究目标');
    expect(harness.chat).not.toHaveBeenCalled();
  });

  it('拆分附件与技能前缀保持不变', () => {
    expect(splitPolishInput('/综述 写出提纲\n\n【附加材料：a.md】\n原文')).toEqual({
      target: '写出提纲',
      prefix: '/综述 ',
      attachments: '\n\n【附加材料：a.md】\n原文',
    });
  });
});
