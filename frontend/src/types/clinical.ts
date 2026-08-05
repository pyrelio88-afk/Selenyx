/**
 * Selenyx 临床数据模型 — NANDA + 检验值 + 统计 + 术语 + 期刊 + 写作模板
 */

export interface NANDADiagnosis {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  domain: string;
  class: string;
  definition: string;
  definingCharacteristics: string[];
  relatedFactors: string[];
  riskFactors: string[];
  nocOutcomes: string[];
  nicInterventions: string[];
}

export const NANDA_DOMAINS = [
  '健康促进', '营养', '排泄', '活动/运动', '感知/认知', '自我感知',
  '角色关系', '性/生殖', '应对/压力耐受', '生活准则', '安全/保护', '舒适', '生长/发育',
] as const;

export interface LabValue {
  id: string;
  name: string;
  nameEn: string;
  category: LabCategory;
  unit: string;
  refRangeLow: number | null;
  refRangeHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  clinicalSignificance: string;
  nursingImplications: string;
  interferingFactors: string[];
  specimenType: string;
}

export const LAB_CATEGORIES = [
  '血常规', '尿常规', '肝功能', '肾功能', '电解质', '心肌标志物',
  '凝血功能', '血脂', '血糖', '甲状腺功能', '肿瘤标志物', '免疫学', '血气分析', '炎症标志物', '其他',
] as const;

export type LabCategory = typeof LAB_CATEGORIES[number];

export interface StatTableEntry {
  id: string;
  tableType: 'z' | 't' | 'chi2' | 'f';
  df1: number;
  df2: number | null;
  alpha: number;
  criticalValue: number;
  pValue: number | null;
}

export interface StatMethod {
  id: string;
  name: string;
  nameEn: string;
  category: 'descriptive' | 'inferential' | 'comparative' | 'correlational' | 'regression' | 'survival' | 'diagnostic' | 'nonparametric';
  useCase: string;
  assumptions: string[];
  codeExamples: { language: 'R' | 'Python' | 'SPSS'; code: string }[];
  caveats: string[];
}

export interface Methodology {
  id: string;
  name: string;
  category: 'design' | 'sampling' | 'measurement' | 'analysis' | 'ethics' | 'reporting';
  description: string;
  applicableTypes: string[];
  pros: string[];
  cons: string[];
  references: string[];
}

export interface QualityTool {
  id: string;
  name: string;
  nameEn: string;
  studyType: string;
  items: QualityItem[];
  scoringMethod: string;
  interpretation: string;
}

export interface QualityItem {
  id: string;
  text: string;
  options: { label: string; score: number }[];
  domain: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  termEn: string;
  category: string;
  definition: string;
  relatedTerms: string[];
  example: string;
}

export interface WritingPhrase {
  id: string;
  category: WritingPhraseCategory;
  textCn: string;
  textEn: string;
  section: string;
  usage: string;
}

export const WRITING_PHRASE_CATEGORIES = [
  '引言', '方法', '结果', '讨论', '结论', '局限性', '致谢', '摘要', '投稿信',
] as const;

export type WritingPhraseCategory = typeof WRITING_PHRASE_CATEGORIES[number];

export interface Journal {
  id: string;
  name: string;
  issn: string;
  impactFactor: number | null;
  jcrQuartile: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  openAccess: boolean;
  pageCharge: number | null;
  reviewWeeks: number | null;
  scope: string;
  submissionUrl: string;
}

export interface CodebookEntry {
  id: string;
  variableName: string;
  variableLabel: string;
  type: 'numeric' | 'string' | 'date' | 'categorical' | 'ordinal' | 'binary';
  codes: { value: string | number; label: string }[];
  missingValues: string[];
  measurementLevel: 'nominal' | 'ordinal' | 'interval' | 'ratio';
  description: string;
}

export interface CitationTemplate {
  id: string;
  style: 'apa7' | 'vancouver' | 'gbt7714' | 'ama';
  itemType: string;
  template: string;
  example: string;
}
