import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("project workspace exposes verified lifecycle evidence without inventing missing stages", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /lifecycle: \{ artifacts: ProjectLifecycleItem\[\]; revisions: ProjectLifecycleItem\[\]; deployments: ProjectLifecycleItem\[\] \}/);
  assert.match(page, /ProjectLifecyclePanel/);
  assert.match(page, /ProjectHistoryPanel/);
  assert.match(page, /프로젝트 활동 기록/);
  assert.match(page, /view\.history/);
  assert.match(page, /view\.lifecycle\.artifacts/);
  assert.match(page, /view\.lifecycle\.revisions/);
  assert.match(page, /view\.lifecycle\.deployments/);
  assert.match(page, /요청 ID/);
  assert.match(page, /request\.attempts/);
  assert.match(page, /request\.createdAt/);
  assert.match(page, /Run ID/);
  assert.match(page, /아직 검증된 증거가 없습니다/);
  assert.doesNotMatch(page, /배포 완료/);
});

test("project list derives its status from the durable project runtime view", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8");
  assert.match(page, /type ProjectListItem = UserProject & \{ runtime: UserProjectView\["runtime"\] \}/);
  assert.match(page, /getUserProject\(project\.id\)/);
  assert.match(page, /runtimeStatus\(project\.runtime\.status\)/);
  assert.match(page, /Run 완료/);
  assert.match(page, /실행된 Run 없음/);
  assert.doesNotMatch(page, /project\.status === 'active' \? 'pending' : 'unknown'/);
});

test("Project Workspace exposes bounded run observability instead of implying unavailable preview data", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /observability: \{ runs: UserProjectRunObservation\[\] \}/);
  assert.match(page, /ProjectRunObservabilityPanel/);
  assert.match(page, /변경 파일/);
  assert.match(page, /테스트·빌드 결과/);
  assert.match(page, /실행 로그 요약/);
  assert.match(page, /미리보기 주소가 기록되지 않았습니다/);
  assert.match(page, /view\.observability\.runs/);
});

test("Project Workspace links only to a recorded verified preview", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /preview: \{ status: 'ready'; url: string; provider\?: string; recordedAt: string \} \| \{ status: 'not-available' \| 'unknown'; blocker: string \}/);
  assert.match(page, /run\.preview\.status === 'ready'/);
  assert.match(page, /run\.preview\.url/);
  assert.match(page, /미리보기 열기/);
  assert.match(page, /기록된 미리보기 주소/);
  assert.doesNotMatch(page, /href=\{run\.preview\.blocker\}/);
});

test("Project Workspace exposes the real bounded workspace file list without reading file contents", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /files: { status: 'ready' \| 'not-available'; items: Array<{ path: string; size: number }>/);
  assert.match(page, /ProjectFilesPanel/);
  assert.match(page, /실제 작업공간 파일/);
  assert.match(page, /file\.path/);
  assert.match(page, /file\.size/);
  assert.match(api, /getUserProjectFile/);
  assert.match(page, /파일 열기/);
  assert.match(page, /fileContent/);
  assert.match(page, /파일 줄 번호/);
  assert.match(page, /split\(\/\\r\?\\n\/\)/);
  assert.match(page, /<pre/);
  assert.match(api, /format: 'unified-diff'/);
  assert.match(api, /UserProjectWorkspaceDiffHunk/);
  assert.match(page, /DiffPreview/);
  assert.match(page, /변경사항 보기/);
  assert.match(page, /추가/);
  assert.match(page, /삭제/);
  assert.doesNotMatch(page, /readFile/);
});

test("Project Workspace exposes an owner-controlled pause checkpoint without claiming process termination", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /pauseUserProjectRun/);
  assert.match(page, /pendingPause/);
  assert.match(page, /실행 중단/);
  assert.match(page, /다음 checkpoint/);
  assert.match(page, /강제 종료하지 않습니다/);
  assert.doesNotMatch(page, /kill|terminate/i);
});

test("isolated browser runner verifies in-progress project team transitions preserve work and access state", async () => {
  const runner = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(runner, /verifyProjectTeamTransitionUi/);
  assert.match(runner, /projectTeamTransitionUi: "passed"/);
});

test("isolated browser runner verifies the owner pause checkpoint and same-Run resume journey", async () => {
  const runner = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(runner, /verifyProjectRuntimePauseUi/);
  assert.match(runner, /project-runtime-pause/);
  assert.match(runner, /projectRuntimePauseUi: "passed"/);
});
