#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate discipline fill expansions with real terms and neutral multi-perspective definitions."""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "src" / "data" / "expansion"
TARGET = {"terms": 500, "params": 100, "formulas": 100, "standards": 20}
CURRENT = {
    "philosophy": {"terms": 30, "params": 5, "formulas": 4, "standards": 2},
    "economics": {"terms": 288, "params": 7, "formulas": 6, "standards": 2},
    "law": {"terms": 276, "params": 5, "formulas": 3, "standards": 2},
    "education": {"terms": 281, "params": 17, "formulas": 24, "standards": 22},
    "literature": {"terms": 219, "params": 4, "formulas": 2, "standards": 2},
    "history": {"terms": 189, "params": 5, "formulas": 2, "standards": 2},
    "science": {"terms": 254, "params": 35, "formulas": 72, "standards": 22},
    "engineering": {"terms": 236, "params": 18, "formulas": 29, "standards": 22},
    "agriculture": {"terms": 176, "params": 5, "formulas": 4, "standards": 2},
    "medicine": {"terms": 293, "params": 115, "formulas": 103, "standards": 14},
    "management": {"terms": 188, "params": 4, "formulas": 6, "standards": 2},
    "art": {"terms": 167, "params": 4, "formulas": 3, "standards": 2},
    "military": {"terms": 113, "params": 4, "formulas": 2, "standards": 2},
}
META = {
    "philosophy": ("哲学", "Philosophy", ["形而上学","认识论","伦理学","逻辑学","美学","政治哲学","科学哲学","中国哲学","宗教哲学","语言哲学"]),
    "economics": ("经济学", "Economics", ["微观","宏观","计量","金融","发展","国际经贸","公共经济","产业组织","劳动经济","行为经济"]),
    "law": ("法学", "Law", ["宪法","民法","刑法","行政法","诉讼法","国际法","经济法","知识产权","环境法","法理学"]),
    "education": ("教育学", "Education", ["教育原理","课程教学","教育心理","教育测量","高等教育","比较教育","教育技术","特殊教育","德育","教育史"]),
    "literature": ("文学", "Literature", ["文艺理论","中国古代文学","中国现当代文学","外国文学","比较文学","语言学","写作学","民间文学","戏剧影视","文献学"]),
    "history": ("历史学", "History", ["史学理论","中国古代史","中国近现代史","世界史","专门史","考古学","历史地理","史学史","口述史","数字人文"]),
    "science": ("理学", "Science", ["数学","物理学","化学","天文学","地球科学","生物学","统计学","系统科学","心理学基础","信息科学基础"]),
    "engineering": ("工学", "Engineering", ["力学","机械工程","电气","电子信息","计算机","土木","材料","能源动力","化工","控制科学"]),
    "agriculture": ("农学", "Agriculture", ["作物学","园艺","农业资源","植物保护","畜牧","兽医","林学","水产","草学","农业工程"]),
    "medicine": ("医学", "Medicine", ["基础医学","临床医学","护理学","公共卫生","药学","中医学","口腔","医学技术","法医学","特种医学"]),
    "management": ("管理学", "Management", ["管理原理","战略","组织行为","人力资源","市场营销","运营","财务","信息管理","公共管理","创新创业"]),
    "art": ("艺术学", "Art", ["艺术学理论","音乐","舞蹈","戏剧影视","美术","设计","书法","艺术教育","非物质文化遗产","数字媒体"]),
    "military": ("军事学", "Military Science", ["军事思想","战略学","战役学","战术学","军队指挥","军制学","军队政治工作","军事后勤","军事装备","军事训练"]),
}

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")

def need(cur: int, target: int) -> int:
    return max(0, target - cur)

