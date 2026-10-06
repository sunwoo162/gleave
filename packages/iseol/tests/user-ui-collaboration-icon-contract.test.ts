import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const iconSource = await readFile(new URL('../user-ui/src/components/Icon.tsx', import.meta.url), 'utf8');
const teamsSource = await readFile(new URL('../user-ui/src/pages/Teams.tsx', import.meta.url), 'utf8');
const communitySource = await readFile(new URL('../user-ui/src/pages/Community.tsx', import.meta.url), 'utf8');

test('Teams and Community collaboration surfaces use semantic icons instead of emoji controls', () => {
  for (const name of ['edit', 'compass', 'heart']) {
    assert.match(iconSource, new RegExp(`\\| '${name}'`), `IconName is missing ${name}`);
    assert.match(iconSource, new RegExp(`case '${name}':`), `Icon shape is missing ${name}`);
  }

  assert.match(teamsSource, /import \{ Icon \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(teamsSource, /<Icon name="users"/);
  assert.match(teamsSource, /<Icon name="edit"/);
  assert.match(teamsSource, /<Icon name="compass"/);
  assert.match(teamsSource, /<Icon name=\{post\.kind === 'project' \? 'bolt' : 'book'\}/);
  assert.doesNotMatch(teamsSource, /[👥✏️🧭⚡📚📘]/u);

  assert.match(communitySource, /import \{ Icon \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(communitySource, /<Icon name="globe"/);
  assert.match(communitySource, /<Icon name="edit"/);
  assert.match(communitySource, /<Icon name="heart"/);
  assert.match(communitySource, /aria-label=\{post\.viewerLiked \?/);
  assert.match(communitySource, /좋아요/);
  assert.doesNotMatch(communitySource, /[🌐✏️❤️🤍]/u);
});
