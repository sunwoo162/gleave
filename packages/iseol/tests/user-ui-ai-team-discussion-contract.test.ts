import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("user UI exposes bounded AI team technical discussion with truthful Runtime states", async () => {
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../user-ui/src/pages/Projects.tsx", import.meta.url), "utf8");
  assert.match(api, /AiTeamDiscussion/);
  assert.match(api, /ai-discussions/);
  assert.match(page, /AI 기술 토론/);
  assert.match(page, /Runtime 대기/);
  assert.match(page, /토론 질문/);
  assert.match(page, /토론 요청/);
});
