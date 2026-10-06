import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'user-ui', 'src', 'pages', 'PublicPortfolio.tsx'), 'utf8');

test('public portfolio timestamps use the shared safe world formatter', () => {
  assert.match(source, /formatWorldDate/);
  assert.match(source, /formatWorldDate\(undefined, item\.occurredAt\)/);
  assert.match(source, /formatWorldDate\(undefined, view\.entry\.updatedAt\)/);
  assert.doesNotMatch(source, /toLocaleDateString/);
});