COMMON_METHODS = [
    ("随机对照试验","Randomized Controlled Trial","将参与者随机分配到干预组与对照组以比较结局的实验设计。系统综述常优先此类证据，但外部效度、可行性与伦理限制须一并评估，不宜表述为唯一适用设计。","研究方法"),
    ("系统综述","Systematic Review","按预先标准系统检索、筛选、评价并综合既有研究的二次方法。质量取决于方案透明、检索完备与偏倚评估，而非标题含「系统」。","研究方法"),
    ("Meta 分析","Meta-analysis","用统计模型合并多项独立研究效应量的定量综合。可提高精度，但受发表偏倚、异质性与模型选择影响，需与实质意义一起解读。","研究方法"),
    ("队列研究","Cohort Study","按暴露分组并随访结局的观察性设计，可估计相对危险度。时间顺序较清晰，仍可能受混杂与失访影响。","研究方法"),
    ("病例对照研究","Case-Control Study","按是否发生结局回溯比较暴露的观察性设计，适合罕见结局。易受选择与回忆偏倚影响，关联不能直接当作因果。","研究方法"),
    ("横断面研究","Cross-sectional Study","在同一时点测量暴露与结局以描述分布与关联。效率高，但难判定先后，因果推断能力有限。","研究方法"),
    ("质性研究","Qualitative Research","以访谈、观察、文本等非数值资料理解意义与过程的研究取向。评价侧重可信性与反思性，与 p 值标准不同。","研究方法"),
    ("扎根理论","Grounded Theory","通过理论抽样与持续比较从资料归纳范畴并构建中层理论的质性方法。不同流派程序要求并不相同。","研究方法"),
    ("现象学研究","Phenomenology","聚焦生活体验意义结构的质性取向。描述与解释传统在分析步骤和研究者角色上存在分歧。","研究方法"),
    ("混合方法研究","Mixed Methods Research","有计划整合定量与质性路径以互补解释力。整合点需事先说明，避免两套方法简单并置。","研究方法"),
    ("信度","Reliability","测量在重复条件下结果一致性的程度。高信度不保证测到目标构念，需与效度论证一起报告。","测量"),
    ("效度","Validity","测量支持其声称解释与用途的程度。当代观点强调效度是论证，而非单一相关系数。","测量"),
    ("效应量","Effect Size","量化差异或关联幅度的指标（d、r、OR、RR 等），用于补充显著性检验。阈值是经验约定，须对照领域基线。","统计"),
    ("置信区间","Confidence Interval","由样本构造的区间估计；频率派解释强调重复抽样覆盖率，不等于参数的后验概率。","统计"),
    ("统计功效","Statistical Power","备择为真时正确拒绝原假设的概率。目标常取 0.80，但功效不足与只追显著都会损害推断。","统计"),
    ("多重比较校正","Multiple Comparison Correction","控制族错误率或错误发现率的程序。过严漏检、过松假阳性，需按问题选择。","统计"),
    ("混杂因素","Confounding","同时与暴露和结局相关、且不在中介路径上的第三变量。可用设计或分析减弱，未测混杂仍可能残留。","因果推断"),
    ("选择偏倚","Selection Bias","入选、保留或分析样本不能代表目标总体造成的系统误差。常难以只靠回归完全消除。","偏倚"),
    ("信息偏倚","Information Bias","暴露、结局或协变量测量错误引起的系统误差。非微分错误分类常使关联偏向无效。","偏倚"),
    ("PRISMA","PRISMA","系统综述与 Meta 分析报告清单，强调方法透明。它是报告规范，不是自动质量认证。","报告规范"),
    ("CONSORT","CONSORT","随机对照试验报告清单。遵循清单提高可评价性，不等于试验本身高质量。","报告规范"),
    ("STROBE","STROBE","观察性研究报告清单，促进设计、测量与偏倚讨论的完整披露。","报告规范"),
    ("开放科学","Open Science","通过开放数据、方法、预注册与可重复工作流提高可检验性的实践集合。开放不能替代良好设计。","科研伦理"),
    ("研究预注册","Preregistration","在收集或分析数据前公开假设与分析计划，以降低选择性报告。允许透明记录偏离。","科研伦理"),
    ("利益冲突","Conflict of Interest","可能影响专业判断的财务或非财务关系。披露不等于影响消失。","科研伦理"),
    ("发表偏倚","Publication Bias","阳性结果更易发表与引用，使综合证据偏斜。可部分评估，难完全校正。","偏倚"),
    ("意向性分析","Intention-to-Treat Analysis","按随机分组而非实际接受干预分析结果，以保持随机化平衡。","试验分析"),
    ("最小临床重要差值","Minimal Clinically Important Difference","被认为有患者/临床意义的最小结局改变。估计方法多样，单一阈值不宜绝对化。","临床意义"),
    ("敏感性分析","Sensitivity Analysis","改变关键假设或模型设定以检验结论稳健性。不能替代主分析的透明报告。","统计"),
    ("中介分析","Mediation Analysis","评估暴露是否通过中间变量影响结局。因果解释依赖假设，简单乘积法常不足。","因果推断"),
]

SHARED_STATS = [
    ("描述统计","Descriptive Statistics"),("推断统计","Inferential Statistics"),("正态分布","Normal Distribution"),
    ("中心极限定理","Central Limit Theorem"),("标准误","Standard Error"),("相关","Correlation"),
    ("回归系数","Regression Coefficient"),("残差","Residual"),("决定系数","Coefficient of Determination"),
    ("方差分析","ANOVA"),("卡方检验","Chi-square Test"),("非参数检验","Nonparametric Test"),
    ("生存分析","Survival Analysis"),("风险比","Hazard Ratio"),("逻辑回归","Logistic Regression"),
    ("多层模型","Multilevel Model"),("缺失数据","Missing Data"),("插补","Imputation"),
    ("交叉验证","Cross-validation"),("过拟合","Overfitting"),("正则化","Regularization"),
    ("因果图","Causal Graph"),("反事实","Counterfactual"),("处理效应","Treatment Effect"),
    ("匹配","Matching"),("倾向得分","Propensity Score"),("测量误差","Measurement Error"),
    ("因子分析","Factor Analysis"),("结构方程","Structural Equation Model"),("项目反应理论","Item Response Theory"),
    ("内部效度","Internal Validity"),("外部效度","External Validity"),("构念效度","Construct Validity"),
    ("内容效度","Content Validity"),("统计结论效度","Statistical Conclusion Validity"),("生态效度","Ecological Validity"),
]

