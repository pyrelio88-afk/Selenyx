import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATURE_UPSTREAM,
  listNatureSkills,
  getNatureSkill,
  executeNatureL1,
  buildNatureMessages,
} from '../src/skills/nature.js';
import { listSkills, getSkill } from '../src/skills/index.js';

test('Nature Skills adapter exposes 18 unique triggerable skills', () => {
  const skills = listNatureSkills();
  assert.equal(skills.length, 18);
  assert.equal(new Set(skills.map((skill) => skill.id)).size, 18);
  assert.ok(skills.every((skill) => skill.family === 'nature'));
  assert.ok(skills.every((skill) => ['l1', 'l2', 'route', 'external'].includes(skill.mode)));
});

test('Nature Skills provenance is pinned and licensed', () => {
  assert.equal(NATURE_UPSTREAM.commit, 'ca9f57e80e8bc100eb06ebfbfff406c126e5b256');
  assert.equal(NATURE_UPSTREAM.license, 'Apache-2.0');
  assert.match(NATURE_UPSTREAM.repository, /^https:\/\/github\.com\//);
});

test('combined registry includes native and Nature Skills', () => {
  assert.equal(listSkills().length, 25);
  assert.equal(getSkill('nature-writing').family, 'nature');
  assert.equal(getSkill('nature-paper-card').offline, true);
  assert.equal(getSkill('nature-figure').offline, false);
});

test('offline paper card keeps 16 sections and marks missing evidence', () => {
  const output = executeNatureL1('nature-paper-card', 'A study title.\nWe test a method.\nThe method improved accuracy.');
  assert.equal((output.match(/^## /gm) ?? []).length, 16);
  assert.match(output, /源文本未明确/);
  assert.match(output, /实验—主张证据链/);
});

test('offline reference audit does not claim online verification', () => {
  const output = executeNatureL1('nature-ref-verifier', [
    'Doe J. Example. 2024. doi:10.1000/test',
    'Doe J. Example. 2024. doi:10.1000/test',
    'Missing metadata reference',
  ].join('\n'));
  assert.match(output, /疑似重复：1/);
  assert.match(output, /缺少年份：1/);
  assert.match(output, /仍需联网多源核验/);
});

test('experiment log preserves raw input and explicit missing fields', () => {
  const output = executeNatureL1('nature-experiment-log', '温度 25°C，样本 A 颜色变深。');
  assert.match(output, /温度 25°C/);
  assert.match(output, /【待补充】/);
  assert.match(output, /integrity: missing-fields-kept-explicit/);
});

test('L2 prompts prohibit invented evidence and reject unsupported modes', () => {
  const messages = buildNatureMessages('nature-response', 'Reviewer 1: explain the sample size.');
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /不得声称完成用户未提供的实验/);
  assert.throws(() => buildNatureMessages('nature-figure', 'data'), /不支持模型执行/);
  assert.equal(getNatureSkill('missing'), null);
});
