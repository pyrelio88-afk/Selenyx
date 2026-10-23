/**
 * 新建任务「研究流程」选项。
 *
 * key 必须与后端 services/agent/recipes.py 的 RECIPES 一致；这里只负责
 * 菜单文案与交互提示，真正的角色接力指令仍由后端注入。
 */

import type { IconName } from '@components/ui/Icon';

export interface TaskRecipeOption {
  key: string;
  name: string;
  hint: string;
  icon: IconName;
  /** 后端 recipe 会强制开启批评审查门。 */
  forcesReview: boolean;
}

export const TASK_RECIPE_OPTIONS: readonly TaskRecipeOption[] = [
  {
    key: 'review-pipeline',
    name: '综述流水线',
    hint: '检索 → 起草 → 证据卡 → 批评 → 成稿',
    icon: 'stageLiterature',
    forcesReview: true,
  },
  {
    key: 'evidence-audit',
    name: '证据审计',
    hint: '逐条核对主张与证据，标出无据和冲突',
    icon: 'stageEvidence',
    forcesReview: false,
  },
  {
    key: 'study-design',
    name: '研究设计',
    hint: '从研究问题到可执行方案与风险清单',
    icon: 'blueprint',
    forcesReview: false,
  },
];

export function recipeOption(key: string | undefined): TaskRecipeOption | undefined {
  return TASK_RECIPE_OPTIONS.find((option) => option.key === key);
}
