# ISEOL 통합 제품 개발 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each task is independently testable and uses RED → GREEN → regression.

**Goal:** 확정된 ISEOL 제품 방향을 기존 JSON durable store, Runtime/Harness, Web Control Plane, Desktop Agent, ChatGPT Web adapter, Discord 및 외부 연동 위에 단계적으로 구현하여 실제 사용자 흐름과 검증 가능한 활동 증거를 연결한다.

**Architecture:** 기존 운영 경계와 저장 경로를 유지한다. Runtime/Harness는 개발 실행 권위, Learning은 학습 권위, Activity/Growth는 증거·평가 권위가 되며 Web/Discord/캐릭터/AI 방송은 projection 또는 승인된 controller다. 새 사용자 데이터는 principal과 scope를 검증한 뒤 `platformRoot/users/<id>` 및 `platformRoot/teams/<id>`에 별도 저장하고 legacy operator 영역을 자동 귀속하지 않는다.

**Tech Stack:** Node.js, TypeScript, `node:test`, 기존 atomic JSON stores, Web Control Plane static UI, SSE snapshot refresh, 기존 Harness/Desktop Agent/ChatGPT Web adapter, 로컬 TTS/브라우저 capability adapter.

**Spec:** `docs/ISEOL_PRODUCT_SPEC.md`, `docs/ISEOL_ARCHITECTURE.md`, `docs/ISEOL_LEARNING_SPEC.md`, `docs/ISEOL_FEATURE_INVENTORY.md`, `docs/ISEOL_HANDOVER.md`, `docs/superpowers/plans/2026-09-21-integrated-development.md`.

## Global Constraints

- 기존 자동 개발, Idea Lab, Project Workspace, Web AI, Desktop Agent, Runtime/Harness, Evaluation, Web, Discord, 캘린더, 코드리뷰, GitHub/CI/배포, scrum/음성 공부/잔디, 음악, 공모전/투표/알림, Notion/Figma 연동은 삭제하거나 새 기능으로 대체하지 않는다.
- 현재 존재하는 UNKNOWN, WAITING_EXTERNAL, WAITING_AGENT, contained job과 사용자 작업 트리는 fixture나 자동 재시도 대상으로 취급하지 않는다.
- 사용자 identity는 요청 body의 `userId`가 아니라 서버 principal에서 결정한다. 모든 read/write/event/AI context에 owner 또는 team scope와 ACL을 적용한다.
- 외부 AI API, GitHub push, 운영 배포, Discord 발신, Runtime 교체, stale lock 복구, 데이터 삭제는 별도 승인 없이는 실행하지 않는다.
- AI 제안, 실제 Desktop 변경, 테스트/빌드 evidence, provider 수락, 배포 결과를 서로 다른 durable 기록으로 남긴다. UNKNOWN은 실패나 미실행으로 치환하지 않는다.
- 모든 mutation은 필요한 경우 idempotency key와 expected revision을 사용하고, 원본 답변·평가·성장 기록을 덮어쓰지 않는다.
- AI 방송실 V1은 학습 자료 기반 AI 토론만 지원하고, 영상 파일 내보내기·외부 송출·범용 사회 이슈 토론을 지원한다고 주장하지 않는다.

## Review Focus

- 실행 요청이 claim 후 Run identity를 잃거나 늦은 terminal 결과로 다른 시도의 상태를 덮는 경우 — Task 1의 crash/late-result tests.
- 사용자 A의 ID, 기억, 학습 답변 또는 팀 자료를 사용자 B가 읽거나 AI context에 넣는 경우 — Task 2와 Task 3의 cross-scope tests.
- HTTP 재시도·두 기기·재시작이 계획, 답변, 평가, 성장 award를 중복 생성하는 경우 — Task 4와 Task 5의 idempotency/CAS tests.
- AI가 실행·숙달·실제 기여를 했다고 추정한 내용을 사용자 evidence로 승격하는 경우 — Task 3, Task 4, Task 8의 provenance tests.
- AI 방송이 V1 범위를 넘어 외부 송출하거나 학습 후 기존 session으로 돌아가지 못하는 경우 — Task 6의 capability and resume tests.

## 기능 추적 및 실행 순서

