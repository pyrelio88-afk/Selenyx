/**
 * 学科补充数据 —— R106 新增
 * Point 5: 每个学科的常用参数/数值（深度搜索权威来源）
 * Point 6: 每个学科的红头文件/官方政策文件
 */
import type { DisciplineParameter, DisciplineStandard } from "./disciplines";

export interface DisciplineExtra {
  parameters: DisciplineParameter[];
  officialDocs: DisciplineStandard[];
}

export const DISCIPLINE_EXTRAS: Record<string, DisciplineExtra> = {
  "philosophy": {
    parameters: [
      { name: "哲学学科评估A类高校数", symbol: undefined, value: "14", unit: "所", description: "教育部第四轮学科评估中哲学获A-及以上的高校数量。", category: "学科建设", source: "教育部第四轮学科评估" },
      { name: "国家社科基金哲学项目立项数", symbol: undefined, value: "约200", unit: "项/年", description: "近年国家社科基金哲学学科年度立项项目数（含重点项目和一般项目）。", category: "科研资助", source: "全国哲学社会科学工作办公室" },
      { name: "哲学核心期刊数量", symbol: undefined, value: "约30", unit: "种", description: "CSSCI来源期刊中哲学类核心期刊数量。", category: "学术出版", source: "南京大学CSSCI目录" },
    ],
    officialDocs: [
      { name: "关于推进新时代哲学社会科学繁荣发展的意见", code: "中发〔2022〕6号", description: "中共中央关于加快构建中国特色哲学社会科学的战略部署文件。", issuer: "中共中央", year: "2022" },
      { name: "高等学校哲学社会科学繁荣计划", code: "教社科〔2011〕3号", description: "教育部实施的高校哲学社会科学繁荣发展专项计划。", issuer: "教育部、财政部", year: "2011" },
    ],
  },
  "economics": {
    parameters: [
      { name: "国内生产总值增速", symbol: "GDP", value: "5.0%", unit: "同比", description: "2024年中国GDP同比增长5.0%，完成全年目标。", category: "宏观经济", source: "国家统计局" },
      { name: "居民消费价格指数", symbol: "CPI", value: "0.2%", unit: "同比", description: "2024年CPI同比上涨0.2%，处于低位运行。", category: "价格指数", source: "国家统计局" },
      { name: "城镇调查失业率", symbol: undefined, value: "5.1%", unit: "%", description: "2024年12月全国城镇调查失业率。", category: "就业", source: "国家统计局" },
      { name: "广义货币供应量增速", symbol: "M2", value: "7.3%", unit: "同比", description: "2024年末M2余额同比增长7.3%。", category: "货币供应", source: "中国人民银行" },
      { name: "外汇储备", symbol: undefined, value: "32012", unit: "亿美元", description: "2024年末中国外汇储备余额。", category: "国际收支", source: "国家外汇管理局" },
    ],
    officialDocs: [
      { name: "中华人民共和国国民经济和社会发展第十四个五年规划纲要", code: "十三届全国人大四次会议批准", description: "十四五时期经济社会发展主要目标和重大任务。", issuer: "全国人民代表大会", year: "2021" },
      { name: "关于加快建设全国统一大市场的意见", code: "中发〔2022〕17号", description: "加快建设高效规范、公平竞争、充分开放的全国统一大市场。", issuer: "中共中央、国务院", year: "2022" },
    ],
  },
  "law": {
    parameters: [
      { name: "法律职业资格考试通过率", symbol: undefined, value: "约10-15%", unit: "%", description: "近年国家统一法律职业资格考试客观题通过率。", category: "法律教育", source: "司法部" },
      { name: "全国法院新收案件数", symbol: undefined, value: "约4500万", unit: "件/年", description: "2024年全国法院新收各类案件数量。", category: "司法统计", source: "最高人民法院" },
      { name: "现行有效法律数量", symbol: undefined, value: "305", unit: "部", description: "截至2024年底中国现行有效法律总数。", category: "立法", source: "全国人大常委会法工委" },
      { name: "律师执业人数", symbol: undefined, value: "约80万", unit: "人", description: "截至2024年底全国执业律师人数。", category: "法律职业", source: "司法部" },
    ],
    officialDocs: [
      { name: "中华人民共和国民法典", code: "主席令第四十五号", description: "2021年1月1日施行，共7编1260条，是社会生活的百科全书。", issuer: "全国人民代表大会", year: "2020" },
      { name: "法治社会建设实施纲要", code: "中办发〔2020〕25号", description: "2020-2025年法治社会建设实施纲要。", issuer: "中共中央办公厅", year: "2020" },
    ],
  },
  "education": {
    parameters: [
      { name: "高等教育毛入学率", symbol: undefined, value: "60.8%", unit: "%", description: "2023年中国高等教育毛入学率，已进入普及化阶段。", category: "教育规模", source: "教育部" },
      { name: "九年义务教育巩固率", symbol: undefined, value: "95.7%", unit: "%", description: "2023年九年义务教育巩固率。", category: "基础教育", source: "教育部" },
      { name: "普通高校数量", symbol: undefined, value: "2822", unit: "所", description: "2023年全国普通高等学校数量。", category: "教育规模", source: "教育部" },
      { name: "专任教师总数", symbol: undefined, value: "约1891万", unit: "人", description: "2023年全国各级各类学校专任教师总数。", category: "师资队伍", source: "教育部" },
      { name: "教育经费占GDP比例", symbol: undefined, value: "4.06%", unit: "%", description: "2023年国家财政性教育经费占GDP比例。", category: "教育投入", source: "教育部、国家统计局" },
    ],
    officialDocs: [
      { name: "中华人民共和国教育法", code: "主席令第四十号", description: "教育领域的基本法律，2021年修订。", issuer: "全国人大常委会", year: "2021" },
      { name: "中国教育现代化2035", code: "中办发〔2019〕16号", description: "面向2035年教育现代化战略规划。", issuer: "中共中央、国务院", year: "2019" },
    ],
  },
  "literature": {
    parameters: [
      { name: "CSSCI文学类来源期刊数", symbol: undefined, value: "约40", unit: "种", description: "CSSCI来源期刊中文学类核心期刊数量。", category: "学术出版", source: "南京大学CSSCI目录" },
      { name: "年度出版长篇小说", symbol: undefined, value: "约5000", unit: "部/年", description: "中国每年新出版长篇小说数量（含网络文学实体化）。", category: "文学创作", source: "新闻出版署" },
      { name: "网络文学用户规模", symbol: undefined, value: "5.75亿", unit: "人", description: "2024年中国网络文学用户规模。", category: "文学消费", source: "中国互联网络信息中心CNNIC" },
    ],
    officialDocs: [
      { name: "关于实施中华优秀传统文化传承发展工程的意见", code: "中办发〔2017〕5号", description: "中华优秀传统文化传承发展的纲领性文件。", issuer: "中共中央办公厅、国务院办公厅", year: "2017" },
      { name: "出版管理条例", code: "国务院令第343号", description: "规范出版活动的行政法规，2020年修订。", issuer: "国务院", year: "2020" },
    ],
  },
  "history": {
    parameters: [
      { name: "全国重点文物保护单位", symbol: undefined, value: "5058", unit: "处", description: "截至2024年第八批全国重点文物保护单位总数。", category: "文物保护", source: "国家文物局" },
      { name: "第三次文物普查不可移动文物", symbol: undefined, value: "766722", unit: "处", description: "第三次全国文物普查登记的不可移动文物总数。", category: "文物资源", source: "国家文物局" },
      { name: "考古发掘项目数", symbol: undefined, value: "约1000", unit: "项/年", description: "近年全国考古发掘项目年度数量。", category: "考古", source: "国家文物局" },
      { name: "中华文明探源工程年限", symbol: undefined, value: "距今5800-3500年", unit: "年前", description: "中华文明探源工程研究的时间范围。", category: "文明探源", source: "中华文明探源工程" },
    ],
    officialDocs: [
      { name: "关于加强文物保护利用改革的若干意见", code: "中办发〔2018〕10号", description: "新时代文物保护利用改革的纲领性文件。", issuer: "中共中央办公厅、国务院办公厅", year: "2018" },
      { name: "中华人民共和国文物保护法", code: "主席令第二十八号", description: "文物保护领域的基本法律，2024年修订。", issuer: "全国人大常委会", year: "2024" },
    ],
  },
  "science": {
    parameters: [
      { name: "光速", symbol: "c", value: "299792458", unit: "m/s", description: "真空中光速精确值，国际单位制定义常数。", category: "物理常数", source: "CODATA 2018" },
      { name: "普朗克常数", symbol: "h", value: "6.62607015×10⁻³⁴", unit: "J·s", description: "量子力学基本常数，2019年SI重新定义的基准常数。", category: "物理常数", source: "CODATA 2018" },
      { name: "万有引力常数", symbol: "G", value: "6.67430×10⁻¹¹", unit: "m³/(kg·s²)", description: "牛顿万有引力定律中的比例常数。", category: "物理常数", source: "CODATA 2018" },
      { name: "阿伏伽德罗常数", symbol: "Nₐ", value: "6.02214076×10²³", unit: "mol⁻¹", description: "1摩尔物质中包含的粒子数。", category: "化学常数", source: "CODATA 2018" },
      { name: "法拉第常数", symbol: "F", value: "96485.33212", unit: "C/mol", description: "1摩尔电子所携带的电荷量。", category: "化学常数", source: "CODATA 2018" },
      { name: "R&D经费投入强度", symbol: undefined, value: "2.68%", unit: "%GDP", description: "2023年中国研发经费占GDP比例。", category: "科研投入", source: "国家统计局" },
    ],
    officialDocs: [
      { name: "中华人民共和国科学技术进步法", code: "主席令第八十二号", description: "科技领域基本法律，2021年修订。", issuer: "全国人大常委会", year: "2021" },
      { name: "国家创新驱动发展战略纲要", code: "中发〔2016〕10号", description: "实施创新驱动发展战略的纲领性文件。", issuer: "中共中央、国务院", year: "2016" },
    ],
  },
  "engineering": {
    parameters: [
      { name: "高铁运营里程", symbol: undefined, value: "48000", unit: "公里", description: "截至2024年中国高铁运营里程，居世界第一。", category: "交通工程", source: "国家铁路局" },
      { name: "5G基站数量", symbol: undefined, value: "约425万", unit: "个", description: "截至2024年底中国5G基站数量。", category: "通信工程", source: "工信部" },
      { name: "汽车年产量", symbol: undefined, value: "约3100万", unit: "辆/年", description: "2024年中国汽车产量，连续16年居世界第一。", category: "制造工程", source: "中国汽车工业协会" },
      { name: "可再生能源装机容量", symbol: undefined, value: "约14.5亿", unit: "千瓦", description: "截至2024年中国可再生能源发电装机容量。", category: "能源工程", source: "国家能源局" },
      { name: "特高压输电线路长度", symbol: undefined, value: "约4万", unit: "公里", description: "中国已建成的特高压交直流输电线路总长度。", category: "电力工程", source: "国家电网" },
    ],
    officialDocs: [
      { name: "中国制造2025", code: "国发〔2015〕28号", description: "实施制造强国战略的行动纲领。", issuer: "国务院", year: "2015" },
      { name: "十四五新型基础设施建设规划", code: "发改高技〔2022〕671号", description: "新型基础设施建设专项规划。", issuer: "国家发改委", year: "2022" },
    ],
  },
  "agriculture": {
    parameters: [
      { name: "粮食总产量", symbol: undefined, value: "70650", unit: "万吨", description: "2024年全国粮食总产量，连续10年稳定在1.3万亿斤以上。", category: "粮食安全", source: "国家统计局" },
      { name: "耕地面积", symbol: undefined, value: "19.29亿", unit: "亩", description: "截至2023年全国耕地面积。", category: "土地资源", source: "自然资源部" },
      { name: "农业科技进步贡献率", symbol: undefined, value: "63.2%", unit: "%", description: "2023年中国农业科技进步贡献率。", category: "农业科技", source: "农业农村部" },
      { name: "主要农作物综合机械化率", symbol: undefined, value: "74%", unit: "%", description: "2023年全国农作物耕种收综合机械化率。", category: "农业装备", source: "农业农村部" },
      { name: "高标准农田面积", symbol: undefined, value: "约10亿", unit: "亩", description: "截至2024年已建成高标准农田面积。", category: "农田建设", source: "农业农村部" },
    ],
    officialDocs: [
      { name: "中华人民共和国农业法", code: "主席令第六号", description: "农业领域基本法律，2012年修订。", issuer: "全国人大常委会", year: "2012" },
      { name: "乡村振兴战略规划", code: "中发〔2018〕18号", description: "2018-2022年乡村振兴战略规划。", issuer: "中共中央、国务院", year: "2018" },
    ],
  },
  "medicine": {
    parameters: [
      { name: "正常体温", symbol: "T", value: "36.0-37.3", unit: "℃", description: "成年人正常腋下体温范围。", category: "生命体征", source: "《诊断学》（第9版）" },
      { name: "正常心率", symbol: "HR", value: "60-100", unit: "次/分", description: "成年人静息正常心率范围。", category: "生命体征", source: "《诊断学》（第9版）" },
      { name: "正常血压", symbol: "BP", value: "90-120/60-80", unit: "mmHg", description: "成年人正常血压范围（收缩压/舒张压）。", category: "生命体征", source: "《诊断学》（第9版）" },
      { name: "空腹血糖", symbol: undefined, value: "3.9-6.1", unit: "mmol/L", description: "正常人空腹血糖参考范围。", category: "生化指标", source: "《内科学》（第9版）" },
      { name: "正常血清钾", symbol: "K⁺", value: "3.5-5.5", unit: "mmol/L", description: "正常血清钾浓度范围。", category: "电解质", source: "《内科学》（第9版）" },
      { name: "护理本科教育年制", symbol: undefined, value: "4", unit: "年", description: "中国护理学本科教育标准学制。", category: "护理教育", source: "教育部护理学类教学质量国家标准" },
    ],
    officialDocs: [
      { name: "中华人民共和国基本医疗卫生与健康促进法", code: "主席令第三十八号", description: "卫生与健康领域的基本法律，2020年施行。", issuer: "全国人大常委会", year: "2019" },
      { name: "护士条例", code: "国务院令第517号", description: "规范护士执业活动的行政法规，2020年修订。", issuer: "国务院", year: "2020" },
    ],
  },
  "management": {
    parameters: [
      { name: "全国登记经营主体数", symbol: undefined, value: "约1.88亿", unit: "户", description: "截至2024年底全国登记在册经营主体数量。", category: "市场主体", source: "市场监管总局" },
      { name: "世界500强中国企业数", symbol: undefined, value: "133", unit: "家", description: "2024年《财富》世界500强中中国大陆（含香港）企业数量。", category: "企业规模", source: "《财富》杂志" },
      { name: "非公有制经济贡献GDP", symbol: undefined, value: "约60%", unit: "%", description: "民营经济对中国GDP的贡献率。", category: "经济贡献", source: "全国工商联" },
      { name: "MBA年招生人数", symbol: undefined, value: "约5万", unit: "人/年", description: "近年全国MBA年招生规模。", category: "管理教育", source: "教育部" },
    ],
    officialDocs: [
      { name: "关于促进民营经济发展壮大的意见", code: "中发〔2023〕10号", description: "促进民营经济发展壮大的纲领性文件。", issuer: "中共中央、国务院", year: "2023" },
      { name: "优化营商环境条例", code: "国务院令第722号", description: "优化营商环境的行政法规，2020年施行。", issuer: "国务院", year: "2019" },
    ],
  },
  "art": {
    parameters: [
      { name: "文化产业GDP占比", symbol: undefined, value: "4.59%", unit: "%", description: "2023年中国文化产业增加值占GDP比重。", category: "文化产业", source: "国家统计局" },
      { name: "博物馆数量", symbol: undefined, value: "6833", unit: "座", description: "截至2024年全国备案博物馆数量。", category: "文化设施", source: "国家文物局" },
      { name: "美术馆数量", symbol: undefined, value: "约800", unit: "座", description: "全国各级美术馆数量。", category: "文化设施", source: "文化和旅游部" },
      { name: "高等艺术院校数", symbol: undefined, value: "约40", unit: "所", description: "全国独立设置的本科艺术院校数量。", category: "艺术教育", source: "教育部" },
    ],
    officialDocs: [
      { name: "关于推动文化产业高质量发展的意见", code: "中办发〔2023〕18号", description: "文化产业高质量发展的纲领性文件。", issuer: "中共中央办公厅、国务院办公厅", year: "2023" },
      { name: "中华人民共和国非物质文化遗产法", code: "主席令第四十二号", description: "非物质文化遗产保护的基本法律。", issuer: "全国人大常委会", year: "2011" },
    ],
  },
  "military": {
    parameters: [
      { name: "国防预算", symbol: undefined, value: "约1.67万亿", unit: "元", description: "2024年中国国防支出预算。", category: "国防投入", source: "财政部预算报告" },
      { name: "国防预算占GDP比例", symbol: undefined, value: "约1.3%", unit: "%", description: "中国国防支出占GDP比例，远低于主要军事大国。", category: "国防投入", source: "财政部预算报告" },
      { name: "现役军人数量", symbol: undefined, value: "约200万", unit: "人", description: "改革后中国军队现役总员额。", category: "军事力量", source: "国防部白皮书" },
      { name: "服役年龄上限", symbol: undefined, value: "24", unit: "周岁", description: "义务兵征集年龄上限（普通高校毕业生可放宽至24周岁）。", category: "兵役制度", source: "兵役法" },
    ],
    officialDocs: [
      { name: "中华人民共和国国防法", code: "主席令第六十七号", description: "国防领域基本法律，2020年修订。", issuer: "全国人大常委会", year: "2020" },
      { name: "新时代的中国国防白皮书", code: "国务院新闻办公室", description: "2019年发布的国防白皮书，阐述新时代中国防御性国防政策。", issuer: "国务院新闻办公室", year: "2019" },
    ],
  },
};