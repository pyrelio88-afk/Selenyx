/**
 * Selenyx 文献模型 — Zotero 式 30 种文献类型 × 57 字段
 * 从 JS 版 (R69) 迁移，对齐 Java 版 Reference.java
 */

/** Zotero 式文献类型（30 种） */
export type ItemType =
  | 'journalArticle'
  | 'book'
  | 'bookSection'
  | 'conferencePaper'
  | 'thesis'
  | 'report'
  | 'webpage'
  | 'preprint'
  | 'dataset'
  | 'software'
  | 'patent'
  | 'standard'
  | 'magazineArticle'
  | 'newspaperArticle'
  | 'bookReview'
  | 'dictionaryEntry'
  | 'encyclopediaArticle'
  | 'chapter'
  | 'presentation'
  | 'hearing'
  | 'bill'
  | 'statute'
  | 'case'
  | 'film'
  | 'tvBroadcast'
  | 'radioBroadcast'
  | 'podcast'
  | 'interview'
  | 'letter'
  | 'map'
  | 'blogPost';

/** 创建者类型 */
export type CreatorType = 'author' | 'editor' | 'translator' | 'contributor' | 'director' | 'producer';

/** 创建者 */
export interface Creator {
  id: string;
  firstName: string;
  lastName: string;
  type: CreatorType;
  order: number;
}

/** 标注类型 */
export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'underline' | 'strikeout';

/** PDF 标注（页码归一化坐标，借鉴 HydraLab） */
export interface Annotation {
  id: string;
  page: number;
  type: AnnotationType;
  /** 归一化坐标 [x1, y1, x2, y2]，0-1 范围，缩放不变（多行选区时为外接包围盒） */
  rect: [number, number, number, number];
  /** 选区批注的逐行归一化坐标（对齐 Zotero 多行高亮存储）；缺省时按 rect 渲染 */
  rects?: [number, number, number, number][];
  text: string;
  note: string;
  color: string;
  createdAt: string;
}

/** 附件 */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  path: string;
  size: number;
  md5?: string;
}

/** 文献条目（57 字段） */
export interface Reference {
  id: string;
  citeKey: string;
  type: ItemType;
  title: string;
  shortTitle: string;
  abstract: string;
  creators: Creator[];
  publication: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  place: string;
  year: string;
  date: string;
  accessionDate: string;
  doi: string;
  isbn: string;
  issn: string;
  pmid: string;
  pmcid: string;
  arxivId: string;
  url: string;
  uri: string;
  collections: string[];
  tags: string[];
  language: string;
  rights: string;
  attachments: Attachment[];
  annotations: Annotation[];
  notes: string;
  impactFactor: number | null;
  jcrQuartile: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  openAccess: boolean;
  pageCharge: number | null;
  reviewWeeks: number | null;
  pipelineStage: PipelineStageKey | null;
  readStatus: 'unread' | 'reading' | 'read' | 'archived';
  importance: 1 | 2 | 3 | 4 | 5;
  pico?: PICO;
  createdAt: string;
  updatedAt: string;
  source: 'manual' | 'import' | 'api';
}

/** PICO 框架 */
export interface PICO {
  population: string;
  intervention: string;
  comparison: string;
  outcome: string;
}

/** 八段流水线阶段键 */
export type PipelineStageKey =
  | 'problem' | 'literature' | 'fulltext' | 'screening'
  | 'reading' | 'evidence' | 'synthesis' | 'writing';

/** 引用格式 */
export type CitationStyle = 'apa7' | 'vancouver' | 'gbt7714' | 'ama';
export type ExportFormat = 'bibtex' | 'ris' | 'csv' | 'json' | 'csljson';

/** 文献集合 */
export interface RefCollection {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  createdAt: string;
}

/** 文献标签 */
export interface RefTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export const SEARCH_WEIGHTS = { title: 10, doi: 6, journal: 4, author: 5, abstract: 2, tag: 3 } as const;

