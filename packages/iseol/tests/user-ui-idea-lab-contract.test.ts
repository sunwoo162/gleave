import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildIdeaLabRuntimeView } from "../user-ui/src/domain/ideaLabState.ts";

const ideaLabPage = resolve(process.cwd(), "user-ui/src/pages/IdeaLab.tsx");

test("Idea Lab separates project execution and Personal AI capability labels", () => {
  assert.deepEqual(buildIdeaLabRuntimeView({ projectExecution: "ready", aiChat: "unavailable" }), {
    project: { ready: true, label: "프로젝트 Runtime 준비됨" },
    ai: { ready: false, label: "개인 AI 후보 생성 대기" },
  });
  assert.deepEqual(buildIdeaLabRuntimeView({ projectExecution: "unavailable", aiChat: "ready" }), {
    project: { ready: false, label: "프로젝트 Runtime 연결 대기" },
    ai: { ready: true, label: "개인 AI 후보 생성 준비됨" },
  });
});

test("Idea Lab keeps capability labels honest while status is unavailable or unknown", () => {
  assert.deepEqual(buildIdeaLabRuntimeView(null), {
    project: { ready: false, label: "프로젝트 Runtime 상태 확인 중" },
    ai: { ready: false, label: "개인 AI 후보 생성 상태 확인 중" },
  });
  assert.deepEqual(buildIdeaLabRuntimeView({ projectExecution: "unavailable", aiChat: "unavailable" }), {
    project: { ready: false, label: "프로젝트 Runtime 연결 대기" },
    ai: { ready: false, label: "개인 AI 후보 생성 대기" },
  });
});

test("Idea Lab reads the authenticated runtime capability instead of a static waiting claim", async () => {
  const source = await readFile(ideaLabPage, "utf8");
  assert.match(source, /getRuntimeStatus/);
  assert.match(source, /buildIdeaLabRuntimeView/);
  assert.match(source, /runtimeView\.project\.label/);
  assert.match(source, /runtimeView\.ai\.label/);
  assert.doesNotMatch(source, /현재 Runtime 연결 대기 · 프로젝트를 작업실에서 계속 편집할 수 있습니다\./);
});
