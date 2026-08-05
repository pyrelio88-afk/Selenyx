/**
 * 科研框架模板 —— Nature/Science 常用研究设计框架
 * 每个框架含字段定义和不同学科示例
 */

export interface FrameworkField {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
}

export interface ResearchFramework {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  bestFor: string;        // 适用研究类型
  disciplines: string[];  // 典型学科
  fields: FrameworkField[];
  example: {
    title: string;
    discipline: string;
    values: Record<string, string>;
  };
}

export const RESEARCH_FRAMEWORKS: ResearchFramework[] = [
  {
    id: 'pico',
    name: 'PICO 框架',
    nameEn: 'PICO Framework',
    description: '循证医学核心框架，将临床问题拆解为人群、干预、对照、结局四要素，是 RCT 和系统综述的标准设计工具。',
    bestFor: '临床试验、循证研究、系统综述',
    disciplines: ['医学', '护理学', '公共卫生', '药学', '康复医学'],
    fields: [
      { key: 'population', label: 'P — 人群 (Population)', placeholder: '研究对象是谁？', hint: '如：护理本科生、2型糖尿病患者、ICU护士' },
      { key: 'intervention', label: 'I — 干预 (Intervention)', placeholder: '施加什么干预？', hint: '如：AI辅助SBAR训练、新药物治疗、正念干预' },
      { key: 'comparison', label: 'C — 对照 (Comparison)', placeholder: '与什么比较？', hint: '如：传统教学、安慰剂、标准护理' },
      { key: 'outcome', label: 'O — 结局 (Outcome)', placeholder: '测量什么结局？', hint: '如：临床推理评分、血压变化、生活质量量表' },
    ],
    example: {
      title: 'AI辅助SBAR交接训练对护生临床推理的影响',
      discipline: '护理学',
      values: {
        population: '某医科大学护理本科生（大三，已完成基础护理学课程）',
        intervention: 'AI辅助SBAR结构化交接训练（8周，每周2次模拟交接）',
        comparison: '传统SBAR交接教学（同频次面对面讲授+练习）',
        outcome: 'Lasater临床判断量表(LCJR)评分、SBAR沟通量表评分',
      },
    },
  },
  {
    id: 'prisma',
    name: 'PRISMA 框架',
    nameEn: 'PRISMA (Preferred Reporting Items for Systematic Reviews and Meta-Analyses)',
    description: '系统综述与 Meta 分析的国际报告标准，涵盖从文献检索到证据综合的完整流程，是高质量证据综合的必备框架。',
    bestFor: '系统综述、Meta分析、范围综述',
    disciplines: ['医学', '护理学', '教育学', '心理学', '社会科学'],
    fields: [
      { key: 'question', label: '研究问题 (Research Question)', placeholder: '系统综述要回答什么问题？', hint: '如：AI模拟教学对护生临床推理能力的影响' },
      { key: 'databases', label: '检索数据库 (Databases)', placeholder: '检索哪些数据库？', hint: '如：PubMed, CINAHL, CNKI, Web of Science' },
      { key: 'inclusion', label: '纳入标准 (Inclusion Criteria)', placeholder: '什么样的研究纳入？', hint: '如：RCT/类实验、护生人群、2020年后发表' },
      { key: 'exclusion', label: '排除标准 (Exclusion Criteria)', placeholder: '什么样的研究排除？', hint: '如：非中英文、无对照组、会议摘要' },
      { key: 'outcome', label: '主要结局 (Primary Outcome)', placeholder: '关注什么结局指标？', hint: '如：临床推理评分、知识测试成绩' },
    ],
    example: {
      title: 'AI模拟教学对护理学生临床推理能力影响的系统综述与Meta分析',
      discipline: '护理学/循证医学',
      values: {
        question: 'AI模拟教学是否比传统教学更有效地提升护理学生的临床推理能力？',
        databases: 'PubMed, CINAHL, Web of Science, CNKI, Wanfang, Embase, Cochrane Library',
        inclusion: 'RCT或类实验设计；护理学生；AI辅助教学干预；报告临床推理结局',
        exclusion: '非中英文文献；无对照组；会议摘要；无法获取全文',
        outcome: '临床推理能力评分（LCJR/CCTDI/CCTST等标准化量表）',
      },
    },
  },
  {
    id: 'consort',
    name: 'CONSORT 框架',
    nameEn: 'CONSORT (Consolidated Standards of Reporting Trials)',
    description: '随机对照试验的国际报告标准，确保试验设计、实施和报告的透明度与完整性，是发表高质量 RCT 的必备规范。',
    bestFor: '随机对照试验 (RCT)',
    disciplines: ['医学', '护理学', '心理学', '教育学', '康复医学'],
    fields: [
      { key: 'design', label: '试验设计 (Trial Design)', placeholder: '什么类型的RCT？', hint: '如：双臂平行、交叉设计、整群随机' },
      { key: 'participants', label: '参与者 (Participants)', placeholder: '纳入排除标准？', hint: '如：18-25岁护理本科生，无临床实习经验' },
      { key: 'intervention', label: '干预方案 (Intervention)', placeholder: '干预具体内容？', hint: '如：8周AI辅助SBAR训练，每周2次，每次90分钟' },
      { key: 'randomization', label: '随机化方法 (Randomization)', placeholder: '如何随机分组？', hint: '如：计算机生成随机序列，1:1分配' },
      { key: 'blinding', label: '盲法 (Blinding)', placeholder: '谁被设盲？', hint: '如：结局评估者盲法、数据分析者盲法' },
      { key: 'outcome', label: '结局指标 (Outcomes)', placeholder: '主要/次要结局？', hint: '如：主要=LCJR评分，次要=SBAR沟通量表' },
    ],
    example: {
      title: 'AI辅助SBAR训练对护生临床推理能力的随机对照试验',
      discipline: '护理学/医学教育',
      values: {
        design: '双臂平行随机对照试验，等待名单对照',
        participants: '护理本科生60名；纳入：大三在读、已完成健康评估课程；排除：有临床实习经验',
        intervention: 'AI辅助SBAR结构化交接训练（8周，每周2次模拟交接，每次90分钟）',
        randomization: '计算机生成随机序列，1:1分配至干预组/对照组，区组大小4',
        blinding: '结局评估者（LCJR评分教师）设盲；数据分析者设盲',
        outcome: '主要：LCJR临床判断评分；次要：SBAR沟通量表、学习满意度',
      },
    },
  },
  {
    id: 'strobe',
    name: 'STROBE 框架',
    nameEn: 'STROBE (Strengthening the Reporting of Observational Studies in Epidemiology)',
    description: '观察性研究的国际报告标准，涵盖队列研究、病例对照研究和横断面研究，是流行病学和社会科学观察性研究的标准框架。',
    bestFor: '观察性研究（队列/病例对照/横断面）',
    disciplines: ['流行病学', '公共卫生', '社会学', '心理学', '护理学'],
    fields: [
      { key: 'design', label: '研究设计 (Study Design)', placeholder: '什么类型的观察性研究？', hint: '如：横断面调查、前瞻性队列、病例对照' },
      { key: 'setting', label: '研究场所 (Setting)', placeholder: '在哪里做研究？', hint: '如：某医科大学护理学院、某三甲医院' },
      { key: 'participants', label: '参与者 (Participants)', placeholder: '纳入标准和来源？', hint: '如：便利抽样、整群抽样、连续纳入' },
      { key: 'variables', label: '变量 (Variables)', placeholder: '暴露/结局/混杂变量？', hint: '如：暴露=AI使用频率，结局=临床推理评分' },
      { key: 'bias', label: '偏倚控制 (Bias Control)', placeholder: '如何控制偏倚？', hint: '如：多变量回归调整、倾向性评分匹配' },
      { key: 'sampleSize', label: '样本量 (Sample Size)', placeholder: '样本量如何确定？', hint: '如：G*Power估算，α=0.05, power=0.80' },
    ],
    example: {
      title: '护理本科生AI工具使用与临床推理能力的横断面调查',
      discipline: '护理学/教育研究',
      values: {
        design: '横断面调查研究',
        setting: '某师范大学医学院护理系',
        participants: '全体在校护理本科生（大一至大四），便利抽样',
        variables: '自变量：AI工具使用频率/类型/时长；因变量：临床推理评分；协变量：年级、GPA、性别',
        bias: '多变量线性回归调整混杂；Harman单因素检验共同方法偏差',
        sampleSize: 'G*Power估算：f²=0.15, α=0.05, power=0.80, 预测变量5个 → 至少92人',
      },
    },
  },
  {
    id: 'imrad',
    name: 'IMRaD 框架',
    nameEn: 'IMRaD (Introduction, Methods, Results, and Discussion)',
    description: '科学研究论文的标准结构框架，适用于实验科学、自然科学和工程学的原创研究，是 Nature/Science 论文的基础结构。',
    bestFor: '实验研究、原创研究论文',
    disciplines: ['理学', '工学', '农学', '医学', '计算机科学'],
    fields: [
      { key: 'introduction', label: 'I — 引言 (Introduction)', placeholder: '研究背景和问题是什么？', hint: '已知什么？未知什么？为什么重要？' },
      { key: 'methods', label: 'M — 方法 (Methods)', placeholder: '怎么做这个研究？', hint: '实验设计、数据来源、分析方法' },
      { key: 'results', label: 'R — 结果 (Results)', placeholder: '发现了什么？', hint: '客观呈现数据和发现，不做解释' },
      { key: 'discussion', label: 'D — 讨论 (Discussion)', placeholder: '结果意味着什么？', hint: '解释结果、比较前人、局限性、未来方向' },
    ],
    example: {
      title: '基于深度学习的护理诊断预测模型开发与验证',
      discipline: '计算机科学/护理信息学',
      values: {
        introduction: '护理诊断是临床决策的核心环节，但护生诊断准确性低。深度学习在医学影像和NLP领域已有突破，但在护理诊断预测中的应用尚缺。',
        methods: '回顾性收集某三甲医院2020-2025年电子病历5000例；LSTM+Attention模型；5折交叉验证；对比Logistic回归和随机森林基线。',
        results: '深度学习模型AUC=0.89 (95%CI 0.87-0.91)，显著优于基线模型（LR: 0.76, RF: 0.79）。Top-5诊断准确率82.3%。',
        discussion: '模型在常见诊断上表现优异但罕见诊断召回率不足（34%）。外部验证队列AUC下降至0.81，提示泛化能力有待提高。未来工作包括联邦学习多中心验证。',
      },
    },
  },
];

/** 根据学科推荐框架 */
export function getFrameworksByDiscipline(discipline: string): ResearchFramework[] {
  const map: Record<string, string[]> = {
    '医学': ['pico', 'consort', 'prisma', 'strobe', 'imrad'],
    '护理学': ['pico', 'consort', 'prisma', 'strobe', 'imrad'],
    '公共卫生': ['strobe', 'prisma', 'pico', 'consort', 'imrad'],
    '心理学': ['consort', 'strobe', 'prisma', 'pico', 'imrad'],
    '教育学': ['consort', 'strobe', 'prisma', 'pico', 'imrad'],
    '理学': ['imrad', 'strobe', 'prisma', 'pico', 'consort'],
    '工学': ['imrad', 'strobe', 'consort', 'prisma', 'pico'],
    '农学': ['imrad', 'strobe', 'consort', 'prisma', 'pico'],
    '社会科学': ['strobe', 'prisma', 'consort', 'pico', 'imrad'],
  };
  const ids = map[discipline] || ['pico', 'prisma', 'consort', 'strobe', 'imrad'];
  return ids.map((id) => RESEARCH_FRAMEWORKS.find((f) => f.id === id)!).filter(Boolean);
}
