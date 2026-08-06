/**
 * R73 解析器冒烟测试 — 真实世界 BibTeX/RIS 样本（R102 转为 vitest 格式）
 * 覆盖：LaTeX 重音、嵌套花括号、#拼接、@string、多作者 and 分隔、
 *       RIS 续行、RIS 多作者重复标签、CRLF。
 */
import { describe, it, expect } from 'vitest';
import { parseBibTeX, stripLatex, toBibTeX } from '../src/utils/bibtex';
import { parseRIS } from '../src/utils/ris';
import {
  importBibTeX, importRIS, exportBibTeX, exportRIS,
  importReferences, parseAuthorName,
} from '../src/utils/referenceConverter';

const bib = `
@string{jama = "JAMA"}

@article{wang2024sbar,
  title = {AI-assisted {SBAR} handoff training for {RNA}-seq novices},
  author = {Wang, Li and Zhang, Wei {\\"u} and M{\\'e}decin, Jean},
  journal = jama # " Open",
  year = {2024},
  volume = 12,
  number = {3},
  pages = {145--152},
  doi = {10.1001/jama.2024.0001},
  month = jan,
  keywords = {SBAR; handoff; clinical reasoning},
  abstract = {Background: fragmented information...}
}

% 行注释
@inproceedings{li2023nursing,
  title={Clinical reasoning in nursing},
  author={Li, Hua},
  booktitle={Proc. ICN},
  year={2023}
}
`;

describe('BibTeX 解析', () => {
  const entries = parseBibTeX(bib);

  it('解析出 2 条（@string/%注释 跳过）', () => {
    expect(entries.length).toBe(2);
  });
  it('citation key', () => {
    expect(entries[0].key).toBe('wang2024sbar');
  });
  it('嵌套花括号保留大小写', () => {
    expect(entries[0].fields.title).toBe('AI-assisted SBAR handoff training for RNA-seq novices');
  });
  it('@string 宏 + # 拼接', () => {
    expect(entries[0].fields.journal).toBe('JAMA Open');
  });
  it('-- 转 –', () => {
    expect(entries[0].fields.pages).toBe('145–152');
  });
  it('LaTeX \\"u → ü', () => {
    expect(entries[0].fields.author.includes('ü')).toBe(true);
  });
  it('LaTeX accent-e → é', () => {
    expect(entries[0].fields.author.includes('é')).toBe(true);
  });
});

describe('LaTeX 剥离', () => {
  it('重音剥离', () => {
    expect(stripLatex('{\\"a} {\\`e} {\\~n} {\\c c}')).toBe('ä è ñ ç');
  });
  it('破折号', () => {
    expect(stripLatex('x---y--z')).toBe('x—y–z');
  });
});

describe('作者名解析', () => {
  it('Last, First', () => {
    expect(parseAuthorName('Wang, Li')).toEqual({ firstName: 'Li', lastName: 'Wang' });
  });
  it('First Last', () => {
    expect(parseAuthorName('Li Wang')).toEqual({ firstName: 'Li', lastName: 'Wang' });
  });
  it('单词名', () => {
    expect(parseAuthorName('Smith')).toEqual({ firstName: '', lastName: 'Smith' });
  });
});

describe('BibTeX → Reference', () => {
  const refs = importBibTeX(bib);

  it('导入 2 条', () => {
    expect(refs.length).toBe(2);
  });
  it('article → journalArticle', () => {
    expect(refs[0].type).toBe('journalArticle');
  });
  it('and 分隔 3 作者', () => {
    expect(refs[0].creators.length).toBe(3);
  });
  it('作者1姓', () => {
    expect(refs[0].creators[0].lastName).toBe('Wang');
  });
  it('期刊映射', () => {
    expect(refs[0].publication).toBe('JAMA Open');
  });
  it('DOI', () => {
    expect(refs[0].doi).toBe('10.1001/jama.2024.0001');
  });
  it('关键词分切', () => {
    expect(refs[0].tags).toEqual(['SBAR', 'handoff', 'clinical reasoning']);
  });
  it('inproceedings → conferencePaper', () => {
    expect(refs[1].type).toBe('conferencePaper');
  });
});

const ris =
  'TY  - JOUR\r\n' +
  'TI  - Family caregiver burden in stroke\r\n' +
  'A1  - Wang, Mengmeng\r\n' +
  'A1  - Xu, Yabo\r\n' +
  'ED  - Mao, Licui\r\n' +
  'JO  - Journal of Nursing\r\n' +
  'PY  - 2024\r\n' +
  'AB  - Objective: to investigate...\r\n' +
  '  continued abstract line\r\n' +
  'DO  - 10.1234/jon.5678\r\n' +
  'KW  - stroke; caregiver\r\n' +
  'ER  - \r\n\r\n' +
  'TY  - BOOK\r\nTI  - Nursing Research\r\nA1  - Polit, Denise\r\nPB  - Wolters Kluwer\r\nPY  - 2020\r\nER  - \r\n';

describe('RIS 解析', () => {
  const risRefs = importRIS(ris);

  it('RIS 导入 2 条', () => {
    expect(risRefs.length).toBe(2);
  });
  it('2 作者 + 1 编辑', () => {
    expect(risRefs[0].creators.length).toBe(3);
  });
  it('第二作者', () => {
    expect(risRefs[0].creators[1].lastName).toBe('Xu');
  });
  it('续行合并', () => {
    expect(risRefs[0].abstract).toBe('Objective: to investigate... continued abstract line');
  });
  it('PY 年份', () => {
    expect(risRefs[0].year).toBe('2024');
  });
  it('BOOK → book', () => {
    expect(risRefs[1].type).toBe('book');
  });
  it('PB 出版社', () => {
    expect(risRefs[1].publisher).toBe('Wolters Kluwer');
  });
});

describe('自动嗅探', () => {
  it('嗅探 RIS', () => {
    expect(importReferences(ris).format).toBe('ris');
  });
  it('嗅探 BibTeX', () => {
    expect(importReferences(bib).format).toBe('bibtex');
  });
});

describe('导出往返', () => {
  const refs = importBibTeX(bib);
  const bibOut = exportBibTeX(refs);
  const roundtrip = importBibTeX(bibOut);
  const risRefs = importRIS(ris);
  const risOut = exportRIS(risRefs);
  const risRoundtrip = importRIS(risOut);

  it('导出保留 citeKey', () => {
    expect(bibOut.includes('@article{wang2024sbar')).toBe(true);
  });
  it('导出大小写保护', () => {
    expect(bibOut.includes('{SBAR}')).toBe(true);
  });
  it('月份宏导出', () => {
    expect(bibOut.includes('month = jan')).toBe(true);
  });
  it('BibTeX 往返标题一致', () => {
    expect(roundtrip[0].title).toBe(refs[0].title);
  });
  it('BibTeX 往返作者数一致', () => {
    expect(roundtrip[0].creators.length).toBe(3);
  });
  it('RIS 导出类型', () => {
    expect(risOut.includes('TY  - JOUR')).toBe(true);
  });
  it('RIS 导出 AU 重复标签', () => {
    expect((risOut.match(/AU  - /g) || []).length).toBe(3);
  });
  it('RIS 往返标题一致', () => {
    expect(risRoundtrip[0].title).toBe(risRefs[0].title);
  });
});
