import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("project workspace exposes an explicit owner-controlled resume checkpoint for waiting Runs", async () => {
  const [api, page, router] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
    readFile(join(process.cwd(), "src", "project-model", "user-project-router.ts"), "utf8"),
  ]);
  assert.match(api, /resumeUserProjectRun/);
  assert.match(api, /runs\/resume/);
  assert.match(page, /Run 재개 승인 확인/);
  assert.match(page, /승인하고 재개/);
  assert.match(page, /Run 재개/);
  assert.match(page, /기존 Run의 단계와 ID를 유지/);
  assert.match(router, /resumeProjectRun/);
  assert.match(router, /runs.*resume/);
});

test("project workspace exposes an owner-controlled retry checkpoint for terminal failures", async () => {
  const [api, page, router] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
    readFile(join(process.cwd(), "src", "project-model", "user-project-router.ts"), "utf8"),
  ]);
  assert.match(api, /retryUserProjectRun/);
  assert.match(api, /runs\/retry/);
  assert.match(page, /Run 재시도 승인 확인/);
  assert.match(page, /승인하고 재시도/);
  assert.match(page, /재시도/);
  assert.match(router, /retryProjectRun/);
  assert.match(router, /runs.*retry/);
});
