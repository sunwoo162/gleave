import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const profileSource = resolve(process.cwd(), "user-ui/src/pages/Profile.tsx");
const friendsSource = resolve(process.cwd(), "user-ui/src/pages/Friends.tsx");
const assetSource = resolve(process.cwd(), "user-ui/src/components/CharacterAssets.tsx");
const browserJourney = resolve(process.cwd(), "scripts/iseol-user-ui-e2e.ts");

test("profile and social identity surfaces use the project character asset instead of initial circles", async () => {
  const [profile, friends, assets, browser] = await Promise.all([
    readFile(profileSource, "utf8"),
    readFile(friendsSource, "utf8"),
    readFile(assetSource, "utf8"),
    readFile(browserJourney, "utf8"),
  ]);

  assert.match(profile, /import\s+\{\s*UserCharacterAsset\s*\}\s+from ['"]\.\.\/components\/CharacterAssets['"]/);
  assert.match(profile, /<UserCharacterAsset[^>]+alt=\{`[^`]*개인 캐릭터/);
  assert.doesNotMatch(profile, /displayName\.slice\(0, 1\)/);

  assert.match(friends, /import\s+\{\s*UserCharacterAsset\s*\}\s+from ['"]\.\.\/components\/CharacterAssets['"]/);
  assert.equal((friends.match(/<UserCharacterAsset/g) ?? []).length, 3);
  assert.doesNotMatch(friends, /displayName\[0\]/);

  assert.match(assets, /USER_CHARACTER_ASSET_SRC/);
  assert.match(assets, /fallbackLabel="사용자 캐릭터 자산 대기"/);
  assert.match(browser, /브라우저 A 개인 캐릭터/);
  assert.match(browser, /iseol-user-character-v1\.png/);
});