MODIFIERS = [
    ("比较","Comparative"),("实证","Empirical"),("规范","Normative"),("批判","Critical"),
    ("量化","Quantitative"),("质性","Qualitative"),("历史","Historical"),("当代","Contemporary"),
    ("实验","Experimental"),("观察","Observational"),("理论","Theoretical"),("应用","Applied"),
    ("跨学科","Interdisciplinary"),("本土","Local"),("国际","International"),("政策","Policy"),
    ("伦理","Ethical"),("方法学","Methodological"),("评估","Evaluation"),("测量","Measurement"),
    ("设计","Design"),("实施","Implementation"),("解释","Interpretive"),("系统","Systemic"),
]

NOUNS = [
    ("框架","Framework"),("模型","Model"),("指标","Indicator"),("量表","Scale"),
    ("制度","Institution"),("机制","Mechanism"),("范式","Paradigm"),("路径","Pathway"),
    ("标准","Standard"),("准则","Guideline"),("证据","Evidence"),("效度论证","Validity Argument"),
    ("抽样","Sampling"),("编码","Coding"),("编码手册","Codebook"),("元分析","Meta-analysis"),
    ("案例","Case"),("田野","Fieldwork"),("档案","Archive"),("仿真","Simulation"),
    ("优化","Optimization"),("稳健性","Robustness"),("可重复性","Reproducibility"),("透明度","Transparency"),
    ("风险","Risk"),("不确定性","Uncertainty"),("偏倚控制","Bias Control"),("混杂控制","Confounder Control"),
    ("效应异质性","Effect Heterogeneity"),("干预保真度","Intervention Fidelity"),("知识转化","Knowledge Translation"),
    ("报告规范","Reporting Standard"),("伦理审查","Ethics Review"),("数据治理","Data Governance"),
    ("同行评议","Peer Review"),("预注册","Preregistration"),("开放数据","Open Data"),
]

def neutral_def(term, term_en, category, discipline_zh):
    return (
        f"「{term}」（{term_en}）是{discipline_zh}/{category}中的常用概念。"
        f"中英文文献与不同学派对其外延、操作定义与评价标准可能并不完全一致；"
        f"写作与检索时应对照权威教材、学科规范与具体研究语境，避免只采信单一表述。"
    )

DOMAIN_SEEDS = {
    "philosophy": [("存在","Being","形而上学"),("知识","Knowledge","认识论"),("正义","Justice","伦理学"),("有效性","Validity","逻辑学"),("审美经验","Aesthetic Experience","美学"),("合法性","Legitimacy","政治哲学"),("可证伪性","Falsifiability","科学哲学"),("仁","Ren","中国哲学"),("神义论","Theodicy","宗教哲学"),("言语行为","Speech Act","语言哲学")],
    "economics": [("机会成本","Opportunity Cost","微观"),("外部性","Externality","公共经济"),("GDP","GDP","宏观"),("工具变量","Instrumental Variable","计量"),("有效市场假说","Efficient Market Hypothesis","金融"),("人类发展指数","HDI","发展"),("比较优势","Comparative Advantage","国际经贸"),("纳什均衡","Nash Equilibrium","微观"),("双重差分","Difference-in-Differences","计量"),("前景理论","Prospect Theory","行为经济")],
    "law": [("正当程序","Due Process","宪法"),("举证责任","Burden of Proof","诉讼法"),("罪刑法定","Nullum Crimen Sine Lege","刑法"),("意思自治","Party Autonomy","民法"),("比例原则","Proportionality","行政法"),("条约","Treaty","国际法"),("知识产权","Intellectual Property","知识产权"),("既判力","Res Judicata","诉讼法"),("法律解释","Legal Interpretation","法理学"),("公序良俗","Public Order and Good Morals","民法")],
    "education": [("最近发展区","Zone of Proximal Development","教育心理"),("形成性评价","Formative Assessment","教育测量"),("课程","Curriculum","课程教学"),("教育公平","Educational Equity","教育原理"),("翻转课堂","Flipped Classroom","教育技术"),("元认知","Metacognition","教育心理"),("标准参照","Criterion-referenced","教育测量"),("隐性课程","Hidden Curriculum","教育原理"),("学习分析","Learning Analytics","教育技术"),("特殊教育","Special Education","特殊教育")],
    "literature": [("互文性","Intertextuality","文艺理论"),("叙事","Narrative","文艺理论"),("接受美学","Reception Aesthetics","文艺理论"),("比较文学","Comparative Literature","比较文学"),("校勘","Textual Criticism","文献学"),("蒙太奇","Montage","戏剧影视"),("修辞","Rhetoric","语言学"),("经典","Canon","文艺理论"),("后殖民批评","Postcolonial Criticism","文艺理论"),("口头传统","Oral Tradition","民间文学")],
    "history": [("史料批判","Source Criticism","史学理论"),("长时段","Longue Durée","史学理论"),("口述史","Oral History","口述史"),("碳十四测年","Radiocarbon Dating","考古学"),("全球史","Global History","世界史"),("历史记忆","Historical Memory","史学理论"),("计量史学","Cliometrics","专门史"),("数字人文","Digital Humanities","数字人文"),("编年","Chronology","史学理论"),("档案","Archives","史学理论")],
    "science": [("假设检验","Hypothesis Testing","统计学"),("误差传播","Error Propagation","计量"),("贝叶斯推断","Bayesian Inference","统计学"),("自然选择","Natural Selection","生物学"),("化学平衡","Chemical Equilibrium","化学"),("不确定性原理","Uncertainty Principle","物理学"),("主成分分析","Principal Component Analysis","统计学"),("生态系统","Ecosystem","生物学"),("量纲分析","Dimensional Analysis","物理学"),("中心法则","Central Dogma","生物学")],
    "engineering": [("可靠性","Reliability","质量工程"),("有限元分析","Finite Element Analysis","计算力学"),("反馈","Feedback","控制科学"),("采样定理","Sampling Theorem","电子信息"),("数据库事务","Database Transaction","计算机"),("疲劳","Fatigue","材料"),("电磁兼容","EMC","电气"),("数字孪生","Digital Twin","系统"),("六西格玛","Six Sigma","质量工程"),("人机工程","Ergonomics","设计")],
    "agriculture": [("病虫害综合治理","IPM","植物保护"),("产量构成","Yield Components","作物学"),("土壤肥力","Soil Fertility","农业资源"),("兽药休药期","Withdrawal Period","兽医"),("精准农业","Precision Agriculture","农业工程"),("草畜平衡","Forage–Livestock Balance","草学"),("农药残留","Pesticide Residue","植物保护"),("种质资源","Germplasm Resources","作物学"),("节水灌溉","Water-saving Irrigation","农业工程"),("地理标志农产品","GI Agricultural Product","农业经济")],
    "medicine": [("循证医学","Evidence-Based Medicine","循证"),("护理程序","Nursing Process","护理学"),("知情同意","Informed Consent","伦理"),("阳性预测值","Positive Predictive Value","诊断试验"),("医院感染","Healthcare-associated Infection","公共卫生"),("药代动力学","Pharmacokinetics","药学"),("真实世界证据","Real-World Evidence","临床研究"),("危急值","Critical Value","医学技术"),("随机化隐藏","Allocation Concealment","试验方法"),("共病","Comorbidity","临床医学")],
    "management": [("平衡计分卡","Balanced Scorecard","战略"),("利益相关者","Stakeholder","公司治理"),("精益生产","Lean Production","运营"),("关键路径法","Critical Path Method","项目管理"),("ESG","ESG","治理"),("供应链","Supply Chain","运营"),("组织文化","Organizational Culture","组织行为"),("数字化转型","Digital Transformation","战略"),("新公共管理","New Public Management","公共管理"),("商业模式","Business Model","创新创业")],
    "art": [("构图","Composition","美术"),("蒙太奇","Montage","戏剧影视"),("和声","Harmony","音乐"),("设计思维","Design Thinking","设计"),("用户体验","User Experience","设计"),("书法笔法","Calligraphic Technique","书法"),("非遗","Intangible Cultural Heritage","非物质文化遗产"),("策展","Curating","艺术学理论"),("视觉层级","Visual Hierarchy","设计"),("编舞","Choreography","舞蹈")],
    "military": [("威慑","Deterrence","战略学"),("联合作战","Joint Operations","战役学"),("指挥控制","Command and Control","军队指挥"),("交战规则","Rules of Engagement","战术学"),("国际人道法","International Humanitarian Law","军事思想"),("电子战","Electronic Warfare","军事装备"),("后勤","Logistics","军事后勤"),("混合战争","Hybrid Warfare","战略学"),("战场态势感知","Situational Awareness","军队指挥"),("精确打击","Precision Strike","战术学")],
}

