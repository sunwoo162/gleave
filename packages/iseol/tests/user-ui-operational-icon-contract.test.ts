import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const iconSource = await readFile(new URL('../user-ui/src/components/Icon.tsx', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../user-ui/src/pages/Settings.tsx', import.meta.url), 'utf8');
const aiChatSource = await readFile(new URL('../user-ui/src/pages/AIChat.tsx', import.meta.url), 'utf8');

test('operational Settings and Personal AI surfaces use semantic icons instead of emoji status marks', () => {
  for (const name of ['monitor', 'robot', 'code', 'fileText', 'rocket']) {
    assert.match(iconSource, new RegExp(`\\| '${name}'`), `IconName is missing ${name}`);
    assert.match(iconSource, new RegExp(`case '${name}':`), `Icon shape is missing ${name}`);
  }

  assert.match(settingsSource, /import \{ Icon, type IconName \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(settingsSource, /icon: IconName/);
  assert.match(settingsSource, /<Icon name=\{i\.icon\}/);
  assert.match(settingsSource, /<Icon name="brain"/);
  for (const emoji of ['🖥', '✨', '🐙', '🤖', '💬', '📝', '▲', '🧠']) {
    assert.doesNotMatch(settingsSource, new RegExp(emoji));
  }

  assert.match(aiChatSource, /import \{ Icon \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(aiChatSource, /<Icon name="sparkles"/);
  assert.match(aiChatSource, /<Icon name="brain"/);
  assert.match(aiChatSource, /<Icon name="lock"/);
  for (const emoji of ['✨', '🧠', '🔒', '✅', '🔬']) {
    assert.doesNotMatch(aiChatSource, new RegExp(emoji));
  }
});
