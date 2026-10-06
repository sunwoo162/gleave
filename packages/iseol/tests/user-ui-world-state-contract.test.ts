import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildWorldMissions } from "../user-ui/src/domain/worldState.ts";

const worldPage = resolve(process.cwd(), "user-ui/src/pages/MyWorld.tsx");
const uiComponents = resolve(process.cwd(), "user-ui/src/components/UI.tsx");
const browserJourney = resolve(process.cwd(), "scripts/iseol-user-ui-e2e.ts");
const userApi = resolve(process.cwd(), "user-ui/src/api/userApi.ts");

test("world missions distinguish durable records from completed user actions", async () => {
  const missions = buildWorldMissions({ projectCount: 2, learningPlanCount: 1, dueReviewCount: 0 });

  assert.equal(missions[0].state, "recorded");
  assert.equal(missions[1].state, "recorded");
  assert.equal(missions[2].state, "next-action");
  assert.ok(missions.every((mission) => !("complete" in mission)));
  assert.ok(missions.every((mission) => !("xp" in mission)));
});

test("world missions expose only verified activity evidence without inventing completion", () => {
  const missions = buildWorldMissions({
    projectCount: 2,
    learningPlanCount: 1,
    dueReviewCount: 1,
    recentActivityEvents: [
      { eventType: "project.run.completed", verificationStatus: "verified", occurredAt: "2026-09-27T09:00:00.000Z" },
      { eventType: "project.run.completed", verificationStatus: "unverified", occurredAt: "2026-09-27T10:00:00.000Z" },
      { eventType: "learning.session.completed", verificationStatus: "verified", occurredAt: "2026-09-27T11:00:00.000Z" },
      { eventType: "learning.review.completed", verificationStatus: "verified", occurredAt: "2026-09-27T12:00:00.000Z" },
    ],
  });

  assert.deepEqual(
    missions.map(({ id, evidenceCount, lastRecordedAt }) => ({ id, evidenceCount, lastRecordedAt })),
    [
      { id: "projects", evidenceCount: 1, lastRecordedAt: "2026-09-27T09:00:00.000Z" },
      { id: "learning", evidenceCount: 1, lastRecordedAt: "2026-09-27T11:00:00.000Z" },
      { id: "reviews", evidenceCount: 1, lastRecordedAt: "2026-09-27T12:00:00.000Z" },
    ],
  );
  assert.ok(missions.every((mission) => !("complete" in mission)));
});

test("world missions retain an explicit unverified user completion record", () => {
  const missions = buildWorldMissions({
    projectCount: 2,
    learningPlanCount: 1,
    dueReviewCount: 1,
    recentActivityEvents: [
      {
        eventType: "world.mission.completed",
        verificationStatus: "unverified",
        occurredAt: "2026-09-27T13:00:00.000Z",
        status: "active",
        payload: { missionId: "projects" },
      },
      {
        eventType: "world.mission.completed",
        verificationStatus: "unverified",
        occurredAt: "2026-09-27T14:00:00.000Z",
        status: "retracted",
        payload: { missionId: "learning" },
      },
    ],
  });

  assert.equal(missions[0].userActionState, "recorded");
  assert.equal(missions[0].lastUserActionAt, "2026-09-27T13:00:00.000Z");
  assert.equal(missions[1].userActionState, "not-recorded");
  assert.equal(missions[2].userActionState, "not-recorded");
  assert.ok(missions.every((mission) => !("complete" in mission)));
});

test("world page renders the explicit mission state instead of a fake completion badge", async () => {
  const [source, components, journey, api] = await Promise.all([readFile(worldPage, "utf8"), readFile(uiComponents, "utf8"), readFile(browserJourney, "utf8"), readFile(userApi, "utf8")]);

  assert.match(source, /buildWorldMissions/);
  assert.match(source, /mission\.state/);
  assert.match(source, /mission\.evidenceCount/);
  assert.match(source, /lastRecordedAt/);
  assert.match(source, /recordWorldMissionCompletion/);
  assert.match(source, /profile\.timezone/);
  assert.match(source, /userActionState/);
  assert.match(api, /calendarDateForTimeZone\(timezone\)/);
  assert.match(journey, /verifyWorldMissionCompletionUi/);
  assert.match(journey, /worldMissionCompletionUi: "passed"/);
  assert.match(journey, /locator\(`button\[data-mission-id=\"\$\{missionId\}\"\]`\)\.click\(\)/, "browser re-recording must target the stable mission identity after dynamic labels are recalculated");
  assert.match(source, /저장된 기록/);
  assert.doesNotMatch(source, /complete:\s*projects\.length\s*>\s*0/);
  assert.doesNotMatch(source, /complete:\s*plans\.length\s*>\s*0/);
  assert.doesNotMatch(source, /MissionItem/);
  assert.match(components, /state: 'recorded' \| 'next-action'/);
  assert.doesNotMatch(components, /progress:\s*number;\s*total:\s*number;\s*xp:\s*number/);
});
