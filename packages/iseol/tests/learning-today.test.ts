import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string, timezone?: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"], ...(timezone ? { timezone } : {}) } as Principal; }

test("today read model uses the account timezone and follows the existing session boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-today-"));
  const owner = principal("today-owner", "Pacific/Kiritimati");
  const other = principal("today-other", "Pacific/Kiritimati");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Today", duration: { days: 2 }, dailyMinutes: 20 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const available = await service.getLearningGoalToday(owner, goal.id);
  assert.ok(available);
  assert.equal(available.state, "available");
  assert.equal(available.day?.localDate, "2026-09-27");
  assert.equal(available.session, undefined);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: available.day!.id, expectedRevision: available.goalRevision });
  const active = await service.getLearningGoalToday(owner, goal.id);
  assert.equal(active?.state, "active");
  assert.equal(active?.session?.id, session.id);
  await service.requestLearningSessionContent(owner, session.id);
  const pending = await service.getLearningGoalToday(owner, goal.id);
  assert.equal(pending?.state, "content-pending");
  assert.equal(await service.getLearningGoalToday(other, goal.id), null);
});
