/**
 * Selenyx 临床数据 —— 前端内置数据集
 * NANDA 护理诊断 / 检验参考值 / 护理科研术语表
 * 不依赖后端，全部内置在前端
 */

export interface NANDADiagnosis {
  code: string;
  name: string;
  domain: string;
  class: string;
  definition: string;
  definingCharacteristics: string[];
  relatedFactors: string[];
}

export const NANDA_DIAGNOSES: NANDADiagnosis[] = [
  { code: '00032', name: '无效呼吸形态', domain: '安全/保护', class: '呼吸', definition: '吸气和呼气模式不能提供充分通气。', definingCharacteristics: ['呼吸困难', '使用辅助呼吸肌', '鼻翼扇动', '呼吸频率异常', '发绀', '桶状胸'], relatedFactors: ['气道阻塞', '神经肌肉功能障碍', '疼痛', '焦虑', '肺部疾病'] },
  { code: '00029', name: '气体交换受损', domain: '安全/保护', class: '呼吸', definition: '肺泡与毛细血管之间的气体交换失衡。', definingCharacteristics: ['低氧血症', '高碳酸血症', '烦躁不安', '意识模糊', '心动过速', '发绀'], relatedFactors: ['肺泡-毛细血管膜改变', '通气灌注失衡', '血流改变', '氧供减少'] },
  { code: '00088', name: '腹泻', domain: '排泄', class: '胃肠', definition: '排便次数增多，粪便呈松散或液体状。', definingCharacteristics: ['排便次数>3次/日', '腹痛', '肠鸣音亢进', '脱水', '粪便稀薄'], relatedFactors: ['感染', '饮食不当', '药物副作用', '吸收不良', '炎症性肠病'] },
  { code: '00004', name: '有感染的危险', domain: '安全/保护', class: '感染', definition: '处于易受病原体侵犯的危险状态。', definingCharacteristics: [], relatedFactors: ['免疫防御功能下降', '侵入性操作', '慢性疾病', '营养不良', '皮肤完整性受损'] },
  { code: '00046', name: '皮肤完整性受损', domain: '安全/保护', class: '皮肤', definition: '表皮和/或真皮发生改变。', definingCharacteristics: ['皮肤破损', '红斑', '水疱', '溃疡', '渗出'], relatedFactors: ['压力', '摩擦力', '剪切力', '潮湿', '营养缺乏', '制动'] },
  { code: '00035', name: '有皮肤完整性受损的危险', domain: '安全/保护', class: '皮肤', definition: '皮肤可能发生改变的危险状态。', definingCharacteristics: [], relatedFactors: ['制动', '感觉障碍', '潮湿', '营养缺乏', '循环障碍'] },
  { code: '00126', name: '有体液量不平衡的危险', domain: '营养', class: '体液', definition: '处于血管内、组织间隙和/或细胞内体液减少或过多的危险状态。', definingCharacteristics: [], relatedFactors: ['静脉输液', '药物', '肾功能异常', '心力衰竭', '肝硬化'] },
  { code: '00023', name: '体液过多', domain: '营养', class: '体液', definition: '等渗体液潴留增加。', definingCharacteristics: ['水肿', '体重增加', '呼吸困难', '颈静脉怒张', '血压升高', '少尿'], relatedFactors: ['肾功能衰竭', '心力衰竭', '肝硬化', '钠摄入过多'] },
  { code: '00027', name: '体液不足', domain: '营养', class: '体液', definition: '血管内、组织间隙和/或细胞内液体减少。', definingCharacteristics: ['口渴', '皮肤干燥', '尿量减少', '血压下降', '心率增快', '乏力'], relatedFactors: ['失血', '呕吐腹泻', '多尿', '出汗过多', '液体摄入不足'] },
  { code: '00095', name: '睡眠形态紊乱', domain: '活动/休息', class: '睡眠', definition: '睡眠时间和质量不能满足需要。', definingCharacteristics: ['入睡困难', '频繁觉醒', '早醒', '白天嗜睡', '烦躁', '注意力下降'], relatedFactors: ['疼痛', '焦虑', '环境噪音', '药物', '昼夜节律改变'] },
  { code: '00132', name: '急性疼痛', domain: '舒适', class: '疼痛', definition: '有害刺激引起的突然或缓慢发生的感官体验，持续<3个月。', definingCharacteristics: ['自述疼痛', '保护性体位', '面部表情痛苦', '烦躁不安', '生命体征改变', '出汗'], relatedFactors: ['损伤', '疾病', '手术', '炎症', '缺血'] },
  { code: '00133', name: '慢性疼痛', domain: '舒适', class: '疼痛', definition: '有害刺激引起的感官体验，持续或反复出现≥3个月。', definingCharacteristics: ['自述持续疼痛', '行为改变', '睡眠障碍', '食欲下降', '抑郁', '社交退缩'], relatedFactors: ['慢性疾病', '神经损伤', '关节炎', '癌症', '手术后遗症'] },
  { code: '00134', name: '恶心', domain: '舒适', class: '舒适', definition: '咽喉部或胃部的不适感，常伴随有呕吐的冲动。', definingCharacteristics: ['面色苍白', '出汗', '唾液增多', '心动过速', '胃部不适感'], relatedFactors: ['药物', '妊娠', '胃肠道疾病', '化疗', '疼痛'] },
  { code: '00118', name: '有跌倒的危险', domain: '安全/保护', class: '损伤', definition: '处于意外跌倒的危险状态。', definingCharacteristics: [], relatedFactors: ['年龄', '步态不稳', '用药', '视力障碍', '环境因素', '认知障碍'] },
  { code: '00097', name: '有受伤的危险', domain: '安全/保护', class: '损伤', definition: '处于组织损伤的危险状态。', definingCharacteristics: [], relatedFactors: ['感觉障碍', '认知障碍', '环境危险', '制动', '药物'] },
  { code: '00116', name: '有误吸的危险', domain: '安全/保护', class: '呼吸', definition: '处于异物进入气管支气管的危险状态。', definingCharacteristics: [], relatedFactors: ['吞咽困难', '意识障碍', '胃食管反流', '气管插管', '呕吐'] },
  { code: '00086', name: '有体温调节无效的危险', domain: '安全/保护', class: '体温调节', definition: '处于不能维持体温在正常范围的危险状态。', definingCharacteristics: [], relatedFactors: ['年龄极端', '暴露极端环境', '脱水', '感染', '药物'] },
  { code: '00007', name: '体温过高', domain: '安全/保护', class: '体温调节', definition: '体温升高至正常范围以上。', definingCharacteristics: ['体温>37.5°C(腋下)', '皮肤潮红', '心率增快', '呼吸增快', '出汗', '寒战'], relatedFactors: ['感染', '炎症', '脱水', '中枢神经系统损伤', '药物'] },
  { code: '00006', name: '体温过低', domain: '安全/保护', class: '体温调节', definition: '体温降低至正常范围以下。', definingCharacteristics: ['体温<36°C(腋下)', '皮肤苍白', '寒战', '心率减慢', '嗜睡'], relatedFactors: ['暴露低温', '年龄', '酒精中毒', '代谢障碍', '休克'] },
  { code: '00099', name: '有出血的危险', domain: '安全/保护', class: '损伤', definition: '处于内部或外部出血量减少的危险状态。', definingCharacteristics: [], relatedFactors: ['凝血障碍', '抗凝治疗', '手术', '创伤', '肝脏疾病'] },
  { code: '00155', name: '有跌倒的危险', domain: '安全/保护', class: '损伤', definition: '处于因意外跌倒而导致损伤的危险状态。', definingCharacteristics: [], relatedFactors: ['步态不稳', '认知障碍', '环境因素', '药物影响', '视力障碍'] },
  { code: '00102', name: '喂养自我护理缺陷', domain: '活动/休息', class: '自我护理', definition: '进食的能力受损。', definingCharacteristics: ['不能自己进食', '不能使用餐具', '不能咀嚼'], relatedFactors: ['衰弱', '神经肌肉障碍', '认知障碍', '疼痛', '视力障碍'] },
  { code: '00109', name: '进食自理缺陷', domain: '活动/休息', class: '自我护理', definition: '独立完成进食活动的能力受损。', definingCharacteristics: [], relatedFactors: ['肌肉无力', '关节活动受限', '认知障碍', '视力障碍'] },
  { code: '00085', name: '身体活动障碍', domain: '活动/休息', class: '活动', definition: '四肢或全身自主运动受限。', definingCharacteristics: ['活动范围受限', '肌力下降', '步态异常', '协调障碍', '运动迟缓'], relatedFactors: ['神经肌肉障碍', '肌肉骨骼疾病', '疼痛', '制动', '衰弱'] },
  { code: '00040', name: '有精神状态改变的危险', domain: '感知/认知', class: '认知', definition: '处于认知功能改变的危险状态。', definingCharacteristics: [], relatedFactors: ['年龄', '药物', '感染', '代谢紊乱', '缺氧', '睡眠剥夺'] },
  { code: '00129', name: '慢性意识模糊', domain: '感知/认知', class: '认知', definition: '渐进的、长期的、不可逆的智力功能减退。', definingCharacteristics: ['记忆障碍', '定向障碍', '判断力下降', '行为改变', '语言障碍'], relatedFactors: ['阿尔茨海默病', '血管性痴呆', '脑损伤'] },
  { code: '00128', name: '急性意识模糊', domain: '感知/认知', class: '认知', definition: '突发的、可逆的意识和注意力紊乱。', definingCharacteristics: ['意识模糊', '注意力不集中', '幻觉', '烦躁', '睡眠-觉醒周期紊乱'], relatedFactors: ['感染', '药物', '代谢紊乱', '缺氧', '酒精戒断'] },
  { code: '00055', name: '进食障碍', domain: '营养', class: '摄入', definition: '营养摄入低于或超过机体代谢需要量。', definingCharacteristics: ['体重变化', '食欲改变', '进食量改变', '营养不良体征'], relatedFactors: ['疾病', '药物', '心理因素', '经济困难', '认知障碍'] },
  { code: '00002', name: '营养失调：低于机体需要量', domain: '营养', class: '摄入', definition: '营养摄入不足以满足代谢需要量。', definingCharacteristics: ['体重低于正常范围', '皮下脂肪减少', '肌肉萎缩', '食欲减退', '血红蛋白降低'], relatedFactors: ['摄入不足', '消化吸收障碍', '代谢增加', '疾病', '经济困难'] },
  { code: '00001', name: '营养失调：高于机体需要量', domain: '营养', class: '摄入', definition: '营养摄入超过机体代谢需要量。', definingCharacteristics: ['体重超过正常范围', '三头肌皮褶厚度增加', '久坐生活方式'], relatedFactors: ['摄入过多', '活动减少', '代谢降低', '心理因素'] },
  { code: '00146', name: '焦虑', domain: '应对/压力耐受', class: '应对反应', definition: '模糊的不安感，伴随自主神经反应。', definingCharacteristics: ['紧张', '不安', '心悸', '出汗', '失眠', '注意力不集中', '呼吸增快'], relatedFactors: ['健康威胁', '环境改变', '人际冲突', '不确定性', '药物'] },
  { code: '00148', name: '恐惧', domain: '应对/压力耐受', class: '应对反应', definition: '对已识别的威胁产生的反应。', definingCharacteristics: ['惊恐', '逃避行为', '心悸', '出汗', '颤抖', '瞳孔散大'], relatedFactors: ['威胁性刺激', '疼痛', '陌生环境', '手术'] },
  { code: '00125', name: '无力感', domain: '应对/压力耐受', class: '应对反应', definition: '对自身或情境缺乏控制感。', definingCharacteristics: ['表达无法控制', '被动', '依赖', '消极', '自尊降低'], relatedFactors: ['慢性疾病', '社会支持缺乏', '反复失败', '住院'] },
  { code: '00069', name: '应对无效', domain: '应对/压力耐受', class: '应对反应', definition: '评估和管理压力源的能力受损。', definingCharacteristics: ['不能有效解决问题', '情绪反应过度', '行为异常', '社交退缩', '否认现实'], relatedFactors: ['压力过载', '应对技巧不足', '社会支持缺乏', '自尊低下'] },
  { code: '00074', name: '家庭应对无效', domain: '应对/压力耐受', class: '家庭应对', definition: '家庭成员不能有效管理健康问题。', definingCharacteristics: ['家庭沟通障碍', '忽视患者需要', '过度保护', '冲突增加'], relatedFactors: ['家庭功能障碍', '信息不足', '长期疾病', '经济压力'] },
  { code: '00100', name: '知识缺乏', domain: '感知/认知', class: '认知', definition: '有关特定主题的认知信息缺乏。', definingCharacteristics: ['口述缺乏信息', '行为错误', '不遵医嘱', '提出问题'], relatedFactors: ['信息来源缺乏', '认知障碍', '文化差异', '语言障碍'] },
  { code: '00050', name: '精神困扰', domain: '生命原则', class: '信念', definition: '生命意义和目的受到干扰。', definingCharacteristics: ['质疑意义', '精神空虚', '愤怒', '绝望', '分离感'], relatedFactors: ['疾病', '丧失', '痛苦', '孤独'] },
  { code: '00098', name: '活动无耐力', domain: '活动/休息', class: '活动', definition: '生理或心理能量不足以完成日常活动。', definingCharacteristics: ['活动后疲乏', '呼吸困难', '心率增快', '出汗', '虚弱'], relatedFactors: ['心肺疾病', '贫血', '衰弱', '抑郁', '制动'] },
  { code: '00113', name: '有创伤后综合征的危险', domain: '应对/压力耐受', class: '创伤后反应', definition: '暴露于创伤事件后可能出现持续性心理反应的危险状态。', definingCharacteristics: [], relatedFactors: ['创伤事件', '缺乏社会支持', '既往精神病史'] },
];

