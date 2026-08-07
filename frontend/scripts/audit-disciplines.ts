import { DISCIPLINES } from '../src/data/disciplines.ts';

const TARGET = { terms: 500, params: 100, formulas: 100, standards: 20 };

const rows = DISCIPLINES.map((d) => {
  const standards = d.standards ?? [];
  const docs = d.officialDocs ?? [];
  return {
    id: d.id,
    name: d.name,
    terms: d.glossary.length,
    params: (d.parameters ?? []).length,
    formulas: d.formulas.length,
    standards: standards.length,
    docs: docs.length,
    fullText: [...standards, ...docs].filter((s) => Boolean(s.fullText)).length,
  };
});

console.log('id\tname\tterms\tparams\tform\tstd\tdocs\tft');
for (const r of rows) {
  console.log([r.id, r.name, r.terms, r.params, r.formulas, r.standards, r.docs, r.fullText].join('\t'));
}

const sum = (k: keyof (typeof rows)[0]) => rows.reduce((a, r) => a + (r[k] as number), 0);
console.log('\nTOTAL', {
  terms: sum('terms'),
  params: sum('params'),
  formulas: sum('formulas'),
  standards: sum('standards'),
  docs: sum('docs'),
  fullText: sum('fullText'),
});

console.log('\nGAPS vs target', TARGET);
for (const r of rows) {
  const gaps = [];
  if (r.terms < TARGET.terms) gaps.push(`terms ${r.terms}/${TARGET.terms}`);
  if (r.params < TARGET.params) gaps.push(`params ${r.params}/${TARGET.params}`);
  if (r.formulas < TARGET.formulas) gaps.push(`formulas ${r.formulas}/${TARGET.formulas}`);
  if (r.standards < TARGET.standards) gaps.push(`standards ${r.standards}/${TARGET.standards}`);
  if (gaps.length) console.log(`- ${r.id}: ${gaps.join(', ')}`);
}
