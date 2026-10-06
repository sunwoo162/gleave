import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";
import { withDurableLearningReportLock } from "../src/learning/report-lock.js";
import { loadLearningReport, listLearningReports, saveLearningReport } from "../src/learning/store.js";

const at = "2026-09-30T00:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning report public reads and writes wait for the durable report lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-store-lock-"));
  const owner = principal("report-store-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Report store", duration: { days: 2 }, dailyMinutes: 20 });
  const result = await service.createLearningReport(owner, goal.id, { period: { from: "2026-09-30", to: "2026-09-30", kind: "weekly" } });
  const report = result.report;
  const periodKey = JSON.stringify(report.period);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningReportLock(root, owner.userId, goal.id, periodKey, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningReport(root, { ...report, summary: "잠금 해제 후 리포트" }).then(() => { saveSettled = true; });
  const load = loadLearningReport(root, owner.userId, report.id).then(() => { loadSettled = true; });
  const list = listLearningReports(root, owner.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningReport(root, owner.userId, report.id))?.summary, "잠금 해제 후 리포트");
  assert.equal((await listLearningReports(root, owner.userId))[0]?.summary, "잠금 해제 후 리포트");
});
