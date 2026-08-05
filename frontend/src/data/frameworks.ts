/**
 * 科研框架模板 —— 覆盖 13 个学科门类的研究设计框架库
 * 医学循证系（PICO/PRISMA/CONSORT/STROBE）+ 社科质性系（SPIDER/扎根/问卷/案例）
 * + 理工实验系（DOE/IMRaD）+ 人文系（内容分析/规范分析/概念分析）+ 经管实证系
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
  // ========== 通用 ==========
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
      title: '新型光催化剂降解水中有机污染物的性能研究',
      discipline: '理学/环境化学',
      values: {
        introduction: '水中有机污染物处理是环境治理难题。TiO2光催化成本低但可见光利用率不足5%。掺杂改性可能拓宽光谱响应范围。',
        methods: '水热法合成N掺杂TiO2；XRD/SEM/UV-Vis表征；以罗丹明B为模型污染物测试降解率；对比商业P25。',
        results: 'N-TiO2在可见光下120min降解率达92%，是P25的3.1倍；循环5次后活性保持87%。',
        discussion: 'N掺杂引入中间能级拓宽了光响应。但实际废水基质中效率下降约30%，离子干扰机制需进一步研究。',
      },
    },
  },

  // ========== 医学 / 循证系 ==========
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
    description: '系统综述与 Meta 分析的国际报告标准，涵盖从文献检索到证据综合的完整流程，也广泛用于教育学、心理学和社会科学的证据综合。',
    bestFor: '系统综述、Meta分析、范围综述',
    disciplines: ['医学', '护理学', '教育学', '心理学', '社会科学'],
    fields: [
      { key: 'question', label: '研究问题 (Research Question)', placeholder: '系统综述要回答什么问题？', hint: '如：翻转课堂对大学生学业成绩的影响' },
      { key: 'databases', label: '检索数据库 (Databases)', placeholder: '检索哪些数据库？', hint: '如：Web of Science, Scopus, CNKI, ERIC' },
      { key: 'inclusion', label: '纳入标准 (Inclusion Criteria)', placeholder: '什么样的研究纳入？', hint: '如：RCT/准实验、报告标准化成绩、2015年后' },
      { key: 'exclusion', label: '排除标准 (Exclusion Criteria)', placeholder: '什么样的研究排除？', hint: '如：无对照组、会议摘要、数据不可提取' },
      { key: 'outcome', label: '主要结局 (Primary Outcome)', placeholder: '关注什么结局指标？', hint: '如：标准化测验成绩、效应量d' },
    ],
    example: {
      title: '翻转课堂对大学生学业成绩影响的Meta分析',
      discipline: '教育学',
      values: {
        question: '翻转课堂相比传统讲授是否显著提升大学生学业成绩？效应在学科间是否有差异？',
        databases: 'Web of Science, Scopus, ERIC, CNKI, Wanfang, ProQuest',
        inclusion: 'RCT或准实验设计；大学生人群；翻转课堂干预；报告可计算效应量的成绩数据',
        exclusion: '无对照组；无成绩数据；重复发表；非中英文',
        outcome: '标准化均数差(SMD)表示的学业成绩效应量；学科/地区/干预时长的亚组分析',
      },
    },
  },
  {
    id: 'consort',
    name: 'CONSORT 框架',
    nameEn: 'CONSORT (Consolidated Standards of Reporting Trials)',
    description: '随机对照试验的国际报告标准，确保试验设计、实施和报告的透明度与完整性。除医学外，心理学和教育学的干预实验也普遍采用。',
    bestFor: '随机对照试验 (RCT)、干预实验',
    disciplines: ['医学', '护理学', '心理学', '教育学', '康复医学'],
    fields: [
      { key: 'design', label: '试验设计 (Trial Design)', placeholder: '什么类型的RCT？', hint: '如：双臂平行、交叉设计、整群随机' },
      { key: 'participants', label: '参与者 (Participants)', placeholder: '纳入排除标准？', hint: '如：某高校大一新生，无相关训练经历' },
      { key: 'intervention', label: '干预方案 (Intervention)', placeholder: '干预具体内容？', hint: '如：8周正念训练，每周2次，每次45分钟' },
      { key: 'randomization', label: '随机化方法 (Randomization)', placeholder: '如何随机分组？', hint: '如：计算机生成随机序列，1:1分配' },
      { key: 'blinding', label: '盲法 (Blinding)', placeholder: '谁被设盲？', hint: '如：结局评估者盲法、数据分析者盲法' },
      { key: 'outcome', label: '结局指标 (Outcomes)', placeholder: '主要/次要结局？', hint: '如：主要=焦虑量表评分，次要=睡眠质量' },
    ],
    example: {
      title: '正念训练对大学生考试焦虑的随机对照试验',
      discipline: '心理学',
      values: {
        design: '双臂平行随机对照试验，等待名单对照',
        participants: '某高校本科生80名；纳入：考试焦虑量表≥临界值；排除：正在接受心理治疗',
        intervention: '正念减压训练（MBSR改编版，8周，每周2次，每次45分钟）',
        randomization: '计算机生成随机序列，1:1分配，性别分层区组随机',
        blinding: '结局评估者与数据分析者设盲；参与者因干预性质无法设盲',
        outcome: '主要：考试焦虑量表(TAS)评分；次要：匹兹堡睡眠质量指数、正念注意觉知量表',
      },
    },
  },
  {
    id: 'strobe',
    name: 'STROBE 框架',
    nameEn: 'STROBE (Strengthening the Reporting of Observational Studies in Epidemiology)',
    description: '观察性研究的国际报告标准，涵盖队列、病例对照和横断面研究。流行病学之外，社会学、经济学的观察性数据分析也参照执行。',
    bestFor: '观察性研究（队列/病例对照/横断面）',
    disciplines: ['流行病学', '公共卫生', '社会学', '心理学', '护理学', '经济学'],
    fields: [
      { key: 'design', label: '研究设计 (Study Design)', placeholder: '什么类型的观察性研究？', hint: '如：横断面调查、前瞻性队列、病例对照' },
      { key: 'setting', label: '研究场所 (Setting)', placeholder: '在哪里做研究？', hint: '如：某省三座城市、全国代表性样本' },
      { key: 'participants', label: '参与者 (Participants)', placeholder: '纳入标准和来源？', hint: '如：分层随机抽样、连续纳入' },
      { key: 'variables', label: '变量 (Variables)', placeholder: '暴露/结局/混杂变量？', hint: '如：暴露=社交媒体使用时长，结局=抑郁评分' },
      { key: 'bias', label: '偏倚控制 (Bias Control)', placeholder: '如何控制偏倚？', hint: '如：多变量回归调整、倾向性评分匹配' },
      { key: 'sampleSize', label: '样本量 (Sample Size)', placeholder: '样本量如何确定？', hint: '如：G*Power估算，α=0.05, power=0.80' },
    ],
    example: {
      title: '社交媒体使用时长与青少年抑郁症状的横断面关联研究',
      discipline: '社会学/公共卫生',
      values: {
        design: '横断面调查研究',
        setting: '某省6所中学（城市4所/农村2所）',
        participants: '12-18岁在校生，分层整群抽样，有效问卷2341份（回收率91.2%）',
        variables: '自变量：日均社交媒体使用时长；因变量：CES-D抑郁评分；协变量：性别/年级/家庭经济/睡眠时间',
        bias: '多变量logistic回归调整混杂；敏感性分析排除极端值；Harman检验共同方法偏差',
        sampleSize: '基于既往OR=1.5、暴露率40%估算，需至少1800人（α=0.05, power=0.90）',
      },
    },
  },

  // ========== 社会科学 / 质性系 ==========
  {
    id: 'spider',
    name: 'SPIDER 框架',
    nameEn: 'SPIDER (Sample, Phenomenon of Interest, Design, Evaluation, Research type)',
    description: '质性研究的问题构建框架，是 PICO 在质性/混合研究中的对应物，适用于访谈、焦点小组等质性证据的检索与设计。',
    bestFor: '质性研究、混合研究、质性系统综述',
    disciplines: ['社会科学', '教育学', '心理学', '护理学', '管理学'],
    fields: [
      { key: 'sample', label: 'S — 样本 (Sample)', placeholder: '研究谁的经验/观点？', hint: '如：乡村教师、初创企业创始人、独居老人' },
      { key: 'phenomenon', label: 'PI — 关实现象 (Phenomenon of Interest)', placeholder: '关注什么现象/体验？', hint: '如：职业倦怠的体验、数字化转型的阻力' },
      { key: 'design', label: 'D — 研究设计 (Design)', placeholder: '用什么质性方法？', hint: '如：半结构访谈、焦点小组、参与式观察' },
      { key: 'evaluation', label: 'E — 评估 (Evaluation)', placeholder: '产出什么形式的资料？', hint: '如：主题分析提炼的主题、叙事文本' },
      { key: 'researchType', label: 'R — 研究类型 (Research type)', placeholder: '质性/量化/混合？', hint: '如：纯质性、质性为主的混合设计' },
    ],
    example: {
      title: '乡村青年教师职业倦怠体验的质性研究',
      discipline: '教育学',
      values: {
        sample: '中西部乡村小学任教3年以内的青年教师（目的抽样+滚雪球，n=18）',
        phenomenon: '职业倦怠的发生过程、情绪体验与应对策略',
        design: '半结构深度访谈（每人60-90分钟）+ 教学日志补充',
        evaluation: 'NVivo三级编码提炼主题；受访者校验(member checking)保证可信性',
        researchType: '纯质性研究（解释现象学取向）',
      },
    },
  },
  {
    id: 'grounded-theory',
    name: '扎根理论',
    nameEn: 'Grounded Theory (Glaser & Strauss / Strauss & Corbin)',
    description: '从原始资料中自下而上建构理论的质性方法论，通过开放式编码、主轴编码、选择性编码三级程序提炼核心范畴，适合尚无成熟理论解释的新现象。',
    bestFor: '理论建构型质性研究、新现象探索',
    disciplines: ['社会学', '管理学', '教育学', '护理学', '传播学'],
    fields: [
      { key: 'phenomenon', label: '研究现象 (Phenomenon)', placeholder: '要解释什么新现象？', hint: '如：外卖骑手的时间观、县城青年的消费降级' },
      { key: 'sampling', label: '理论抽样 (Theoretical Sampling)', placeholder: '如何随编码进展选样本？', hint: '如：先便利抽样，后按范畴发展需要补充样本' },
      { key: 'openCoding', label: '开放式编码 (Open Coding)', placeholder: '如何打散资料贴标签？', hint: '如：逐行编码，提取初始概念120+个' },
      { key: 'axialCoding', label: '主轴编码 (Axial Coding)', placeholder: '概念如何聚成范畴？', hint: '如：用因果-现象-脉络-策略-结果范式模型' },
      { key: 'selectiveCoding', label: '选择性编码 (Selective Coding)', placeholder: '核心范畴与故事线？', hint: '如：核心范畴"时间驯化"统领5个主范畴' },
      { key: 'saturation', label: '理论饱和 (Saturation)', placeholder: '如何判断饱和？', hint: '如：连续3份访谈无新概念出现，预留2份验证' },
    ],
    example: {
      title: '平台零工劳动者时间体验的扎根理论研究',
      discipline: '社会学',
      values: {
        phenomenon: '算法管理下外卖骑手的时间体验与时间策略——既有劳动过程理论未充分解释的新现象',
        sampling: '初始便利访谈12名骑手；随编码发展补充女骑手、专送/众包对比样本共27人',
        openCoding: '逐行编码28万字转录文本，提取"抢单焦虑""时间碎片"等初始概念134个',
        axialCoding: '按范式模型聚合为"算法时间压迫""身体时间损耗""能动时间策略"等12个范畴',
        selectiveCoding: '核心范畴"时间的双重驯化与反驯化"，构建过程模型',
        saturation: '第25份访谈后无新范畴，预留2份做理论饱和度检验',
      },
    },
  },
  {
    id: 'survey',
    name: '问卷调查设计',
    nameEn: 'Survey Research Design',
    description: '社会科学量化研究的主力方法，核心是抽样代表性、量表信效度和统计推断链条。适用于态度、行为、满意度和现状描述类研究。',
    bestFor: '现状调查、态度测量、关系检验（横断面量化）',
    disciplines: ['社会科学', '心理学', '管理学', '教育学', '传播学', '经济学'],
    fields: [
      { key: 'population', label: '总体与抽样框 (Population & Sampling Frame)', placeholder: '研究总体是谁？如何获得名单？', hint: '如：某市在校大学生，按学校-专业分层' },
      { key: 'sampling', label: '抽样方法 (Sampling)', placeholder: '概率还是非概率抽样？', hint: '如：分层随机抽样；样本量按公式 n=Z²p(1-p)/e² 估算' },
      { key: 'instrument', label: '测量工具 (Instrument)', placeholder: '用什么量表/自编题项？', hint: '如：成熟量表优先；自编需预试做信效度' },
      { key: 'validity', label: '信效度 (Reliability & Validity)', placeholder: '如何保证测量质量？', hint: '如：Cronbach α>0.8；探索性+验证性因子分析' },
      { key: 'analysis', label: '统计分析 (Analysis)', placeholder: '用什么统计方法？', hint: '如：描述统计+相关+多元回归/SEM' },
    ],
    example: {
      title: '大学生短视频使用与注意力关系的问卷调查',
      discipline: '传播学',
      values: {
        population: '某省5所高校全日制在校本科生；按学校类型（双一流/普通本科/高职）分层',
        sampling: '分层随机抽样，按5%误差、95%置信度估算最低样本量384，实际发放1200份',
        instrument: '短视频使用强度量表(改编)+注意力控制量表(ACS)+自编使用动机题项',
        validity: '预试120份做项目分析与EFA；正式样本CFA验证结构效度；α系数0.82-0.91',
        analysis: '描述统计→相关分析→多元层级回归（控制性别/年级/专业）→Bootstrap中介检验',
      },
    },
  },
  {
    id: 'case-study',
    name: '案例研究法',
    nameEn: 'Case Study Research (Yin / Eisenhardt)',
    description: '在真实情境中深入剖析一个或多个案例的研究策略，回答"如何"和"为什么"类问题。单案例深描、多案例复制逻辑，是管理学和法学的主流方法之一。',
    bestFor: '组织/制度/事件深度剖析、机制解释',
    disciplines: ['管理学', '法学', '经济学', '教育学', '公共管理', '军事学'],
    fields: [
      { key: 'question', label: '研究问题 (How/Why Question)', placeholder: '要解释什么机制？', hint: '如：传统制造企业如何实现数字化转型？' },
      { key: 'caseSelection', label: '案例选择 (Case Selection)', placeholder: '选哪个/哪些案例？为何？', hint: '如：理论抽样选极端/典型/对立案例' },
      { key: 'dataSources', label: '数据来源 (Data Sources)', placeholder: '如何三角验证？', hint: '如：访谈+档案+观察+公开数据多源印证' },
      { key: 'analysis', label: '分析策略 (Analysis)', placeholder: '如何分析案例资料？', hint: '如：模式匹配、时间序列、跨案例复制' },
      { key: 'rigor', label: '严谨性 (Rigor)', placeholder: '如何保证信度效度？', hint: '如：案例研究数据库、证据链、评审者复核' },
    ],
    example: {
      title: '传统零售企业数字化转型的双案例对比研究',
      discipline: '管理学',
      values: {
        question: '传统零售企业数字化转型中，组织能力如何影响转型成败？',
        caseSelection: '理论抽样选两家同区域同规模商超：A转型成功、B转型失败（对立设计）',
        dataSources: '高管访谈23人次+内部文件+门店观察+财报数据，四源三角验证',
        analysis: '案例内时间序列分析→跨案例模式匹配，提炼"能力-路径"机制模型',
        rigor: '建立案例数据库存档全部证据链；两名编码者独立编码一致性87%后协商',
      },
    },
  },
  {
    id: 'mixed-methods',
    name: '混合研究设计',
    nameEn: 'Mixed Methods Research (Creswell)',
    description: '量化与质性方法的系统性整合设计，包括聚敛式、解释顺序式和探索顺序式三大经典设计，用一类数据弥补另一类的不足。',
    bestFor: '需要"广度和深度兼得"的复杂研究问题',
    disciplines: ['教育学', '社会科学', '心理学', '管理学', '公共卫生'],
    fields: [
      { key: 'design', label: '整合设计 (Design)', placeholder: '哪种混合设计？', hint: '如：解释顺序式（先量化后质性）' },
      { key: 'quantPhase', label: '量化阶段 (QUAN Phase)', placeholder: '量化部分做什么？', hint: '如：问卷300份，检验变量关系' },
      { key: 'qualPhase', label: '质性阶段 (QUAL Phase)', placeholder: '质性部分做什么？', hint: '如：访谈15人，解释量化发现的异常' },
      { key: 'integration', label: '整合点 (Integration)', placeholder: '两阶段在哪整合？', hint: '如：抽样衔接（从问卷受访者中选访谈对象）' },
      { key: 'metaInference', label: '元推论 (Meta-inference)', placeholder: '两类证据如何合成结论？', hint: '如：联合展示表(joint display)对照' },
    ],
    example: {
      title: '在线学习中师生互动对学习投入影响的混合研究',
      discipline: '教育学',
      values: {
        design: '解释顺序式混合设计（QUAN→QUAL），量化为主质性为辅',
        quantPhase: '在线学习投入问卷(N=412)，回归分析发现"互动频率→投入"关系在男生中不显著',
        qualPhase: '针对异常发现访谈16名男生，揭示"工具性互动偏好"的调节机制',
        integration: '从问卷高分/低分组中目的抽样访谈对象；质性主题回授修正回归模型',
        metaInference: '联合展示表呈现"统计显著性×质性解释"，形成分层结论',
      },
    },
  },

  // ========== 理工实验系 ==========
  {
    id: 'doe',
    name: '实验设计 (DOE)',
    nameEn: 'Design of Experiments (Fisher / Box)',
    description: '通过系统的因素-水平安排、随机化和重复来分离变量效应的实验方法论，包括全因子、部分因子、响应面等设计，是理工农实验科学的质量基石。',
    bestFor: '可控实验、工艺优化、因素筛选',
    disciplines: ['工学', '理学', '农学', '材料科学', '化学'],
    fields: [
      { key: 'factors', label: '因素与水平 (Factors & Levels)', placeholder: '考察哪些因素？各取几个水平？', hint: '如：温度(3水平)×压力(2水平)×时间(3水平)' },
      { key: 'response', label: '响应变量 (Response)', placeholder: '测量什么输出？', hint: '如：产率、强度、纯度、存活率' },
      { key: 'designType', label: '设计类型 (Design Type)', placeholder: '全因子/部分因子/响应面？', hint: '如：3因素先部分因子筛选，再响应面优化' },
      { key: 'randomization', label: '随机化与区组 (Randomization & Blocking)', placeholder: '如何安排实验顺序？', hint: '如：完全随机；按批次设区组' },
      { key: 'replication', label: '重复 (Replication)', placeholder: '每个处理重复几次？', hint: '如：中心点重复5次估计纯误差' },
      { key: 'analysis', label: '方差分析 (ANOVA)', placeholder: '如何检验因素显著性？', hint: '如：ANOVA+主效应/交互效应图' },
    ],
    example: {
      title: '3D打印工艺参数对零件拉伸强度的响应面优化',
      discipline: '工学/机械制造',
      values: {
        factors: '打印温度(210-230°C)、层厚(0.1-0.3mm)、填充率(20-80%)、打印速度(30-70mm/s)',
        response: '拉伸强度(MPa)与表面粗糙度(Ra)双响应',
        designType: 'Box-Behnken响应面设计（4因素29组，含5个中心点）',
        randomization: '实验顺序完全随机化；每更换线材批次设区组',
        replication: '中心点重复5次估计纯误差；失拟检验验证模型充分性',
        analysis: '二次回归模型ANOVA；等高线图找最优窗口；验证实验确认预测值±5%内',
      },
    },
  },

  // ========== 经管实证系 ==========
  {
    id: 'econometric',
    name: '计量实证框架',
    nameEn: 'Empirical Econometric Research Design',
    description: '经济学实证研究的标准范式：理论假说→变量与数据→模型设定→基准回归→稳健性/内生性处理→异质性分析，强调因果识别的可信度。',
    bestFor: '经济学实证、政策评估、面板数据分析',
    disciplines: ['经济学', '管理学', '金融学', '公共管理'],
    fields: [
      { key: 'hypothesis', label: '理论假说 (Hypothesis)', placeholder: '从理论推出什么可检验假说？', hint: '如：H1数字普惠金融促进农村消费' },
      { key: 'data', label: '数据 (Data)', placeholder: '什么数据？覆盖范围？', hint: '如：CFPS 2014-2022五期面板' },
      { key: 'model', label: '模型设定 (Model)', placeholder: '基准模型怎么设？', hint: '如：双向固定效应 Y_it=α+βX_it+μ_i+λ_t+ε' },
      { key: 'identification', label: '识别策略 (Identification)', placeholder: '如何处理内生性？', hint: '如：工具变量/DID/PSM/断点回归' },
      { key: 'robustness', label: '稳健性检验 (Robustness)', placeholder: '做哪些稳健性检验？', hint: '如：替换变量/缩尾/安慰剂检验' },
      { key: 'heterogeneity', label: '异质性分析 (Heterogeneity)', placeholder: '效应在哪类群体中更强？', hint: '如：分收入组/地区/年龄组' },
    ],
    example: {
      title: '数字普惠金融对农村居民消费的影响研究',
      discipline: '经济学',
      values: {
        hypothesis: 'H1：数字普惠金融显著促进农村居民消费；H2：通过缓解信贷约束中介',
        data: '北大数字普惠金融指数×CFPS 2014-2022五期面板，匹配后约1.8万户次',
        model: '双向固定效应模型：消费_it=α+β·数字金融_it+γ·控制变量+个体固定效应+年份固定效应',
        identification: '工具变量（到杭州球面距离×全国指数均值）；PSM-DID做政策冲击验证',
        robustness: '替换被解释变量口径、1%缩尾、剔除直辖市、安慰剂检验（随机分配政策时点）',
        heterogeneity: '分组回归：效应在低收入组、中西部地区、中老年户主中显著更强',
      },
    },
  },

  // ========== 人文系 ==========
  {
    id: 'content-analysis',
    name: '内容分析法',
    nameEn: 'Content Analysis (Krippendorff)',
    description: '对文本、图像、音视频等传播内容进行系统、客观、量化分析的方法，核心是编码框架的构建与编码者间信度。文学、新闻、历史文献研究的量化路径。',
    bestFor: '文本/媒体内容量化、历史文献分析、话语研究',
    disciplines: ['文学', '新闻传播学', '历史学', '艺术学', '政治学'],
    fields: [
      { key: 'corpus', label: '语料库 (Corpus)', placeholder: '分析什么材料？如何取样？', hint: '如：某报1980-2020年相关报道全样本' },
      { key: 'codingScheme', label: '编码框架 (Coding Scheme)', placeholder: '类目怎么构建？', hint: '如：基于理论演绎+试编码归纳结合' },
      { key: 'unit', label: '分析单位 (Unit of Analysis)', placeholder: '以什么为编码单位？', hint: '如：每篇报道/每段/每个意象' },
      { key: 'reliability', label: '编码信度 (Inter-coder Reliability)', placeholder: '如何保证编码一致？', hint: "如：双编码，Krippendorff's α>0.80" },
      { key: 'analysis', label: '分析策略 (Analysis)', placeholder: '量化统计还是诠释？', hint: '如：频次+历时趋势+共现分析' },
    ],
    example: {
      title: '《人民日报》四十年"科学家"形象建构的内容分析',
      discipline: '新闻传播学',
      values: {
        corpus: '1980-2020年《人民日报》含"科学家"报道全样本，按年份分层抽取1200篇',
        codingScheme: '理论演绎（形象理论）+试编码归纳：身份类型/品质词汇/叙事框架/信源结构4个一级类目',
        unit: '以单篇报道为情景单位，以单个科学家形象表征为编码单位',
        reliability: "两名编码员独立编码10%样本，Krippendorff's α=0.83-0.91后分编",
        analysis: '频次历时趋势分析+语义网络共现分析+典型文本深读三角印证',
      },
    },
  },
  {
    id: 'doctrinal',
    name: '规范分析法',
    nameEn: 'Doctrinal Legal Research',
    description: '法学的经典方法论，通过法律解释、体系分析和漏洞填补研究"法是什么"，以法律规范文本为核心，结合判例检验规范的适用逻辑。',
    bestFor: '法学规范研究、法律解释、制度构建',
    disciplines: ['法学'],
    fields: [
      { key: 'issue', label: '规范问题 (Legal Issue)', placeholder: '要解决什么法律问题？', hint: '如：AI生成内容的著作权归属如何认定？' },
      { key: 'sources', label: '规范文本 (Legal Sources)', placeholder: '依据哪些法律渊源？', hint: '如：著作权法+实施条例+司法解释+国际条约' },
      { key: 'interpretation', label: '解释方法 (Interpretation)', placeholder: '用什么解释方法？', hint: '如：文义→体系→目的→历史解释的顺位' },
      { key: 'cases', label: '判例检验 (Case Testing)', placeholder: '如何验证解释结论？', hint: '如：类案检索检验司法实践立场' },
      { key: 'conclusion', label: '规范结论 (Normative Conclusion)', placeholder: '得出什么解释/立法建议？', hint: '如：解释论方案 or 立法论建议' },
    ],
    example: {
      title: '人工智能生成内容著作权归属的规范分析',
      discipline: '法学',
      values: {
        issue: 'AI生成内容是否构成著作权法意义上的"作品"？权利应归属何人？',
        sources: '《著作权法》第3条/第11条、实施条例、伯尔尼公约、域外立法例（英美欧日）比较',
        interpretation: '文义解释"自然人创作"要件→体系解释与邻接权关系→目的解释激励理论检验',
        cases: '类案检索"菲林案""腾讯案"等AI生成物判例，检验法院对"独创性"的认定分歧',
        conclusion: '解释论：使用者可经"必要干预"标准取得作者地位；立法论：建议增设AI生成物特别规定',
      },
    },
  },
  {
    id: 'conceptual',
    name: '概念分析法',
    nameEn: 'Conceptual Analysis',
    description: '哲学研究的核心方法，通过必要条件与充分条件的界定、思想实验和反例检验来澄清概念的含义与边界，是分析哲学传统的标准工具。',
    bestFor: '哲学论证、伦理学分析、概念澄清',
    disciplines: ['哲学', '伦理学', '逻辑学'],
    fields: [
      { key: 'concept', label: '待析概念 (Target Concept)', placeholder: '分析哪个概念？', hint: '如：知识、正义、意识、自由意志' },
      { key: 'intuitions', label: '直觉案例 (Intuitive Cases)', placeholder: '哪些案例划定用法边界？', hint: '如：葛梯尔案例挑战传统知识定义' },
      { key: 'conditions', label: '必要条件 (Necessary Conditions)', placeholder: '构成该概念必须满足什么？', hint: '如：JTB：相信/为真/得到辩护' },
      { key: 'counterexamples', label: '反例检验 (Counterexamples)', placeholder: '什么情形推翻当前定义？', hint: '如：构造满足条件但直觉上不算的反例' },
      { key: 'revision', label: '修正方案 (Revision)', placeholder: '如何修正定义？', hint: '如：增补条件/替换条件/放弃分析转向家族相似' },
    ],
    example: {
      title: '"算法公平"概念的分析哲学考察',
      discipline: '哲学/科技伦理',
      values: {
        concept: '算法决策语境下"公平"(fairness)概念的内涵与边界',
        intuitions: '招聘算法性别歧视案、COMPAS再犯预测种族差异案等划定日常用法边界',
        conditions: '既有文献的候选条件：统计均等/机会均等/校准性/个体公平——逐一检验必要性',
        counterexamples: '构造思想实验：满足统计均等但违反个体公平的推荐系统，证明单条件不充分',
        revision: '提出"分层公平"概念框架：分配层/程序层/承认层分别适用不同条件',
      },
    },
  },
  {
    id: 'action-research',
    name: '行动研究',
    nameEn: 'Action Research (Lewin / Kemmis)',
    description: '"计划-行动-观察-反思"螺旋循环的实践研究方法，研究者即实践者，在真实工作情境中改进实践并生成知识。教师研究和组织变革研究的主流路径。',
    bestFor: '教学改进、组织变革、实践者研究',
    disciplines: ['教育学', '管理学', '社会工作', '护理学'],
    fields: [
      { key: 'problem', label: '实践问题 (Practical Problem)', placeholder: '工作中要改进什么？', hint: '如：高一物理课堂参与度低' },
      { key: 'plan', label: '行动计划 (Plan)', placeholder: '第一轮干预怎么做？', hint: '如：引入5分钟小组探究环节' },
      { key: 'action', label: '行动实施 (Action)', placeholder: '如何实施并记录？', hint: '如：实施4周，课堂录像+学生日志' },
      { key: 'observation', label: '观察评估 (Observation)', placeholder: '如何收集效果证据？', hint: '如：参与度编码表+访谈+成绩对比' },
      { key: 'reflection', label: '反思迭代 (Reflection)', placeholder: '第一轮教会我们什么？', hint: '如：有效但后排学生游离→第二轮调整分组' },
    ],
    example: {
      title: '基于问题导向学习的高中物理课堂改进行动研究',
      discipline: '教育学',
      values: {
        problem: '所带班级物理课堂参与度持续走低（发言率<15%），传统讲授改进无效',
        plan: '第一轮：每周2节PBL试点课，真实问题情境导入+小组探究',
        action: '实施4周共8节课；课堂录像、学生探究单、教师反思日志三路记录',
        observation: '参与度编码（发言率15%→42%）+8名学生焦点访谈+单元测验对比',
        reflection: '参与度显著提升但学困生被边缘化→第二轮引入异质分组与角色轮换，进入新循环',
      },
    },
  },
];

/** 根据学科推荐框架（按适用度排序，学科未匹配时返回全部通用优先） */
export function getFrameworksByDiscipline(discipline: string): ResearchFramework[] {
  const map: Record<string, string[]> = {
    '哲学': ['conceptual', 'content-analysis', 'grounded-theory', 'imrad', 'survey'],
    '经济学': ['econometric', 'case-study', 'survey', 'strobe', 'mixed-methods'],
    '法学': ['doctrinal', 'case-study', 'content-analysis', 'survey', 'mixed-methods'],
    '教育学': ['action-research', 'consort', 'survey', 'mixed-methods', 'spider', 'grounded-theory', 'prisma', 'strobe'],
    '文学': ['content-analysis', 'conceptual', 'grounded-theory', 'imrad', 'spider'],
    '历史学': ['content-analysis', 'doctrinal', 'case-study', 'grounded-theory', 'imrad'],
    '理学': ['imrad', 'doe', 'strobe', 'prisma', 'survey'],
    '工学': ['doe', 'imrad', 'case-study', 'survey', 'prisma'],
    '农学': ['doe', 'imrad', 'strobe', 'survey', 'prisma'],
    '医学': ['pico', 'consort', 'prisma', 'strobe', 'imrad', 'spider'],
    '护理学': ['pico', 'consort', 'prisma', 'strobe', 'spider', 'grounded-theory', 'action-research'],
    '公共卫生': ['strobe', 'prisma', 'pico', 'consort', 'survey', 'mixed-methods'],
    '管理学': ['case-study', 'survey', 'econometric', 'grounded-theory', 'mixed-methods', 'action-research'],
    '艺术学': ['content-analysis', 'case-study', 'grounded-theory', 'survey', 'spider'],
    '军事学': ['case-study', 'doctrinal', 'content-analysis', 'survey', 'imrad'],
    '心理学': ['consort', 'strobe', 'survey', 'mixed-methods', 'spider', 'prisma'],
    '社会科学': ['survey', 'grounded-theory', 'spider', 'case-study', 'mixed-methods', 'strobe', 'prisma'],
    '社会学': ['grounded-theory', 'survey', 'strobe', 'case-study', 'mixed-methods', 'spider'],
    '传播学': ['content-analysis', 'survey', 'grounded-theory', 'case-study', 'spider'],
    '计算机科学': ['imrad', 'doe', 'prisma', 'survey', 'case-study'],
    '材料科学': ['doe', 'imrad', 'strobe'],
    '化学': ['doe', 'imrad', 'strobe'],
    '流行病学': ['strobe', 'prisma', 'pico', 'consort', 'survey'],
    '公共管理': ['case-study', 'econometric', 'survey', 'mixed-methods', 'grounded-theory'],
    '金融学': ['econometric', 'case-study', 'survey', 'strobe'],
    '新闻传播学': ['content-analysis', 'survey', 'grounded-theory', 'spider', 'case-study'],
    '政治学': ['content-analysis', 'case-study', 'doctrinal', 'survey', 'mixed-methods'],
    '伦理学': ['conceptual', 'case-study', 'grounded-theory'],
    '逻辑学': ['conceptual', 'content-analysis'],
    '社会工作': ['action-research', 'case-study', 'survey', 'spider', 'mixed-methods'],
    '药学': ['pico', 'consort', 'prisma', 'doe', 'imrad'],
    '康复医学': ['consort', 'pico', 'strobe', 'survey', 'action-research'],
  };
  // 未匹配学科：返回覆盖度最广的通用序列
  const ids = map[discipline] || ['imrad', 'survey', 'case-study', 'prisma', 'grounded-theory', 'doe', 'mixed-methods', 'pico', 'strobe', 'consort'];
  return ids.map((id) => RESEARCH_FRAMEWORKS.find((f) => f.id === id)!).filter(Boolean);
}
