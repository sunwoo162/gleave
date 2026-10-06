import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const settingsSource = resolve(process.cwd(), "user-ui/src/pages/Settings.tsx");

test("settings exposes the durable password-change flow and keeps account deletion unavailable", async () => {
  const source = await readFile(settingsSource, "utf8");

  assert.match(source, /readOnly/);
  assert.match(source, /aria-readonly="true"/);
  assert.match(source, /changePassword/);
  assert.match(source, /aria-label="현재 비밀번호"/);
  assert.match(source, /aria-label="새 비밀번호"/);
  assert.match(source, /aria-label="새 비밀번호 확인"/);
  assert.match(source, /기존 세션이 모두 종료되고 다시 로그인해야 합니다/);
  assert.match(source, /navigate\('\/login'/);
  assert.match(source, /downloadActivityExport\(format: 'json' \| 'markdown'\)/);
  assert.match(source, /exportActivity\(format\)/);
  assert.match(source, /downloadActivityExport\('json'\)/);
  assert.match(source, /downloadActivityExport\('markdown'\)/);
  assert.match(source, /활동 기록 Markdown 내보내기/);
  assert.match(source, /updateSettings/);
  assert.match(source, /활동 기록 내보내기를 시작했습니다/);
  assert.match(source, /disabled[^>]*>계정 삭제<\/button>/);
  assert.match(source, /계정 삭제는 복구 정책이 연결된 후 제공됩니다/);
  assert.match(source, /\/profile/);
  assert.match(source, /개인 기억 참조/);
  assert.match(source, /팀 공유 문서 접근/);
  assert.match(source, /settingsQueueRef/);
  assert.match(source, /settingsRef/);
  assert.match(source, /settingsLoadRef/);
  assert.match(source, /settingsQueueRef\.current === queuedOperation/);
});