export interface LabValue {
  name: string;
  category: string;
  range: string;
  unit: string;
  critical: string;
  nursingNote: string;
}

export const LAB_VALUES: LabValue[] = [
  // 血液
  { name: '血红蛋白', category: '血液', range: '男 120-160 / 女 110-150', unit: 'g/L', critical: '<60 重度贫血 / >180 红细胞增多', nursingNote: '贫血者观察乏力、心悸；增多者防血栓' },
  { name: '白细胞计数', category: '血液', range: '4.0-10.0', unit: '×10⁹/L', critical: '<2.0 感染危险 / >30.0 白血病可能', nursingNote: '减少者保护性隔离；增多者排查感染' },
  { name: '血小板计数', category: '血液', range: '100-300', unit: '×10⁹/L', critical: '<50 出血风险 / <20 严重出血', nursingNote: '减少者防跌倒、软毛牙刷、注意出血征象' },
  { name: '红细胞计数', category: '血液', range: '男 4.0-5.5 / 女 3.5-5.0', unit: '×10¹²/L', critical: '<2.0 严重贫血', nursingNote: '结合Hb判断贫血程度' },
  { name: '中性粒细胞', category: '血液', range: '2.0-7.0 (50%-70%)', unit: '×10⁹/L', critical: '<0.5 粒细胞缺乏症', nursingNote: '缺乏症需保护性隔离、无菌饮食' },
  { name: '血沉(ESR)', category: '血液', range: '男 <15 / 女 <20', unit: 'mm/h', critical: '>100 严重炎症或肿瘤', nursingNote: '非特异性指标，需结合临床' },
  // 电解质
  { name: '血钾(K⁺)', category: '电解质', range: '3.5-5.5', unit: 'mmol/L', critical: '<2.5 致命心律失常 / >6.5 心搏骤停', nursingNote: '低钾：心电监护、补钾；高钾：胰岛素+葡萄糖、钙剂' },
  { name: '血钠(Na⁺)', category: '电解质', range: '135-145', unit: 'mmol/L', critical: '<120 抽搐昏迷 / >160 神经症状', nursingNote: '低钠缓慢纠正防脑水肿；高钠限钠补水' },
  { name: '血钙(Ca²⁺)', category: '电解质', range: '2.10-2.55', unit: 'mmol/L', critical: '<1.5 抽搐 / >3.5 心律失常', nursingNote: '低钙：Chvostek征、Trousseau征监测；高钙补液促排' },
  { name: '血磷(P)', category: '电解质', range: '0.81-1.45', unit: 'mmol/L', critical: '<0.3 呼吸衰竭', nursingNote: '与钙呈反比，慢性肾病常见异常' },
  { name: '血镁(Mg²⁺)', category: '电解质', range: '0.75-1.05', unit: 'mmol/L', critical: '<0.5 抽搐 / >3.0 呼吸抑制', nursingNote: '低镁常伴低钾低钙；高镁用钙剂拮抗' },
  { name: '血氯(Cl⁻)', category: '电解质', range: '95-105', unit: 'mmol/L', critical: '异常多伴随其他电解质紊乱', nursingNote: '结合Na⁺和酸碱平衡评估' },
  // 肝功能
  { name: 'ALT(谷丙转氨酶)', category: '肝功能', range: '<40', unit: 'U/L', critical: '>1000 急性肝损伤', nursingNote: '反映肝细胞损伤程度，用药时监测' },
  { name: 'AST(谷草转氨酶)', category: '肝功能', range: '<40', unit: 'U/L', critical: '>1000 严重肝损伤', nursingNote: 'AST/ALT比值>1提示酒精性肝病' },
  { name: '总胆红素(TBIL)', category: '肝功能', range: '3.4-17.1', unit: 'μmol/L', critical: '>171 重度黄疸', nursingNote: '黄疸者观察皮肤瘙痒、大便颜色' },
  { name: '白蛋白(ALB)', category: '肝功能', range: '35-55', unit: 'g/L', critical: '<25 严重低蛋白血症', nursingNote: '低白蛋白→水肿、伤口愈合差，需营养支持' },
  { name: '总蛋白(TP)', category: '肝功能', range: '60-80', unit: 'g/L', critical: '<40 营养不良', nursingNote: '白蛋白/球蛋白比值评估肝功能' },
  // 肾功能
  { name: '血肌酐(Cr)', category: '肾功能', range: '男 53-115 / 女 44-97', unit: 'μmol/L', critical: '持续升高提示肾功能不全', nursingNote: '评估GFR的主要指标' },
  { name: '尿素氮(BUN)', category: '肾功能', range: '2.9-7.5', unit: 'mmol/L', critical: '>28.6 严重肾功能不全', nursingNote: '脱水、消化道出血也可升高' },
  { name: '尿酸(UA)', category: '肾功能', range: '男 149-416 / 女 89-357', unit: 'μmol/L', critical: '>540 痛风风险高', nursingNote: '高尿酸者低嘌呤饮食、多饮水' },
  { name: 'eGFR', category: '肾功能', range: '>90', unit: 'mL/min/1.73m²', critical: '<15 肾衰竭(5期)', nursingNote: '分5期评估慢性肾病严重程度' },
  // 心肌酶/心脏
  { name: '肌钙蛋白I(cTnI)', category: '心肌标志物', range: '<0.04', unit: 'ng/mL', critical: '>0.4 心肌损伤 / >2.0 心梗', nursingNote: '急性胸痛患者必查，3-6h达峰' },
  { name: 'CK-MB', category: '心肌标志物', range: '<25', unit: 'U/L', critical: '>5%总CK 心肌损伤', nursingNote: '心梗后4-6h升高，24h达峰' },
  { name: 'BNP/NT-proBNP', category: '心肌标志物', range: 'BNP<100 / NT-proBNP<300', unit: 'pg/mL', critical: '>400 心衰可能', nursingNote: '排除心衰的阴性预测值高' },
  // 血糖代谢
  { name: '空腹血糖(FBG)', category: '血糖代谢', range: '3.9-6.1', unit: 'mmol/L', critical: '<2.8 低血糖 / >33.3 高渗状态', nursingNote: '低血糖立即处理；高血糖查酮体' },
  { name: '糖化血红蛋白(HbA1c)', category: '血糖代谢', range: '<5.7%', unit: '%', critical: '>9% 血糖控制差', nursingNote: '反映2-3月平均血糖，糖尿病诊断/监测金标准' },
  { name: '餐后2h血糖', category: '血糖代谢', range: '<7.8', unit: 'mmol/L', critical: '>11.1 糖尿病', nursingNote: 'OGTT 2h值诊断糖尿病' },
  // 凝血
  { name: 'PT/INR', category: '凝血', range: 'PT 11-14s / INR 0.8-1.2', unit: 's/INR', critical: 'INR>5 出血风险高', nursingNote: '抗凝监测目标INR 2-3（机械瓣2.5-3.5）' },
  { name: 'APTT', category: '凝血', range: '25-37', unit: 's', critical: '>70 出血风险', nursingNote: '肝素治疗监测指标' },
  { name: 'D-二聚体', category: '凝血', range: '<0.5', unit: 'mg/L', critical: '>5 需排查DVT/PE', nursingNote: '阴性排除价值高，阳性需进一步检查' },
  // 甲状腺
  { name: 'TSH', category: '甲状腺', range: '0.27-4.2', unit: 'mIU/L', critical: '<0.1 甲亢 / >100 甲减', nursingNote: '甲状腺功能首选筛查指标' },
  { name: 'FT3', category: '甲状腺', range: '3.1-6.8', unit: 'pmol/L', critical: '>30 甲亢危象风险', nursingNote: '与FT4联合评估甲状腺功能' },
  { name: 'FT4', category: '甲状腺', range: '12-22', unit: 'pmol/L', critical: '异常提示甲状腺功能障碍', nursingNote: '甲亢者观察心率、体温、情绪变化' },
  // 炎症
  { name: 'C反应蛋白(CRP)', category: '炎症', range: '<10', unit: 'mg/L', critical: '>100 严重感染', nursingNote: '细菌感染升高，病毒感染多正常' },
  { name: '降钙素原(PCT)', category: '炎症', range: '<0.1', unit: 'ng/mL', critical: '>2 严重细菌感染', nursingNote: '区分细菌/病毒感染优于CRP' },
  { name: '血培养', category: '炎症', range: '阴性', unit: '—', critical: '阳性 菌血症/败血症', nursingNote: '发热寒战时抽血，抗生素使用前' },
  // 血气
  { name: 'pH', category: '血气分析', range: '7.35-7.45', unit: '—', critical: '<7.20 / >7.60 危及生命', nursingNote: '酸碱平衡核心指标' },
  { name: 'PaO₂', category: '血气分析', range: '80-100', unit: 'mmHg', critical: '<60 呼吸衰竭', nursingNote: 'I型呼衰<60，II型<60伴PaCO₂>50' },
  { name: 'PaCO₂', category: '血气分析', range: '35-45', unit: 'mmHg', critical: '>70 CO₂麻醉', nursingNote: 'COPD患者谨慎氧疗防CO₂潴留' },
  { name: 'HCO₃⁻', category: '血气分析', range: '22-26', unit: 'mmol/L', critical: '<10 / >40 严重酸碱失衡', nursingNote: '代谢性酸碱失衡指标' },
  { name: 'SaO₂', category: '血气分析', range: '95-100', unit: '%', critical: '<90 低氧血症', nursingNote: 'SpO₂监测无创便捷' },
];

