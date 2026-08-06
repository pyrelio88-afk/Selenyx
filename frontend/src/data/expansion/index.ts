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
import { MEDICINE_BATCH3 } from './medicine_batch3';
import { MEDICINE_BATCH4 } from './medicine_batch4';
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
import { PARAMS_OFFICIAL_REGISTRY } from './parameters_official';

export interface DisciplineExpansion {
  glossary?: DisciplineGlossary[];
  parameters?: DisciplineParameter[];
  formulas?: DisciplineFormula[];
  standards?: DisciplineStandard[];
  officialDocs?: DisciplineStandard[];  // R106: 红头文件
}

/** 合并同一学科的多个扩展批次 */
function mergeExpansions(...extras: DisciplineExpansion[]): DisciplineExpansion {
  const result: DisciplineExpansion = {
    glossary: [],
    parameters: [],
    formulas: [],
    standards: [],
    officialDocs: [],
  };
  for (const ext of extras) {
    if (ext.glossary) result.glossary!.push(...ext.glossary);
    if (ext.parameters) result.parameters!.push(...ext.parameters);
    if (ext.formulas) result.formulas!.push(...ext.formulas);
    if (ext.standards) result.standards!.push(...ext.standards);
    if (ext.officialDocs) result.officialDocs!.push(...ext.officialDocs);
  }
  return result;
}

// R106: 合并参数+红头文件到每个学科
function withParamsOfficial(base: DisciplineExpansion, discId: string): DisciplineExpansion {
  const extra = PARAMS_OFFICIAL_REGISTRY[discId];
  if (!extra) return base;
  return mergeExpansions(base, extra);
}

export const DISCIPLINE_EXPANSIONS: Record<string, DisciplineExpansion> = {
  philosophy: withParamsOfficial({ glossary: [], parameters: [], formulas: [], standards: [] }, 'philosophy'),
  medicine: withParamsOfficial(mergeExpansions(MEDICINE_EXTRA, MEDICINE_BATCH2, MEDICINE_BATCH3, MEDICINE_BATCH4), 'medicine'),
  science: withParamsOfficial(SCIENCE_EXTRA, 'science'),
  education: withParamsOfficial(EDUCATION_EXTRA, 'education'),
  engineering: withParamsOfficial(ENGINEERING_EXTRA, 'engineering'),
  economics: withParamsOfficial(ECONOMICS_EXTRA, 'economics'),
  law: withParamsOfficial(LAW_EXTRA, 'law'),
  military: withParamsOfficial(MILITARY_EXTRA, 'military'),
  art: withParamsOfficial(ART_EXTRA, 'art'),
  management: withParamsOfficial(MANAGEMENT_EXTRA, 'management'),
  agriculture: withParamsOfficial(AGRICULTURE_EXTRA, 'agriculture'),
  history: withParamsOfficial(HISTORY_EXTRA, 'history'),
  literature: withParamsOfficial(LITERATURE_EXTRA, 'literature'),
};
