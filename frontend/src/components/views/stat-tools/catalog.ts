export type Tab = 'calculator' | 'tables' | 'formula' | 'methods';

export const Z_TABLE_ENTRIES = [
  { z: 1.645, label: 'α=0.10 (双侧)', p: 0.10 },
  { z: 1.96, label: 'α=0.05 (双侧)', p: 0.05 },
  { z: 2.576, label: 'α=0.01 (双侧)', p: 0.01 },
  { z: 3.291, label: 'α=0.001 (双侧)', p: 0.001 },
];

export type CalcKey = 'pvalue' | 'ttest' | 'pairedt' | 'onesamplet' | 'anova' | 'chi' | 'orrr' | 'diagtest' | 'correlation' | 'effectsize' | 'samplesize' | 'ci' | 'cronbach' | 'regression' | 'mannwhitney' | 'logistic' | 'roc' | 'survival';

type CalcGroupId = 'description' | 'inference' | 'association' | 'diagnostic' | 'design';
interface CalcMeta { key: CalcKey; label: string; description: string; group: CalcGroupId; groupLabel: string }

export const CALC_LIST: CalcMeta[] = [
  { key: 'pvalue', label: 'Z → p 值', description: '由标准正态统计量计算双尾概率', group: 'inference', groupLabel: '基础推断' },
  { key: 'ttest', label: '独立样本 t 检验', description: '比较两个独立组的均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'pairedt', label: '配对 t 检验', description: '比较配对或重复测量均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'onesamplet', label: '单样本 t 检验', description: '样本均值与已知总体均值比较', group: 'inference', groupLabel: '基础推断' },
  { key: 'anova', label: '单因素 ANOVA', description: '比较三个及以上独立组均值', group: 'inference', groupLabel: '基础推断' },
  { key: 'chi', label: '卡方检验', description: '检验分类变量关联并绘制热力图', group: 'inference', groupLabel: '基础推断' },
  { key: 'mannwhitney', label: 'Mann–Whitney U', description: '两个独立样本的非参数比较', group: 'inference', groupLabel: '基础推断' },
  { key: 'ci', label: '置信区间', description: '描述估计值的不确定性范围', group: 'description', groupLabel: '描述与估计' },
  { key: 'orrr', label: 'OR / RR', description: '病例对照与队列研究效应指标', group: 'association', groupLabel: '关联与效应' },
  { key: 'correlation', label: 'Pearson 相关', description: '连续变量线性相关及显著性', group: 'association', groupLabel: '关联与效应' },
  { key: 'effectsize', label: '效应量', description: '描述 Cohen d 与组间差异强度', group: 'description', groupLabel: '描述与估计' },
  { key: 'regression', label: '线性回归', description: '估计连续结局的线性关系', group: 'association', groupLabel: '关联与效应' },
  { key: 'logistic', label: 'Logistic 回归', description: '二分类结局、OR 与森林图', group: 'association', groupLabel: '关联与效应' },
  { key: 'diagtest', label: '诊断试验', description: '灵敏度、特异度与预测值', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'cronbach', label: 'Cronbach α', description: '量表内部一致性信度', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'roc', label: 'ROC 曲线', description: '判别能力、AUC 与工作点', group: 'diagnostic', groupLabel: '诊断与测量' },
  { key: 'samplesize', label: '样本量估算', description: '按效应量、α 与效能规划样本', group: 'design', groupLabel: '研究设计与时间结局' },
  { key: 'survival', label: '生存分析', description: 'Kaplan–Meier 与 Log-rank 检验', group: 'design', groupLabel: '研究设计与时间结局' },
];

const GROUP_ORDER: Array<{ id: CalcGroupId; label: string }> = [
  { id: 'description', label: '描述与估计' },
  { id: 'inference', label: '基础推断' },
  { id: 'association', label: '关联与效应' },
  { id: 'diagnostic', label: '诊断与测量' },
  { id: 'design', label: '研究设计与时间结局' },
];

export const RESOURCE_LIST = [
  { tab: 'tables' as const, label: '临界值表', description: 't、χ² 等常用临界值' },
  { tab: 'formula' as const, label: '公式库', description: '公式、变量定义与适用条件' },
  { tab: 'methods' as const, label: '方法速查', description: '按问题和数据类型选择方法' },
];

export function filterStatToolGroups(query: string) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return GROUP_ORDER.map((group) => ({
    ...group,
    items: CALC_LIST.filter((item) => item.group === group.id && (
      !normalized || `${item.label} ${item.description} ${item.groupLabel}`.toLocaleLowerCase('zh-CN').includes(normalized)
    )),
  })).filter((group) => group.items.length > 0);
}
