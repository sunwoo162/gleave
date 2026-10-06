import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import type { UserProjectService } from "../src/project-model/user-project-service.js";
import { withDurableLearningProjectApplicationAcceptanceLock } from "../src/learning/project-application-acceptance-lock.js";
import { createLearningService } from "../src/learning/service.js";
import { saveLearningProjectApplication } from "../src/learning/store.js";

const at = "2026-09-27T18:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

function projectStub(ownerUserId: string, projectId: string, workRequestCalls: Array<unknown>): UserProjectService {
  const durableWorkRequests: any[] = [];
  return {
    getProject: async (requester, requestedProjectId) => requester.userId === ownerUserId && requestedProjectId === projectId ? { project: { id: projectId, ownerUserId } as any, workspace: {} as any, workRequests: durableWorkRequests, runtime: { status: "not-started" }, evidence: [], lifecycle: { artifacts: [], revisions: [], deployments: [] } } : null,
    createWorkRequest: async (_requester, requestedProjectId, input) => { const existing = durableWorkRequests.find((item) => item.idempotencyKey === input.idempotencyKey); if (existing) return { created: false, request: existing }; workRequestCalls.push({ requestedProjectId, input }); const request = { id: "work-learning-1", projectId: requestedProjectId, ...input }; durableWorkRequests.push(request); return { created: true, request: request as any }; },
    createProject: async () => { throw new Error("not used"); },
    listProjects: async () => [],
    startProjectRun: async () => { throw new Error("not used"); },
    resumeProjectRun: async () => { throw new Error("not used"); },
    updateProjectTeam: async () => { throw new Error("not used"); },
  };
}

test("learning project application remains a draft until owner acceptance, then creates one linked work request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-"));
  const calls: unknown[] = [];
  const projects = projectStub("learning-owner", "project-1", calls);
  const service = createLearningService(root, { now: () => at, userProjectService: projects });
  const owner = principal("learning-owner");
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript 제네릭", duration: { days: 7 }, dailyMinutes: 30 });
  const input = {
    projectId: "project-1",
    proposal: { title: "제네릭 타입 예제 추가", objective: "학습한 제네릭 타입을 작은 예제로 적용합니다.", nodeRef: "task-types", acceptanceCriteria: ["타입 예제가 설명과 함께 저장됩니다."], tests: ["타입 검사 실행을 확인합니다."], estimatedEffort: 30 },
    learningEvidenceRefs: ["goal:" + goal.id],
    requiredPermissions: ["project.read", "project.work-request.create"],
    actorAssignments: { human: "owner", ai: "reviewer" },
  };
  const proposed = await service.createLearningProjectApplication(owner, goal.id, input);
  assert.equal(proposed.created, true);
  assert.equal(proposed.proposal.status, "proposed");
  assert.equal(calls.length, 0);
  const repeated = await service.createLearningProjectApplication(owner, goal.id, input);
  assert.equal(repeated.created, false);
  const accepted = await service.acceptLearningProjectApplication(owner, goal.id, proposed.proposal.id);
  assert.equal(accepted.proposal.status, "accepted");
  assert.equal(accepted.link.projectId, "project-1");
  assert.equal(accepted.workRequest.id, "work-learning-1");
  assert.equal(calls.length, 1);
  const restarted = createLearningService(root, { now: () => at, userProjectService: projects });
  assert.equal((await restarted.listLearningProjectApplications(owner, goal.id)).length, 1);
  const acceptedAgain = await restarted.acceptLearningProjectApplication(owner, goal.id, proposed.proposal.id);
  assert.equal(acceptedAgain.workRequest.id, "work-learning-1");
  assert.equal(calls.length, 1);
});

test("learning project application fails closed for inaccessible projects and rejects execution claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-deny-"));
  const service = createLearningService(root, { now: () => at, userProjectService: projectStub("other-owner", "project-1", []) });
  const owner = principal("learning-owner");
  const goal = await service.createLearningGoal(owner, { subjectText: "테스트", duration: { days: 2 }, dailyMinutes: 15 });
  await assert.rejects(() => service.createLearningProjectApplication(owner, goal.id, { projectId: "project-1", proposal: { title: "완료된 배포", objective: "push and deploy the finished work", acceptanceCriteria: ["done"], tests: ["pass"], estimatedEffort: 10 }, learningEvidenceRefs: [], requiredPermissions: [], actorAssignments: { human: "owner" } }), /project|execution|claim/i);
  const foreign = principal("foreign");
  await assert.rejects(() => service.createLearningProjectApplication(foreign, goal.id, { projectId: "project-1", proposal: { title: "연결", objective: "연결", acceptanceCriteria: ["확인"], tests: ["확인"], estimatedEffort: 10 }, learningEvidenceRefs: [], requiredPermissions: [], actorAssignments: { human: "owner" } }), /goal|not found/i);
});