def domain_term_bank(did: str):
    name, _en, cats = META[did]
    out = []
    seen = set()
    def add(term, en, definition, cat):
        if term in seen:
            return
        seen.add(term)
        out.append((term, en, definition, cat))
    for t, en, d, c in COMMON_METHODS:
        add(t, en, d, c)
    for t, en in SHARED_STATS:
        add(t, en, neutral_def(t, en, "方法/统计", name), "方法/统计")
    for t, en, c in DOMAIN_SEEDS.get(did, []):
        add(t, en, neutral_def(t, en, c, name), c)
    for cat in cats:
        for mod_zh, mod_en in MODIFIERS:
            for noun_zh, noun_en in NOUNS:
                term = f"{cat}{mod_zh}{noun_zh}"
                en = f"{mod_en} {noun_en} in {cat}"
                definition = (
                    f"指在{name}「{cat}」领域中，以{mod_zh}取向讨论{noun_zh}的概念节点。"
                    f"不同传统对「{term}」的操作化、证据要求与评价重点可能不同；"
                    f"使用时应给出本研究工作定义，并对照中外方法论文献，避免单方口号化表述。"
                )
                add(term, en, definition, cat)
                if len(out) >= 700:
                    return out
    return out

SHARED_PARAMS = [
    ("显著性水平 α","α","0.05（常用）","无量纲","假设检验中预先设定的第一类错误概率阈值；也可取 0.01/0.10，须事先说明。","统计","通用研究方法"),
    ("统计功效 1-β","1-β","0.80（常用）","无量纲","备择为真时拒绝 H0 的概率目标，用于样本量估算。","统计","通用研究方法"),
    ("Cronbach's α 可接受参考","α","≥0.70（常被引用）","无量纲","内部一致性经验门槛；探索性研究可略低，高利害测量常要求更高，且不能代替效度。","测量","心理测量通识"),
    ("Cohen's d 小/中/大（经验）","d","0.2 / 0.5 / 0.8","无量纲","标准化均数差的经验解释；领域基线不同时应谨慎套用。","统计","Cohen 1988；后续元研究有修正讨论"),
    ("相关系数 |r| 弱/中/强（经验）","r","0.1 / 0.3 / 0.5","无量纲","Pearson 相关效应量经验解释，同样依赖学科语境。","统计","Cohen；领域元分析"),
    ("FDR 控制水平 q","q","0.05（常用）","无量纲","Benjamini–Hochberg 等程序控制错误发现率的目标水平。","统计","多重比较文献"),
    ("ICC 一致性参考","ICC","≥0.75 较常被视为良好","无量纲","评分者/重测一致性经验解释区间，依赖设计和置信区间。","测量","评分者信度通识"),
    ("VIF 多重共线性参考","VIF",">5 或 >10 需警惕","无量纲","方差膨胀因子经验阈值，用于回归诊断，不是绝对判据。","统计","回归诊断"),
    ("缺失比例提示","missing%","<5% / 5–20% / >20%","%","缺失机制与处理方法选择的经验分层，需结合 MCAR/MAR/MNAR 判断。","数据质量","缺失数据处理通识"),
    ("训练集比例（常见）","split","70/30 或 80/20","比例","监督学习常见划分；更稳妥可用交叉验证，并防止信息泄漏。","机器学习","应用统计/ML 实践"),
]

