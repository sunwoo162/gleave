import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendReasoningTurn, listReasoningTurns } from "../src/chatgpt-web/turn-store.js";
import { withDurableReasoningTurnLock } from "../src/chatgpt-web/turn-lock.js";

const turn = {
  version: 1 as const,
  turnId: "turn-store-lock",
  sessionId: "session-turn-store-lock",
  runId: "run-turn-store-lock",
  stage: "IMPLEMENT" as const,
  generation: 1,
  promptSha256: "prompt",
  responseSha256: "response",
  summary: "Apply patch",
  decisions: ["Keep lock boundary"],
  desktopIntentIds: [],
  outcome: "continue" as const,
  recordedAt: "2026-09-30T00:00:00.000Z",
};

async function holdRunLock(root: string) {
  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableReasoningTurnLock(root, turn.runId, async () => {
    acquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquiredPromise;
  return { holder, release };
}

test("public reasoning turn lists wait for the shared run lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-chatgpt-turn-store-lock-"));
  await appendReasoningTurn(root, turn);

  const lock = await holdRunLock(root);
  let settled = false;
  const pending = listReasoningTurns(root, turn.runId).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  lock.release();
  await lock.holder;
  assert.deepEqual((await pending).map((candidate) => candidate.turnId), [turn.turnId]);
});
