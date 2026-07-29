const path = require('node:path');

const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeProjectId(value) {
  const id = String(value ?? '').trim();
  return PROJECT_ID_PATTERN.test(id) ? id.toLowerCase() : '';
}

function projectDirFor(projectsDir, value) {
  const id = normalizeProjectId(value);
  if (!id) throw new TypeError('invalid project id');
  const root = path.resolve(projectsDir);
  const target = path.resolve(root, id);
  if (path.dirname(target) !== root) throw new TypeError('project path escapes storage root');
  return target;
}

module.exports = { PROJECT_ID_PATTERN, normalizeProjectId, projectDirFor };
