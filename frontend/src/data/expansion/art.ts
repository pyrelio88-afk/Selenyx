/**
 * 艺术学扩展数据
 * R93 第一批
 */

import type { DisciplineExpansion } from './index';

export const ART_EXTRA: DisciplineExpansion = {
  glossary: [
    { term: '文艺复兴', termEn: 'Renaissance', definition: '14-16世纪起源于意大利、蔓延至全欧洲的文化艺术运动。核心精神：人文主义——以人为中心、肯定人的价值和理性。三杰：达·芬奇（蒙娜丽莎/最后的晚餐）、米开朗基罗（大卫/创世纪）、拉斐尔（雅典学院）。线性透视法的发明是文艺复兴艺术的技法革命。', category: '西方美术史', source: 'Giorgio Vasari《艺苑名人传》' },
    { term: '印象派', termEn: 'Impressionism', definition: '19世纪后半期法国画派。特征：户外写生（en plein air）、捕捉光影瞬息变化、可见笔触、明亮色彩。代表：莫奈（日出·印象/睡莲）、雷诺阿、德加、毕沙罗。1874年首届独立画展被讽刺为\'印象派\'，名称由此而来。印象派打破了学院派的沙龙垄断。', category: '西方美术史', source: '1874年巴黎首届印象派画展' },
    { term: '后印象派', termEn: 'Post-Impressionism', definition: '19世纪末从印象派发展而来的艺术运动。区别于印象派对光影的客观记录，后印象派强调主观感受和情感表达。代表：塞尚（结构化几何——立体主义先驱）、梵高（表现性色彩和笔触）、高更（象征性原始主义）。', category: '西方美术史' , source: 'Cézanne/Van Gogh/Gauguin；Fry (1910) 命名' },
    { term: '立体主义', termEn: 'Cubism', definition: '20世纪初毕加索和布拉克创立的艺术流派。核心：将物体分解为几何碎片、同时呈现多角度视图、挑战文艺复兴以来的单一透视传统。分阶段：分析立体主义（1909-1912，单色/碎片化）→ 综合立体主义（1912后，拼贴/色彩回归）。《亚维农少女》（1907）被视为立体主义开端。', category: '西方美术史', source: 'Picasso & Braque (1907-1914)' },
    { term: '表现主义', termEn: 'Expressionism', definition: '20世纪初德语国家的艺术运动。核心：通过扭曲变形和强烈色彩表达内心情感，而非客观再现现实。代表：蒙克（《呐喊》）、康定斯基、柯克西卡。德国表现主义团体：桥社（Die Brücke）和青骑士（Der Blaue Reiter）。', category: '西方美术史', source: 'Munch《The Scream》(1893)' },
    { term: '超现实主义', termEn: 'Surrealism', definition: '1920年代受弗洛伊德精神分析影响的艺术运动。核心：探索梦境与潜意识、打破理性逻辑、并置不相关事物创造超现实意象。代表：达利（记忆的永恒）、马格利特（这不是烟斗）、米罗。布雷东1924年发表《超现实主义宣言》。', category: '西方美术史', source: 'Breton《超现实主义宣言》1924' },
    { term: '抽象表现主义', termEn: 'Abstract Expressionism', definition: '1940-50年代美国纽约画派，是第一个国际性的美国艺术运动。特征：巨幅画布、行动绘画（波洛克滴洒）、色域绘画（罗斯科色块）。代表：波洛克、罗斯科、德·库宁。将世界艺术中心从巴黎转移到纽约。', category: '西方美术史', source: 'Pollock; Rothko; de Kooning' },
    { term: '波普艺术', termEn: 'Pop Art', definition: '1950-60年代起源于英国、盛于美国的艺术运动。特征：使用大众文化和消费主义图像（广告/漫画/商品包装），模糊高雅艺术与通俗文化的界限。代表：安迪·沃霍尔（坎贝尔汤罐/玛丽莲·梦露）、利希滕斯坦（漫画风格）。', category: '西方美术史', source: 'Warhol (1962)' },
    { term: '文人画', termEn: 'Literati Painting', definition: '中国古代文人阶层创作的绘画，区别于宫廷画和民间画工。特征：重笔墨情趣轻形似、诗书画印合一、以画寄情言志。起源：王维（诗中有画画中有诗），发展：苏轼\'论画以形似见与儿童邻\'理论确立，鼎盛：元代四大家（黄公望/吴镇/倪瓒/王蒙）。', category: '中国美术史', source: '苏轼；董其昌《画旨》' },
    { term: '六法论', termEn: 'Six Principles of Painting', definition: '南齐谢赫《古画品录》提出的绘画六准则：一气韵生动（最高准则——画面有生命力）、二骨法用笔（笔墨力度）、三应物象形（造型准确）、四随类赋彩（色彩得当）、五经营位置（构图布局）、六传移模写（临摹学习）。\'气韵生动\'是中国画最高审美标准。', category: '中国美术史', source: '谢赫《古画品录》（南朝齐）' },
    { term: '皴法', termEn: 'Texture Stroke Technique', definition: '中国画表现山石树木质感和体积感的笔法。主要皴法：披麻皴（董源/江南山峦柔缓）、斧劈皴（李唐/北方山石硬峭）、雨点皴（范宽）、折带皴（倪瓒）、解索皴（王蒙）。皴法是判断画家风格和流派归属的重要依据。', category: '中国美术史' , source: '中国山水画技法体系（披麻皴/斧劈皴等）' },
    { term: '留白', termEn: 'Blank Space / Negative Space', definition: '中国画构图中有意留出的空白，\'计白当黑\'——空白不是无而是有意境的表达。留白可以表现云雾/水面/天空，更可以营造\'此时无声胜有声\'的诗意空间。马远、夏圭（\'马一角夏半边\'）以大量留白著称。', category: '中国美术史' , source: '中国画"计白当黑"美学' },
    { term: '散点透视', termEn: 'Scatter Perspective', definition: '中国画特有的透视方法——不受固定视点限制，将不同角度不同距离的景物组织在同一画面中。与西方焦点透视（一个消失点）不同，散点透视可\'移步换景\'，适合表现长卷式构图。代表：张择端《清明上河图》（5米长卷）、王希孟《千里江山图》。', category: '中国美术史' , source: '中国传统绘画"三远法"（郭熙《林泉高致》）' },
    { term: '清明上河图', termEn: 'Along the River During Qingming Festival', definition: '北宋张择端绘，绢本设色长卷（24.8×528.7cm），描绘汴京（今开封）清明时节城市风貌。散点透视构图包含814人、60余牲畜、28艘船、170余棵树。具有极高的艺术价值和史料价值——是研究北宋城市经济、建筑、民俗的图像百科。', category: '中国美术史', source: '张择端（北宋），故宫博物院藏' },
    { term: '富春山居图', termEn: 'Dwelling in the Fuchun Mountains', definition: '元代黄公望绘，纸本水墨长卷，描绘富春江两岸初秋景色。被誉为\'画中之兰亭\'。明代被吴洪裕焚烧殉葬断为两段：前段《剩山图》（浙江省博物馆藏），后段《无用师卷》（台北故宫博物院藏）。2011年两段合璧展出。', category: '中国美术史', source: '黄公望（1350年完成）' },
    { term: '透视法', termEn: 'Perspective', definition: '在二维平面上表现三维空间的技法。线性透视（布鲁内莱斯基发明、阿尔贝蒂理论化）：平行线汇聚于消失点。空气透视（达·芬奇）：远处色彩偏蓝灰、轮廓模糊。中国画的散点透视不遵循单一消失点原则。', category: '技法理论', source: 'Brunelleschi (15世纪佛罗伦萨)' },
    { term: '色彩理论', termEn: 'Color Theory', definition: '研究色彩属性和关系的理论体系。三要素：色相（hue）、明度（value）、纯度/饱和度（saturation）。色彩关系：互补色（色轮上正对面，如红-绿）、邻近色（色轮上相邻）、三色组（等距三角）。牛顿《光学》（1704）提出色轮。', category: '技法理论', source: 'Newton《Opticks》(1704); Itten《色彩艺术》' },
    { term: '黄金分割', termEn: 'Golden Ratio', definition: '约1:1.618的比例关系，被认为最具审美和谐感。数学定义：a:b = (a+b):a。自然界（鹦鹉螺壳/向日葵种子排列）和艺术（帕特农神庙/蒙娜丽莎/达·芬奇人体比例图）中广泛存在。φ = (1+√5)/2 ≈ 1.618。', category: '技法理论', example: 'φ = (1+√5)/2 ≈ 1.618', source: 'Euclid《几何原本》; Pacioli《神圣比例》1509' },
    { term: '构图', termEn: 'Composition', definition: '画面中各视觉元素的组织安排。基本原则：三分法（将画面分为九宫格、主体置于交叉点）、引导线（利用线条引导视线）、对称与不对称平衡、前景中景背景层次。构图决定画面的视觉节奏和叙事逻辑。', category: '技法理论' , source: '形式美法则（均衡/对比/节奏）' },
    { term: '水墨画', termEn: 'Ink Wash Painting', definition: '以墨和水为主要媒介的中国画形式。墨分五色（焦/浓/重/淡/清），通过水的多少调节墨色深浅变化。\'墨分五色\'出自唐代张彦远，意指纯墨也能表现丰富层次。与西方油画的厚重色彩形成鲜明对比。', category: '中国美术史', source: '张彦远《历代名画记》' },
    { term: '工笔与写意', termEn: 'Gongbi and Xieyi', definition: '中国画的两种基本画法。工笔：精勾细染、层层敷色、工整细致（如宋徽宗瑞鹤图）。写意：简练概括、笔墨淋漓、重在神韵（如徐渭墨葡萄、八大山人鱼鸟）。工笔重形似，写意重意境——\'似与不似之间\'（齐白石）。', category: '中国美术史' , source: '中国画两大表现体系' },
    { term: '书法五体', termEn: 'Five Scripts of Chinese Calligraphy', definition: '中国书法的五种主要字体：篆书（大篆/小篆，秦代统一）、隶书（汉代通行，蚕头燕尾）、楷书（唐代鼎盛，方正端庄）、行书（介于楷草之间，王羲之兰亭序）、草书（章草/今草/狂草，张旭怀素）。五体演变反映了中国文字简化和艺术化的双重进程。', category: '书法' , source: '篆隶草行楷书体分类' },
    { term: '兰亭集序', termEn: 'Preface to the Poems Collected from the Orchid Pavilion', definition: '东晋王羲之353年撰书，被誉为\'天下第一行书\'。28行324字，其中\'之\'字出现20次各不相同。据传原迹随唐太宗陪葬，现存均为摹本（冯承素神龙本最接近原貌）。体现了\'飘若浮云矫若惊龙\'的书风。', category: '书法', source: '王羲之（353年）；冯承素摹本（故宫博物院）' },
    { term: '设计思维', termEn: 'Design Thinking', definition: '以用户为中心的创新解决问题的方法论。五阶段（斯坦福d.school模型）：共情（理解用户需求）→ 定义（明确问题）→ 构思（发散解决方案）→ 原型（快速制作模型）→ 测试（验证改进）。IDEO和苹果是设计思维的践行典范。', category: '设计理论', source: 'IDEO; Stanford d.school' },
    { term: '包豪斯', termEn: 'Bauhaus', definition: '1919年成立于德国魏玛的设计学校，创始人格罗皮乌斯。核心理念：\'形式追随功能\'、艺术与工业生产结合、消除纯艺术与应用艺术的界限。影响现代建筑/工业设计/平面设计/字体设计至深。1933年被纳粹关闭，师生流散全球传播理念。', category: '设计理论', source: 'Gropius W (1919-1933)' },
    { term: '极简主义', termEn: 'Minimalism', definition: '1960年代起源于美国的艺术和设计运动。核心：\'少即是多\'（密斯·凡德罗）、去除非必要元素、几何形式、工业材料。影响：建筑（安藤忠雄）、产品设计（Dieter Rams\'好设计十原则\'→苹果设计哲学）、音乐（Steve Reich）、生活方式。', category: '设计理论', source: 'Mies van der Rohe; Donald Judd' },
    { term: '哥特式建筑', termEn: 'Gothic Architecture', definition: '12-16世纪欧洲建筑风格。特征：尖拱（pointed arch）、肋拱顶（ribbed vault）、飞扶壁（flying buttress）、彩色玻璃花窗。结构创新使墙体变薄、窗户增大，营造向上飞升的精神空间。代表：巴黎圣母院、科隆大教堂、米兰大教堂。', category: '建筑史', source: 'Suger院长（圣丹尼斯教堂，1140年代）' },
    { term: '巴洛克', termEn: 'Baroque', definition: '17世纪欧洲艺术风格。特征：戏剧性的光影对比（明暗法chiaroscuro）、动态构图、华丽装饰、情感张力。代表：卡拉瓦乔、贝尼尼（《阿波罗与达芙妮》）、伦勃朗、鲁本斯。巴洛克服务于天主教反宗教改革——以视觉震撼唤起信仰热情。', category: '西方美术史', source: 'Caravaggio; Bernini; Rembrandt' },
    { term: '浮世绘', termEn: 'Ukiyo-e', definition: '日本江户时代（17-19世纪）的木版画艺术。\'浮世\'指现世享乐。题材：歌舞伎演员、美人画、风景（葛饰北斋《神奈川冲浪里》）、春画。19世纪传入欧洲后深刻影响印象派——梵高曾临摹广重的作品，引发了\'日本主义\'（Japonisme）热潮。', category: '东方美术史', source: '葛饰北斋；歌川广重；喜多川歌麿' },
    { term: '书法用笔', termEn: 'Brushwork in Calligraphy', definition: '书法的运笔技法。基本笔法：中锋（笔锋居中，线条圆浑）、侧锋（笔锋偏侧，线条扁平）、藏锋（起收笔藏于线条内）、露锋（笔锋外露）。运笔要素：起笔/行笔/收笔，提按/顿挫/转折。\'用笔千古不易\'（赵孟頫）——笔法是书法的核心。', category: '书法', source: '赵孟頫' },
  ],
};
