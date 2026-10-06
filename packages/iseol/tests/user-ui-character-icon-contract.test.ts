import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const characterSourcePath = resolve(process.cwd(), "user-ui/src/pages/Character.tsx");
const iconSourcePath = resolve(process.cwd(), "user-ui/src/components/Icon.tsx");

test("character growth controls use semantic icons while preserving accessory presentation", async () => {
  const [character, icon] = await Promise.all([
    readFile(characterSourcePath, "utf8"),
    readFile(iconSourcePath, "utf8"),
  ]);

  for (const name of ["code", "book", "users", "rotate", "edit", "trophy", "lock"] as const) {
    assert.match(icon, new RegExp(`[\\'"]${name}[\\'"]`), `IconName is missing ${name}`);
  }
  assert.match(character, /import \{ Icon, type IconName \} from ['"]\.\.\/components\/Icon['"];?/);
  assert.match(character, /icon: '(?:code|book|users|rotate)' as IconName/);
  assert.match(character, /<Icon name=\{s\.icon\}/);
  assert.match(character, /<Icon name="edit"/);
  assert.match(character, /<Icon name="trophy"/);
  assert.match(character, /<Icon name="lock"/);
  assert.match(character, /icon: '🧢'/);
  assert.match(character, /icon: '🪴'/);
  assert.doesNotMatch(character, /✏️|🏅|🔒/);
});
