import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const iconSourcePath = resolve(process.cwd(), "user-ui/src/components/Icon.tsx");
const profileSourcePath = resolve(process.cwd(), "user-ui/src/pages/Profile.tsx");

test("profile growth uses semantic icons without replacing the character identity asset", async () => {
  const [icon, profile] = await Promise.all([
    readFile(iconSourcePath, "utf8"),
    readFile(profileSourcePath, "utf8"),
  ]);

  for (const name of ["code", "book", "users", "rotate", "trophy"] as const) {
    assert.match(icon, new RegExp(`[\\'"]${name}[\\'"]`), `IconName is missing ${name}`);
    assert.match(icon, new RegExp(`case '${name}':`), `Icon shape is missing ${name}`);
  }

  assert.match(profile, /import \{ Icon, type IconName \} from ['"]\.\.\/components\/Icon['"];?/);
  assert.match(profile, /icon: 'code'/);
  assert.match(profile, /icon: 'book'/);
  assert.match(profile, /icon: 'users'/);
  assert.match(profile, /icon: 'rotate'/);
  assert.match(profile, /<Icon name=\{stat\.icon\}/);
  assert.match(profile, /<Icon name="trophy"/);
  assert.match(profile, /profile\.publicGrowth\.achievements/);
  assert.match(profile, /import \{ UserCharacterAsset \} from ['"]\.\.\/components\/CharacterAssets['"];?/);
  assert.match(profile, /<UserCharacterAsset[^>]+alt=\{`[^`]*개인 캐릭터/);
  assert.doesNotMatch(profile, /profile\.displayName\.slice\(0, 1\)/);
  assert.doesNotMatch(profile, /🏅/);
});
