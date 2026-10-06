import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvaluationObservation } from "../src/evaluation/contracts.js";
import {
  appendEvaluationObservationOnce,
  listEvaluationObservations,
} from "../src/evaluation/observation-store.js";
import { withDurableEvaluationObservationLock } from "../src/evaluation/observation-lock.js";

test("evaluation observation reads wait for the durable observation lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-observation-lock-read-"));
  const observation: EvaluationObservation = {
    version: 1,
    id: "observation-lock-read",
    evaluationId: "evaluation-lock-read",
    scenarioId: "scenario-lock-read",
    type: "recovery-observed",
    at: "2026-09-30T07:00:00.000Z",
    summary: "observation lock read",
  };
  await appendEvaluationObservationOnce(root, observation);

  let settled = false;
  let readPromise: Promise<Awaited<ReturnType<typeof listEvaluationObservations>>> | undefined;
  const lockPromise = withDurableEvaluationObservationLock(
    root,
    observation.evaluationId,
    async () => {
      readPromise = listEvaluationObservations(root, observation.evaluationId);
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;

  assert.deepEqual(await readPromise!, [observation]);
});
