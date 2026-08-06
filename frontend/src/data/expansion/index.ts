/**
 * 学科数据扩展注册表（R86）
 * 每个学科一个增量文件，按轮次持续扩充；在 disciplines.ts 末尾合并进 DISCIPLINES
 * 目标（每学科）：名词 ≥500 · 数值参数 ≥200 · 公式 ≥300 · 标准规范 ≥20
 */

import type {
  DisciplineGlossary,
  DisciplineParameter,
  DisciplineFormula,
  DisciplineStandard,
} from '../disciplines';
import { MEDICINE_EXTRA } from './medicine';
import { SCIENCE_EXTRA } from './science';
import { EDUCATION_EXTRA } from './education';
import { ENGINEERING_EXTRA } from './engineering';

export interface DisciplineExpansion {
  glossary?: DisciplineGlossary[];
  parameters?: DisciplineParameter[];
  formulas?: DisciplineFormula[];
  standards?: DisciplineStandard[];
}

export const DISCIPLINE_EXPANSIONS: Record<string, DisciplineExpansion> = {
  medicine: MEDICINE_EXTRA,
  science: SCIENCE_EXTRA,
  education: EDUCATION_EXTRA,
  engineering: ENGINEERING_EXTRA,
};