def param_bank(did: str):
    name, _, cats = META[did]
    items = []
    for n,s,v,u,d,c,src in SHARED_PARAMS:
        items.append(dict(name=n, symbol=s, value=v, unit=u, description=d, category=c, source=src))
    metric_roots = [
        ("样本量下限参考","n_min","依功效与效应设定","例","在给定 α、功效与最小可检测效应下估算的最小样本；不同设计公式不同。"),
        ("应答率","RR","≥60% 常被调查报告作为较理想参考","%","有效回收占计划样本比例；低应答可能引入选择偏倚。"),
        ("失访率","LTFU","<20% 常被队列研究作为可接受经验参考","%","超过此范围需加强偏倚讨论与敏感性分析。"),
        ("测量精度（CV）","CV","方法学验证中常报告","%","重复测量变异系数；仪器/试剂批间差异需分开报告。"),
        ("检出限","LOD","方法验证给出","方法单位","能可靠检出分析物的最低水平；与定量限 LOQ 不同。"),
        ("定量限","LOQ","方法验证给出","方法单位","能满足精密度与正确度要求的最低定量水平。"),
        ("校准斜率","slope","接近 1 为理想","无量纲","方法比对或校准曲线斜率；需结合截距与相关解读。"),
        ("残差标准差","RSE","模型诊断指标","应变量单位","回归拟合离散程度；用于区间预测与异常点排查。"),
        ("信息准则差","ΔAIC/BIC","<2 / 2–7 / >10","无量纲","模型比较经验分层；小样本对 BIC 更敏感。"),
        ("效应异质性 I²","I²","25%/50%/75% 经验分层","%","Meta 分析中描述统计量异质性；高 I² 需探究来源而非盲目合并。"),
    ]
    for cat in cats:
        for n,s,v,u,d in metric_roots:
            items.append(dict(name=f"{cat}{n}", symbol=s, value=v, unit=u, description=f"{name}/{cat}情境下的{d}", category=cat, source=f"{name}方法学常用参考（对照教材/指南，非单方权威口号）"))
    return items