| 단계 | 기능군 | 현재 상태 | 이 계획의 결과 |
|---|---|---|---|
| 0 | Runtime/read model/root/promotion | 구현·격리 검증, 운영 미반영 | 유지. 운영 교체·복구는 승인 경계로 기록 |
| 1 | Project work queue와 Run 일관성 | 부분 구현 | terminal observer, explicit resume, late result protection |
| 2 | 사용자 principal·session·scope | 설계만 | 개인/팀 namespace와 API 인가 기반 |
| 3 | 개인 세계·캐릭터·기억·활동·성장 | 설계만 | private memory와 evidence 기반 growth projection |
| 4 | 학습 최소 흐름 A–F | 설계만 | 3입력→계획→수업→답변→feedback→복습의 fake adapter acceptance |
| 5 | 학습 장기 운영 G–K | 설계만 | plan version, review, adjustment, portfolio/growth link |
| 6 | AI 방송실 V1 | 최신 요구 신규 | 4-character roster, local playback, subtitles/TTS adapter, comprehension check, session resume |
| 7 | 스터디·사람/AI/혼합 팀·모집·교류 | 설계만 | membership/role/privacy/approval 기반 공유 |
| 8 | 포트폴리오·기존 연동 통합 | 부분 구현/외부 미검증 | human/AI provenance와 공개 승인, Calendar/Discord/GitHub 연결 |
| 9 | 실제 브라우저·Runtime·외부 acceptance | 미검증 | 합성 acceptance 후 승인된 단일 live run과 별도 운영 기록 |

### Task 1: Project Run terminal observer와 명시적 resume

