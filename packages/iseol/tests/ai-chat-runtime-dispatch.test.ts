import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createMemoryService } from "../src/memory/service.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createLearningService } from "../src/learning/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createActivityService } from "../src/activity/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createTeamService } from "../src/teams/service.js";
import { createStudyService } from "../src/study/service.js";
import { createAiAgentProfileService } from "../src/ai-agent/service.js";
import { createUserRuntimeDispatchGate } from "../src/runtime/user-runtime-dispatch-gate.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("an explicitly injected local Runtime can persist an attributed assistant response", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-runtime-"));
  const memory = createMemoryService(root, { now: () => "2026-09-26T12:00:00.000Z" });
  const calls: Array<{ userId: string; conversationId: string; messageId: string; content: string }> = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async (request) => {
      calls.push({ userId: request.principal.userId, conversationId: request.conversationId, messageId: request.messageId, content: request.content });
      return { status: "completed", assistantContent: "로컬 Runtime이 개인 범위에서 답변했습니다." };
    },
  });
  const a = principal("ai-runtime-a");
  const b = principal("ai-runtime-b");
  const conversation = await chat.createConversation(a, "Runtime 대화");

  const result = await chat.sendMessage(a, conversation.id, "내 학습 맥락을 확인해줘");

  assert.equal(result.runtimeStatus, "completed");
  assert.deepEqual(calls, [{ userId: a.userId, conversationId: conversation.id, messageId: result.conversation.messages[0].id, content: "내 학습 맥락을 확인해줘" }]);
  assert.deepEqual(result.conversation.messages.map((message) => ({ role: message.role, status: message.status, content: message.content })), [
    { role: "user", status: "persisted", content: "내 학습 맥락을 확인해줘" },
    { role: "assistant", status: "persisted", content: "로컬 Runtime이 개인 범위에서 답변했습니다." },
  ]);
  assert.equal((await chat.getConversation(b, conversation.id)), null);

  const restarted = createAiChatService(root, { memoryService: memory, now: () => "2026-09-26T12:00:00.000Z" });
  assert.equal((await restarted.getConversation(a, conversation.id))?.messages[1].content, "로컬 Runtime이 개인 범위에서 답변했습니다.");
});

test("Runtime dispatch receives only the authenticated user's AI profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-agent-profile-context-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const profiles = createAiAgentProfileService(join(root, "profiles"), { now });
  const owner = principal("ai-profile-owner");
  const outsider = principal("ai-profile-outsider");
  await profiles.updateProfile(owner, { name: "루미", personality: "차분한 코치", tone: "짧고 따뜻하게", role: "학습 동반자" });
  const captured: Array<{ userId: string; profile?: { name: string; personality: string; tone: string; role: string } }> = [];
  const chat = createAiChatService(root, {
    aiAgentProfileService: profiles,
    now,
    runtimeDispatcher: async (request) => {
      captured.push({ userId: request.principal.userId, profile: request.context.agentProfile });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });

  const ownerConversation = await chat.createConversation(owner);
  await chat.sendMessage(owner, ownerConversation.id, "내 개인 AI 설정을 참고해줘");
  const outsiderConversation = await chat.createConversation(outsider);
  await chat.sendMessage(outsider, outsiderConversation.id, "내 개인 AI 설정을 참고해줘");

  assert.deepEqual(captured, [
    { userId: owner.userId, profile: { name: "루미", personality: "차분한 코치", tone: "짧고 따뜻하게", role: "학습 동반자" } },
    { userId: outsider.userId, profile: { name: "이설", personality: "사용자와 함께 배우고 만드는 개인 AI", tone: "친근하고 간결한 말투", role: "개인 AI 동반자" } },
  ]);
  assert.ok(!JSON.stringify(captured[1]).includes("루미"));
});

