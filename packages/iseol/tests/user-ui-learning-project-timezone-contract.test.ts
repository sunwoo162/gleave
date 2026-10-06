import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const readPage = (name: string) => fs.readFileSync(path.join(root, 'user-ui', 'src', 'pages', name), 'utf8');

test('learning timestamps use the account timezone formatter', () => {
  const source = readPage('Learning.tsx');

  assert.match(source, /useUser/);
  assert.match(source, /formatWorldDateTime/);
  assert.match(source, /formatDate\([^,]+, timezone\)/);
  assert.doesNotMatch(source, /new Intl\.DateTimeFormat/);
});

test('project timestamps use the account timezone formatter', () => {
  const source = readPage('Projects.tsx');

  assert.match(source, /useUser/);
  assert.match(source, /formatWorldDate/);
  assert.match(source, /date\([^,]+, timezone\)/);
  assert.doesNotMatch(source, /new Intl\.DateTimeFormat/);
});
