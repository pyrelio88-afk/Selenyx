/**
 * 文学扩展数据
 * R93 第一批
 */

import type { DisciplineExpansion } from './index';

export const LITERATURE_EXTRA: DisciplineExpansion = {
  glossary: [
    { term: '现实主义', termEn: 'Realism', definition: '19世纪中叶兴起的文学思潮，主张如实反映社会生活。区别于浪漫主义的主观抒情，现实主义强调客观描写、典型环境中的典型人物。代表：巴尔扎克《人间喜剧》、福楼拜《包法利夫人》、托尔斯泰《战争与和平》、狄更斯。', category: '文学流派', source: 'Balzac; Flaubert; Tolstoy; Dickens' },
    { term: '浪漫主义', termEn: 'Romanticism', definition: '18世纪末-19世纪中叶的文学艺术运动，反抗古典主义理性束缚和新古典主义规则。特征：崇尚情感与想象、关注自然与个人体验、追求自由与反叛。代表：拜伦、雪莱、雨果《悲惨世界》、歌德《少年维特之烦恼》、华兹华斯。', category: '文学流派', source: 'Byron; Hugo; Goethe; Wordsworth' },
    { term: '意识流', termEn: 'Stream of Consciousness', definition: '20世纪初兴起的小说叙事技法，试图直接呈现人物意识的连续流动——包括联想、回忆、感觉的交织，不受逻辑和时序约束。代表：乔伊斯《尤利西斯》、伍尔夫《到灯塔去》、福克纳《喧哗与骚动》。', category: '文学技法', source: 'Joyce; Woolf; Faulkner' },
    { term: '魔幻现实主义', termEn: 'Magic Realism', definition: '将超自然/魔幻元素融入现实叙事的文学手法，魔幻与日常并存且叙事者不感到异常。代表：马尔克斯《百年孤独》(\'很多年以后，面对行刑队，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个遥远的下午\')。拉美文学爆炸的核心流派。', category: '文学流派', source: 'García Márquez《百年孤独》(1967)' },
    { term: '存在主义文学', termEn: 'Existentialist Literature', definition: '以存在主义哲学为思想基础的文学流派，探讨存在的荒诞、自由选择与责任、个体孤独。代表：萨特《恶心》、加缪《局外人》《鼠疫》、卡夫卡《变形记》。\'他人即地狱\'(萨特)、\'人是注定自由的\'(加缪)。', category: '文学流派', source: 'Sartre; Camus; Kafka' },
    { term: '象征主义', termEn: 'Symbolism', definition: '19世纪后期诗歌运动，主张以象征暗示而非直接描述表达内心世界。代表：波德莱尔《恶之花》（现代诗歌开端）、马拉美、兰波。象征主义反对自然主义的客观描写和帕尔纳斯派的形式主义，强调暗示性和音乐性。', category: '文学流派', source: 'Baudelaire《Les Fleurs du Mal》(1857)' },
    { term: '元小说', termEn: 'Metafiction', definition: '自觉暴露虚构性的小说——小说意识到自己是小说，打破第四面墙。手法：作者介入叙事、讨论写作过程、多重结局、人物意识到自己是虚构的。代表：博尔赫斯、卡尔维诺《如果在冬夜一个旅人》。', category: '文学技法', source: 'Borges; Calvino' },
    { term: '互文性', termEn: 'Intertextuality', definition: '一部文本与其他文本之间的关联关系——任何文本都是对其他文本的吸收、转化和引用。概念由克里斯蒂娃提出，巴特\'作者之死\'是其延伸。互文性打破了文本封闭性和作者权威。', category: '文学理论', source: 'Kristeva J (1966); Barthes R (1967)' },
    { term: '叙事视角', termEn: 'Narrative Perspective / Point of View', definition: '故事叙述者与故事内容的关系。主要类型：全知视角（叙述者无所不知）、限制性全知（只知一个人物内心）、第一人称（\'我\'叙述）、第二人称（\'你\'叙述，较少见）、客观视角（只描述外在行为不进入内心）。视角选择决定叙事效果和读者距离感。', category: '叙事学' },
    { term: '原型批评', termEn: 'Archetypal Criticism', definition: '以荣格集体无意识和弗莱神话理论为基础的文学批评方法，寻找作品中反复出现的原型意象和叙事模式。常见原型：英雄之旅（出发→启程→回归）、智慧老人、大地母亲、阴影。原型穿越文化和时代——如西游记取经之旅与奥德赛归乡之旅的结构相似性。', category: '文学理论', source: 'Jung CG; Frye N《解剖批评》(1957)' },
    { term: '互文', termEn: 'Allusion', definition: '文本中对其他文本、人物、事件的引用或暗示，要求读者具备相关知识才能完整理解。如艾略特《荒原》大量引用但丁、莎士比亚、佛教经典。互文丰富了文本层次，也是精英文学与通俗文学区别之一。', category: '文学技法' },
    { term: '鲁迅', termEn: 'Lu Xun', definition: '中国现代文学奠基人。1918年发表《狂人日记》（中国第一篇白话小说），\'吃人\'两字直指封建礼教。《阿Q正传》揭示国民性弱点（精神胜利法）。杂文如匕首投枪。鲁迅弃医从文的理由：\'凡是愚弱的国民，即使体格如何健全茁壮，也只能做毫无意义的示众的材料和看客\'。', category: '中国现代文学', source: '鲁迅（1881-1936）' },
    { term: '诗经', termEn: 'Book of Songs (Shi Jing)', definition: '中国最早的诗歌总集，收录西周至春秋诗歌305篇。六义：风（十五国风，民歌）、雅（大雅/小雅，宫廷乐歌）、颂（宗庙祭祀乐歌）、赋（铺陈）、比（比喻）、兴（起兴）。\'关关雎鸠，在河之洲\'出自《周南·关雎》。', category: '中国古典文学', source: '约公元前11-6世纪' },
    { term: '楚辞', termEn: 'Chu Ci (Songs of Chu)', definition: '战国时期以屈原为代表的楚国诗歌体系。代表作：《离骚》（中国古代最长抒情诗，373句2490字）、《九歌》、《天问》。特征：\'书楚语、作楚声、纪楚地、名楚物\'，大量使用香草美人比喻。楚辞与诗经并称\'风骚\'，是中国诗歌两大源头。', category: '中国古典文学', source: '屈原（约前340-278）' },
    { term: '唐宋八大家', termEn: 'Eight Great Prose Masters of Tang and Song', definition: '唐宋两代八位散文大家：韩愈、柳宗元（唐代）+欧阳修、苏洵、苏轼、苏辙、王安石、曾巩（宋代）。韩愈发起古文运动——反对骈文形式主义，恢复先秦两汉散文明道致用传统。苏轼是八大家中文学成就最高者。', category: '中国古典文学' },
    { term: '红楼梦', termEn: 'Dream of the Red Chamber', definition: '曹雪芹著、高鹗续，中国古典小说巅峰。120回，前80回曹著后40回高续（争议持续）。以贾宝玉林黛玉薛宝钗爱情婚姻悲剧为主线，展现贾府兴衰。\'满纸荒唐言，一把辛酸泪\'。脂砚斋批本是重要研究资料。红学是与莎学并列的显学。', category: '中国古典文学', source: '曹雪芹（约1715-1763）' },
    { term: '莎士比亚', termEn: 'William Shakespeare', definition: '英国文艺复兴时期剧作家和诗人，西方文学史上最伟大的作家。38部戏剧+154首十四行诗。四大悲剧：《哈姆雷特》《奥赛罗》《李尔王》《麦克白》。四大喜剧：《仲夏夜之梦》《威尼斯商人》《第十二夜》《皆大欢喜》。对英语语言贡献约1700个新词。', category: '西方文学', source: 'Shakespeare W (1564-1616)' },
    { term: '荷马史诗', termEn: 'Homeric Epics', definition: '古希腊两部史诗《伊利亚特》和《奥德赛》，传为盲诗人荷马所作（约前8世纪）。《伊利亚特》讲特洛伊战争第十年的阿喀琉斯之怒，《奥德赛》讲奥德修斯战后十年归乡之旅。西方文学源头，口传文学最后阶段产物。', category: '西方文学', source: 'Homer（约公元前8世纪）' },
    { term: '魔幻', termEn: 'The Grotesque', definition: '文学中怪诞、荒谬、不协调的美学范畴——将喜剧与恐怖、美与丑并置。来源：意大利洞窟装饰grotteschi。卡夫卡《变形记》（人变甲虫）是现代文学怪诞的经典。怪诞不是单纯的恐怖或滑稽，而是两者的矛盾统一。', category: '文学理论' },
    { term: '解构主义', termEn: 'Deconstruction', definition: '德里达提出的阅读策略，揭示文本内部的自相矛盾——文本不可能有单一的稳定意义，意义总是在延异（différance）中。在文学批评中表现为：寻找文本推翻自己声称之义的地方。解构不是摧毁而是揭示文本的内在裂缝。', category: '文学理论', source: 'Derrida J (1967)' },
    { term: '新批评', termEn: 'New Criticism', definition: '20世纪中叶美国文学批评流派，主张\'文本细读\'——关注文本自身的语言结构和形式要素（意象/隐喻/反讽/张力），而非作者生平或社会背景。\'意图谬误\'（作者意图不影响文本意义）和\'感受谬误\'（读者感受不等于文本意义）。', category: '文学理论', source: 'Wimsatt & Beardsley (1949)' },
    { term: '比较文学', termEn: 'Comparative Literature', definition: '跨越语言、国家、学科边界研究文学的学科。主要方法：影响研究（A作家如何影响B作家）、平行研究（不同文学中相似现象的类比）、跨学科研究（文学与哲学/心理学/宗教）。歌德\'世界文学\'概念是其思想先驱。', category: '文学理论', source: 'Goethe《West-östlicher Divan》(1819)' },
  ],
};
