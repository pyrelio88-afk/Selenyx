import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeProjectId, projectDirFor } = require('../desktop/projectPaths.cjs');

test('project storage accepts UUIDs and normalizes their case', () => {
  assert.equal(
    normalizeProjectId('F66F22FC-D08C-4E4F-9B77-87B1095079DB'),
    'f66f22fc-d08c-4e4f-9b77-87b1095079db',
  );
});

for (const value of ['', '..', '../outside', 'project-1', 'f66f22fc-d08c-4e4f-7b77-87b1095079db']) {
  test(`project storage rejects unsafe id ${JSON.stringify(value)}`, () => {
    assert.equal(normalizeProjectId(value), '');
    assert.throws(() => projectDirFor(path.join('tmp', 'projects'), value), /invalid project id/);
  });
}

test('project storage resolves a valid id directly below its storage root', () => {
  const root = path.resolve('tmp', 'projects');
  const target = projectDirFor(root, 'f66f22fc-d08c-4e4f-9b77-87b1095079db');
  assert.equal(path.dirname(target), root);
});
