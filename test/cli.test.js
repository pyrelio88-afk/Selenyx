// CLI 单测：参数解析 + 帮助/版本
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.js';

test('cli: no args -> command null, no positionals', () => {
  const a = parseArgs([]);
  assert.equal(a.command, null);
  assert.equal(a.positionals.length, 0);
});

test('cli: ask "<question>" parses positionals and command', () => {
  const a = parseArgs(['ask', 'what is the meaning of life?']);
  assert.equal(a.command, 'ask');
  assert.deepEqual(a.positionals, ['what is the meaning of life?']);
});

test('cli: long flags', () => {
  const a = parseArgs(['ask', 'q', '--canon', 'medical', '--count', '5', '--no-color']);
  assert.equal(a.command, 'ask');
  assert.equal(a.positionals[0], 'q');
  assert.ok(a.flags.has('--canon'));
  assert.ok(a.flags.has('--count'));
  assert.ok(a.flags.has('--no-color'));
});

test('cli: short -v -h normalize', () => {
  assert.ok(parseArgs(['-v']).flags.has('--version'));
  assert.ok(parseArgs(['-h']).flags.has('--help'));
  assert.ok(parseArgs(['--version']).flags.has('--version'));
  assert.ok(parseArgs(['--help']).flags.has('--help'));
});

test('cli: theme command with optional positional', () => {
  const a = parseArgs(['theme', 'moonlight']);
  assert.equal(a.command, 'theme');
  assert.equal(a.positionals[0], 'moonlight');
});

test('cli: subcommands alias', () => {
  assert.equal(parseArgs(['onboard']).command, 'onboard');
  assert.equal(parseArgs(['research', 'q']).command, 'research');
  assert.equal(parseArgs(['subagents']).command, 'subagents');
});

test('cli: assign --flag=value form normalizes correctly', () => {
  const a = parseArgs(['ask', 'q', '--canon=medical']);
  assert.ok(a.flags.has('--canon'));
  assert.ok(!a.flags.has('--canon=medical'));
});
