import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const settingsSource = resolve(process.cwd(), "user-ui/src/pages/Settings.tsx");

test("settings does not expose the unimplemented weekly digest as an active notification switch", async () => {
  const source = await readFile(settingsSource, "utf8");

  assert.match(source, /key: 'weekly', label: '주간 활동 요약', available: false/);
  assert.match(source, /준비 중/);
  assert.match(source, /disabled=\{!n\.available \|\| settingsBusy\}/);
  assert.match(source, /aria-disabled=\{!n\.available\}/);
});