test("Runtime dispatch receives only the current user's bounded private memory context", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-context-"));
  const memory = createMemoryService(root, { now: () => "2026-09-26T12:00:00.000Z" });
  const captured: Array<{ scope: string; contents: string[] }> = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async (request) => {
      captured.push({ scope: request.context.scope, contents: request.context.memories.map((item) => item.content) });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const a = principal("ai-context-a");
  const b = principal("ai-context-b");
  await memory.appendPrivateMemory(a, { kind: "goal", content: "A-only learning goal" });
  await memory.appendPrivateMemory(b, { kind: "secret", content: "B-only private memory" });
  const conversation = await chat.createConversation(a);
  const result = await chat.sendMessage(a, conversation.id, "현재 학습 맥락을 확인해줘");

  assert.equal(result.runtimeStatus, "waiting_runtime");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].scope, "private");
  assert.ok(captured[0].contents.includes("A-only learning goal"));
  assert.ok(captured[0].contents.includes("현재 학습 맥락을 확인해줘"));
  assert.ok(!captured[0].contents.includes("B-only private memory"));
});

test("private memory context follows the user's AI access permission", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-memory-permission-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const memory = createMemoryService(root, { now });
  const settings = createSettingsService(root, { now });
  const captured: string[][] = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    settingsService: settings,
    now,
    runtimeDispatcher: async (request) => {
      captured.push(request.context.memories.map((item) => item.content));
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const owner = principal("ai-memory-permission-owner");
  await memory.appendPrivateMemory(owner, { kind: "preference", content: "owner-approved memory context" });
  const first = await chat.createConversation(owner);
  await chat.sendMessage(owner, first.id, "기억을 사용할 수 있어");
  assert.ok(captured[0]?.includes("owner-approved memory context"));

  await settings.updateSettings(owner, { aiAccess: { memory: false } });
  const second = await chat.createConversation(owner);
  await chat.sendMessage(owner, second.id, "저장된 기억을 사용하지 마");
  assert.ok(!captured[1]?.includes("owner-approved memory context"));
});

test("private memory context fails closed when the settings read is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-memory-settings-failure-"));
  const memory = createMemoryService(root, { now: () => "2026-09-26T12:00:00.000Z" });
  const captured: string[][] = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    settingsService: { getSettings: async () => { throw new Error("settings unavailable"); } },
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async (request) => {
      captured.push(request.context.memories.map((item) => item.content));
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const owner = principal("ai-memory-settings-failure-owner");
  await memory.appendPrivateMemory(owner, { kind: "secret", content: "must not cross a settings failure" });
  const conversation = await chat.createConversation(owner);
  await chat.sendMessage(owner, conversation.id, "설정 읽기 실패를 확인해줘");
  assert.deepEqual(captured, [[]]);
});

test("learning history reaches the private AI Runtime only when the user setting allows it", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-learning-context-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const memory = createMemoryService(root, { now });
  const learning = createLearningService(root, { now });
  const settings = createSettingsService(root, { now });
  const captured: Array<{ learning?: { sessionIds: string[]; attemptIds: string[] } }> = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    learningService: learning,
    settingsService: settings,
    now,
    runtimeDispatcher: async (request) => {
      captured.push({ learning: request.context.learning ? {
        sessionIds: request.context.learning.sessions.map((session) => session.id),
        attemptIds: request.context.learning.attempts.map((attempt) => attempt.id),
      } : undefined });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const a = principal("ai-learning-context-a");
  const plan = await learning.createLearningPlan(a, { title: "Private course", description: "A-only", goals: ["Remember"] });
  const session = await learning.startLearningSession(a, plan.id);
  const attempt = await learning.recordStudyAttempt(a, { sessionId: session.id, questionId: "q-a", answer: "A-only answer" });
  const conversation = await chat.createConversation(a);

  await chat.sendMessage(a, conversation.id, "학습 기록을 참고해줘");
  assert.deepEqual(captured[0].learning, { sessionIds: [session.id], attemptIds: [attempt.id] });

  await settings.updateSettings(a, { aiAccess: { learningHistory: false } });
  const secondConversation = await chat.createConversation(a);
  await chat.sendMessage(a, secondConversation.id, "학습 기록을 사용하지 말아줘");
  assert.equal(captured[1].learning, undefined);
});