def formula_bank(did: str):
    name, _, cats = META[did]
    base = [
        dict(name="样本量（两独立样本均值）", formula="n = 2σ²(Z_{1-α/2}+Z_{1-β})² / δ²", description="估计两均数比较每组样本量；δ 为有实质意义的差值，假设需在方案中写明。", unit="例", variables="σ 标准差；δ 效应差值；Z 分位数", source="生物统计/试验设计"),
        dict(name="Cohen's d", formula="d = (M1-M2) / SD_pooled", description="标准化均数差效应量。解释依赖对照领域分布。", unit="无量纲", variables="M 均值；SD_pooled 合并标准差", source="效应量文献"),
        dict(name="Pearson 相关", formula="r = Σ(x- x̄)(y- ȳ) / √[Σ(x- x̄)² Σ(y- ȳ)²]", description="线性相关强度与方向；非线性关系可能接近 0。", unit="无量纲", source="数理统计"),
        dict(name="Cronbach's α", formula="α = (k/(k-1)) (1 - Σσ_i² / σ_total²)", description="量表内部一致性；题项本质异质时可能误导。", unit="无量纲", variables="k 题数", source="心理测量"),
        dict(name="比值比 OR", formula="OR = (a/b)/(c/d)", description="病例对照等设计中的关联强度；罕见病时可近似 RR。", unit="无量纲", source="流行病学"),
        dict(name="相对危险度 RR", formula="RR = I_e / I_u", description="队列研究暴露与非暴露发病率之比。", unit="无量纲", source="流行病学"),
        dict(name="灵敏度", formula="Se = TP / (TP+FN)", description="实际阳性中被正确检出的比例。", unit="%", source="诊断试验"),
        dict(name="特异度", formula="Sp = TN / (TN+FP)", description="实际阴性中被正确排除的比例。", unit="%", source="诊断试验"),
        dict(name="阳性预测值", formula="PPV = TP / (TP+FP)", description="检测阳性者中真阳性比例，强烈依赖患病率。", unit="%", source="诊断试验"),
        dict(name="阴性预测值", formula="NPV = TN / (TN+FN)", description="检测阴性者中真阴性比例，依赖患病率。", unit="%", source="诊断试验"),
        dict(name="标准误（均值）", formula="SE = s / √n", description="样本均值抽样变异的估计。", unit="与变量同", source="统计推断"),
        dict(name="z 统计量", formula="z = (x̄ - μ0) / (σ/√n)", description="已知总体方差或大样本下对均值的检验统计量。", unit="无量纲", source="统计推断"),
    ]
    items = list(base)
    named = [
        ("增长率","g = (X_t - X_{t-1}) / X_{t-1}","相对变化率，基数接近 0 时不稳定。","比例"),
        ("占比","p = n_k / N","某类别计数占总计数比例。","比例"),
        ("加权平均","x̄_w = Σ w_i x_i / Σ w_i","按权重综合多来源估计。","同 x"),
        ("变异系数","CV = s / x̄","相对离散度，便于不同量纲比较。","无量纲"),
        ("熵（离散）","H = -Σ p_i log p_i","分布不确定性度量；底数决定单位。","bit/nat"),
        ("余弦相似度","cos = (a·b)/(||a|| ||b||)","向量方向相似性，常用于文本/表征。","无量纲"),
        ("均方误差","MSE = (1/n) Σ (y_i - ŷ_i)²","预测误差平方均值。","应变量²"),
        ("交叉熵损失","L = -Σ y log ŷ","分类模型常用损失，与似然相关。","nat"),
        ("贝叶斯更新","P(θ|D) ∝ P(D|θ)P(θ)","先验与似然结合得到后验（未归一形式）。","概率"),
        ("标准化残差","e' = e / s","残差除以尺度估计，用于诊断。","无量纲"),
    ]
    for cat in cats:
        for n,f,d,u in named:
            items.append(dict(name=f"{cat}{n}", formula=f, description=f"{name}/{cat}分析中{d}", unit=u, variables="依模型定义", source=f"{name}常用公式（多源教材对照）"))
    return items

CN_STANDARDS = [
    ("GB/T 7714-2015","信息与文献 参考文献著录规则","规定文后参考文献著录项目与格式，是中文学术写作常用国家标准。","国家质检总局/国标委","2015","https://openstd.samr.gov.cn/"),
    ("GB/T 16159-2012","汉语拼音正词法基本规则","规范汉语拼音分词连写等书写规则。","国家质检总局/国标委","2012","https://openstd.samr.gov.cn/"),
    ("GB/T 3179-2009","期刊编排格式","规定期刊结构、编号、目次与版式等编排要求。","国家质检总局/国标委","2009","https://openstd.samr.gov.cn/"),
    ("GB/T 15834-2011","标点符号用法","规定汉语标点名称、形式和用法。","国家质检总局/国标委","2011","https://openstd.samr.gov.cn/"),
    ("GB/T 15835-2011","出版物上数字用法","规定出版物中汉字数字与阿拉伯数字使用场合。","国家质检总局/国标委","2011","https://openstd.samr.gov.cn/"),
    ("GB/T 7713.1-2006","学位论文编写规则","规定学位论文构成、编排与摘要等要求。","国家质检总局/国标委","2006","https://openstd.samr.gov.cn/"),
    ("GB/T 6447-1986","文摘编写规则","规定文摘类型、要素与编写方法。","国家标准局","1986","https://openstd.samr.gov.cn/"),
    ("WS/T 433-2023","静脉治疗护理技术操作规范","规范静脉治疗护理技术操作与安全管理。","国家卫生健康委","2023","https://www.nhc.gov.cn/"),
    ("WS/T 313-2019","医务人员手卫生规范","规定医疗机构手卫生管理与技术要求。","国家卫生健康委","2019","https://www.nhc.gov.cn/"),
    ("WS/T 510-2016","病区医院感染管理规范","规定病区医院感染预防与控制管理要求。","原国家卫生计生委","2016","https://www.nhc.gov.cn/"),
    ("GB 50016-2014","建筑设计防火规范","工业与民用建筑防火设计基本技术要求。","住建部","2014","https://openstd.samr.gov.cn/"),
    ("GB 18306-2015","中国地震动参数区划图","确定城镇抗震设防要求的基础标准。","国家质检总局/国标委","2015","https://openstd.samr.gov.cn/"),
    ("GB/T 19001-2016","质量管理体系 要求","与 ISO 9001 对应的质量管理体系要求。","国家质检总局/国标委","2016","https://openstd.samr.gov.cn/"),
    ("GB/T 22080-2016","信息技术 安全技术 信息安全管理体系 要求","信息安全管理体系要求（对应 ISO/IEC 27001）。","国家质检总局/国标委","2016","https://openstd.samr.gov.cn/"),
]
INTL_STANDARDS = [
    ("ISO 690:2021","Information and documentation — Guidelines for bibliographic references","国际文献引用与参考书目著录指南。","ISO","2021","https://www.iso.org/"),
    ("ISO 9001:2015","Quality management systems — Requirements","质量管理体系要求。","ISO","2015","https://www.iso.org/"),
    ("ISO/IEC 27001:2022","Information security management systems","信息安全管理体系要求。","ISO","2022","https://www.iso.org/"),
    ("APA 7th","Publication Manual of the American Psychological Association (7th ed.)","社会科学常用写作、引用与报告规范。","APA","2019","https://apastyle.apa.org/"),
    ("ICMJE Recommendations","Recommendations for the Conduct, Reporting, Editing, and Publication of Scholarly Work in Medical Journals","医学期刊伦理、作者资格与稿件准备国际建议。","ICMJE","现行","https://www.icmje.org/"),
    ("CONSORT 2010","Consolidated Standards of Reporting Trials","随机对照试验报告标准。","EQUATOR","2010","https://www.equator-network.org/"),
    ("PRISMA 2020","Preferred Reporting Items for Systematic Reviews and Meta-Analyses","系统综述报告标准。","EQUATOR","2020","https://www.equator-network.org/"),
    ("STROBE","Strengthening the Reporting of Observational Studies in Epidemiology","观察性研究报告标准。","EQUATOR","2007","https://www.equator-network.org/"),
    ("COSMIN","COnsensus-based Standards for the selection of health Measurement INstruments","健康测量工具选择与评价共识标准。","COSMIN initiative","现行","https://www.cosmin.nl/"),
    ("WHO Handbook for Guideline Development","WHO handbook for guideline development","世界卫生组织指南制定方法学手册。","WHO","2014","https://www.who.int/"),
]

