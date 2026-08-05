/**
 * R73 解析器冒烟测试 — 真实世界 BibTeX/RIS 样本
 * 覆盖：LaTeX 重音、嵌套花括号、#拼接、@string、多作者 and 分隔、
 *       RIS 续行、RIS 多作者重复标签、CRLF。
 */
import { parseBibTeX, stripLatex, toBibTeX } from '../src/utils/bibtex';
import { parseRIS } from '../src/utils/ris';
import { importBibTeX, importRIS, exportBibTeX, exportRIS, importReferences, parseAuthorName } from '../src/utils/referenceConverter';

let pass = 0, fail = 0;
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      期望: ${e}\n      实际: ${a}`); }
}

console.log('== BibTeX 解析 ==');
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
const entries = parseBibTeX(bib);
eq(entries.length, 2, '解析出 2 条（@string/%注释 跳过）');
eq(entries[0].key, 'wang2024sbar', 'citation key');
eq(entries[0].fields.title, 'AI-assisted SBAR handoff training for RNA-seq novices', '嵌套花括号保留大小写');
eq(entries[0].fields.journal, 'JAMA Open', '@string 宏 + # 拼接');
eq(entries[0].fields.pages, '145–152', '-- 转 –');
eq(entries[0].fields.author.includes('ü'), true, 'LaTeX \\"u → ü');
eq(entries[0].fields.author.includes('é'), true, 'LaTeX accent-e → é');

console.log('== LaTeX 剥离 ==');
eq(stripLatex('{\\"a} {\\`e} {\\~n} {\\c c}'), 'ä è ñ ç', '重音剥离');
eq(stripLatex('x---y--z'), 'x—y–z', '破折号');

console.log('== 作者名解析 ==');
eq(parseAuthorName('Wang, Li'), { firstName: 'Li', lastName: 'Wang' }, 'Last, First');
eq(parseAuthorName('Li Wang'), { firstName: 'Li', lastName: 'Wang' }, 'First Last');
eq(parseAuthorName('Smith'), { firstName: '', lastName: 'Smith' }, '单词名');

console.log('== BibTeX → Reference ==');
const refs = importBibTeX(bib);
eq(refs.length, 2, '导入 2 条');
eq(refs[0].type, 'journalArticle', 'article → journalArticle');
eq(refs[0].creators.length, 3, 'and 分隔 3 作者');
eq(refs[0].creators[0].lastName, 'Wang', '作者1姓');
eq(refs[0].publication, 'JAMA Open', '期刊映射');
eq(refs[0].doi, '10.1001/jama.2024.0001', 'DOI');
eq(refs[0].tags, ['SBAR', 'handoff', 'clinical reasoning'], '关键词分切');
eq(refs[1].type, 'conferencePaper', 'inproceedings → conferencePaper');

console.log('== RIS 解析 ==');
const ris = 'TY  - JOUR\r\n' +
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
const risRefs = importRIS(ris);
eq(risRefs.length, 2, 'RIS 导入 2 条');
eq(risRefs[0].creators.length, 3, '2 作者 + 1 编辑');
eq(risRefs[0].creators[1].lastName, 'Xu', '第二作者');
eq(risRefs[0].abstract, 'Objective: to investigate... continued abstract line', '续行合并');
eq(risRefs[0].year, '2024', 'PY 年份');
eq(risRefs[1].type, 'book', 'BOOK → book');
eq(risRefs[1].publisher, 'Wolters Kluwer', 'PB 出版社');

console.log('== 自动嗅探 ==');
eq(importReferences(ris).format, 'ris', '嗅探 RIS');
eq(importReferences(bib).format, 'bibtex', '嗅探 BibTeX');

console.log('== 导出往返 ==');
const bibOut = exportBibTeX(refs);
eq(bibOut.includes('@article{wang2024sbar'), true, '导出保留 citeKey');
eq(bibOut.includes('{SBAR}'), true, '导出大小写保护');
eq(bibOut.includes('month = jan'), true, '月份宏导出');
const roundtrip = importBibTeX(bibOut);
eq(roundtrip[0].title, refs[0].title, 'BibTeX 往返标题一致');
eq(roundtrip[0].creators.length, 3, 'BibTeX 往返作者数一致');

const risOut = exportRIS(risRefs);
eq(risOut.includes('TY  - JOUR'), true, 'RIS 导出类型');
eq((risOut.match(/AU  - /g) || []).length, 3, 'RIS 导出 AU 重复标签');
const risRoundtrip = importRIS(risOut);
eq(risRoundtrip[0].title, risRefs[0].title, 'RIS 往返标题一致');

console.log(`\n== 结果: ${pass} 通过, ${fail} 失败 ==`);
process.exit(fail > 0 ? 1 : 0);
