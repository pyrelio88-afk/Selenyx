// Persistence 单测：JSONL 写入与回放
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Journal, investigationDir } from '../src/core/persistence.js';

test('journal: append + replay roundtrip', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-'));
  const file = path.join(tmp, 'j.jsonl');
  const j = new Journal(file);
  j.append('note', { hello: 'world' });
  j.append('note', { bye: 1 });
  const replayed = j.replay();
  assert.equal(replayed.notes.length, 2);
  assert.deepEqual(replayed.notes[0], { hello: 'world' });
});

test('journal: malformed lines are skipped (counted, not thrown)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-'));
  const file = path.join(tmp, 'j.jsonl');
  fs.writeFileSync(file, '{"kind":"note","data":{"ok":1}}\nNOT JSON\n{"kind":"note","data":{"ok":2}}\n');
  const j = new Journal(file);
  const replayed = j.replay();
  assert.equal(replayed.notes.length, 2);
  assert.equal(replayed.skipped, 1);
});

test('journal: filePath nested directories are created', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selenyx-'));
  const file = path.join(tmp, 'deep', 'nested', 'j.jsonl');
  const j = new Journal(file);
  j.append('note', { ok: 1 });
  assert.ok(fs.existsSync(file));
});

test('investigationDir: composes ~/.selenyx/investigations/<id>/', () => {
  const p = investigationDir('/tmp/home', 'inv_1');
  assert.equal(p, path.join('/tmp/home', '.selenyx', 'investigations', 'inv_1'));
});