test("team document context exposes only shared study metadata to active members when permitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-team-docs-context-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const settings = createSettingsService(root, { now });
  const teams = createTeamService(join(root, "teams"), { now });
  const memory = createMemoryService(root, { now, teamService: teams });
  const study = createStudyService(join(root, "study"), { teamService: teams, now });
  const captured: Array<{ userId: string; docs?: Array<{ id: string; teamId: string; kind: string; content: string }> }> = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    settingsService: settings,
    teamService: teams,
    studyService: study,
    now,
    runtimeDispatcher: async (request) => {
      captured.push({ userId: request.principal.userId, docs: request.context.teamDocs?.map((doc) => ({ id: doc.id, teamId: doc.teamId, kind: doc.kind, content: doc.content })) });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const owner = principal("ai-team-doc-owner");
  const member = principal("ai-team-doc-member");
  const outsider = principal("ai-team-doc-outsider");
  const team = await teams.createTeam(owner, { name: "공유 학습 팀", description: "팀 문서 context 경계", kind: "study", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, member.userId, "member");
  const space = await study.createStudySpace(owner, { teamId: team.id, title: "TypeScript 공유 수업", description: "팀이 함께 보는 계획" });
  const curriculum = await study.addCurriculumLink(owner, space.id, { kind: "resource", referenceId: "resource-typescript", label: "제네릭과 타입 경계" });
  const task = await study.createTask(owner, space.id, { title: "공유 타입 과제", instructions: "팀 문서에 공개할 과제 지시문" });
  await study.saveTaskSubmission(owner, space.id, task.id, { answer: "owner-private 제출 답변", status: "submitted" });
  const sharedMemory = await memory.appendPrivateMemory(owner, { kind: "팀 기억", content: "팀이 합의한 타입 경계" });
  await memory.updatePrivateMemorySharing(owner, sharedMemory.id, [team.id]);
  await settings.updateSettings(owner, { aiAccess: { teamDocs: true } });

  const ownerConversation = await chat.createConversation(owner);
  await chat.sendMessage(owner, ownerConversation.id, "팀 공유 문서를 참고해줘");
  assert.deepEqual(captured[0], {
    userId: owner.userId,
    docs: [
      { id: space.id, teamId: team.id, kind: "study-space", content: "팀이 함께 보는 계획" },
      { id: curriculum.id, teamId: team.id, kind: "curriculum-link", content: "제네릭과 타입 경계" },
      { id: task.id, teamId: team.id, kind: "study-task", content: "팀 문서에 공개할 과제 지시문" },
      { id: sharedMemory.id, teamId: team.id, kind: "shared-memory", content: "팀이 합의한 타입 경계" },
    ],
  });
  assert.ok(!captured[0].docs?.some((doc) => doc.content.includes("owner-private")));

  await settings.updateSettings(owner, { aiAccess: { teamDocs: false } });
  const deniedConversation = await chat.createConversation(owner);
  await chat.sendMessage(owner, deniedConversation.id, "팀 문서 접근을 끈 상태");
  assert.equal(captured[1].docs, undefined);

  const memberConversation = await chat.createConversation(member);
  await settings.updateSettings(member, { aiAccess: { teamDocs: true } });
  await chat.sendMessage(member, memberConversation.id, "멤버로 팀 문서를 읽어줘");
  assert.equal(captured[2].userId, member.userId);
  assert.deepEqual(captured[2].docs?.map((doc) => doc.id), [space.id, curriculum.id, task.id, sharedMemory.id]);
  assert.ok(!captured[2].docs?.some((doc) => doc.content.includes("owner-private")));

  const outsiderConversation = await chat.createConversation(outsider);
  await chat.sendMessage(outsider, outsiderConversation.id, "다른 사용자의 팀 문서를 읽어줘");
  assert.equal(captured[3].docs?.length ?? 0, 0);
});

test("project and verified activity context obey owner scope and independent AI permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-project-activity-context-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const memory = createMemoryService(root, { now });
  const activity = createActivityService(root, { now });
  const settings = createSettingsService(root, { now });
  const projects = createUserProjectService({ platformRoot: root, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now });
  const captured: Array<{ projects?: string[]; activity?: string[] }> = [];
  const chat = createAiChatService(root, {
    memoryService: memory,
    activityService: activity,
    userProjectService: projects,
    settingsService: settings,
    now,
    runtimeDispatcher: async (request) => {
      captured.push({
        projects: request.context.projects?.map((project) => project.id),
        activity: request.context.activityTimeline?.map((event) => event.id),
      });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const a = principal("ai-project-context-a");
  const b = principal("ai-project-context-b");
  const projectA = await projects.createProject(a, { name: "A project", objective: "A-only objective", purpose: "rapid-prototype", teamMode: "solo" });
  const projectB = await projects.createProject(b, { name: "B project", objective: "B-only objective", purpose: "rapid-prototype", teamMode: "solo" });
  const verifiedA = await activity.recordActivityEvent(a, { sourceType: "learning", sourceId: "session-a", eventType: "learning.session.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified", occurredAt: now() });
  await activity.recordActivityEvent(a, { sourceType: "learning", sourceId: "self-a", eventType: "learning.self.reported", eventVersion: 1, actorType: "user", verificationStatus: "unverified", occurredAt: now() });
  await activity.recordActivityEvent(b, { sourceType: "learning", sourceId: "session-b", eventType: "learning.session.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified", occurredAt: now() });

  const conversation = await chat.createConversation(a);
  await chat.sendMessage(a, conversation.id, "프로젝트와 활동 맥락을 확인해줘");
  assert.deepEqual(captured[0], { projects: [projectA.id], activity: [verifiedA.id] });
  assert.ok(!captured[0]?.projects?.includes(projectB.id));

  await settings.updateSettings(a, { aiAccess: { projectFiles: false, activityTimeline: false } });
  const secondConversation = await chat.createConversation(a);
  await chat.sendMessage(a, secondConversation.id, "프로젝트와 활동 맥락을 사용하지 말아줘");
  assert.deepEqual(captured[1], { projects: undefined, activity: undefined });
});

test("a Runtime dispatcher that does not complete keeps the request waiting without inventing an assistant reply", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-runtime-waiting-"));
  const chat = createAiChatService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async () => ({ status: "accepted", blocker: "local Runtime queue is busy" }),
  });
  const conversation = await chat.createConversation(principal("ai-runtime-waiting"));

  const result = await chat.sendMessage(principal("ai-runtime-waiting"), conversation.id, "답변을 기다려줘");

  assert.equal(result.runtimeStatus, "waiting_runtime");
  assert.equal(result.conversation.messages.length, 1);
  assert.equal(result.conversation.messages[0].status, "waiting_runtime");
  assert.equal(result.conversation.messages[0].role, "user");
});