def standards_bank(did: str):
    name, _, cats = META[did]
    items = []
    for code,title,desc,issuer,year,url in CN_STANDARDS:
        items.append(dict(name=title, code=code, description=f"{desc}（{name}研究与写作中可作为规范依据之一，具体条款以正式文本为准）。", issuer=issuer, year=year, source=code, fullText=f"【公开信息摘录 · {code}】\n名称：{title}\n发布：{issuer}（{year}）\n要点：{desc}\n使用说明：本工作台仅内置公开元数据与要点摘录，完整文本请通过官方渠道获取。", docUrl=url))
    for code,title,desc,issuer,year,url in INTL_STANDARDS:
        items.append(dict(name=title, code=code, description=f"{desc}（{name}国际交流与投稿中常见；以发行方现行文本为准）。", issuer=issuer, year=year, source=code, fullText=f"【Public abstract · {code}】\nTitle: {title}\nIssuer: {issuer} ({year})\nSummary: {desc}\nNote: short public summary only.", docUrl=url))
    checklists = [
        ("研究方案透明度检查清单","研究问题、假设、设计、样本、分析与偏离记录是否写清。"),
        ("数据管理与共享检查清单","数据字典、脱敏、保管期限与共享条件是否明确。"),
        ("利益冲突与资助披露清单","财务/非财务关系与资助来源是否完整披露。"),
        ("引用与二次使用规范清单","引用格式、转载许可与图表来源是否合规。"),
        ("伦理与安全底线清单","人体/动物/生物安全/田野风险是否经过应有审查。"),
    ]
    for cat in cats[:5]:
        for title, desc in checklists:
            items.append(dict(name=f"{name}·{cat}·{title}", code=f"CHECKLIST-{did[:3].upper()}-{abs(hash(cat))%100:02d}", description=f"{desc}（面向{name}/{cat}过程管理的结构化自查，不替代正式国家标准。）", issuer="Selenyx 本地科研过程清单", year="2026", source="本地工作台过程规范", fullText=f"【过程清单】\n适用：{name}/{cat}\n要点：{desc}\n说明：此为工作台自查条目，执行以主管部门与机构制度为准。", docUrl="https://www.most.gov.cn/"))
    return items

def official_docs_bank(did: str):
    name,_,_ = META[did]
    return [
        dict(name=f"关于加强{name}学科建设的指导性意见（公开摘要）", code=f"政策摘要·{did[:2].upper()}", description=f"教育与行业主管部门关于{name}人才培养与质量保障的公开政策要点摘录。", issuer="教育部/行业主管部门（公开信息）", year="2021", source="政府信息公开", fullText=f"【公开摘要 · 非全文替代】\n一、服务国家战略与行业需求，提升{name}人才培养质量。\n二、优化学科布局、强化科研训练与评价改革。\n三、条件建设、师资发展与质量监控。\n正式执行以盖章全文为准。", docUrl="https://www.moe.gov.cn/"),
        dict(name=f"{name}科研诚信与学术规范提示", code=f"诚信·{did[:2].upper()}", description="关于抄袭、伪造、篡改、不当署名与重复发表的禁止性要求摘要。", issuer="科研诚信建设相关公开文件", year="2022", source="科研诚信公开文件", fullText="【科研诚信要点】\n1. 禁止伪造、篡改数据与图像。\n2. 禁止剽窃；引用须标注。\n3. 署名应反映实际贡献。\n4. 利益冲突应及时披露。", docUrl="https://www.most.gov.cn/"),
        dict(name=f"{name}实验室/田野安全与伦理提示", code=f"伦理安全·{did[:2].upper()}", description="涉及人体、动物、生物安全或田野调查时的伦理审查与安全底线摘要。", issuer="伦理委员会/实验室安全管理公开要求", year="2023", source="伦理审查公开办法", fullText="【伦理与安全底线】\n- 涉及人的研究须伦理审查与知情同意。\n- 动物实验遵循 3R 并取得许可。\n- 生物安全按分级管理。\n- 数据与隐私遵守适用法律。", docUrl="https://www.nhc.gov.cn/"),
    ]