**Files:**
- Modify: `src/project-model/work-request.ts`
- Modify: `src/project-model/workspace-run-preparation.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `src/web-control-plane/contracts.ts`
- Modify: `web/app.js`
- Test: `tests/project-work-request.test.ts`
- Test: `tests/project-run-recovery.test.ts`
- Test: `tests/web-control-plane-router.test.ts`

**Interfaces:**
- Consumes: `ProjectWorkRequest.requestedRunId`, `loadHarnessRun()`, `HarnessRunStatus`, `startProjectWorkspaceRun()`.
- Produces: `reconcileProjectWorkRequest()` that reads the exact requested Run and returns `{request, run, execution, transition}` without creating a Run; `POST /api/projects/:projectId/work-requests/:workId/resume` that requires an existing queued/waiting request and an explicit `runId`, `targetRoot`, `expectedRevision`.

- [ ] **Step 1: Write the failing terminal projection tests**

```ts
test("terminal DONE Run projects its linked work request to completed exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-terminal-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Build", objective: "Build", idempotencyKey: "build", id: "work-1", at });
  await updateProjectWorkRequest(root, "project-1", "work-1", { status: "running", requestedRunId: "run-1", runId: "run-1" }, at);
  const first = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "work-1",
    findRun: async () => ({ runId: "run-1", state: { stage: "DONE", status: "DONE" }, updatedAt: at }),
    at: "2026-09-20T12:01:00.000Z",
  });
  const second = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "work-1",
    findRun: async () => ({ runId: "run-1", state: { stage: "DONE", status: "DONE" }, updatedAt: at }),
    at: "2026-09-20T12:02:00.000Z",
  });
  assert.equal(first.request.status, "completed");
  assert.equal(second.request.status, "completed");
  assert.equal(second.transition, "already-completed");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/project-work-request.test.ts`

Expected: FAIL because `reconcileProjectWorkRequest` is not exported.

- [ ] **Step 3: Implement minimal identity-bound reconciliation**

Map only the authoritative Run status: `DONE → completed`, `FAILED_FINAL → failed`, `CANCELLED → cancelled`, `WAITING_EXTERNAL|WAITING_AGENT|BLOCKED_USER → waiting`, and all other present statuses to `running`. If no Run exists, return `unknown` and do not change the request. If the request's stored `requestedRunId` differs from the inspected Run id, reject. Apply a terminal projection only when the request still points to that exact Run; a second observation is a no-op.

- [ ] **Step 4: Add explicit resume route tests before route implementation**

Cover 401 without bearer, 409 on a stale `expectedRevision`, 409 when the request is already running or has no durable Run identity after a claim, and 202/200 only when the same explicit Run identity is reused or newly created by the canonical `startProjectWorkspaceRun` path. Assert that a missing/unknown Run never creates a replacement.

- [ ] **Step 5: Implement route and static UI projection**

Add read-only reconciliation to the existing work-request detail response. Add the resume route with mutation authentication, expected-revision comparison, and no implicit scheduler call. Render `waiting`, `unknown`, `running`, `completed`, and `failed` separately in `web/app.js`; the resume action must be disabled unless the API reports an explicit next action.

- [ ] **Step 6: Run focused regression and build**

Run: `node --import tsx --test tests/project-work-request.test.ts tests/project-run-recovery.test.ts tests/web-control-plane-router.test.ts`; `npm.cmd run build`; `node --check web/app.js`.

- [ ] **Step 7: Commit**

```powershell
git add src/project-model src/web-control-plane web/app.js tests
git commit -m "feat: reconcile project work with durable runs"
```

### Task 2: Principal, session, scope, and private namespace

**Files:**
- Create: `src/identity/contracts.ts`
- Create: `src/identity/store.ts`
- Create: `src/access/scope.ts`
- Create: `src/access/authorization.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/web-control-plane/router.ts`
- Test: `tests/identity-scope.test.ts`
- Test: `tests/web-control-plane-authorization.test.ts`

**Interfaces:** `Principal={userId,sessionId,roles}` is produced only by an authentication adapter; `Scope` is `personal(ownerUserId)` or `team(teamId)`; `authorize(principal, resource, action)` returns allow/deny without trusting body user ids. Legacy operator bearer remains an operator credential and is not auto-mapped to a user.

- [ ] **Step 1: Write RED tests for A/B IDOR, expired session, revoke, path traversal, and legacy isolation.**
- [ ] **Step 2: Run `node --import tsx --test tests/identity-scope.test.ts tests/web-control-plane-authorization.test.ts` and confirm missing module/contract failures.**
- [ ] **Step 3: Implement append-only session/revoke records and scope/path validation with atomic writes under per-aggregate locks.**
- [ ] **Step 4: Thread the principal through learning/project/private routes while keeping existing operator routes explicit and backward-compatible.**
- [ ] **Step 5: Run the new tests, existing router/server tests, and `npm.cmd run build`.**
- [ ] **Step 6: Commit `feat: add user and scope authorization foundation`.**

### Task 3: Personal world, memory, activity, growth, and character projections

**Files:**
- Create: `src/personal-world/contracts.ts`
- Create: `src/personal-world/store.ts`
- Create: `src/memory/contracts.ts`
- Create: `src/memory/store.ts`
- Create: `src/activity/contracts.ts`
- Create: `src/activity/store.ts`
- Create: `src/growth/ledger.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `web/app.js`
- Test: `tests/personal-world.test.ts`
- Test: `tests/memory-scope.test.ts`
- Test: `tests/activity-growth.test.ts`

**Interfaces:** Activity facts require `sourceEventId`, actor type, contribution, verification, and scope. Growth awards use `sourceEventId + ruleVersion` uniqueness; corrections append reversal/superseding events. Memory retrieval accepts an owner/team scope and returns only consented, bounded source summaries.

- [ ] **Step 1: RED tests for private memory retrieval/deletion, AI-vs-human attribution, duplicate award, and reversal.**
- [ ] **Step 2: Implement durable stores and bounded character/world read models; never derive mastery from time or commit count alone.**
- [ ] **Step 3: Add authenticated read/edit/delete endpoints and projection events; ensure deletion removes retrieval eligibility without deleting original audit facts.**
- [ ] **Step 4: Verify with cross-user and restart tests, then build and static UI syntax check.**
- [ ] **Step 5: Commit `feat: add evidence based personal growth`.**

### Task 4: Learning core A–F with local fake adapter acceptance

