import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Project Workspace exposes a truthful queued-work cancellation action", async () => {
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../user-ui/src/pages/Projects.tsx", import.meta.url), "utf8");
  const browser = await readFile(new URL("../scripts/iseol-user-ui-e2e.ts", import.meta.url), "utf8");

  assert.match(api, /export async function cancelProjectWorkRequest/);
  assert.match(api, /work-requests\/\$\{encodeURIComponent\(workRequestId\)\}\/cancel/);
  assert.match(page, /cancelProjectWorkRequest/);
  assert.match(page, /요청 취소/);
  assert.match(page, /request\.status === 'queued'/);
  assert.match(page, /취소 확인/);
  assert.match(page, /취소됨/);
  assert.match(page, /실행 중인 Run은 이 화면에서 강제 중단하지 않습니다/);
  assert.match(browser, /verifyProjectQueuedCancellationUi/);
  assert.match(browser, /projectWorkRequestCancellationUi/);
});