export interface GlossaryTerm {
  en: string;
  zh: string;
  category: string;
  definition: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { en: 'Evidence-Based Nursing (EBN)', zh: '循证护理', category: '方法论', definition: '将最佳证据、临床经验和患者偏好相结合的护理决策方法' },
  { en: 'PICO Framework', zh: 'PICO框架', category: '方法论', definition: '问题结构化工具：人群(P)、干预(I)、对照(C)、结局(O)' },
  { en: 'Systematic Review', zh: '系统评价', category: '研究类型', definition: '系统检索、评价和综合研究证据的方法' },
  { en: 'Meta-Analysis', zh: '荟萃分析', category: '研究类型', definition: '用统计方法合并多个研究结果的定量分析' },
  { en: 'Randomized Controlled Trial (RCT)', zh: '随机对照试验', category: '研究类型', definition: '随机分配受试者到干预组/对照组的实验性研究' },
  { en: 'Quasi-Experimental Study', zh: '类实验研究', category: '研究类型', definition: '有干预但缺乏随机分配的研究设计' },
  { en: 'Cohort Study', zh: '队列研究', category: '研究类型', definition: '追踪暴露/非暴露人群结局发生的观察性研究' },
  { en: 'Case-Control Study', zh: '病例对照研究', category: '研究类型', definition: '比较病例组与对照组既往暴露的回顾性研究' },
  { en: 'Cross-Sectional Study', zh: '横断面研究', category: '研究类型', definition: '在特定时点同时测量暴露和结局的观察性研究' },
  { en: 'Qualitative Research', zh: '质性研究', category: '研究类型', definition: '通过访谈、观察等方法探索主观经验的非量化研究' },
  { en: 'GRADE', zh: 'GRADE证据分级', category: '评价工具', definition: '评估证据质量和推荐强度的国际标准体系（高/中/低/极低）' },
  { en: 'PRISMA', zh: 'PRISMA报告规范', category: '评价工具', definition: '系统综述和荟萃分析的标准报告条目（2020版27项）' },
  { en: 'Cochrane Risk of Bias', zh: 'Cochrane偏倚风险工具', category: '评价工具', definition: '评估RCT偏倚风险的标准化工具（7个域）' },
  { en: 'JBI Critical Appraisal', zh: 'JBI质量评价工具', category: '评价工具', definition: '澳大利亚JBI研究所开发的不同研究类型质量评价工具' },
  { en: 'Validity', zh: '效度', category: '测量学', definition: '测量工具正确测量到目标概念的程度' },
  { en: 'Reliability', zh: '信度', category: '测量学', definition: '测量工具重复测量结果的一致性程度' },
  { en: 'Internal Consistency', zh: '内部一致性', category: '测量学', definition: '量表各条目之间相关程度，常用Cronbach α系数评估' },
  { en: 'Inter-Rater Reliability', zh: '评分者间信度', category: '测量学', definition: '不同评分者使用同一工具评分的一致性' },
  { en: 'Content Validity Index (CVI)', zh: '内容效度指数', category: '测量学', definition: '专家评定量表条目相关性的量化指标' },
  { en: 'Construct Validity', zh: '结构效度', category: '测量学', definition: '量表实际结构与理论框架的一致程度' },
  { en: 'Sensitivity', zh: '灵敏度', category: '诊断试验', definition: '真阳性率，患者中被正确判为阳性的比例' },
  { en: 'Specificity', zh: '特异度', category: '诊断试验', definition: '真阴性率，非患者中被正确判为阴性的比例' },
  { en: 'Positive Predictive Value (PPV)', zh: '阳性预测值', category: '诊断试验', definition: '阳性结果中真正患病的比例' },
  { en: 'Negative Predictive Value (NPV)', zh: '阴性预测值', category: '诊断试验', definition: '阴性结果中真正未患病的比例' },
  { en: 'Likelihood Ratio', zh: '似然比', category: '诊断试验', definition: '结合灵敏度和特异度的综合诊断指标' },
  { en: 'p-value', zh: 'p值', category: '统计学', definition: '在零假设成立时观察到当前或更极端结果的概率' },
  { en: 'Confidence Interval (CI)', zh: '置信区间', category: '统计学', definition: '总体参数可能落入的范围，常用95%CI' },
  { en: 'Effect Size', zh: '效应量', category: '统计学', definition: '衡量处理效应大小的标准化指标（如Cohen d、OR、RR）' },
  { en: 'Odds Ratio (OR)', zh: '比值比', category: '统计学', definition: '病例组与对照组暴露比值的比' },
  { en: 'Relative Risk (RR)', zh: '相对危险度', category: '统计学', definition: '暴露组与非暴露组发病风险的比值' },
  { en: 'Number Needed to Treat (NNT)', zh: '需治人数', category: '统计学', definition: '治疗多少人可多获得一例有利结局' },
  { en: 'Type I Error (α)', zh: 'I类错误', category: '统计学', definition: '零假设为真时拒绝零假设（假阳性）' },
  { en: 'Type II Error (β)', zh: 'II类错误', category: '统计学', definition: '零假设为假时未拒绝零假设（假阴性）' },
  { en: 'Power (1-β)', zh: '检验效能', category: '统计学', definition: '正确拒绝错误零假设的概率，通常要求≥0.80' },
  { en: 'Intention-to-Treat (ITT)', zh: '意向性分析', category: '分析方法', definition: '按随机分配组进行分析，不因退出/失访而改变分组' },
  { en: 'Per-Protocol Analysis', zh: '符合方案分析', category: '分析方法', definition: '只分析完成方案要求的受试者' },
  { en: 'Blinding', zh: '盲法', category: '研究设计', definition: '隐藏分组信息以减少偏倚（单盲/双盲/三盲）' },
  { en: 'Allocation Concealment', zh: '分配隐藏', category: '研究设计', definition: '隐藏随机分组序列，防止选择偏倚' },
  { en: 'Attrition Bias', zh: '失访偏倚', category: '偏倚', definition: '因受试者退出/失访导致的系统性误差' },
  { en: 'Selection Bias', zh: '选择偏倚', category: '偏倚', definition: '研究对象选择过程中的系统性误差' },
  { en: 'Information Bias', zh: '信息偏倚', category: '偏倚', definition: '数据收集/测量过程中的系统性误差' },
  { en: 'Confounding', zh: '混杂', category: '偏倚', definition: '第三方因素同时影响暴露和结局造成的偏倚' },
  { en: 'Publication Bias', zh: '发表偏倚', category: '偏倚', definition: '阳性结果更易发表导致的系统性偏差' },
  { en: 'Saturation', zh: '资料饱和', category: '质性研究', definition: '质性研究中新增数据不再产生新信息的时点' },
  { en: 'Triangulation', zh: '三角验证', category: '质性研究', definition: '用多种方法/来源/理论交叉验证研究发现' },
  { en: 'Phenomenology', zh: '现象学', category: '质性研究', definition: '研究个体主观经验的研究方法论' },
  { en: 'Grounded Theory', zh: '扎根理论', category: '质性研究', definition: '从数据中自下而上构建理论的方法' },
  { en: 'Narrative Inquiry', zh: '叙事研究', category: '质性研究', definition: '通过个体故事/叙事来理解经验的研究方法' },
  { en: 'Action Research', zh: '行动研究', category: '质性研究', definition: '研究与实践结合，边行动边研究边改进的方法' },
  { en: 'Concept Analysis', zh: '概念分析', category: '理论', definition: '系统分析概念属性、前因、后果的方法（如Walker & Avant法）' },
  { en: 'Middle-Range Theory', zh: '中域理论', category: '理论', definition: '范围有限、可检验、可操作的护理理论（如Orem自理理论）' },
  { en: 'SBAR', zh: 'SBAR沟通工具', category: '临床工具', definition: '结构化交接沟通工具：情境(S)、背景(B)、评估(A)、建议(R)' },
  { en: 'Clinical Reasoning', zh: '临床推理', category: '临床工具', definition: '收集和解读信息、形成判断和决策的认知过程' },
  { en: 'Critical Thinking', zh: '批判性思维', category: '临床工具', definition: '有目的、自我调节的判断过程' },
  { en: 'Nursing Process', zh: '护理程序', category: '临床工具', definition: '评估→诊断→计划→实施→评价的系统化护理方法' },
  { en: 'NANDA-I', zh: 'NANDA-I护理诊断', category: '临床工具', definition: '北美护理诊断协会分类系统，标准化护理诊断术语' },
  { en: 'NIC', zh: '护理措施分类', category: '临床工具', definition: '标准化护理干预措施分类系统' },
  { en: 'NOC', zh: '护理结局分类', category: '临床工具', definition: '标准化护理敏感结局分类系统' },
  { en: 'Kappa Statistic', zh: 'Kappa系数', category: '统计学', definition: '评估两名评分者间一致性的统计量，>0.8为一致性良好' },
  { en: 'Informed Consent', zh: '知情同意', category: '伦理', definition: '研究参与者在充分了解后自愿同意参加研究' },
  { en: 'Institutional Review Board (IRB)', zh: '伦理委员会', category: '伦理', definition: '审查研究方案伦理合规性的独立委员会' },
  { en: 'Vulnerability', zh: '脆弱性', category: '伦理', definition: '研究参与者因能力/处境而处于易受伤害的状态' },
  { en: 'Anonymity', zh: '匿名', category: '伦理', definition: '研究者也无法识别数据与个体对应关系' },
];
