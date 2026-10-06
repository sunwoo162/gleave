import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sources = await Promise.all([
  ['Auth', '../user-ui/src/pages/Auth.tsx'],
  ['Landing', '../user-ui/src/pages/Landing.tsx'],
  ['Onboarding', '../user-ui/src/pages/Onboarding.tsx'],
  ['NotFound', '../user-ui/src/pages/NotFound.tsx'],
  ['Icon', '../user-ui/src/components/Icon.tsx'],
].map(async ([name, path]) => [name, await readFile(new URL(path, import.meta.url), 'utf8')] as const));

test('entry and onboarding surfaces use semantic icons without changing product assets or flows', () => {
  const byName = new Map(sources);
  const auth = byName.get('Auth') ?? '';
  const landing = byName.get('Landing') ?? '';
  const onboarding = byName.get('Onboarding') ?? '';
  const notFound = byName.get('NotFound') ?? '';
  const icon = byName.get('Icon') ?? '';

  for (const name of ['eye', 'eyeOff', 'mail']) {
    assert.match(icon, new RegExp(`\\| '${name}'`), `IconName is missing ${name}`);
    assert.match(icon, new RegExp(`case '${name}':`), `Icon shape is missing ${name}`);
  }

  assert.match(auth, /import \{ Icon \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(auth, /<Icon name="monitor"/);
  assert.match(auth, /name=\{showPw \? 'eyeOff' : 'eye'\}/);
  for (const name of ['code', 'globe', 'mail']) {
    assert.match(auth, new RegExp(`<Icon name=\{p\.icon\}|<Icon name="${name}"`), `Auth is missing ${name}`);
  }

  assert.match(landing, /import \{ Icon, type IconName \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(landing, /icon: IconName/);
  assert.match(landing, /<Icon name=\{f\.icon\}/);
  for (const name of ['sparkles', 'rocket', 'bolt', 'globe', 'book', 'users', 'palette', 'message', 'lightbulb']) {
    assert.match(landing, new RegExp(`<Icon name="${name}"|icon: '${name}'`), `Landing is missing ${name}`);
  }

  assert.match(onboarding, /import \{ Icon, type IconName \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(onboarding, /icon: IconName/);
  assert.match(onboarding, /<Icon name=\{a\.icon\}/);
  assert.match(onboarding, /<Icon name=\{f\.icon\}/);
  for (const name of ['bolt', 'book', 'users', 'sparkles', 'code', 'alertTriangle', 'fileText', 'home']) {
    assert.match(onboarding, new RegExp(`<Icon name="${name}"|icon: '${name}'`), `Onboarding is missing ${name}`);
  }

  assert.match(notFound, /import \{ Icon \} from ['"]\.\.\/components\/Icon['"]/);
  assert.match(notFound, /<Icon name="home"/);

  for (const [name, source] of [
    ['Auth', auth],
    ['Landing', landing],
    ['Onboarding', onboarding],
    ['NotFound', notFound],
  ] as const) {
    assert.doesNotMatch(source, /[🔬🙈👁🐙📧✨🚀🏆🌍📚👥🎨🌐💡⚡👋🎉🔍📝🏠]/u, `${name} still contains a generic UI emoji`);
  }
});
