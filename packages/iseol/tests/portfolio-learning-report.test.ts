import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createPortfolioService } from "../src/portfolio/service.js";

const at = "2026-09-28T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("portfolio exposes owner-scoped verified learning-report outcomes as selectable evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-learning-report-"));
  const platformRoot = join(root, "platform");
  const activityService = createActivityService(platformRoot, { now: () => at });
  const userProjectService = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const reports = {
    async listLearningGoals(owner: Principal) {
      return owner.userId === "learning-owner" ? [{ id: "goal-owner" }] : [];
    },
    async listLearningReports(owner: Principal, goalId: string) {
      if (owner.userId !== "learning-owner" || goalId !== "goal-owner") return [];
      return [{
        id: "learning-report-owner",
        goalSubject: "TypeScript",
        createdAt: at,
        verifiedOutcomes: [{ outcomeId: "outcome-1", label: "타입 안전성을 설명하고 적용함", evidenceRefs: ["attempt-1"] }],
        unverifiedOutcomes: [{ outcomeId: "self-report-1", label: "이해했다는 자기보고", evidenceRefs: ["self-report-1"] }],
      }];
    },
  };
  const portfolio = createPortfolioService(platformRoot, { activityService, userProjectService, learningService: reports as never, now: () => at });

  const ownerSnapshot = await portfolio.listPortfolio(principal("learning-owner"));
  const learningEvidence = ownerSnapshot.evidence.find((item) => item.id === "learning-report:learning-report-owner:outcome-1");
  assert.deepEqual(learningEvidence, {
    id: "learning-report:learning-report-owner:outcome-1",
    sourceType: "learning-report",
    sourceId: "outcome-1",
    reportId: "learning-report-owner",
    actorType: "user",
    verificationStatus: "verified",
    summary: "TypeScript: 타입 안전성을 설명하고 적용함",
    occurredAt: at,
    provider: "learning-report-local",
  });
  assert.equal(ownerSnapshot.evidence.some((item) => item.id.includes("self-report-1")), false);

  const foreignSnapshot = await portfolio.listPortfolio(principal("learning-foreign"));
  assert.equal(foreignSnapshot.evidence.some((item) => item.sourceType === "learning-report"), false);

  const draft = await portfolio.createEntry(principal("learning-owner"), {
    title: "TypeScript 학습 적용 초안",
    summary: "학습 보고서에서 검증된 결과를 편집할 초안입니다.",
    visibility: "private",
    evidenceIds: [learningEvidence!.id],
  });
  assert.equal(draft.visibility, "private");
  assert.deepEqual(draft.evidenceIds, [learningEvidence!.id]);
});
