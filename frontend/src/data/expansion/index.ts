/**
 * 学科数据扩展注册表
 * 每个学科：精选扩展 + fill_*（真实词条/中性多源释义，禁止 核心概念NN 占位）
 * 目标（每学科）：名词 ≥500 · 数值参数 ≥100 · 公式 ≥100 · 标准规范 ≥20。
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
import { FILL_PHILOSOPHY } from './fill_philosophy';
import { FILL_ECONOMICS } from './fill_economics';
import { FILL_LAW } from './fill_law';
import { FILL_EDUCATION } from './fill_education';
import { FILL_LITERATURE } from './fill_literature';
import { FILL_HISTORY } from './fill_history';
import { FILL_SCIENCE } from './fill_science';
import { FILL_ENGINEERING } from './fill_engineering';
import { FILL_AGRICULTURE } from './fill_agriculture';
import { FILL_MEDICINE } from './fill_medicine';
import { FILL_MANAGEMENT } from './fill_management';
import { FILL_ART } from './fill_art';
import { FILL_MILITARY } from './fill_military';

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
  philosophy: withParamsOfficial(FILL_PHILOSOPHY, 'philosophy'),
  medicine: withParamsOfficial(mergeExpansions(MEDICINE_EXTRA, MEDICINE_BATCH2, MEDICINE_BATCH3, MEDICINE_BATCH4, FILL_MEDICINE), 'medicine'),
  science: withParamsOfficial(mergeExpansions(SCIENCE_EXTRA, FILL_SCIENCE), 'science'),
  education: withParamsOfficial(mergeExpansions(EDUCATION_EXTRA, FILL_EDUCATION), 'education'),
  engineering: withParamsOfficial(mergeExpansions(ENGINEERING_EXTRA, FILL_ENGINEERING), 'engineering'),
  economics: withParamsOfficial(mergeExpansions(ECONOMICS_EXTRA, FILL_ECONOMICS), 'economics'),
  law: withParamsOfficial(mergeExpansions(LAW_EXTRA, FILL_LAW), 'law'),
  military: withParamsOfficial(mergeExpansions(MILITARY_EXTRA, FILL_MILITARY), 'military'),
  art: withParamsOfficial(mergeExpansions(ART_EXTRA, FILL_ART), 'art'),
  management: withParamsOfficial(mergeExpansions(MANAGEMENT_EXTRA, FILL_MANAGEMENT), 'management'),
  agriculture: withParamsOfficial(mergeExpansions(AGRICULTURE_EXTRA, FILL_AGRICULTURE), 'agriculture'),
  history: withParamsOfficial(mergeExpansions(HISTORY_EXTRA, FILL_HISTORY), 'history'),
  literature: withParamsOfficial(mergeExpansions(LITERATURE_EXTRA, FILL_LITERATURE), 'literature'),
};