**Files:**
- Create: `src/learning/contracts.ts`
- Create: `src/learning/store.ts`
- Create: `src/learning/validators.ts`
- Create: `src/learning/service.ts`
- Create: `src/learning/ai-adapter.ts`
- Create: `src/learning/prompts/interpret-goal.ts`
- Create: `src/learning/prompts/curriculum.ts`
- Create: `src/learning/prompts/today-lesson.ts`
- Create: `src/learning/prompts/explanation.ts`
- Create: `src/learning/prompts/exercise.ts`
- Create: `src/learning/prompts/feedback.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `web/index.html`, `web/app.js`, `web/styles.css`
- Test: `tests/learning-contracts.test.ts`
- Test: `tests/learning-service.test.ts`
- Test: `tests/learning-web-control-plane.test.ts`
- Test: `tests/learning-acceptance.test.ts`

**Interfaces:** Implement the exact goal/plan/session/answer/feedback states and API paths in `docs/ISEOL_LEARNING_SPEC.md`. `AiWork` is durable and provider-agnostic; a missing provider returns `503`/`waiting-external` and never fabricates content. The acceptance adapter is explicitly fake and its output is labeled synthetic.

- [ ] **Step 1: RED validation/idempotency/CAS tests for the three required inputs and API mutations.**
- [ ] **Step 2: Implement goal and immutable plan version stores with owner scope, bounded input validation, and expected-revision checks.**
- [ ] **Step 3: Implement A–F template schemas and one correction attempt; preserve UNKNOWN and do not auto-resubmit timeout/rate-limit results.**
- [ ] **Step 4: Implement session actions, append-only answer attempts, feedback states, review creation, and answer-retry lookup by idempotency key.**
- [ ] **Step 5: Connect static UI from free subject input through preview/start/lesson/answer/feedback/reconnect, with accessibility labels and explicit synthetic/provider status.**
- [ ] **Step 6: Run two-user browser-like acceptance with duplicate submit, late response, private scope, and restart checks; then full backend tests/build.**
- [ ] **Step 7: Commit `feat: add scoped learning core`.**

### Task 5: Learning long-running operation G–K, review, adjustment, and links

**Files:**
- Create: `src/learning/prompts/misconception.ts`, `review.ts`, `adjustment.ts`, `report.ts`, `project-application.ts`
- Modify: `src/learning/service.ts`, `src/activity/store.ts`, `src/growth/ledger.ts`, `src/project-model/work-request.ts`
- Modify: `src/web-control-plane/router.ts`, `web/app.js`
- Test: `tests/learning-review-adjustment.test.ts`
- Test: `tests/learning-project-link.test.ts`

- [ ] **Step 1: RED tests for preserved completion records, plan adjustment CAS, due review dedup, project proposal-only behavior, and accepted-link idempotency.**
- [ ] **Step 2: Implement G–K validators and immutable plan/version transition rules.**
- [ ] **Step 3: Add private progress/report projections and opt-in LearningLink records; do not execute a project work request until separately authorized.**
- [ ] **Step 4: Verify fixed-clock/timezone 30-day compressed flows and all previous learning tests.**
- [ ] **Step 5: Commit `feat: connect learning review and project links`.**

### Task 6: AI learning broadcast room V1

**Files:**
- Create: `src/learning-broadcast/contracts.ts`
- Create: `src/learning-broadcast/store.ts`
- Create: `src/learning-broadcast/room-service.ts`
- Create: `src/learning-broadcast/tts-adapter.ts`
- Create: `src/learning-broadcast/subtitle-timeline.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `web/index.html`, `web/app.js`, `web/styles.css`
- Test: `tests/learning-broadcast-room.test.ts`
- Test: `tests/learning-broadcast-ui.test.ts`

**Interfaces:** A `BroadcastRoom` binds one owner, one learning context snapshot, one host and two debaters selected from a four-character pool. It stores turn text, speaker id, subtitle timing, local playback status, comprehension check, and `resumeSessionId`. TTS is a local capability adapter; unavailable TTS yields text/subtitles and a blocker, not a claim of audio completion.

- [ ] **Step 1: RED tests for exactly 4-character roster selection, one host/two debaters, private context filtering, local playback, subtitles, comprehension check, and session resume.**
- [ ] **Step 2: Implement room state machine and bounded dialogue turn schema for learning-only topics; reject external broadcast/export actions in V1.**
- [ ] **Step 3: Add local TTS adapter contract and browser playback controller with interruption/reconnect-safe current turn.**
- [ ] **Step 4: Verify that completion writes a comprehension result and returns to the original learning session without creating a duplicate session.**
- [ ] **Step 5: Commit `feat: add scoped learning broadcast room`.**