export const ITEM_TYPE_FIELDS: Record<ItemType, { required: string[]; optional: string[] }> = {
  journalArticle: { required: ['title', 'creators', 'publication', 'year'], optional: ['volume', 'issue', 'pages', 'doi', 'abstract', 'issn', 'url', 'tags', 'notes'] },
  book: { required: ['title', 'creators', 'publisher', 'year'], optional: ['isbn', 'pages', 'place', 'url', 'tags', 'notes'] },
  bookSection: { required: ['title', 'creators', 'bookTitle', 'publisher', 'year'], optional: ['pages', 'isbn', 'doi', 'url', 'tags'] },
  conferencePaper: { required: ['title', 'creators', 'proceedingsTitle', 'year'], optional: ['pages', 'doi', 'url', 'place', 'tags'] },
  thesis: { required: ['title', 'creators', 'university', 'year'], optional: ['thesisType', 'pages', 'url', 'tags'] },
  report: { required: ['title', 'creators', 'institution', 'year'], optional: ['pages', 'url', 'tags', 'abstract'] },
  webpage: { required: ['title', 'url', 'accessionDate'], optional: ['creators', 'year', 'abstract', 'tags'] },
  preprint: { required: ['title', 'creators', 'year', 'repository'], optional: ['doi', 'arxivId', 'abstract', 'url', 'tags'] },
  dataset: { required: ['title', 'creators', 'year', 'repository'], optional: ['doi', 'url', 'tags', 'abstract'] },
  software: { required: ['title', 'creators', 'year'], optional: ['version', 'url', 'doi', 'tags', 'license'] },
  patent: { required: ['title', 'creators', 'year', 'patentNumber'], optional: ['assignee', 'url', 'tags'] },
  standard: { required: ['title', 'year', 'publisher'], optional: ['creators', 'number', 'url', 'tags'] },
  magazineArticle: { required: ['title', 'creators', 'publication', 'year'], optional: ['volume', 'issue', 'pages', 'issn', 'url'] },
  newspaperArticle: { required: ['title', 'creators', 'publication', 'year'], optional: ['pages', 'issn', 'url', 'place'] },
  bookReview: { required: ['title', 'creators', 'publication', 'year'], optional: ['volume', 'issue', 'pages', 'doi'] },
  dictionaryEntry: { required: ['title', 'creators', 'dictionary', 'year'], optional: ['pages', 'publisher', 'isbn'] },
  encyclopediaArticle: { required: ['title', 'creators', 'encyclopedia', 'year'], optional: ['pages', 'publisher', 'isbn'] },
  chapter: { required: ['title', 'creators', 'bookTitle', 'publisher', 'year'], optional: ['pages', 'isbn', 'doi'] },
  presentation: { required: ['title', 'creators', 'year'], optional: ['meetingName', 'place', 'url'] },
  hearing: { required: ['title', 'year', 'legislativeBody'], optional: ['creators', 'pages', 'url'] },
  bill: { required: ['title', 'year', 'billNumber'], optional: ['legislativeBody', 'url'] },
  statute: { required: ['title', 'year', 'code'], optional: ['section', 'url'] },
  case: { required: ['title', 'year', 'court'], optional: ['reporter', 'pages', 'url'] },
  film: { required: ['title', 'creators', 'year'], optional: ['distributor', 'runtime', 'url'] },
  tvBroadcast: { required: ['title', 'year', 'network'], optional: ['creators', 'url'] },
  radioBroadcast: { required: ['title', 'year', 'network'], optional: ['creators', 'url'] },
  podcast: { required: ['title', 'creators', 'year'], optional: ['url', 'duration', 'tags'] },
  interview: { required: ['title', 'creators', 'year'], optional: ['interviewer', 'medium', 'url'] },
  letter: { required: ['title', 'creators', 'year'], optional: ['recipient', 'url'] },
  map: { required: ['title', 'creators', 'year'], optional: ['scale', 'publisher', 'url'] },
  blogPost: { required: ['title', 'creators', 'url', 'year'], optional: ['abstract', 'tags', 'accessionDate'] },
};

export const FIELD_LABELS: Record<string, string> = {
  title: '题名', shortTitle: '短标题', abstract: '摘要', creators: '创建者',
  publication: '期刊/出版物', volume: '卷', issue: '期', pages: '页码',
  publisher: '出版社', place: '出版地', year: '年份', date: '日期',
  doi: 'DOI', isbn: 'ISBN', issn: 'ISSN', pmid: 'PMID', pmcid: 'PMC ID',
  arxivId: 'arXiv ID', url: 'URL', uri: 'URI', language: '语言', rights: '版权',
  notes: '笔记', tags: '标签', collections: '集合', bookTitle: '书名',
  proceedingsTitle: '会议论文集', thesisType: '学位类型', university: '大学',
  institution: '机构', repository: '仓库', version: '版本', license: '许可证',
  patentNumber: '专利号', assignee: '受让人', number: '编号', meetingName: '会议名称',
  legislativeBody: '立法机构', billNumber: '法案编号', code: '法典', section: '条款',
  court: '法院', reporter: '报告人', distributor: '发行商', runtime: '时长',
  network: '播出机构', duration: '时长', interviewer: '采访者', medium: '媒介',
  recipient: '收件人', scale: '比例尺', impactFactor: '影响因子',
  jcrQuartile: '中科院分区', openAccess: '开放获取', pageCharge: '版面费',
  reviewWeeks: '审稿周期', pipelineStage: '流水线阶段', readStatus: '阅读状态',
  importance: '重要性', citeKey: '引用键',
};
