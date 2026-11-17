/**
 * 学科数据扩展注册表（仅保留真实精选词条、权威数值参数与标准规范，严禁合成拼接占位数据）
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
  officialDocs?: DisciplineStandard[];
}

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

function withParamsOfficial(base: DisciplineExpansion, discId: string): DisciplineExpansion {
  const extra = PARAMS_OFFICIAL_REGISTRY[discId];
  if (!extra) return base;
  return mergeExpansions(base, extra);
}

export const DISCIPLINE_EXPANSIONS: Record<string, DisciplineExpansion> = {
  philosophy: withParamsOfficial({}, 'philosophy'),
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
