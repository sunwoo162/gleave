import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TeamMessage } from "../src/team-chat/contracts.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { listTeamMessages, saveTeamMessage } from "../src/team-chat/store.js";

test("public team chat stores wait for the canonical team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-chat-store-lock-"));
  const message: TeamMessage = { version: 1, id: "team-message-store-lock", teamId: "team-chat-store-lock-team", senderUserId: "team-chat-store-lock-owner", body: "기존 메시지", createdAt: "2026-09-30T12:00:00.000Z" };
  await saveTeamMessage(root, message);
  const updated = { ...message, body: "잠금 해제 후 최신 메시지", createdAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, message.teamId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let listSettled = false;
  const pendingSave = saveTeamMessage(root, updated).then(() => { saveSettled = true; });
  const pendingList = listTeamMessages(root, message.teamId).then((result) => { listSettled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingList]);
  assert.equal((await listTeamMessages(root, message.teamId))[0]?.body, updated.body);
});