test("learning project application lists wait for each durable acceptance lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-read-lock-"));
  const owner = principal("learning-application-read-lock-owner");
  const projects = projectStub(owner.userId, "project-1", []);
  const service = createLearningService(root, { now: () => at, userProjectService: projects });
  const goal = await service.createLearningGoal(owner, { subjectText: "Application reads", duration: { days: 2 }, dailyMinutes: 20 });
  const proposal = await service.createLearningProjectApplication(owner, goal.id, {
    projectId: "project-1",
    proposal: { title: "Application", objective: "Read application state", acceptanceCriteria: ["one"], tests: ["one"], estimatedEffort: 10 },
    learningEvidenceRefs: ["goal:" + goal.id], requiredPermissions: ["project.read"], actorAssignments: { human: "owner" },
  });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningProjectApplicationAcceptanceLock(root, owner.userId, goal.id, proposal.proposal.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningProjectApplications(owner, goal.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningProjectApplication(root, { ...proposal.proposal, actorAssignments: { human: "updated-owner" } });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.actorAssignments.human, "updated-owner");
});

test("concurrent learning project applications across service instances remain one proposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-concurrent-"));
  const projects = projectStub("learning-concurrent-owner", "project-1", []);
  const firstService = createLearningService(root, { now: () => at, userProjectService: projects });
  const secondService = createLearningService(root, { now: () => at, userProjectService: projects });
  const owner = principal("learning-concurrent-owner");
  const goal = await firstService.createLearningGoal(owner, { subjectText: "TypeScript 동시 지원", duration: { days: 7 }, dailyMinutes: 30 });
  const input = {
    projectId: "project-1",
    proposal: { title: "동시 지원", objective: "하나의 durable proposal", acceptanceCriteria: ["one record"], tests: ["no duplicate"], estimatedEffort: 30 },
    learningEvidenceRefs: ["goal:" + goal.id],
    requiredPermissions: ["project.read"],
    actorAssignments: { human: "owner" },
  };

  const results = await Promise.all([
    firstService.createLearningProjectApplication(owner, goal.id, input),
    secondService.createLearningProjectApplication(owner, goal.id, input),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(new Set(results.map((result) => result.proposal.id)).size, 1);
  assert.equal((await firstService.listLearningProjectApplications(owner, goal.id)).length, 1);
});

test("concurrent learning project application acceptance across service instances creates one linked request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-accept-concurrent-"));
  const owner = principal("learning-accept-concurrent-owner");
  const baseProjects = projectStub(owner.userId, "project-1", []);
  let workRequestCalls = 0;
  const projects: UserProjectService = {
    ...baseProjects,
    createWorkRequest: async (requester, projectId, input) => {
      workRequestCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return baseProjects.createWorkRequest(requester, projectId, input);
    },
  };
  const activityCalls: unknown[] = [];
  const activityService = { recordActivityEvent: async (_requester: Principal, input: unknown) => { activityCalls.push(input); return {} as any; } } as any;
  const firstService = createLearningService(root, { now: () => at, userProjectService: projects, activityService });
  const secondService = createLearningService(root, { now: () => at, userProjectService: projects, activityService });
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 프로젝트 승인", duration: { days: 3 }, dailyMinutes: 20 });
  const proposed = await firstService.createLearningProjectApplication(owner, goal.id, {
    projectId: "project-1",
    proposal: { title: "동시 승인", objective: "하나의 연결 요청", acceptanceCriteria: ["one request"], tests: ["no duplicate"], estimatedEffort: 20 },
    learningEvidenceRefs: ["goal:" + goal.id],
    requiredPermissions: ["project.work-request.create"],
    actorAssignments: { human: "owner" },
  });

  const results = await Promise.all([
    firstService.acceptLearningProjectApplication(owner, goal.id, proposed.proposal.id),
    secondService.acceptLearningProjectApplication(owner, goal.id, proposed.proposal.id),
  ]);

  assert.equal(workRequestCalls, 1);
  assert.equal(activityCalls.length, 1);
  assert.equal(new Set(results.map((result) => result.workRequest.id)).size, 1);
  assert.equal(new Set(results.map((result) => result.link.id)).size, 1);
  assert.equal((await firstService.listLearningProjectApplications(owner, goal.id))[0]?.status, "accepted");
});