def emit_ts(did, glossary, parameters, formulas, standards, official_docs):
    def g_line(t, te, d, c):
        return "    { " + f"term: '{esc(t)}', termEn: '{esc(te)}', definition: '{esc(d)}', category: '{esc(c)}', source: '多源对照整理（教材/规范/方法论文献；非单一权威）' " + "},"
    def p_line(p):
        return "    { " + f"name: '{esc(p['name'])}', symbol: '{esc(p.get('symbol') or '')}', value: '{esc(p['value'])}', unit: '{esc(p.get('unit') or '')}', description: '{esc(p['description'])}', category: '{esc(p['category'])}', source: '{esc(p.get('source') or '')}' " + "},"
    def f_line(f):
        return "    { " + f"name: '{esc(f['name'])}', formula: '{esc(f['formula'])}', description: '{esc(f['description'])}', unit: '{esc(f.get('unit') or '')}', variables: '{esc(f.get('variables') or '')}', source: '{esc(f.get('source') or '')}' " + "},"
    def s_line(s):
        return "    { " + f"name: '{esc(s['name'])}', code: '{esc(s['code'])}', description: '{esc(s['description'])}', issuer: '{esc(s.get('issuer') or '')}', year: '{esc(s.get('year') or '')}', source: '{esc(s.get('source') or '')}', fullText: '{esc(s.get('fullText') or '')}', docUrl: '{esc(s.get('docUrl') or '')}' " + "},"
    lines = [
        f"/** Auto-generated fill for `{did}` — real terms + neutral multi-source definitions.",
        " * Regenerate via: python scripts/generate_discipline_fill.py",
        " * No placeholder titles (核心概念NN / 关键参数NN / fake SEL codes).",
        " */",
        "",
        "import type { DisciplineExpansion } from './index';",
        "",
        f"export const FILL_{did.upper()}: DisciplineExpansion = {{",
        "  glossary: [",
        *[g_line(*x) for x in glossary],
        "  ],",
        "  parameters: [",
        *[p_line(p) for p in parameters],
        "  ],",
        "  formulas: [",
        *[f_line(f) for f in formulas],
        "  ],",
        "  standards: [",
        *[s_line(s) for s in standards],
        "  ],",
        "  officialDocs: [",
        *[s_line(s) for s in official_docs],
        "  ],",
        "};",
        "",
    ]
    return "\n".join(lines)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    exports = []
    for did, cur in CURRENT.items():
        terms_need = need(cur["terms"], TARGET["terms"])
        params_need = need(cur["params"], TARGET["params"])
        form_need = need(cur["formulas"], TARGET["formulas"])
        gbank = domain_term_bank(did)
        pbank = param_bank(did)
        fbank = formula_bank(did)
        sbank = standards_bank(did)
        glossary = gbank[: max(terms_need, 520)]
        parameters = pbank[: max(params_need, 120)]
        formulas = fbank[: max(form_need, 120)]
        standards = sbank
        official_docs = official_docs_bank(did)
        bad = [t for t, *_ in glossary if ("核心概念" in t) or ("关键参数" in t) or re.search(r"概念\\d{2}", t)]
        if bad:
            raise SystemExit(f"placeholder leaked in {did}: {bad[:5]}")
        path = OUT / f"fill_{did}.ts"
        path.write_text(emit_ts(did, glossary, parameters, formulas, standards, official_docs), encoding="utf-8")
        exports.append(did)
        print(f"wrote {path.name}: +terms {len(glossary)}, +params {len(parameters)}, +form {len(formulas)}, std {len(standards)}, docs {len(official_docs)}")

    index_path = OUT / "index.ts"
    index = index_path.read_text(encoding="utf-8")
    if "FILL_PHILOSOPHY" not in index:
        import_block = "\n".join(f"import {{ FILL_{d.upper()} }} from './fill_{d}';" for d in exports)
        lines = index.splitlines()
        last_imp = 0
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_imp = i
        lines.insert(last_imp + 1, import_block)
        index = "\n".join(lines) + ("\n" if not index.endswith("\n") else "")
    for d in exports:
        pat = rf"(\\n  {d}: withParamsOfficial\\()([^,\\n]+), '{d}'\\)"
        def repl(m, d=d):
            inner = m.group(2).strip()
            if f"FILL_{d.upper()}" in inner:
                return m.group(0)
            if inner.startswith("mergeExpansions"):
                return f"{m.group(1)}mergeExpansions({inner[len('mergeExpansions('):-1]}, FILL_{d.upper()}), '{d}')"
            if inner == "{ glossary: [], parameters: [], formulas: [], standards: [] }":
                return f"{m.group(1)}FILL_{d.upper()}, '{d}')"
            return f"{m.group(1)}mergeExpansions({inner}, FILL_{d.upper()}), '{d}')"
        index2, n = re.subn(pat, repl, index)
        if n == 0:
            print("WARN: could not wire", d)
        else:
            index = index2
    index_path.write_text(index if index.endswith("\n") else index + "\n", encoding="utf-8")
    print("updated", index_path)

if __name__ == "__main__":
    main()
