import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pageSource = resolve(process.cwd(), "user-ui/src/pages/MyWorld.tsx");
const apiSource = resolve(process.cwd(), "user-ui/src/api/userApi.ts");

test("my world surfaces accepted AI work that still needs explicit user confirmation", async () => {
  const [page, api] = await Promise.all([readFile(pageSource, "utf8"), readFile(apiSource, "utf8")]);

  assert.match(api, /export async function listAiTeamProposals/);
  assert.match(page, /listAiTeamProposals/);
  assert.match(page, /pendingAiWork/);
  assert.match(page, /사용자 확인이 필요한 AI 작업/);
  assert.match(page, /작업실에서 확인/);
  assert.match(page, /item\.workRequestId === request\.id/);
  assert.match(page, /request\.status === 'queued'/);
  assert.match(page, /request\.status === 'waiting'/);
});