test("an accepted Runtime can complete later through a user-bound durable callback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-runtime-async-"));
  let complete: ((assistantContent: string) => Promise<unknown>) | undefined;
  const chat = createAiChatService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async (request) => {
      complete = request.complete;
      return { status: "accepted", blocker: "local Runtime is processing" };
    },
  });
  const a = principal("ai-runtime-async-a");
  const b = principal("ai-runtime-async-b");
  const conversation = await chat.createConversation(a);
  const queued = await chat.sendMessage(a, conversation.id, "비동기 답변을 준비해줘");

  assert.equal(queued.runtimeStatus, "waiting_runtime");
  assert.ok(complete);
  await assert.rejects(() => chat.completeMessage(b, conversation.id, queued.conversation.messages[0].id, "타 사용자 응답"), /not found/);
  await complete!("로컬 Runtime이 나중에 답변을 완료했습니다.");
  const completed = await chat.getConversation(a, conversation.id);
  assert.deepEqual(completed?.messages.map((message) => ({ role: message.role, status: message.status, content: message.content })), [
    { role: "user", status: "persisted", content: "비동기 답변을 준비해줘" },
    { role: "assistant", status: "persisted", content: "로컬 Runtime이 나중에 답변을 완료했습니다." },
  ]);
  await complete!("중복 응답은 무시되어야 합니다.");
  assert.equal((await chat.getConversation(a, conversation.id))?.messages.length, 2);
});

