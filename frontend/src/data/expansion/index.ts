/**
 * 学科数据扩展注册表（R86 / R93 大规模扩充）
 * 每个学科一个增量文件，按轮次持续扩充；在 disciplines.ts 末尾合并进 DISCIPLINES
 * 目标（每学科）：名词 ≥500 · 数值参数 ≥200 · 公式 ≥300 · 标准规范 ≥20
 *
 * R93 新增 9 个学科扩展文件 + 医学第二批，共 337 条新术语
 */

import type {
  DisciplineGlossary,
  DisciplineParameter,
  DisciplineFormula,
  DisciplineStandard,
} from '../disciplines';
import { MEDICINE_EXTRA } from './medicine';
import { MEDICINE_BATCH2 } from './medicine_batch2';
import { SCIENCE_EXTRA } from './science';
import { EDUCATION_EXTRA } from './education';
import { ENGINEERING_EXTRA } from './engineering';
import { ECONOMICS_EXTRA } from './economics';
import { LAW_EXTRA } from './law';
import { MILITARY_EXTRA } from './military';
import { ART_EXTRA } from './art';
import { MANAGEMENT_EXTRA } from './management';
import { AGRICULTURE_EXTRA } from './agriculture';
import { HISTORY_EXTRA } from './history';
import { LITERATURE_EXTRA } from './literature';

export interface DisciplineExpansion {
  glossary?: DisciplineGlossary[];
  parameters?: DisciplineParameter[];
  formulas?: DisciplineFormula[];
  standards?: DisciplineStandard[];
}

/** 合并同一学科的多个扩展批次 */
function mergeExpansions(...extras: DisciplineExpansion[]): DisciplineExpansion {
  const result: DisciplineExpansion = {
    glossary: [],
    parameters: [],
    formulas: [],
    standards: [],
  };
  for (const ext of extras) {
    if (ext.glossary) result.glossary!.push(...ext.glossary);
    if (ext.parameters) result.parameters!.push(...ext.parameters);
    if (ext.formulas) result.formulas!.push(...ext.formulas);
    if (ext.standards) result.standards!.push(...ext.standards);
  }
  return result;
}

export const DISCIPLINE_EXPANSIONS: Record<string, DisciplineExpansion> = {
  medicine: mergeExpansions(MEDICINE_EXTRA, MEDICINE_BATCH2),
  science: SCIENCE_EXTRA,
  education: EDUCATION_EXTRA,
  engineering: ENGINEERING_EXTRA,
  economics: ECONOMICS_EXTRA,
  law: LAW_EXTRA,
  military: MILITARY_EXTRA,
  art: ART_EXTRA,
  management: MANAGEMENT_EXTRA,
  agriculture: AGRICULTURE_EXTRA,
  history: HISTORY_EXTRA,
  literature: LITERATURE_EXTRA,
};
