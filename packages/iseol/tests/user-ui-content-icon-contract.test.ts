import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sources = await Promise.all([
  ['MyWorld', '../user-ui/src/pages/MyWorld.tsx'],
  ['Friends', '../user-ui/src/pages/Friends.tsx'],
  ['IdeaLab', '../user-ui/src/pages/IdeaLab.tsx'],
  ['PortfolioScreen', '../user-ui/src/pages/PortfolioScreen.tsx'],
  ['MemoryVault', '../user-ui/src/pages/MemoryVault.tsx'],
].map(async ([name, path]) => [name, await readFile(new URL(path, import.meta.url), 'utf8')] as const));

test('core user content surfaces use semantic icons instead of generic presentation emoji', () => {
  const byName = new Map(sources);
  for (const name of ['MyWorld', 'Friends', 'IdeaLab', 'PortfolioScreen', 'MemoryVault']) {
    assert.match(byName.get(name) ?? '', /import \{ Icon/);
  }

  assert.match(byName.get('MyWorld') ?? '', /const zones: Array<\{[\s\S]*icon: IconName/);
  assert.match(byName.get('MyWorld') ?? '', /<Icon name=\{z\.icon\}/);
  assert.match(byName.get('Friends') ?? '', /<Icon name="message"/);
  assert.match(byName.get('IdeaLab') ?? '', /<Icon name="lightbulb"/);
  assert.match(byName.get('PortfolioScreen') ?? '', /<Icon name="chart"/);
  assert.match(byName.get('PortfolioScreen') ?? '', /<Icon name="palette"/);
  assert.match(byName.get('MemoryVault') ?? '', /<Icon name="lock"/);

  for (const [name, source] of sources) {
    assert.doesNotMatch(source, /[💬💡⚡📊🎨📚✨👥🌐🔒⏳]/u, `${name} still contains a generic UI emoji`);
  }
});
