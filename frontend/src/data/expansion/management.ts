/**
 * 管理学扩展数据
 * R93 第一批
 */

import type { DisciplineExpansion } from './index';

export const MANAGEMENT_EXTRA: DisciplineExpansion = {
  glossary: [
    { term: '泰勒科学管理', termEn: 'Taylor\'s Scientific Management', definition: '20世纪初泰勒提出的以提高生产效率为核心的管理理论。核心原则：工作标准化（时间-动作研究确定最佳方法）、科学选拔与培训工人、计划与执行分离、差别计件工资制。泰勒制是现代工业管理的基础，但被批评忽视人的社会性和心理需求。', category: '管理思想史', source: 'Taylor FW (1911)《科学管理原理》' },
    { term: '霍桑实验', termEn: 'Hawthorne Studies', definition: '1924-1932年在西方电气公司霍桑工厂进行的实验。发现：照明改善提高产量，但照明减弱产量仍提高——社会心理因素（被关注、群体归属感）比物理条件更重要。霍桑效应：被研究本身改变行为。催生了人际关系学派，标志着行为科学管理的诞生。', category: '管理思想史', source: 'Mayo E (1933)' },
    { term: '马斯洛需要层次', termEn: 'Maslow\'s Hierarchy of Needs', definition: '人类需要由低到高五层次：生理→安全→社交→尊重→自我实现。低层次需要满足后才会追求高层次需要。在管理中的应用：针对不同层次需要设计激励措施。批评：需要层次并非严格递进，不同文化优先级不同。', category: '组织行为', source: 'Maslow AH (1943)' },
    { term: '双因素理论', termEn: 'Two-Factor Theory (Herzberg)', definition: '赫茨伯格提出的工作满意因素分两类：保健因素（薪酬/工作条件/人际关系/公司政策——缺失导致不满但改善不增加满意）和激励因素（成就感/认可/责任/成长——存在增加满意但缺失不必然不满）。管理启示：提高满意度须增加激励因素，仅改善保健因素不够。', category: '组织行为', source: 'Herzberg F (1959)' },
    { term: '期望理论', termEn: 'Expectancy Theory (Vroom)', definition: '激励力 = 期望值 × 工具性 × 效价。期望值（努力→绩效的概率信念）、工具性（绩效→奖励的概率信念）、效价（对奖励的价值判断）。三者任一为零则激励力为零。管理启示：设定可达成绩效标准、确保绩效与奖励关联、奖励须是员工看重的。', category: '组织行为', source: 'Vroom VH (1964)' },
    { term: '公平理论', termEn: 'Equity Theory (Adams)', definition: '员工将自己投入产出比与他人比较，感知不公平时会调整：减少投入（消极怠工）、改变产出（要求加薪）、改变参照对象、扭曲认知、离职。公平感不仅取决于绝对报酬更取决于相对比较。管理启示：分配程序公平性（程序公平）有时比结果公平更重要。', category: '组织行为', source: 'Adams JS (1965)' },
    { term: '目标设置理论', termEn: 'Goal Setting Theory (Locke)', definition: '具体且有挑战性的目标比\'尽力而为\'更能提高绩效。目标有效条件：具体（可量化）、困难但可达成、承诺（员工接受目标）、反馈（进展信息）。SMART原则：Specific/Measurable/Achievable/Relevant/Time-bound。', category: '组织行为', source: 'Locke EA & Latham GP (1990)' },
    { term: 'SWOT 分析', termEn: 'SWOT Analysis', definition: '战略分析工具：Strengths（优势）+ Weaknesses（劣势）为内部因素，Opportunities（机会）+ Threats（威胁）为外部因素。交叉策略：SO（增长型：用优势抓机会）、WO（扭转型：补劣势抓机会）、ST（多元型：用优势避威胁）、WT（防御型：减劣势避威胁）。', category: '战略管理', source: 'Andrews KR (1971)' },
    { term: '波特五力', termEn: 'Porter\'s Five Forces', definition: '分析行业竞争结构的五种力量：现有竞争者竞争强度、潜在进入者威胁、替代品威胁、供应商议价能力、买方议价能力。五力越强行业利润率越低。战略选择：成本领先、差异化、集中化。是行业分析和竞争战略的经典框架。', category: '战略管理', source: 'Porter ME (1980)' },
    { term: '核心竞争力', termEn: 'Core Competence', definition: '企业独特的、难以模仿的、能为客户创造价值的能力组合。三个判据：有价值（创造客户价值）、稀缺（竞争对手没有）、难以模仿/替代。如索尼的微型化技术、本田的发动机技术。核心竞争力理论强调企业应聚焦核心能力、外包非核心业务。', category: '战略管理', source: 'Prahalad CK & Hamel G (1990)' },
    { term: '平衡计分卡', termEn: 'Balanced Scorecard (BSC)', definition: '卡普兰和诺顿提出的综合绩效管理工具，从四个维度衡量组织表现：财务、客户、内部流程、学习与成长。纠正了传统仅看财务指标的短期主义。四个维度有因果关系：学习成长→内部流程→客户→财务。', category: '绩效管理', source: 'Kaplan & Norton (1992)' },
    { term: '彼得原理', termEn: 'Peter Principle', definition: '在层级组织中，员工因在当前岗位表现出色而被晋升，直到到达其不能胜任的层级为止——最终每个职位都被不能胜任的人占据。管理启示：晋升不应仅基于当前岗位绩效，还需评估目标岗位的胜任力。', category: '组织行为', source: 'Peter LJ & Hull R (1969)' },
    { term: '帕金森定律', termEn: 'Parkinson\'s Law', definition: '\'工作会膨胀直至占满所有可用时间\'。帕金森还发现：行政人员数量增长与工作量无关——官员倾向于增加下属而非竞争对手。数据：英国海军部1914-1928年舰艇减少2/3但官员增加近40%。', category: '组织行为', source: 'Parkinson CN (1955)' },
    { term: '墨菲定律', termEn: 'Murphy\'s Law', definition: '\'如果坏事可能发生，它就一定会发生\'。在质量管理中引申为：必须预设错误会发生并建立防护机制——故障树分析FMEA、防呆设计 Poka-Yoke。不是悲观主义而是风险管理思维。', category: '质量管理' },
    { term: '六西格玛', termEn: 'Six Sigma', definition: '摩托罗拉1986年提出的质量管理方法，目标是将缺陷率降至每百万机会3.4个（6σ水平）。DMAIC方法论：Define定义→Measure测量→Analyze分析→Improve改进→Control控制。GE 1995年推行六西格玛节省数十亿美元。', category: '质量管理', source: 'Motorola (1986); Smith W' },
    { term: '精益生产', termEn: 'Lean Production', definition: '丰田生产方式（TPS）的理论化总结。核心：消除七种浪费（过量生产/等待/运输/过度加工/库存/动作/缺陷）、准时化JIT、自动化（自働化，异常自动停线）、持续改善Kaizen。\'丰田之路\'两大支柱：持续改善和尊重员工。', category: '运营管理', source: 'Womack & Jones《改变世界的机器》(1990)' },
    { term: '敏捷管理', termEn: 'Agile Management', definition: '以迭代增量、快速反馈、自适应规划为特征的项目管理方法。Scrum框架：Sprint（2-4周迭代）、Daily Standup（每日站会）、Sprint Review & Retrospective。敏捷宣言四价值观：个体互动>流程工具、可工作软件>详尽文档、客户协作>合同谈判、响应变化>遵循计划。', category: '项目管理', source: 'Agile Manifesto (2001)' },
    { term: '变革管理', termEn: 'Change Management', definition: '管理组织变革以降低阻力、提高成功率的方法论。Kotter 八步法：建立紧迫感→组建联盟→形成愿景→传达愿景→授权行动→创造短期胜利→巩固成果→固化文化。变革失败主因：过于急躁、沟通不足、缺乏短期成果。', category: '组织行为', source: 'Kotter JP (1996)' },
    { term: '知识管理', termEn: 'Knowledge Management', definition: '系统化地获取、组织、存储和共享组织知识。知识分显性（文档/流程/数据库）和隐性（经验/直觉/技能）。SECI模型（野中郁次郎）：社会化Socialization→外化Externalization→整合Combination→内化Internalization。', category: '组织学习', source: 'Nonaka I & Takeuchi H (1995)' },
    { term: '利益相关者理论', termEn: 'Stakeholder Theory', definition: '企业不应只对股东负责，还需平衡员工、客户、供应商、社区、环境等所有利益相关者的利益。与股东至上理论（弗里德曼）对立。ESG（环境/社会/治理）投资兴起使利益相关者理论从学术走向实践。', category: '企业伦理', source: 'Freeman RE (1984)' },
    { term: '委托代理理论', termEn: 'Principal-Agent Theory', definition: '委托人（股东）与代理人（管理者）信息不对称、目标不一致，代理人可能损害委托人利益（代理成本）。治理机制：董事会监督、股权激励（利益捆绑）、外部审计、信息披露、控制权市场竞争。', category: '公司治理', source: 'Jensen & Meckling (1976)' },
    { term: '蓝海战略', termEn: 'Blue Ocean Strategy', definition: '跳出竞争激烈的红海（现有市场），开创无人竞争的蓝海（新市场空间）。价值创新：同时追求差异化和低成本。四步动作框架：剔除Reduce→减少→增加→创造。案例：太阳马戏团（剔除动物表演，增加艺术性和剧情）。', category: '战略管理', source: 'Kim WC & Mauborgne R (2005)' },
    { term: '长尾理论', termEn: 'The Long Tail', definition: '安德森提出：互联网时代渠道成本趋近于零，大量小众产品（长尾）的总销量可超过少数热门产品（头部）。条件：生产工具普及（人人可创作）、传播工具普及（互联网分发）、连接供需的过滤器（搜索/推荐）。', category: '战略管理', source: 'Anderson C (2004)' },
    { term: '颠覆性创新', termEn: 'Disruptive Innovation', definition: '克里斯坦森提出：从低端/边缘市场切入的简单廉价产品逐步改进最终颠覆主流市场。初期被在位企业忽视（\'不赚钱的客户\'）。案例：数码相机颠覆柯达、Netflix颠覆Blockbuster。维持性创新（改善现有产品）vs 颠覆性创新（创造新市场）。', category: '创新管理', source: 'Christensen CM (1997)' },
    { term: 'PDCA 循环', termEn: 'PDCA Cycle (Deming Wheel)', definition: '持续改进的管理循环：Plan计划→Do执行→Check检查→Act处置。每轮PDCA将检查中发现的问题标准化，进入下一轮更高起点的循环。是ISO 9001质量管理体系的基础方法。戴明将其推广到日本质量管理实践。', category: '质量管理', source: 'Deming W Edwards' },
    { term: '决策树', termEn: 'Decision Tree', definition: '决策分析工具：以树状图表示决策节点（方块）、机会节点（圆）、结果节点（三角），计算期望值辅助决策。优点：直观展示决策逻辑、可量化不确定性。剪枝防止过拟合——管理决策中常结合敏感性分析。', category: '决策分析' },
    { term: '博弈论与定价', termEn: 'Game Theory in Pricing', definition: '寡头市场中定价决策的博弈分析。伯特兰竞争：价格战导致价格降至边际成本（利润为零）。古诺竞争：产量竞争导致均衡产量低于完全竞争但价格高于边际成本。价格默契（价格领导/信号传递）避免价格战。', category: '战略管理', source: 'Cournot (1838); Bertrand (1883)' },
    { term: '供应链管理', termEn: 'Supply Chain Management (SCM)', definition: '从原材料到最终消费者的全链条计划与协调。牛鞭效应：需求信息沿供应链向上传递时波动放大（零售商小波动→批发商→制造商大波动）。缓解策略：信息共享（EDI/区块链）、VMI供应商管理库存、延迟策略Postponement。', category: '运营管理', source: 'Lee HL et al. (1997) 牛鞭效应' },
    { term: '服务利润链', termEn: 'Service Profit Chain', definition: '内部服务质量→员工满意→员工保留与生产力→外部服务价值→客户满意→客户忠诚→利润与增长。管理启示：服务企业的利润始于员工而非客户——投资于员工发展和服务支持系统是盈利的起点。', category: '服务管理', source: 'Heskett JL et al. (1997)' },
    { term: 'OKR', termEn: 'Objectives and Key Results', definition: '目标管理框架：O（Objective，鼓舞人心的方向性目标）+ KR（Key Results，可量化的关键结果，2-5个）。特征：公开透明、季度周期、不与薪酬直接挂钩、鼓励挑战（\'勇敢目标\'moonshot）。Intel首创、Google推广。', category: '绩效管理', source: 'Doerr J《Measure What Matters》(2018)' },

// ===== R93 gap-fill: 管理学补全12条 =====
    { term: '矩阵组织', termEn: 'Matrix Organization', definition: '员工同时向职能部门经理和项目/产品经理汇报的组织结构。优势：资源灵活配置、跨部门协作。劣势：双重指挥冲突、权责不清。PMO是缓解矩阵冲突的常见机制。', category: '组织设计' },
    { term: '扁平化组织', termEn: 'Flat Organization', definition: '减少管理层级、扩大管理幅度的组织结构。优势：决策快速、沟通顺畅。适用条件：员工素质高、创新导向。劣势：晋升通道有限、管理幅度过大。', category: '组织设计' },
    { term: '管理幅度', termEn: 'Span of Control', definition: '一名管理者直接有效管理的下属人数。影响因素：下属能力、任务复杂度、标准化程度。管理幅度与管理层级呈反比——幅度大则层级少（扁平化）。', category: '组织设计', source: 'Graicunas公式' },
    { term: '组织文化', termEn: 'Organizational Culture', definition: '组织成员共享的价值观、信念、规范和行为模式。Schein三层次：人工制品、标榜的价值观、基本假设。文化变革需从深层假设入手。', category: '组织行为', source: 'Schein E《Organizational Culture and Leadership》' },
    { term: '领导风格', termEn: 'Leadership Styles', definition: 'Blake-Mouton管理方格：横轴关心生产、纵轴关心人，5种风格（团队型9,9为最优）。变革型领导vs交易型领导。情境领导：根据下属成熟度调整风格。', category: '组织行为', source: 'Blake & Mouton (1964); Hersey & Blanchard' },
    { term: '团队发展阶段', termEn: 'Team Development Stages', definition: 'Tuckman五阶段：Forming形成期→Storming风暴期→Norming规范期→Performing执行期→Adjourning解散期。管理者应在不同阶段采用不同策略。', category: '组织行为', source: 'Tuckman BW (1965; 1977)' },
    { term: '冲突管理', termEn: 'Conflict Management', definition: 'Thomas-Kilmann五策略：竞争/回避/迁就/妥协/合作。建设性冲突（任务相关）可促进创新，破坏性冲突（人际情绪化）损害团队。', category: '组织行为', source: 'Thomas KW & Kilmann RH (1974)' },
    { term: '跨文化管理', termEn: 'Cross-Cultural Management', definition: 'Hofstede文化维度：权力距离/个人主义集体主义/不确定性规避/长期导向等。文化智力（CQ）是在多元文化情境中有效工作的能力。', category: '组织行为', source: 'Hofstede G (1980); Earley & Ang' },
    { term: '变革型领导', termEn: 'Transformational Leadership', definition: '通过激发追随者内在动机使其超越自利追求更高目标的领导方式。四要素（4I）：理想化影响、鼓舞性激励、智力激发、个性化关怀。', category: '组织行为', source: 'Bass BM (1985)' },
    { term: '学习型组织', termEn: 'Learning Organization', definition: '持续促进组织学习和变革能力的组织。Senge五项修炼：自我超越/改善心智模式/建立共同愿景/团队学习/系统思考。特征：扁平化结构、授权、信息共享、容忍失败。', category: '组织学习', source: 'Senge PM《The Fifth Discipline》(1990)' },
    { term: '流程再造', termEn: 'Business Process Reengineering', definition: '对企业业务流程进行根本性重新思考和彻底性重新设计。区别于持续改善：BPR是激进重构而非渐进改进。80-90%的BPR项目失败——主因：忽视人的因素。', category: '运营管理', source: 'Hammer M & Champy J《Reengineering the Corporation》(1993)' },
    { term: 'ERP系统', termEn: 'Enterprise Resource Planning', definition: '整合企业各业务流程的统一信息系统。核心特征：单一数据库、模块化、实时数据、流程标准化。SAP/Oracle是主要厂商。', category: '信息系统' },
  ],
};
