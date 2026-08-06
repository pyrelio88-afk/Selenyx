/**
 * 农学扩展数据
 * R93 第一批
 */

import type { DisciplineExpansion } from './index';

export const AGRICULTURE_EXTRA: DisciplineExpansion = {
  glossary: [
    { term: '绿色革命', termEn: 'Green Revolution', definition: '1960-70年代以高产矮秆品种、化学肥料和灌溉技术为核心的农业技术变革。诺曼·博洛格培育矮秆小麦使印度/墨西哥粮食产量翻倍，1970年获诺贝尔和平奖。批评：过度依赖化肥农药、品种单一化、小农受益有限。', category: '农业发展史', source: 'Borlaug N (1970 Nobel Peace Prize)' },
    { term: '精准农业', termEn: 'Precision Agriculture', definition: '利用GPS、遥感、传感器和变量技术实现精细化管理。核心：定位（GPS厘米级）、感知（遥感/无人机多光谱）、决策（GIS数据分析）、执行（变量施肥/灌溉/播种）。区别于传统均匀管理，按田间差异精准施策，提高效率减少浪费。', category: '农业技术' },
    { term: '轮作', termEn: 'Crop Rotation', definition: '在同一田块按一定顺序轮换种植不同作物的农业制度。作用：减少土壤养分单一消耗（豆科固氮补充氮素）、打断病虫害循环、抑制杂草、改善土壤结构。典型轮作：玉米-大豆-小麦三年轮作。', category: '耕作制度', source: '《农学概论》；中国传统农业经典制度' },
    { term: '间作套种', termEn: 'Intercropping', definition: '在同一田块同时或先后种植两种以上作物的种植方式。间作：同行或带状同时种植（玉米间作大豆）。套种：前茬作物收获前在行间播种后茬（小麦套种棉花）。优势：提高光能利用率、充分利用空间和时间、减少病虫害。', category: '耕作制度', source: '《耕作学》' },
    { term: '杂交水稻', termEn: 'Hybrid Rice', definition: '利用水稻杂种优势培育的高产稻种。袁隆平1973年完成三系配套（不育系/保持系/恢复系），使中国水稻亩产从300kg提高到500kg以上。两系法（光温敏不育系）和超级稻进一步突破。杂交稻种子只能用一代（F1），第二代性状分离需重新购种。', category: '作物育种', source: '袁隆平（1973年三系配套）' },
    { term: '基因编辑作物', termEn: 'CRISPR-Edited Crops', definition: '使用CRISPR-Cas9等基因编辑技术精准改良作物性状。区别于转基因（插入外源基因），基因编辑可以只敲除或微调自身基因，很多国家不按转基因监管。应用：抗病小麦、高营养水稻、无褐变蘑菇。', category: '生物技术' },
    { term: '有机农业', termEn: 'Organic Agriculture', definition: '不使用化学合成肥料、农药、生长调节剂和转基因种子的农业生产体系。原则：健康、生态、公平、谨慎。依靠轮作、堆肥、生物防治维持土壤肥力和控制病虫害。产量通常比常规农业低10-30%但溢价销售。', category: '农业体系', source: 'IFOAM 有机农业标准' },
    { term: '垂直农业', termEn: 'Vertical Farming', definition: '在室内多层立体环境中进行作物生产。优势：不受气候限制、节水90%以上、无农药、靠近消费地减少运输。劣势：能耗高（人工光照）、初始投资大、主要适合叶菜类。LED光源和水培/气培是核心技术。', category: '农业技术' },
    { term: '土壤有机质', termEn: 'Soil Organic Matter (SOM)', definition: '土壤中来源于生物的含碳有机物质，包括腐殖质和未分解生物残体。功能：改善土壤结构（团粒结构）、保水保肥、缓冲pH、提供微生物能源。中国农田有机质含量普遍偏低（1-2%），高产田需>2.5%。', category: '土壤学' },
    { term: '测土配方施肥', termEn: 'Soil Testing and Formula Fertilization', definition: '根据土壤养分测定结果和作物需肥规律制定施肥方案的技术。步骤：取土样→化验N/P/K和微量元素→根据目标产量计算需肥量→制定配方→指导施肥。可减少化肥过量施用、提高肥料利用率、降低面源污染。', category: '土壤肥料', source: '《测土配方施肥技术规范》农业部' },
    { term: '滴灌', termEn: 'Drip Irrigation', definition: '通过管道系统和滴头将水精准输送到作物根区的灌溉方式。优势：节水30-70%（相比漫灌）、减少蒸发和深层渗漏、可结合施肥（ fertigation）、降低病害（叶面不湿）。以色列在干旱条件下发展滴灌成为农业强国。', category: '灌溉技术', source: 'Netafim（以色列）' },
    { term: '生物防治', termEn: 'Biological Control', definition: '利用天敌、寄生蜂、病原微生物等生物因子控制有害生物的方法。经典案例：澳洲瓢虫防治吹绵蚧、赤眼蜂防治玉米螟、苏云金芽孢杆菌Bt防治鳞翅目害虫。优势：环境友好、不易产生抗药性；局限：见效慢、效果受环境影响大。', category: '植保技术', source: 'FAO生物防治指南；《植物保护学》' },
    { term: '植物检疫', termEn: 'Plant Quarantine', definition: '防止危险性有害生物随植物及其产品传播的法定措施。包括：禁止进境物名录、产地检疫、口岸检疫、隔离试种。中国检疫性有害生物名单包括地中海实蝇、美国白蛾、松材线虫等。', category: '植保技术', source: '《植物检疫条例》' },
    { term: '农业面源污染', termEn: 'Agricultural Non-Point Source Pollution', definition: '化肥农药畜禽粪便等通过径流和渗漏进入水体的分散性污染。特征：发生范围广、难以定点治理、受降水和地形影响大。防控：测土配方施肥、缓冲带、生态沟渠、畜禽粪污资源化利用。', category: '农业环境', source: '《水污染防治法》；农业农村部防控指导意见' },
    { term: '碳汇农业', termEn: 'Carbon Sink Agriculture', definition: '通过农业措施增加土壤和植被碳储存、减少温室气体排放。途径：免耕/少耕（减少土壤有机碳氧化）、秸秆还田、种植绿肥、有机肥替代化肥、稻田甲烷减排（间歇灌溉）。农业既是碳排放源也是重要碳汇。', category: '农业环境', source: 'IPCC农业温室气体清单指南' },
    { term: '农产品冷链', termEn: 'Cold Chain Logistics', definition: '农产品从产地到消费地全程低温保藏运输的供应链。环节：产地预冷→冷库储存→冷藏运输→冷链销售。中国果蔬冷链流通率约35%（发达国家80%+），损耗率20-30%。冷链缺失是农产品\'卖难\'和食品安全的重要瓶颈。', category: '农业经济', source: '《农产品冷链物流发展规划》发改委' },
    { term: '农地三权分置', termEn: 'Three Rights Separation of Rural Land', definition: '中国农村土地制度改革：所有权（集体）、承包权（农户）、经营权（实际经营者）三权分置。目的：在坚持集体所有的前提下，放活土地经营权，促进土地流转和适度规模经营。', category: '农业政策', source: '2014年中央全面深化改革领导小组' },
    { term: '农业保险', termEn: 'Agricultural Insurance', definition: '为农业生产者因自然灾害/病虫害/市场价格波动造成的损失提供保障的保险制度。中国政策性农业保险保费财政补贴约80%。三大主粮（稻/麦/玉米）保险覆盖面超70%。指数保险（如气象指数保险）以客观指标触发理赔，简化定损。', category: '农业政策', source: '《农业保险条例》；财政部补贴管理办法' },
    { term: '畜禽粪污资源化', termEn: 'Manure Resource Utilization', definition: '将畜禽粪便转化为有机肥、沼气等资源的处理利用方式。途径：堆肥发酵制有机肥、厌氧发酵产沼气（沼气发电/沼渣沼液还田）、黑水虻生物转化。中国畜禽粪污年产量约40亿吨，资源化利用率约75%。', category: '畜牧环保', source: '《畜禽规模养殖污染防治条例》' },
    { term: '设施农业', termEn: 'Protected Agriculture', definition: '在人工控制环境下进行农业生产的方式，包括温室、大棚、植物工厂。优势：延长生长季、提高产量品质、减少自然灾害影响。荷兰玻璃温室番茄亩产可达50吨（露地5-8吨）。植物工厂全人工光不依赖自然条件但能耗极高。', category: '农业技术', source: '《设施农业学报》；FAO保护地农业指南' },
    { term: '农业物联网', termEn: 'Agricultural IoT', definition: '在农业生产中部署传感器网络实时监测环境参数（温湿度/光照/土壤水分/CO₂）并通过云平台分析和远程控制。应用：智能温室自动调控、大田精准灌溉、畜禽健康监测、农产品溯源。', category: '农业技术', source: '农业农村部数字农业建设试点指南' },
    { term: '可持续农业', termEn: 'Sustainable Agriculture', definition: '满足当代需求且不损害后代满足其需求能力的农业生产方式。三大支柱：经济可行（农民有利润）、环境友好（资源再生不退化）、社会公平（食品安全和农村发展）。', category: '农业体系', source: 'FAO可持续粮食和农业五大原则' },
    { term: '作物育种', termEn: 'Crop Breeding', definition: '通过遗传改良创造优良作物品种的科学技术。方法：杂交育种（杂交+选择）、诱变育种（辐射/化学诱变）、分子标记辅助选择（MAS）、转基因、基因编辑。育种目标：高产/优质/抗病/抗逆/适应性。', category: '作物育种', source: '《作物育种学总论》' },
    { term: '植物病理', termEn: 'Plant Pathology', definition: '研究植物病害发生规律和防治的学科。病害三角：病原物+寄主+环境三者互作致病。病原类型：真菌（70%以上植物病害）、细菌、病毒、线虫、寄生植物。防治策略：植物检疫+抗病品种+栽培防治+化学防治+生物防治综合应用。', category: '植保技术', source: '《植物病理学》；Agrios GN《Plant Pathology》' },
    { term: '农业生态系统', termEn: 'Agroecosystem', definition: '人类干预下以农作物生产为目的的生态系统。与自然生态系统区别：物种单一化、营养循环开放（产品输出带走养分）、人工辅助能投入（化肥/农药/机械）、自我调节能力弱。可持续农业要求增强系统稳定性和循环性。', category: '农业生态', source: '《农业生态学》；Altieri MA《Agroecology》' },
    { term: '耕地红线', termEn: 'Farmland Red Line', definition: '中国保障粮食安全的耕地面积底线——18亿亩。2022年全国耕地19.14亿亩。耕地保护制度：占补平衡（建设占用多少需补充多少）、永久基本农田保护（15.46亿亩不可占用）、耕地非农化非粮化管控。', category: '农业政策', source: '《土地管理法》' },
  ],
};
