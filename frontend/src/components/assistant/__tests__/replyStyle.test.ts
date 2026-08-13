import { describe, expect, it } from 'vitest';
import { composeSystemPrompt, replyStyleLine, withReplyStyle } from '../chatShared';

describe('reply style settings', () => {
  it('changes the instruction line for each style', () => {
    expect(replyStyleLine('concise')).toContain('简洁');
    expect(replyStyleLine('thorough')).toContain('详尽');
    expect(replyStyleLine('balanced')).toContain('均衡');
  });

  it('injects style and custom instructions into the system prompt', () => {
    const prompt = composeSystemPrompt({
      replyStyle: 'concise',
      customInstructions: '引用必须给出处',
      extras: '当前项目：试验',
    });
    expect(prompt).toContain('简洁');
    expect(prompt).toContain('引用必须给出处');
    expect(prompt).toContain('当前项目：试验');
  });

  it('prefixes agent custom instructions with the style', () => {
    expect(withReplyStyle('用中文', 'thorough')).toMatch(/^回复风格：详尽/);
  });
});