test("Personal AI Runtime dispatches do not overlap for the same user", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-runtime-gate-same-user-"));
  const owner = principal("ai-runtime-gate-owner");
  let active = 0;
  let maximumActive = 0;
  let dispatchCount = 0;
  let firstEntered: (() => void) | undefined;
  const firstEnteredPromise = new Promise<void>((resolve) => { firstEntered = resolve; });
  let releaseFirst: (() => void) | undefined;
  const firstReleasePromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const chat = createAiChatService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async () => {
      dispatchCount += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (dispatchCount === 1) firstEntered?.();
      await firstReleasePromise;
      active -= 1;
      return { status: "completed", assistantContent: "개인 Runtime 응답" };
    },
  });
  const firstConversation = await chat.createConversation(owner, "첫 대화");
  const secondConversation = await chat.createConversation(owner, "둘째 대화");

  const first = chat.sendMessage(owner, firstConversation.id, "첫 요청");
  await firstEnteredPromise;
  const second = chat.sendMessage(owner, secondConversation.id, "둘째 요청");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(dispatchCount, 1);
  assert.equal(maximumActive, 1);
  releaseFirst?.();
  await Promise.all([first, second]);
  assert.equal(dispatchCount, 2);
  assert.equal(maximumActive, 1);
});

test("Personal AI Runtime dispatches can run concurrently for different users", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-runtime-gate-different-users-"));
  const ownerA = principal("ai-runtime-gate-a");
  const ownerB = principal("ai-runtime-gate-b");
  let active = 0;
  let maximumActive = 0;
  let entered = 0;
  let releaseBoth: (() => void) | undefined;
  const releasePromise = new Promise<void>((resolve) => { releaseBoth = resolve; });
  let bothEntered: (() => void) | undefined;
  const bothEnteredPromise = new Promise<void>((resolve) => { bothEntered = resolve; });
  const chat = createAiChatService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      entered += 1;
      if (entered === 2) bothEntered?.();
      await releasePromise;
      active -= 1;
      return { status: "completed", assistantContent: "사용자별 개인 Runtime 응답" };
    },
  });
  const conversationA = await chat.createConversation(ownerA, "A 대화");
  const conversationB = await chat.createConversation(ownerB, "B 대화");
  const resultA = chat.sendMessage(ownerA, conversationA.id, "A 요청");
  const resultB = chat.sendMessage(ownerB, conversationB.id, "B 요청");

  await bothEnteredPromise;
  assert.equal(maximumActive, 2);
  releaseBoth?.();
  await Promise.all([resultA, resultB]);
  assert.equal(maximumActive, 2);
});

test("learning and Personal AI share one injected per-user Runtime gate when composed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-cross-domain-runtime-gate-"));
  const owner = principal("cross-domain-runtime-owner");
  const sharedGate = createUserRuntimeDispatchGate();
  let active = 0;
  let maximumActive = 0;
  let dispatchCount = 0;
  let firstEntered: (() => void) | undefined;
  const firstEnteredPromise = new Promise<void>((resolve) => { firstEntered = resolve; });
  let releaseFirst: (() => void) | undefined;
  const firstReleasePromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const learning = createLearningService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    actionDispatcher: async ({ action, complete }) => {
      dispatchCount += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (dispatchCount === 1) firstEntered?.();
      await firstReleasePromise;
      active -= 1;
      return { status: "completed" as const, action: await complete(`학습 Runtime 응답: ${action.actionId}`) };
    },
    dispatchForUser: sharedGate,
  });
  const chat = createAiChatService(root, {
    now: () => "2026-09-26T12:00:00.000Z",
    runtimeDispatcher: async () => {
      dispatchCount += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      active -= 1;
      return { status: "completed" as const, assistantContent: "개인 AI Runtime 응답" };
    },
    dispatchForUser: sharedGate,
  });
  const plan = await learning.createLearningPlan(owner, { title: "교차 도메인 게이트", description: "개인 AI와 학습의 공통 Runtime", goals: ["겹치지 않기"] });
  const session = await learning.startLearningSession(owner, plan.id);
  const conversation = await chat.createConversation(owner, "개인 AI");

  const learningRequest = learning.recordLearningSessionAction(owner, session.id, { actionId: "cross-domain-action", type: "explanation", question: "동시성" });
  await firstEnteredPromise;
  const chatRequest = chat.sendMessage(owner, conversation.id, "개인 AI도 실행해줘");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(dispatchCount, 1);
  assert.equal(maximumActive, 1);
  releaseFirst?.();
  await Promise.all([learningRequest, chatRequest]);
  assert.equal(dispatchCount, 2);
  assert.equal(maximumActive, 1);
});