### Task 7: Study spaces, human/AI/mixed teams, recruitment, and social boundaries

**Files:**
- Create: `src/teams/*`, `src/study/*`, `src/social/*`, `src/recruitment/*`
- Modify: `src/access/authorization.ts`, `src/activity/store.ts`, `src/web-control-plane/router.ts`, `web/app.js`
- Test: `tests/team-membership-privacy.test.ts`
- Test: `tests/study-recruitment-social.test.ts`

- [ ] **Step 1: RED tests for owner/member/AI role capabilities, invite/leave/revoke, private answer isolation, application≠membership, friend block/report, and duplicate approval.**
- [ ] **Step 2: Implement atomic membership operations and scope-aware shared curriculum/task projections.**
- [ ] **Step 3: Add team execution grants that cannot exceed owner capability and require human approval for external side effects.**
- [ ] **Step 4: Verify with two-user concurrent edits and preserve existing Discord/contest/job behavior.**
- [ ] **Step 5: Commit `feat: add scoped teams studies and recruitment`.**

### Task 8: Evidence-grounded portfolio and existing integrations

**Files:**
- Modify: `src/project-model/portfolio.ts`, `src/project-model/portfolio-store.ts`
- Create: `src/portfolio/provenance.ts`
- Modify: `src/services/calendar/*`, `src/discord-project/*`, `src/services/github*`, `src/idea-lab/*`
- Modify: `src/web-control-plane/router.ts`, `web/app.js`
- Test: `tests/portfolio-provenance.test.ts`
- Test: `tests/integration-delivery-unknown.test.ts`

- [ ] **Step 1: RED tests for human/AI/system claims, broken/private references, user edit/publication approval, provider timeout UNKNOWN, and no resend.**
- [ ] **Step 2: Implement claim provenance and public snapshot generation from verified evidence only; mark AI-written prose as draft.**
- [ ] **Step 3: Connect opt-in calendar/Discord/GitHub events through existing adapters and durable delivery identities without changing old commands.**
- [ ] **Step 4: Run integration fixtures and existing external-adapter regression tests; do not use live credentials.**
- [ ] **Step 5: Commit `feat: ground portfolio and integration evidence`.**

### Task 9: Full product acceptance and separately approved live boundaries

**Files:**
- Create: `docs/iseol-product-acceptance.md`
- Modify only when a failing acceptance creates a RED regression test first.

- [ ] **Step 1: Write the acceptance checklist for existing Idea Lab/Project flows and the new personal/learning/broadcast/team/portfolio flows.**
- [ ] **Step 2: Run `npm.cmd test`, `npm.cmd run build`, `node --check web/app.js`, `git diff --check`, and all new focused suites.**
- [ ] **Step 3: Run synthetic two-user browser acceptance with temporary roots and no live credentials; record durable ids and restart identity equality.**
- [ ] **Step 4: Report remaining external boundaries explicitly. A single live Learning AiWork, Runtime replacement/recovery, Discord delivery, GitHub/Calendar action, push, or deployment requires separate user approval and a bounded stop condition.**
- [ ] **Step 5: Commit only the acceptance evidence; never include tokens, cookies, raw AI output, or private environment values.**

## Rulings

- The absent files named `01_ISEOL_V1_통합제품명세.md`, `02_ISEOL_V1_개발마스터프롬프트.md`, `03_ISEOL_V1_명세추적_검증_인수인계.md`, `05_원문대조_문서검수_개발이관게이트.md`, and `12_학습_복습_AI방송_코딩테스트_상세명세.md` are not treated as available. This plan uses the repository's dated 2026-09-21 product, architecture, learning, inventory, handover, audit, and integrated-development documents; missing AI broadcast details are limited to the user-provided V1 requirements above.
- The current stale Runtime lock and existing UNKNOWN/contained records remain untouched. This costs operational completion speed, but avoids destructive or irreversible recovery without the exact separately approved fingerprint/action.
- The first implementation unit is Task 1 rather than the new learning domains because the approved roadmap makes Run/queue identity and explicit resume a prerequisite for trustworthy project evidence and later growth attribution.
