import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("personal world uses a real environment asset with an explicit fallback", async () => {
  const [assetSource, worldSource] = await Promise.all([
    readFile(resolve(process.cwd(), "user-ui/src/components/EnvironmentAssets.tsx"), "utf8"),
    readFile(resolve(process.cwd(), "user-ui/src/pages/MyWorld.tsx"), "utf8"),
  ]);

  assert.match(assetSource, /PERSONAL_WORKSHOP_ENVIRONMENT_ASSET_SRC/);
  assert.match(assetSource, /\/app\/assets\/environments\/iseol-personal-workshop-v1-provisional\.png/);
  assert.match(assetSource, /개인 작업실 환경 자산 대기/);
  assert.match(assetSource, /개인 작업실 환경/);
  assert.match(assetSource, /pointer-events-none/);
  assert.match(worldSource, /import \{ PersonalWorkshopEnvironmentAsset \} from ['"]\.\.\/components\/EnvironmentAssets['"];?/);
  assert.match(worldSource, /<PersonalWorkshopEnvironmentAsset/);
});
