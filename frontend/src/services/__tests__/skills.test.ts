/**
 * V4 模块 F 前端：/技能名 前缀解析。
 */

import { describe, expect, it } from 'vitest';
import { parseSkillPrefix } from '@services/skills';

describe('parseSkillPrefix（输入框 /技能名）', () => {
  it('解析技能名与目标', () => {
    expect(parseSkillPrefix('/文献速读 帮我梳理谵妄证据')).toEqual({ skill: '文献速读', goal: '帮我梳理谵妄证据' });
  });

  it('换行分隔也可解析', () => {
    expect(parseSkillPrefix('/综述\n写一份提纲')).toEqual({ skill: '综述', goal: '写一份提纲' });
  });

  it('不带前缀原样返回', () => {
    expect(parseSkillPrefix('帮我梳理证据')).toEqual({ skill: null, goal: '帮我梳理证据' });
  });

  it('只有技能名没有目标时不当作技能调用', () => {
    expect(parseSkillPrefix('/文献速读')).toEqual({ skill: null, goal: '/文献速读' });
  });

  it('路径样式文本不误判', () => {
    expect(parseSkillPrefix('看 /usr/local 这个目录')).toEqual({ skill: null, goal: '看 /usr/local 这个目录' });
  });
});
