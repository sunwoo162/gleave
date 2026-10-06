import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";
import type { LearningContentDispatcher } from "../src/learning/contracts.js";
import { withDurableLearningSessionLock } from "../src/learning/session-lock.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

async function started(root: string, contentDispatcher?: LearningContentDispatcher) {
  const service = createLearningService(root, { now: () => at, ...(contentDispatcher ? { contentDispatcher } : {}) });
  const owner = principal("content-owner");
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript 제네릭", duration: { days: 2 }, dailyMinutes: 30 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  return { service, owner, goal, preview, session };
}

test("learning content request is private, idempotent, and remains waiting when local Runtime is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-request-"));
  const { service, owner, session } = await started(root);

  const request = await service.requestLearningSessionContent(owner, session.id);
  assert.equal(request.state, "waiting-runtime");
  assert.equal(request.scope, "private");
  assert.equal(request.sessionId, session.id);
  assert.equal(request.lesson, undefined);
  assert.match(request.blocker ?? "", /Runtime/i);
  assert.equal((await service.resumeLearningSession(owner, session.id))?.contentStatus, "pending");
  assert.equal((await service.requestLearningSessionContent(owner, session.id)).id, request.id);
  assert.equal((await createLearningService(root, { now: () => at }).getLearningSessionContent(owner, session.id))?.id, request.id);
  await assert.rejects(() => service.requestLearningSessionContent(principal("content-other"), session.id), /not found|forbidden/i);
});

test("an explicitly injected local content Runtime can complete later through an owner-bound durable callback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-async-"));
  let complete: ((lesson: Parameters<NonNullable<LearningContentDispatcher>>[0]["complete"] extends (input: infer T) => Promise<unknown> ? T : never) => Promise<unknown>) | undefined;
  const dispatcher: LearningContentDispatcher = async (request) => {
    complete = request.complete;
    return { status: "accepted", blocker: "local content Runtime is processing token=content-secret" };
  };
  const { service, owner, session, preview } = await started(root, dispatcher);
  const queued = await service.requestLearningSessionContent(owner, session.id);
  assert.equal(queued.state, "waiting-runtime");
  assert.equal(queued.blocker?.includes("content-secret"), false);
  assert.match(queued.blocker ?? "", /Runtime/i);
  assert.ok(complete);

  await complete!({
    title: "TypeScript 제네릭 오늘 수업",
    estimatedMinutes: 20,
    blocks: [
      { id: "block-concept", kind: "concept", conceptIds: [preview.plan.days[0]!.conceptIds[0]!], minutes: 8, title: "핵심 개념", content: "타입 매개변수로 재사용 가능한 타입 관계를 표현합니다." },
      { id: "block-question", kind: "question", conceptIds: [preview.plan.days[0]!.conceptIds[0]!], minutes: 12, title: "확인 질문", content: "제네릭이 필요한 상황을 한 문장으로 설명해 보세요." },
    ],
  });
  const ready = await service.getLearningSessionContent(owner, session.id);
  assert.equal(ready?.state, "validated");
  assert.equal(ready?.lesson?.blocks.length, 2);
  assert.equal((await service.resumeLearningSession(owner, session.id))?.contentStatus, "ready");
  const before = JSON.stringify(ready);
  await complete!({
    title: "중복 응답",
    estimatedMinutes: 1,
    blocks: [{ id: "other", kind: "concept", conceptIds: [], minutes: 1, title: "무시", content: "무시되어야 합니다." }],
  });
  assert.equal(JSON.stringify(await service.getLearningSessionContent(owner, session.id)), before);
});

test("learning content Runtime exception blockers are redacted before durable storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-error-safety-"));
  const secret = "content exception token=content-error-secret https://preview.example/?access_token=content-error-url";
  const { service, owner, session } = await started(root, async () => { throw new Error(secret); });
  const request = await service.requestLearningSessionContent(owner, session.id);
  assert.equal(request.state, "waiting-runtime");
  assert.equal(request.blocker?.includes("content-error-secret"), false);
  assert.equal(request.blocker?.includes("content-error-url"), false);
  assert.match(request.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
});

test("learning content reservation waits for a competing shared session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-lock-"));
  const { service, owner, session } = await started(root);
  let settled = false;
  let requestPromise!: ReturnType<typeof service.requestLearningSessionContent>;
  const held = withDurableLearningSessionLock(root, owner.userId, session.id, async () => {
    requestPromise = service.requestLearningSessionContent(owner, session.id).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);
  });
  await held;
  const request = await requestPromise;
  assert.equal(request.sessionId, session.id);
  assert.equal(settled, true);
});

test("learning content reservation is idempotent across service instances and dispatches once", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-cross-instance-"));
  let calls = 0;
  let resolveEntered!: () => void;
  const entered = new Promise<void>((resolve) => { resolveEntered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const dispatcher: LearningContentDispatcher = async () => {
    calls += 1;
    if (calls === 1) {
      resolveEntered();
      await gate;
    }
    return { status: "accepted", blocker: "local content Runtime is processing" };
  };
  const { service: firstService, owner, session } = await started(root, dispatcher);
  const secondService = createLearningService(root, { now: () => at, contentDispatcher: dispatcher });
  const first = firstService.requestLearningSessionContent(owner, session.id);
  await entered;
  const second = await secondService.requestLearningSessionContent(owner, session.id);
  assert.equal(calls, 1);
  release();
  const firstResult = await first;
  assert.equal(firstResult.id, second.id);
  assert.equal(firstResult.state, "waiting-runtime");
});

test("learning content completion waits on the owning session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-complete-lock-"));
  const { service, owner, session, preview } = await started(root);
  const request = await service.requestLearningSessionContent(owner, session.id);
  let settled = false;
  let completion!: ReturnType<typeof service.completeLearningContent>;
  await withDurableLearningSessionLock(root, owner.userId, session.id, async () => {
    completion = service.completeLearningContent(owner, request.id, {
      title: "잠금 경계 수업",
      estimatedMinutes: 20,
      blocks: [
        { id: "block-concept", kind: "concept", conceptIds: [preview.plan.days[0]!.conceptIds[0]!], minutes: 8, title: "핵심 개념", content: "공유 세션 잠금은 한 번에 하나의 상태 전이를 허용합니다." },
        { id: "block-question", kind: "question", conceptIds: [preview.plan.days[0]!.conceptIds[0]!], minutes: 12, title: "확인 질문", content: "왜 콘텐츠 완료도 세션 잠금 안에서 처리되어야 할까요?" },
      ],
    }).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);
  });
  const completed = await completion;
  assert.equal(completed.state, "validated");
  assert.equal(settled, true);
});
