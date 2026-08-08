import { describe, expect, it } from 'vitest';
import type { ResearchSkill } from '@data/skills';
import { filterResearchSkills, getSkillRuntimeStatus, getSkillWorkflow, safeSkillSourceUrl } from './SkillsView';

function skill(patch: Partial<ResearchSkill> = {}): ResearchSkill {
  return {
    id: 'skill-1', name: '文献检索', nameEn: 'literature-search', category: 'research', categoryLabel: '研究',
    description: '检索并核对学术文献', source: '本地已安装 skills/example', sourceUrl: 'https://example.org/skill',
    license: 'MIT', prompt: '查文献', tags: ['检索'], ...patch,
  };
}

describe('Skills workbench helpers', () => {
  it('never turns a source declaration into a verified runtime claim', () => {
    expect(getSkillRuntimeStatus(skill())).toEqual({
      kind: 'mapped', label: '内置技能映射',
      detail: '可把触发词投递到 AI；实际执行仍取决于本机安装与运行环境，当前页面未验证。',
    });
    expect(getSkillRuntimeStatus(skill({ source: 'OpenAI 官方', license: '商业服务' })).kind).toBe('service');
  });

  it('filters by category and searchable metadata', () => {
    const skills = [skill(), skill({ id: 'skill-2', name: '学术润色', nameEn: 'polish', category: 'writing', categoryLabel: '写作', tags: ['英语'] })];
    expect(filterResearchSkills(skills, 'writing', '英语').map((item) => item.id)).toEqual(['skill-2']);
    expect(getSkillWorkflow(skills[1]).stages).toEqual(['写作', '传播']);
  });

  it('only opens http and https source links', () => {
    expect(safeSkillSourceUrl('https://example.org/path')).toBe('https://example.org/path');
    expect(safeSkillSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSkillSourceUrl('not a url')).toBeNull();
  });
});
