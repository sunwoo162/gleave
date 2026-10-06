import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("project workspace exposes the durable execution profile without overstating planned roles", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /selectedRoles: string\[\]/);
  assert.match(api, /executableRoles: string\[\]/);
  assert.match(api, /plannedRoles: string\[\]/);
  assert.match(api, /verificationStages: string\[\]/);
  assert.match(page, /AI 팀 역할/);
  assert.match(page, /실행 어댑터/);
  assert.match(page, /계획 상태/);
  assert.match(page, /verificationStages/);
  assert.doesNotMatch(page, /AI 역할 4명|역할 4개/);
});
