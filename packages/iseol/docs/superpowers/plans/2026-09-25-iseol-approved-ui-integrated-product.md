# ISEOL Approved UI Integrated Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최신 승인된 ISEOL UI/UX ZIP을 사용자용 애플리케이션의 기준으로 통합하고, 사용자별 데이터·권한·학습·프로젝트 실행·협업·성장·포트폴리오를 실제 저장소와 기존 Runtime/Agent에 연결한다.

**Architecture:** 기존 `web/` Control Plane과 Runtime/Harness/Agent 경계를 보존한다. ZIP의 React/Vite UI는 `user-ui/`에 격리하고, 현재 Control Plane 서버가 제공하는 명시적인 `/app` 사용자 UI 진입점과 사용자 scope가 있는 API를 통해 연결한다. 사용자·팀·프로젝트 데이터는 legacy operator 영역과 분리된 platform root 아래에 저장하며, 운영 Runtime은 ownership이 확인되기 전까지 읽기 전용으로만 관찰한다.

**Tech Stack:** Existing TypeScript/Node/JSON durable stores, Node test runner, React 19, Vite 8, Tailwind CSS 4 from the approved ZIP, Playwright browser verification, existing Harness/Runtime/Desktop Agent.

**Spec:** User-provided attached specification at `C:/Users/user/.codex/attachments/cd7d4930-8949-4562-80ec-a997dfbf26fb/붙여넣은 텍스트.txt`; approved UI artifact `C:/Users/user/Downloads/ISEOL Platform UI_UX Redesign (2).zip` (SHA-256 `CC34AD36A72ADD5CCEB039F783388F0752B08162CE09912EC61896C0CC6B5256`).

## Global Constraints

- Preserve existing `src/harness`, `src/runtime`, `src/desktop-agent`, `src/chatgpt-web`, `src/idea-lab`, `src/project-model`, `src/web-control-plane`, and the existing Control Plane.
- Treat the ZIP's screen structure, tokens, typography, inline SVG character, navigation, and user flows as the approved UI baseline; do not replace it with a generic dark AI dashboard.
- Keep AI broadcast room out of the current implementation scope; preserve any related files and plans.
- Never resend existing UNKNOWN requests or mark UNKNOWN, WAITING_EXTERNAL, WAITING_AGENT, or indeterminate records as success.
- Do not stop, recover, replace, or restart the currently ambiguous Runtime/Agent; use isolated data roots and ports for local integration tests.
- Do not perform external AI requests, external-account mutations, GitHub push, or production deployment without separate approval.
- Every user-owned record must carry an explicit `userId` and scope; team and project access must be checked at the API/store boundary.
- Demo state must be labeled and must never be presented as real activity, AI completion, build success, or growth evidence.
- The existing dirty worktree is user-owned; do not reset, clean, overwrite, or commit unrelated changes.

## Review Focus

- A user must not read or mutate another user's world, memory, learning, project, activity, or portfolio: covered by Task 1 isolation tests.
- Refresh/restart must preserve user-owned records without importing legacy operator data: covered by Tasks 1–3 persistence tests.
- Actual Run and Agent evidence must remain distinct from assistant text or fixture responses: covered by Task 5 project evidence tests.
- Growth and portfolio evidence must be idempotent and actor-attributed: covered by Tasks 4 and 8 ledger tests.
- The UI must expose unavailable, pending, failed, and demo-only states honestly on desktop and mobile: covered by Tasks 2, 6, and 9 browser tests.

---

### Task 1: Establish durable user identity, sessions, and scope-bound storage

**Files:**
- Modify: `src/identity/contracts.ts`
- Modify: `src/identity/store.ts`
- Modify: `src/access/authorization.ts`
- Create: `src/platform-user/contracts.ts`
- Create: `src/platform-user/store.ts`
- Create: `src/platform-user/service.ts`
- Create: `src/web-control-plane/user-router.ts`
- Create: `tests/platform-user-isolation.test.ts`
- Modify: `tests/identity-scope.test.ts`
- Modify: `package.json`

**Interfaces:**
- `createPlatformUser(input: { email: string; displayName: string }): Promise<UserRecord>`
- `createUserSession(input: { userId: string; expiresAt: string }): Promise<SessionRecord>`
- `resolveAuthenticatedPrincipal(token: string): Promise<Principal | null>`
- `assertScopeAccess(principal: Principal, scope: Scope, action: AccessAction): void`
- User records live below `platformRoot/users/<userId>`; team records are not readable through a personal scope.

- [x] **Step 1: Write the failing isolation tests** for two users, expired sessions, path traversal, personal/team scope mismatch, and legacy operator data exclusion in `tests/platform-user-isolation.test.ts`.
- [x] **Step 2: Run the focused test** with `node --import tsx --test tests/platform-user-isolation.test.ts`; confirm failure is caused by missing platform service behavior.
- [x] **Step 3: Implement the minimal durable user/session store** by reusing the existing identity primitives and writing atomically below an isolated platform root.
- [x] **Step 4: Add the API boundary** that resolves the bearer session and rejects missing, expired, wrong-user, and wrong-team access before reading a store.
- [x] **Step 5: Run focused tests and the existing identity/access tests**; fix implementation failures without weakening assertions.
- [x] **Step 6: Run `npm.cmd test` and `npm.cmd run build`; record the fresh counts before moving to Task 2.

### Task 2: Add the approved React user UI without replacing Control Plane

**Files:**
- Create: `user-ui/` from the approved ZIP's source files, preserving `src/components`, `src/pages`, `src/app/routes.ts`, `src/index.css`, and `src/store` as the initial UI baseline.
- Create: `user-ui/package.json`
- Create: `user-ui/vite.config.ts`
- Create: `user-ui/tsconfig.json`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/web-control-plane/router.ts`
- Create: `tests/user-ui-static-serving.test.ts`
- Modify: root `package.json`

**Interfaces:**
- `GET /app` serves the built user UI shell.
- `GET /app/assets/*` serves only the user UI build output.
- Existing `/`, Control Plane APIs, Evaluation, and operator routes remain unchanged.
- User UI API calls use `/api/user/*` and receive explicit `401`, `403`, `404`, and `409` responses.

- [x] **Step 1: Write the static-serving regression test** asserting Control Plane `/` remains unchanged, `/app` is served separately, and missing user assets return a controlled 404.
- [x] **Step 2: Run the focused test** and confirm it fails because `/app` does not yet exist.
- [x] **Step 3: Copy the approved ZIP source into `user-ui/`** without copying its `.git` or overwriting existing root files; keep the archive itself unchanged.
- [x] **Step 4: Install only the ZIP-declared React/Vite/Tailwind dependencies inside `user-ui/`**, then configure its build output to a dedicated generated directory consumed by the existing server.
- [x] **Step 5: Replace demo-only API calls incrementally with an explicit `userApi` adapter**; leave unconnected features labeled unavailable until their backend exists.
- [x] **Step 6: Build the user UI and run the focused static-serving test, then run the root build and test suite.

### Task 3: Persist onboarding, personal world, character, and personal AI context

**Files:**
- Create: `src/personal-world/contracts.ts`
- Create: `src/personal-world/store.ts`
- Create: `src/personal-world/service.ts`
- Create: `src/personal-world/router.ts`
- Create: `src/memory/contracts.ts`
- Create: `src/memory/store.ts`
- Create: `src/memory/service.ts`
- Modify: `user-ui/src/store/userStore.ts`
- Modify: `user-ui/src/pages/Onboarding.tsx`
- Modify: `user-ui/src/pages/MyWorld.tsx`
- Modify: `user-ui/src/pages/Character.tsx`
- Modify: `user-ui/src/pages/AIChat.tsx`
- Create: `tests/personal-world-persistence.test.ts`
- Create: `tests/personal-memory-isolation.test.ts`

**Interfaces:**
- `getWorld(principal: Principal): Promise<WorldRecord>`
- `updateCharacter(principal: Principal, patch: CharacterPatch): Promise<CharacterRecord>`
- `appendPrivateMemory(principal: Principal, input: MemoryInput): Promise<MemoryRecord>`
- `listPrivateMemories(principal: Principal, query: MemoryQuery): Promise<MemoryRecord[]>`
- No memory or onboarding value is stored in process-only UI state.

- [x] **Step 1: Write failing persistence and cross-user memory tests** covering onboarding, refresh/reload, update, delete, and user B denial.
- [x] **Step 2: Run only those tests and observe the expected missing-store failures.
- [x] **Step 3: Implement atomic JSON stores with user-bound paths and schema validation.
- [x] **Step 4: Add user API routes and map the approved UI's onboarding/world/character actions to them.
- [x] **Step 5: Remove demo-only profile mutation from the production path; show an explicit unavailable state if the API is offline.
- [x] **Step 6: Run focused tests, root tests, user UI build, and a browser refresh/reconnect check against an isolated local server.

### Task 4: Implement activity events and evidence-based character growth

**Files:**
- Create: `src/activity/contracts.ts`
- Create: `src/activity/store.ts`
- Create: `src/activity/service.ts`
- Create: `src/growth/contracts.ts`
- Create: `src/growth/ledger.ts`
- Create: `src/growth/read-model.ts`
- Create: `src/growth/router.ts`
- Modify: `user-ui/src/pages/MyWorld.tsx`
- Modify: `user-ui/src/pages/Character.tsx`
- Modify: `user-ui/src/pages/Portfolio.tsx`
- Create: `tests/activity-growth-ledger.test.ts`

**Interfaces:**
- `recordActivityEvent(input: ActivityEventInput): Promise<ActivityEvent>`
- `applyGrowthProjection(input: ActivityEvent): Promise<GrowthLedgerEntry | null>`
- `getGrowthSnapshot(principal: Principal): Promise<GrowthSnapshot>`
- Idempotency key is `(userId, sourceType, sourceId, eventType, eventVersion)`.

- [x] **Step 1: Write failing tests for actor attribution, duplicate event rejection, correction/retraction, and no growth from unverified fixture data.
- [x] **Step 2: Run the focused test and confirm the ledger is missing.
- [x] **Step 3: Implement durable event and growth stores with provenance and idempotency.
- [x] **Step 4: Add projections for verified learning and project events only.
- [x] **Step 5: Connect My World and Character read models to the growth API; reserve the provenance-based Portfolio surface for Task 8.
- [x] **Step 6: Run focused tests, full root tests, and browser checks for reload and duplicate submission.

### Task 5: Implement learning, review, code analysis, and coding-test records

**Files:**
- Create: `src/learning/contracts.ts`
- Create: `src/learning/store.ts`
- Create: `src/learning/service.ts`
- Create: `src/learning/router.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `user-ui/src/pages/AIChat.tsx`
- Create: `tests/learning-persistence.test.ts`
- Create: `tests/learning-review-flow.test.ts`

**Interfaces:**
- `createLearningPlan(principal: Principal, input: LearningPlanInput): Promise<LearningPlan>`
- `startLearningSession(principal: Principal, planId: string): Promise<LearningSession>`
- `recordStudyAttempt(principal: Principal, input: StudyAttemptInput): Promise<StudyAttempt>`
- `createReviewItem(principal: Principal, input: ReviewItemInput): Promise<ReviewItem>`
- `analyzeCodeForLearning(principal: Principal, input: CodeAnalysisInput): Promise<CodeAnalysisResult>`

- [x] **Step 1: Write failing tests for plan creation, session resume, answer isolation, review scheduling, and persistent code-analysis provenance.
- [x] **Step 2: Run focused tests and confirm missing learning domain behavior.
- [x] **Step 3: Implement durable learning records with private scope enforcement.
- [x] **Step 4: Connect the approved Learning UI inputs to the real API and distinguish unavailable local AI from completed local-static analysis.
- [x] **Step 5: Emit verified learning activity events only after persistence succeeds.
- [x] **Step 6: Run focused tests, root suite, UI build, and browser refresh/resume checks.

Task 5 note: learning sessions now have an explicit owner-bound completion transition. The existing session identity is preserved, repeat completion returns the durable completed record, `completedAt` is persisted, and one verified user-attributed `learning.session.completed` ActivityEvent is recorded only after the session write. Runtime composition injects the owner-scoped GrowthService so the existing +100 learning XP projection is applied once; direct post-completion attempts are rejected. The Learning UI renders the completed state and prevents additional attempts. Focused completion/API/UI checks pass `1/1`, `1/1`, and `1/1`; serial user-product `83/83`; isolated browser E2E reports `learningSessionCompletion: passed`; final root `648/648`, TypeScript, root/UI builds, and diff checks pass. Live AI tutoring and AI broadcast-room behavior remain separate deferred/unverified boundaries.
Task 5 coding-test update: added a bounded local learning slice for coding exercise and answer records. Exercises are owner-bound and may reference an active learning session; attempts are append-only, restart-readable, and idempotent by `clientRequestId`. The durable result explicitly remains `environment-required` with no executor or test receipt, so the UI does not claim a pass or verified mastery. Added service/API/UI tests and an isolated browser assertion for create → select → answer save → visible environment-needed state. Runtime sandbox execution, evaluator feedback, and growth projection remain future work requiring an approved isolated executor boundary.
Task 3 AI-context update: the private AI conversation path now passes a bounded owner-only memory snapshot to the injected local Runtime dispatcher after message persistence. The loopback Ollama adapter formats that snapshot into the user prompt only when explicitly enabled; no external or operational Runtime was contacted. Focused AI tests pass `11/11`, serial user-product `88/88`, TypeScript/build pass, and the final root suite remains `648/648`. Learning/project/activity context permissions and live local model generation remain unverified/open.

### Task 6: Bind user projects to existing Project Work, Harness, Runtime, and Agent

**Files:**
- Modify: `src/project-model/contracts.ts`
- Modify: `src/project-model/work-request.ts`
- Modify: `src/web-control-plane/router.ts`
- Create: `src/project-model/user-project-service.ts`
- Create: `src/project-model/evidence-service.ts`
- Modify: `user-ui/src/pages/IdeaLab.tsx`
- Modify: `user-ui/src/pages/Projects.tsx`
- Create: `tests/user-project-execution.test.ts`
- Create: `tests/project-evidence-attribution.test.ts`

**Interfaces:**
- `createUserProject(principal: Principal, input: ProjectInput): Promise<ProjectRecord>`
- `requestProjectRun(principal: Principal, input: RunRequestInput): Promise<RunRequest>`
- `resumeProjectRun(principal: Principal, input: ResumeInput): Promise<RunRecord>`
- `getProjectEvidence(principal: Principal, projectId: string): Promise<ProjectEvidenceView>`
- Existing Run reconciliation remains the authority for late terminal results and duplicate suppression.

- [x] **Step 1: Write failing tests for user/project ownership, approval requirement, late Run reconciliation, UNKNOWN preservation, and Artifact provenance.
- [x] **Step 2: Run focused tests against an isolated temp dataRoot and verify failure before production changes.
- [x] **Step 3: Add user/project identity binding to existing project stores without reassigning legacy operator records.
- [x] **Step 4: Wire user UI project creation, work request, approval, status, artifact, revision, and preview states to existing APIs.
- [x] **Step 5: Use only isolated Runtime/Agent fixtures for local execution tests; do not submit work to the current ambiguous Runtime.** (The composed project journey now also starts the real local Desktop Core WebSocket service and an isolated authenticated Agent for CONTEXT/TEST execution.)
- [x] **Step 6: Run focused project tests, root suite, user UI build, and browser checks for success, failure, UNKNOWN, and waiting states.

Task 6 note: the isolated implementation creates durable owner-bound Project Workspace records and idempotent work requests, including the physical owner-bound `workspaceRoot` consumed by Run preflight. Accepted isolated Runtime execution preserves `projectId`/`runId`, attaches the Run to the workspace tree, and exposes only evidence carrying both matching identities. The browser verification intentionally exercised the no-Runtime path and confirmed `Project Runtime is not configured` without fake Run success; a separate temporary-root composition test now verifies CONTEXT/TEST through the real local Desktop Core and authenticated Agent boundary. `UserProjectView.lifecycle` now projects explicit Artifact/Revision/Deployment evidence from the same bound records and keeps missing stages empty. Waiting Runs now have an owner-approved resume path that preserves Run identity and stage, writes a status event/checkpoint, and reuses the existing Runtime enqueue boundary; team viewers remain unable to mutate it. Terminal success/resume through operational Runtime PID `1708` remains Runtime-owned and was not submitted.

### Task 7: Implement teams, study recruitment, social profiles, friends, chat, and collaboration ACL

**Files:**
- Create: `src/teams/contracts.ts`
- Create: `src/teams/store.ts`
- Create: `src/teams/service.ts`
- Create: `src/social/contracts.ts`
- Create: `src/social/store.ts`
- Create: `src/social/service.ts`
- Create: `src/recruitment/contracts.ts`
- Create: `src/recruitment/store.ts`
- Create: `src/recruitment/service.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `user-ui/src/pages/Community.tsx`
- Modify: `user-ui/src/pages/Friends.tsx`
- Create: `user-ui/src/pages/Profile.tsx`
- Create: `tests/team-membership-acl.test.ts`
- Create: `tests/recruitment-flow.test.ts`
- Create: `tests/user-ui-profile-contract.test.ts`

**Interfaces:**
- `createTeam(principal: Principal, input: TeamInput): Promise<TeamRecord>`
- `applyToRecruitment(principal: Principal, input: ApplicationInput): Promise<ApplicationRecord>`
- `changeMembership(input: MembershipChange): Promise<MembershipRecord>`
- `sendDirectMessage(principal: Principal, input: MessageInput): Promise<MessageRecord>`
- Team membership changes immediately affect project and chat access.

- [x] **Step 1: Write failing cross-user tests for recruitment, accept/reject/leave, team project access, direct messages, and post-leave denial.
- [x] **Step 2: Run focused tests and verify missing team/social stores.
- [x] **Step 3: Implement durable stores with explicit membership roles and ACL checks.
- [x] **Step 4: Connect approved UI pages and expose pending/denied/empty states without fake counts. (Teams/Friends/Community and the durable Profile surface are API-backed; isolated browser verification remains.)
- [x] **Step 5: Emit actor-attributed collaboration events only for persisted actions.
- [x] **Step 6: Run focused tests, root suite, and browser flows with two isolated user sessions.** (Two-context world/community/portfolio flows and private team ACL now pass; live Runtime/Agent execution remains a separate boundary.)

### Task 8: Build provenance-based portfolio editing and export

**Files:**
- Modify: `src/project-model/portfolio-store.ts`
- Create: `src/portfolio/contracts.ts`
- Create: `src/portfolio/service.ts`
- Create: `src/portfolio/router.ts`
- Modify: `user-ui/src/pages/Portfolio.tsx`
- Create: `tests/portfolio-provenance.test.ts`

**Interfaces:**
- `createPortfolioEntry(principal: Principal, input: PortfolioEntryInput): Promise<PortfolioEntry>`
- `updatePortfolioEntry(principal: Principal, input: PortfolioUpdate): Promise<PortfolioEntry>`
- `exportPortfolio(principal: Principal, format: "json" | "markdown"): Promise<ExportedPortfolio>`
- Every evidence item includes source record, actor type, verification status, and visibility.

- [x] **Step 1: Write tests for user/AI attribution, evidence visibility, private/public access, export contents, and unsupported evidence exclusion. (The actor matrix is covered by `tests/portfolio-actor-attribution.test.ts`; external/live evidence remains out of scope.)
- [x] **Step 2: Run focused tests and verify the current project-only portfolio is insufficient.
- [x] **Step 3: Implement user-bound portfolio records and provenance validation.
- [x] **Step 4: Connect the approved Portfolio UI to durable editing and export endpoints. (Create/edit/export, public preview, and visible share-link control are connected.)
- [x] **Step 5: Add activity and learning evidence projections without inventing metrics.
- [x] **Step 6: Run focused tests, root suite, build, and browser preview/export checks. (Create/reload, JSON export trigger, public preview, tokenless public route/API, and two-context public portfolio access are verified; private team ACL remains separately tracked.)

### Task 9: Complete user UI states, responsive behavior, accessibility, and Control Plane boundary

**Files:**
- Modify: `user-ui/src/components/Navigation.tsx`
- Modify: `user-ui/src/components/UI.tsx`
- Modify: `user-ui/src/index.css`
- Modify: all `user-ui/src/pages/*.tsx` where API state wiring requires it
- Modify: `src/web-control-plane/server.ts`
- Create: `tests/user-ui-api-boundary.test.ts`
- Create: `tests/user-ui-browser.e2e.test.ts`

**Interfaces:**
- Loading, empty, unauthorized, forbidden, unavailable, pending, failed, and success states are explicit components.
- Control Plane routes remain operator-only and are not exposed as user-world data.
- Mobile breakpoints cover 390px, 768px, 1024px, and 1440px.

- [x] **Step 1: Write failing browser/API tests for auth boundaries, navigation, disabled unavailable actions, reload persistence, and responsive route access.** (Existing API/static boundary coverage was extended with a RED-then-green authenticated-shell contract, truthful My World mission state contract, and unavailable integration contract; the isolated browser runner now covers the corresponding route behavior and reload matrix.)
- [x] **Step 2: Run browser tests against a safe isolated local server and confirm failures before UI wiring.** (The new UI contracts first failed before implementation; the isolated runner then verified the wired behavior in a fresh temporary server and headless browser context. A selector-only browser failure was corrected against the approved login heading and was not treated as a product pass.)
- [x] **Step 3: Replace remaining fake progress, fake success, and uncontrolled demo counts with explicit state adapters.** (My World missions now distinguish `recorded` durable data from `next-action` user work; the reusable MissionItem no longer accepts fabricated progress/XP; Settings exposes only runtime-unknown, unavailable, and coming states with no non-functional disconnect action. Landing and selected integration surfaces remain explicitly static/deferred where no durable connector exists.)
- [x] **Step 4: Add keyboard focus, labels, accessible names, reduced-motion behavior, and mobile navigation using the approved ZIP tokens.** (Responsive layout tokens, focus-visible treatment, navigation labels, reduced-motion handling, and the real Teams navigation link are implemented and contract/browser checked.)
- [x] **Step 5: Run browser tests at all required viewport sizes and capture only actual results.** (The isolated runner checks 13 authenticated user routes with no horizontal overflow at 390/768/1024/1440px; operator UI and unlisted route variants remain outside this matrix.)
- [x] **Step 6: Run root tests, user UI build, and static serving verification.** (SPA route fallback, user/operator API boundary, static serving, root `648/648`, user-product `127/127`, TypeScript build, approved UI build, and fresh browser route/viewport evidence are verified.)

### Task 10: Integrated end-to-end verification and durable handover

**Files:**
- Create: `tests/iseol-user-journeys.test.ts`
- Create: `scripts/iseol-user-ui-e2e.ts`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Create: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-25-iseol-approved-ui-integrated-product.md`

**Interfaces:**
- Isolated E2E setup creates two local users and separate test data roots.
- E2E scenarios cover onboarding/world, project execution, learning/growth, collaboration, private memory, and operator/user state divergence.
- The development log records exact files, commands, outcomes, blockers, and unverified items without secrets.

- [x] **Step 1: Write end-to-end scenario tests for the required cross-domain user journeys.
- [x] **Step 2: Run the scenario against an isolated local HTTP server; the first implementation run passed without requiring a production behavior fix.
- [x] **Step 3: No production behavior fix was needed in this slice; the scenario exercises the already-owned service boundaries and preserves the Runtime waiting result.
- 2026-09-26 continuation: the AI Chat service now has an optional, explicitly injected local Runtime dispatcher. Completed responses are persisted with user/conversation/message attribution; accepted work can complete later through a user-bound durable callback; absent, waiting, or failed dispatch remains honest `waiting_runtime`. The operational Runtime remains unconnected pending ownership and approved-context decisions.
- [x] **Step 4: Re-run focused, integration, and full regression tests after every cross-domain fix.** (Latest composed Runtime integration `2/2`, user-product `75/75`, and root `648/648` pass.)
- [x] **Step 5: Run fresh `npm.cmd test`, `npm.cmd run build`, user UI build, and browser E2E verification.** (Root build and approved UI build pass with only existing Vite warnings; browser runner verifies two contexts, private-team ACL, public portfolio/export, 13 routes, and 390/768/1024/1440px containment.)
- [x] **Step 6: Inspect Git diff and runtime/data roots, update the handover log, and report verified versus unverified scope.** (Operational PID/ports and stale lock were rechecked read-only; isolated local Core/Agent execution was verified separately; no Runtime restart, UNKNOWN replay, external call, data deletion, push, or deployment occurred.)

2026-09-26 continuation: the private AI context now honors the persisted `aiAccess.learningHistory` permission, with bounded owner-scoped session/attempt payloads and fail-closed behavior; focused AI `12/12`, user-product `89/89`, and root `648/648` pass. The same full regression exposed and then verified a Windows transient atomic-rename boundary in Harness Run persistence; `src/harness/run-store.ts` now retries the existing bounded rename helper and cleans failed temporary files. Focused integration/storage checks `10/10` and the subsequent root suite `648/648` pass. No operational Runtime/Agent/browser or UNKNOWN state was changed.
2026-09-26 continuation: added the latest learning-spec minimum-input `LearningGoal` draft flow alongside the existing legacy LearningPlan. The owner-bound API/UI persists and reloads `subjectText`, `duration`, and `dailyMinutes` with bounded validation; focused goal/API/UI `4/4`, user-product `93/93`, root `648/648`, builds, and browser `learningGoalDraftPersistence: passed`. AI interpretation, PlanVersion generation, and live Runtime-backed content remain follow-up work.
2026-09-26 continuation: added the first non-AI plan-preview slice for the new LearningGoal contract. `GoalInterpretation` and immutable `LearningPlanVersion` records are owner-bound and durable, carry explicit `local-template` provenance, bounded assumptions/outcomes/exclusions, daily activity budgets, checkpoints, and revision/idempotency behavior. Authenticated API/UI and isolated browser verification cover draft → reload → preview; focused `4/4`, user-product `98/98`, root `648/648`, builds, and `learningPlanPreviewPersistence: passed`. This does not claim local-model AI interpretation, active plan selection, timezone-complete scheduling, session/content linkage, or coding evaluation.
2026-09-26 continuation: connected preview to a real first-day session activation. The owner-approved `start` route is revision-bound, validates the selected PlanVersion/day, activates the goal/version, and persists a reusable `LearningSession` while leaving content explicitly `not-requested`. UI/browser now cover draft → preview → start day → complete session; focused `4/4`, user-product `102/102`, root rerun `648/648`, builds, and `learningGoalDaySession: passed`. The initial full-root live-smoke timeout was isolated (`14/14`) and the next full suite passed; no operational Runtime/UNKNOWN/external/broadcast state was changed.
2026-09-26 continuation: connected an activated goal day to a durable today-content request without fabricating AI output. The private request stores template/version/input hash/budget, becomes `waiting-runtime` when no local content dispatcher is configured, and is idempotently restored through GET/reload. An injected local dispatcher can complete later via an owner-bound callback; lesson blocks are validated against source identity, ids, allowed kinds, text limits, and the day time budget before `validated` content is persisted. Focused content/API/UI `4/4`, user-product `106/106`, root/UI builds, and browser `learningGoalContentRequest: passed` pass. The operational Runtime, stale lock/UNKNOWN state, external providers, and deferred broadcast-room files remain untouched.
2026-09-26 continuation: added the learning action and answer receipt boundary. Session `self-report` actions are stored without mastery claims; explanation/example/hint actions remain Runtime-waiting when no local action dispatcher exists. Coding answers bind to the owner/session/exercise/attempt and create an idempotent `evaluation-pending` receipt plus separate `pending` feedback. Focused action/API/UI `4/4`, user-product `110/110`, root `648/648`, builds, and browser `learningAnswerEvaluationPending: passed` pass. Runtime action completion, evaluator feedback/disputes, verified mastery, and operational Runtime ownership remain open.
2026-09-26 continuation: added the evidence-only learning progress read model and UI panel. `GET /api/user/learning/goals/:goalId/progress` is owner-bound, restart-readable, and separates planned days, actual goal sessions, verified/unverified attempts, self-reports, Runtime-waiting actions, evaluator pending states, goal-bound due reviews, and evidence ids. No percentage or mastery claim is returned. Focused progress/API/UI tests pass `4/4`, user-product `114/114`, root `648/648`, builds pass, and isolated browser E2E reports `learningProgressEvidence: passed`. Authenticated requests use persisted account timezone, with a visible fallback for direct principals that have none; local evaluator/action Runtime completion and operational Runtime ownership remain open.
2026-09-26 continuation: added the timezone-aware `GET /api/user/learning/goals/:goalId/today` read model and Learning UI state. It reads the current plan day and existing session only, returns `available`/`active`/`content-pending`/`completed`/`locked`, and never creates a session or fabricates AI output. Focused today/progress/UI `7/7`, user-product `117/117`, root `648/648`, builds, and browser `learningTodayState: passed` pass. AI broadcast-room work remains deferred.

2026-09-26 continuation: added the bounded learning feedback dispute flow. A user-owned `LearningFeedbackDispute` preserves the reason, transitions the related answer and feedback to `disputed`, and reports `waiting-runtime` until evaluator-backed re-evaluation exists. Focused dispute tests `3/3`, serial user-product `120/120`, root `648/648`, root/UI builds, and isolated browser `learningFeedbackDispute: passed` verify the slice. The operational Runtime, UNKNOWN records, external providers, and deferred broadcast-room files remain untouched.

2026-09-26 continuation: added the bounded structured learning evaluator boundary. An explicitly injected local `LearningFeedbackDispatcher` validates immutable answer/attempt identity, rubric/evaluator versions, criteria/evidence limits, misconceptions, and next action before storing feedback. Missing verifier evidence prevents a `verified` claim and leaves the result `tentative`; waiting/failure preserves `evaluation-pending`. Focused evaluator/UI `3/3`, user-product `123/123`, root `648/648`, root/UI builds, and browser E2E pass. Live evaluator/verifier execution, dispute re-evaluation, operational Runtime, UNKNOWN records, and deferred broadcast-room files remain untouched.

2026-09-26 continuation: connected the same injected evaluator to disputed feedback. Re-evaluation preserves the prior evaluation in `evaluationHistory`, projects the new version, returns the answer to `feedback-ready`, and marks the dispute `recorded`; without the dispatcher it remains `waiting-runtime`. Focused `1/1`, user-product `124/124`, root `648/648`, builds, and browser E2E pass. Operational Runtime, UNKNOWN records, external providers, and deferred broadcast-room files remain untouched.

### Task 11: Add the opt-in loopback local learning Runtime boundary

**Files:**
- Create: `src/learning/local-runtime.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Create: `tests/learning-local-runtime.test.ts`

- [x] **Step 1: Write RED tests for disabled/default configuration, loopback-only endpoints, private structured content requests, structured evaluation callbacks, and honest malformed/unavailable responses.**
- [x] **Step 2: Implement the Ollama adapter with bounded JSON transport and no external/public endpoint support.**
- [x] **Step 3: Inject it into the composed Runtime only when `ISEOL_LEARNING_RUNTIME_ENABLED=true`; keep existing owner-bound validation and durable completion authoritative.**
- [x] **Step 4: Run focused learning tests, user-product regression, root regression, builds, and isolated browser journeys.** (Focused local-learning checks `9/9`, user-product `131/131`, root `648/648`, builds, and browser E2E pass.)

Live local model generation/evaluation and verifier-backed evidence remain explicitly unverified because no model call was authorized or needed for isolated validation.

### Task 12: Make live-smoke timeout cleanup idempotent

**Files:**
- Modify: `scripts/idea-lab-live-smoke.ts`
- Verify: `tests/idea-lab-live-smoke.test.ts`

- [x] **Step 1: Reproduce the bounded-disposal failure under the full concurrent root suite and isolate it from the learning Runtime changes.**
- [x] **Step 2: Prevent a timed-out restart disposal from being invoked again by the finalizer.**
- [x] **Step 3: Re-run focused live-smoke tests and the full root suite.** (Focused `14/14`; root `648/648`.)

### Task 13: Connect local Runtime responses for learning actions

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/local-runtime.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `tests/learning-local-runtime.test.ts`
- Modify: `tests/learning-actions-answers.test.ts`

- [x] **Step 1: Write RED coverage for private structured action prompts and owner-bound completion.**
- [x] **Step 2: Add durable `recorded` action responses with local-runtime attribution while keeping self-report separate.**
- [x] **Step 3: Wire the adapter only behind the explicit loopback local-learning Runtime gate.**
- [x] **Step 4: Verify focused action checks `8/8`, user-product `133/133`, root `648/648`, build, and browser E2E.**

Live local model calls and UI display of generated action responses remain unverified; no operational Runtime call was made.

### Task 14: Render durable learning action states in the approved UI

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `tests/user-ui-learning-actions-answers-contract.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Add RED UI contract coverage for help requests, action history, and explicit waiting/recorded labels.**
- [x] **Step 2: Connect explanation/example/hint controls to the authenticated action API and reloadable action list.**
- [x] **Step 3: Keep self-report separate and never present a Runtime response as mastery or verified growth.**
- [x] **Step 4: Run focused UI contract `1/1`, user-product `133/133`, UI build, and isolated browser E2E.** (Browser reports `learningActionWaiting: passed`.)

Live local model response rendering remains pending until an explicit local Runtime is enabled; no operational request was made.

### Task 15: Expose a safe authenticated Runtime capability status

**Files:**
- Modify: `src/web-control-plane/user-router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Settings.tsx`
- Modify: `tests/user-ui-integrations-contract.test.ts`
- Create: `tests/user-runtime-status-api.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Add RED coverage for authentication, capability-state projection, and absence of operator/runtime internals.**
- [x] **Step 2: Reuse the existing composed local Runtime capability and return only a bounded user-facing snapshot.**
- [x] **Step 3: Render ready/blocked/disabled/unknown states in the existing approved integration surface without adding fake connection actions.**
- [x] **Step 4: Verify focused tests `3/3`, user-product `135/135`, full root `648/648`, TypeScript/root/UI builds, diff check, and isolated browser `runtimeStatusSurface: passed`.**

The live operational Runtime remains read-only and unmodified. A full-root attempt exposed a Windows worker-load race in the live-smoke test watchdog; the watchdog was widened above the 5ms bounded cleanup budget, the focused file passes `14/14`, and the fresh full-root regression passes `648/648`.

### Task 16: Verify the private AI Chat surface through two isolated browser contexts

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Create: `tests/user-ui-ai-chat-contract.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add a UI contract for durable private conversation actions and truthful `waiting_runtime` display.**
- [x] **Step 2: Exercise account-A conversation creation, message persistence, reload recovery, and account-B non-visibility in the isolated browser runner.**
- [x] **Step 3: Include the contract in `test:iseol-user-product` and verify product regression `136/136`, approved UI build, and browser `privateAiChatPersistenceIsolation: passed`.**

This task verifies the existing persistence/isolation boundary only; it does not claim live local model output or operational Runtime ownership.

### Task 17: Connect owner-scoped activity export to Settings

**Files:**
- Modify: `src/growth/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Settings.tsx`
- Create: `tests/activity-export-api.test.ts`
- Modify: `tests/user-ui-settings-contract.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`

- [x] **Step 1: Add RED coverage for authenticated JSON/Markdown export, user isolation, invalid format rejection, and the Settings contract.**
- [x] **Step 2: Implement the export from the existing owner-bound activity ledger and connect the Settings button to a browser download.**
- [x] **Step 3: Verify focused tests `2/2`, serial user-product `137/137`, root `648/648`, root/UI builds, diff check, and browser `activityExportDownload: passed`.**

Account deletion remains deferred because the durable recovery policy and irreversible-action approval flow are not implemented. The export does not touch operational Runtime state or external providers.

### Task 18: Verify private friend messaging through two user browser contexts

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Create: `tests/user-ui-friends-contract.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add a UI contract for profile search, friendship request/acceptance, direct-message loading, and save/error states.**
- [x] **Step 2: Exercise account-A request, account-B acceptance, account-A message send, and account-B reload recovery in the isolated browser runner.**
- [x] **Step 3: Verify serial user-product regression `138/138` and browser `privateFriendMessagingPersistence: passed` with the existing two-account and responsive journeys.**

This verifies the existing local social boundary; production notification delivery, multi-device synchronization, and external service integration remain separate open checks.

### Task 19: Verify private memory vault CRUD and isolation in the browser

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Reuse the existing memory UI/API contract and add a two-account browser journey for save, edit, delete, and reload.**
- [x] **Step 2: Keep the journey owner-scoped and assert account B never sees account A's memory.**
- [x] **Step 3: Verify browser `privateMemoryCrudIsolation: passed` with the existing local route and responsive matrix.**

The local AI adapter remains disabled/unavailable on this machine, so CRUD and context-boundary evidence does not claim live answer generation.

### Task 20: Derive evidence-backed growth achievements

**Files:**
- Modify: `src/growth/contracts.ts`
- Modify: `src/growth/read-model.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/MyWorld.tsx`
- Modify: `user-ui/src/pages/Character.tsx`
- Create: `tests/growth-achievements.test.ts`
- Modify: `tests/activity-growth-ledger.test.ts`
- Modify: `tests/user-ui-character-contract.test.ts`
- Modify: `tests/user-ui-my-world-contract.test.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Add RED coverage for verified-only, idempotent, retractable achievement evidence.**
- [x] **Step 2: Project a bounded earned-achievement catalog from net-positive growth ledger entries with provenance.**
- [x] **Step 3: Render earned achievements only in the approved text surface without inventing missing final badge artwork or locked unlock rules.**
- [x] **Step 4: Verify product regression `139/139`, root/UI builds, and browser `growthAchievementsPersistenceIsolation: passed`.**

The repository still lacks an approved final achievement catalog and artwork mapping; this task intentionally exposes stable data keys and truthful earned states without treating placeholder emoji/text as final visual approval.

### Task 21: Verify project approval and truthful no-Runtime waiting in the browser

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Exercise owner project/work-request creation and build-run approval through the approved Project Workspace UI.**
- [x] **Step 2: Confirm approval cancel sends no request and approval against a no-enqueue Runtime persists `waiting` with the explicit blocker.**
- [x] **Step 3: Confirm reload persistence, absence of a resume action without a durable Run identity, and account-B project isolation.**
- [x] **Step 4: Verify browser `projectApprovalWaiting: passed` with the existing two-account and responsive matrix.**

The browser slice intentionally does not claim a successful Run or live Runtime/Agent execution. Resume behavior for an already-created waiting Run remains covered by isolated service/API tests and requires an explicitly configured execution boundary.

### Task 22: Enforce trusted ownership of verified activity

**Files:**
- Modify: `src/growth/router.ts`
- Modify: `tests/activity-growth-api.test.ts`
- Modify: `tests/activity-export-api.test.ts`
- Modify: `tests/iseol-user-journeys.test.ts`

- [x] **Step 1: Add RED coverage proving a user API client cannot submit verified evidence directly.**
- [x] **Step 2: Reject client-submitted verified activity while preserving owner-scoped unverified/unknown export behavior.**
- [x] **Step 3: Replace the integrated journey's manual verified event with actual learning-session completion and verified-event lookup.**
- [x] **Step 4: Verify focused tests `3/3`, product regression `139/139`, root regression `648/648`, root/UI builds, and browser E2E.**

This preserves evidence-based growth and portfolio integrity: verified activity is service-owned, while client-reported activity remains explicitly non-verified.

### Task 23: Add permission-aware project and activity context to personal AI

**Files:**
- Modify: `src/ai-chat/contracts.ts`
- Modify: `src/ai-chat/service.ts`
- Modify: `src/ai-chat/local-runtime.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `tests/ai-chat-runtime-dispatch.test.ts`
- Modify: `tests/ai-chat-local-runtime.test.ts`

- [x] **Step 1: Add RED coverage for owner/team-visible project context, verified-only activity context, and independent permission revocation.**
- [x] **Step 2: Project bounded context through existing ACL services without exposing workspace roots or raw files.**
- [x] **Step 3: Project only active verified activity and render both optional sections in the loopback-only local adapter.**
- [x] **Step 4: Verify focused AI `11/11`, product `140/140`, root `648/648`, root/UI builds, and browser E2E.**

Live local model generation remains unverified and requires an available approved local model; this task does not enable or install one.

### Task 24: Verify AI permission persistence and account isolation in the browser

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Toggle project-file and activity-timeline AI permissions off for account A through the approved Settings UI.**
- [x] **Step 2: Reload and confirm both disabled values persist.**
- [x] **Step 3: Confirm account B retains independent enabled defaults.**
- [x] **Step 4: Verify browser `settingsPermissionPersistenceIsolation: passed` with the existing two-account and responsive matrix.**

This is isolated local browser evidence; it does not claim live local model output or operational Runtime policy execution.

### Task 25: Verify the approved portfolio share controls in the browser

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Create a public evidence-backed portfolio entry through the durable API boundary.**
- [x] **Step 2: Use the visible `공개 링크 복사` control and verify truthful clipboard/fallback status.**
- [x] **Step 3: Use `공개 포트폴리오 열기` and confirm the tokenless public route still exposes only the non-private entry.**
- [x] **Step 4: Verify browser `publicPortfolioShareControl: passed` with the existing two-account and responsive matrix.**

Private entries remain excluded from share controls and public reads.

### Task 26: Verify learning review scheduling in the browser

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Save a review question and answer through the approved Learning UI.**
- [x] **Step 2: Complete the due review with the `이해함` quality action and confirm the queue clears.**
- [x] **Step 3: Read the durable future schedule and assert the first-review interval is two days.**
- [x] **Step 4: Verify browser `learningReviewScheduling: passed` with the existing learning, portfolio, two-account, and responsive matrix.**

The review action records spaced-review scheduling only; it does not claim AI evaluation or mastery.

### Task 27: Add the bounded local Runtime learning-plan proposal boundary

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/local-runtime.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `tests/learning-plan-preview.test.ts`
- Modify: `tests/learning-local-runtime.test.ts`

- [x] **Step 1: Add RED coverage for runtime proposal dispatch, private request context, idempotent persistence, and waiting/invalid no-mutation behavior.**
- [x] **Step 2: Preserve the default local-template path and add an explicit optional `LearningPlanDispatcher` composition point.**
- [x] **Step 3: Validate strict proposal fields, segment coverage, day continuity, activity/time budgets, and final checkpoint before durable writes.**
- [x] **Step 4: Verify focused learning `10/10`, serial product `143/143`, TypeScript build, and approved UI build.**

This task does not enable a model, replay UNKNOWN work, call an external provider, or claim live AI planning quality. The local Runtime remains an explicit opt-in boundary.

### Task 28: Surface learning plan provenance without redesigning the approved screen

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `tests/user-ui-learning-plan-preview-contract.test.ts`

- [x] **Step 1: Add RED coverage requiring the preview UI to read durable interpretation provenance.**
- [x] **Step 2: Accept both template and explicitly validated local-runtime plan source versions in the user API types.**
- [x] **Step 3: Render the source kind dynamically inside the existing approved Learning preview surface.**
- [x] **Step 4: Verify UI contract `1/1`, product `143/143`, TypeScript/UI builds, and browser `learningPlanPreviewPersistence: passed`.**

No new visual system, external connection, live model, or deferred AI Broadcast Room scope was introduced.

### Task 29: Preserve evidence across accepted learning plan adjustments

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/store.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `tests/learning-plan-preview.test.ts`
- Modify: `tests/learning-plan-preview-api.test.ts`
- Modify: `tests/user-ui-learning-plan-preview-contract.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Add RED coverage for proposal-only state, completed-day preservation, owner scope, stale revision, no-op rejection, and idempotent acceptance.**
- [x] **Step 2: Persist adjustment proposals separately from PlanVersions and expose authenticated preview/list/accept routes.**
- [x] **Step 3: Create a new accepted PlanVersion only after CAS approval, superseding the old version without deleting historical sessions.**
- [x] **Step 4: Connect the existing Learning surface and verify focused/API `7/7`, product `145/145`, builds, and browser `learningPlanAdjustment: passed`.**

The adjustment path does not infer mastery, delete completed evidence, invoke external services, or alter deferred AI Broadcast Room scope.

### Task 30: Project learning review and code-analysis evidence into portfolio candidates

**Files:**
- Modify: `src/learning/service.ts`
- Modify: `tests/learning-review-flow.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Add RED coverage for review-completion and local-code-analysis activity events with explicit actor/provenance fields.**
- [x] **Step 2: Record the events after durable learning writes, using review count for repeated review identity and no new mastery/XP rule.**
- [x] **Step 3: Verify the existing owner-scoped Portfolio read model exposes the new verified review evidence in the isolated browser flow.**
- [x] **Step 4: Verify focused `6/6`, product `145/145`, root `648/648`, builds, and browser `learningEvidenceProjection: passed`.**

The evidence projection records completed actions and analysis provenance only; it does not infer correctness, mastery, XP, or external-provider success.

### Task 31: Add manager-side recruitment application review to the approved UI

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/user-ui-team-recruitment-contract.test.ts`

- [x] **Step 1: Add RED coverage for manager application retrieval/review API usage and accept/reject UI states.**
- [x] **Step 2: Render manager-scoped application review actions inside the existing recruitment detail surface.**
- [x] **Step 3: Exercise applicant submission and manager acceptance through separate browser accounts, then verify team-project ACL access.**
- [x] **Step 4: Verify UI contract `1/1`, user-product `146/146`, TypeScript/UI builds, and browser `recruitmentApplicationReviewUi: passed`.**

The UI delegates membership changes to the existing authenticated recruitment service; it does not grant client-only access or alter the approved visual system.

### Task 32: Verify project Runtime completion through the approved UI in an isolated fixture

**Files:**
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/user-ui-project-runtime-browser-contract.test.ts`

- [x] **Step 1: Add RED coverage requiring an explicit isolated project Runtime mode and browser completion journey.**
- [x] **Step 2: Add a temporary-root deterministic Harness supervisor path without changing the default no-Runtime waiting server.**
- [x] **Step 3: Exercise project creation, work request, execution, durable completion, reload, and lifecycle evidence through headless Chrome.**
- [x] **Step 4: Verify contract `1/1`, root/UI builds, and browser `projectRuntimeExecutionUi: passed` with the existing two-account/responsive journeys.**

This is isolated local Runtime/Harness evidence only. It does not authorize or invoke the operational Runtime, replay UNKNOWN work, call external AI, or expand the deferred AI Broadcast Room scope.

### Task 33: Verify private AI Runtime response and truthful status through the approved UI

**Files:**
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `user-ui/src/pages/AIChat.tsx`
- Modify: `tests/user-ui-ai-chat-contract.test.ts`
- Add: `tests/user-ui-ai-chat-runtime-browser-contract.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add RED coverage for an opt-in isolated dispatcher and a browser response/reload journey.**
- [x] **Step 2: Connect only the temporary isolated server to a deterministic owner-bound dispatcher; preserve default `waiting_runtime`.**
- [x] **Step 3: Render a truthful Runtime-connected state only when durable assistant evidence exists, without changing the approved layout or approval boundary.**
- [x] **Step 4: Verify the focused contracts, UI/runtime browser journey, builds, and full regressions.**

This does not claim live Ollama/model quality, operational Runtime execution, external AI access, or any AI Broadcast Room implementation.

### Task 34: Verify Learning Runtime responses through the approved UI in an isolated fixture

**Files:**
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/user-ui-learning-runtime-browser-contract.test.ts`

- [x] **Step 1: Add RED coverage requiring an explicit isolated Learning Runtime dispatcher boundary and browser journey.**
- [x] **Step 2: Inject deterministic owner-bound content, action, and feedback dispatchers only into the temporary browser server; preserve the default waiting paths.**
- [x] **Step 3: Exercise goal/session creation, validated lesson content, persisted Runtime help, and coding-answer evaluation through the approved Learning UI.**
- [x] **Step 4: Verify the evaluator downgrades an unsupported `verified` request to `tentative`, then run focused contracts, user-product/full regressions, builds, and browser E2E.**

This is isolated local dispatcher evidence only. It does not claim live Ollama quality, operational Runtime ownership, external AI access, coding execution evidence, or any AI Broadcast Room implementation.

### Task 35: Restore durable Learning evaluation feedback after reconnect

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Add/Modify: `tests/learning-feedback-evaluator.test.ts`
- Add/Modify: `tests/learning-feedback-dispute-api.test.ts`
- Add/Modify: `tests/user-ui-learning-feedback-evaluator-contract.test.ts`

- [x] **Step 1: Add RED coverage for owner-scoped durable answer listing and UI restore requirements.**
- [x] **Step 2: Expose authenticated `GET /api/user/learning/sessions/:id/answers` and return only the requesting user's answer receipts.**
- [x] **Step 3: Restore the latest coding exercise and its persisted evaluator feedback after Learning page reload, including pending, tentative, and disputed states.**
- [x] **Step 4: Verify the default waiting/dispute path and isolated Runtime tentative path through browser reload, then run focused `4/4`, product `149/149`, root `648/648`, TypeScript/UI builds, and browser E2E.**

This restores existing durable learning state only. It does not infer mastery, upgrade tentative feedback to verified, call the operational Runtime, replay UNKNOWN requests, or change the approved visual system/deferred AI Broadcast Room scope.

### Task 36: Verify durable community reactions through two approved UI sessions

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/user-ui-team-recruitment-contract.test.ts`

- [x] **Step 1: Add UI contract coverage for the existing per-user community like API/state binding.**
- [x] **Step 2: Extend the isolated two-account browser journey so account B likes account A's public post and reloads the page.**
- [x] **Step 3: Verify account B retains the liked state while account A sees the same count without inheriting B's liked state.**
- [x] **Step 4: Verify focused contract `2/2`, product `150/150`, root `648/648`, TypeScript/UI builds, diff validation, and browser `publicCommunityLikePersistence: passed`.**

This verifies the existing community surface without changing its approved layout, visibility rules, user scope, or external notification behavior.

### Task 37: Implement owner-scoped AI team membership permissions

**Files:**
- Modify: `src/teams/contracts.ts`
- Modify: `src/teams/store.ts`
- Modify: `src/teams/service.ts`
- Modify: `src/collaboration-router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Add/Modify: `tests/team-membership-acl.test.ts`
- Add/Modify: `tests/collaboration-api.test.ts`
- Add/Modify: `tests/user-ui-team-recruitment-contract.test.ts`

- [x] **Step 1: Add RED coverage for bounded AI membership records, manager-only mutation, persistence, and non-manager UI isolation.**
- [x] **Step 2: Extend team membership storage with explicit human/AI type, assignment role, bounded capabilities, and approval scope while normalizing legacy human records.**
- [x] **Step 3: Add owner/manager-scoped AI member add/remove APIs; keep AI members out of the human collaboration ACL and require explicit approval scope for execution requests.**
- [x] **Step 4: Add the approved Teams surface for owner-scoped AI permissions and verify add, reload persistence, remove, and non-manager visibility through isolated two-account Chrome.**
- [x] **Step 5: Verify focused `6/6`, product regression `152/152`, root regression `648/648`, TypeScript/UI builds, diff validation, and browser `aiTeamMemberPermissions: passed`.**

This records AI team assignment metadata and its human approval boundary only. It does not grant autonomous execution, bypass per-Run approval, change the operational Runtime/Agent, replay UNKNOWN work, or expand the deferred AI Broadcast Room scope.

### Task 38: Connect bounded AI team proposals to human-approved project work requests

**Files:**
- Add: `src/ai-team/contracts.ts`
- Add: `src/ai-team/store.ts`
- Add: `src/ai-team/service.ts`
- Modify: `src/project-model/user-project-router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Projects.tsx`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/ai-team-proposals.test.ts`
- Add: `tests/ai-team-proposals-api.test.ts`
- Add: `tests/user-ui-ai-team-proposal-contract.test.ts`

- [x] **Step 1: Add RED coverage for a bounded AI proposal, idempotency, waiting state, and owner approval boundary.**
- [x] **Step 2: Persist owner/project/team/AI assignment metadata and expose authenticated list/request/accept/reject routes.**
- [x] **Step 3: Keep the default server fail-closed when no AI dispatcher is configured; accept only a proposed item and create a queued Work Request.**
- [x] **Step 4: Connect the existing approved Projects surface and isolated deterministic Runtime fixture without changing the approved visual system.**
- [x] **Step 5: Verify focused proposal/UI checks `5/5`, user-product `156/156`, root `648/648`, TypeScript/UI builds, diff validation, and browser `aiTeamProposalRuntimeUi: passed`.**

The proposal path is not autonomous execution: a human manager must accept it, acceptance creates only an existing queued Work Request, and the existing per-Run approval/Runtime boundary remains required. The default production composition has no dispatcher and therefore persists `waiting-runtime`; the deterministic dispatcher exists only in the temporary isolated browser server. No operational Runtime/Agent request, UNKNOWN replay, external provider call, or AI Broadcast Room implementation occurred.

### Task 39: Add shared study spaces with private member submissions

**Files:**
- Add: `src/study/contracts.ts`
- Add: `src/study/store.ts`
- Add: `src/study/service.ts`
- Add: `src/study/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/study-space.test.ts`
- Add: `tests/study-space-api.test.ts`
- Add: `tests/user-ui-study-space-contract.test.ts`

- [x] **Step 1: Add RED coverage for StudySpace/CurriculumLink/shared task persistence and private member submissions.**
- [x] **Step 2: Add manager-scoped study domain storage and membership re-checks on every read/write; keep curriculum metadata shared and submissions user-scoped.**
- [x] **Step 3: Expose authenticated study API routes and compose the service into the Control Plane and Runtime service graph.**
- [x] **Step 4: Connect the existing approved Teams surface for shared materials, task creation, and a member's own answer without redesigning the UI system.**
- [x] **Step 5: Verify focused study `4/4`, user-product `160/160`, root `648/648`, TypeScript/UI builds, diff validation, and browser `studyWorkspacePersistencePrivacy: passed`.**

Study submissions are stored with a stable study/task/user scope and are returned only as `mySubmissions`; no team member or manager receives another user's answer by default. The slice does not expose private Learning answers, call external AI, alter operational Runtime/Agent state, replay UNKNOWN, or change AI Broadcast Room deferral.

### Task 40: Add user-scoped social blocking and reporting

**Files:**
- Modify: `src/social/contracts.ts`
- Modify: `src/social/store.ts`
- Modify: `src/social/service.ts`
- Modify: `src/collaboration-router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Friends.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/social-safety.test.ts`
- Add: `tests/social-safety-api.test.ts`
- Add: `tests/user-ui-social-safety-contract.test.ts`

- [x] **Step 1: Add RED coverage for durable blocks, private reports, bidirectional access denial, and UI controls.**
- [x] **Step 2: Persist owner-scoped active/removed blocks and reporter-scoped open reports without exposing report text to the target or other users.**
- [x] **Step 3: Apply the block boundary to profile discovery, friend lists/requests, and direct-message reads/writes while preserving friendship after unblock.**
- [x] **Step 4: Connect the approved Friends surface and isolated two-account browser journey for report, block, hidden discovery, private report visibility, and unblock restoration.**
- [x] **Step 5: Verify focused `4/4`, collaboration `8/8`, user-product `164/164`, root `648/648`, TypeScript/UI builds, and browser `socialSafetyBlockReportUi: passed`.**

Reports remain user statements with `unverified` activity provenance; no moderation console or automated enforcement is implied. The slice does not change the approved visual system, operational Runtime/Agent, UNKNOWN records, external providers, or deferred AI Broadcast Room scope.

### Task 41: Apply learning evidence to an existing project through an approval-gated Work Request

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/store.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/learning-project-application.test.ts`
- Add: `tests/learning-project-application-api.test.ts`
- Add: `tests/user-ui-learning-project-application-contract.test.ts`

- [x] **Step 1: Add RED coverage for owner/project validation, draft persistence, accept-only Work Request creation, idempotency, and execution-claim rejection.**
- [x] **Step 2: Persist owner-scoped learning project applications and LearningLink records, and expose authenticated proposal/list/accept routes.**
- [x] **Step 3: Inject the existing UserProjectService into the composed Learning service and create exactly one queued Work Request only after owner acceptance.**
- [x] **Step 4: Connect the approved Learning surface and isolated browser journey for goal → project selection → draft → acceptance → durable Work Request without starting execution.**
- [x] **Step 5: Verify focused `4/4`, serial user-product `168/168`, root `648/648`, TypeScript/UI builds, and browser `learningProjectApplicationUi: passed`.**

The project application is an evidence-linked proposal, not an execution result. It preserves project scope, owner approval, existing Run approval, Runtime waiting, and the distinction between learning evidence and project execution evidence. No operational Runtime/Agent request, UNKNOWN replay, external provider call, push, deployment, or AI Broadcast Room implementation occurred.

### Task 42: Add evidence-separated weekly/final learning reports

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/store.ts`
- Modify: `src/learning/service.ts`
- Modify: `src/learning/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/learning-report.test.ts`
- Add: `tests/learning-report-api.test.ts`
- Add: `tests/user-ui-learning-report-contract.test.ts`

- [x] **Step 1: Add RED coverage for period validation, owner scope, evidence references, self-report separation, and period/source idempotency.**
- [x] **Step 2: Persist local-evidence reports from existing plan/session/attempt/review records with explicit provenance and no mastery claims.**
- [x] **Step 3: Expose authenticated report list/create routes and the approved Learning UI period/report surface, including weekly/final report selection.**
- [x] **Step 4: Verify both report kinds after reload in the isolated browser, waiting for the durable final record, while preserving the existing two-account, Runtime, approval, portfolio, and responsive journeys.**
- [x] **Step 5: Verify focused `3/3`, serial user-product `171/171`, root `648/648`, TypeScript/UI builds, and two consecutive browser runs with `learningReportUi: passed`.**

This report is a deterministic local evidence summary, not an AI-generated conclusion. Verified outcomes require evidence references; self-reports remain unverified; remaining work and review suggestions are explicit. Runtime-generated reporting can be added later without weakening this boundary. No operational Runtime/Agent request, UNKNOWN replay, external provider call, push, deployment, or AI Broadcast Room implementation occurred.

### Task 43: Add user-controlled private memory access for personal AI

**Files:**
- Modify: `src/settings/contracts.ts`
- Modify: `src/settings/service.ts`
- Modify: `src/ai-chat/service.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Settings.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/settings-isolation.test.ts`
- Modify: `tests/ai-chat-runtime-dispatch.test.ts`
- Modify: `tests/user-ui-settings-contract.test.ts`

- [x] **Step 1: Add RED coverage for the durable memory permission, AI dispatch filtering, and approved Settings switch.**
- [x] **Step 2: Persist and migrate `aiAccess.memory` with default-on behavior while keeping memory records owner-private.**
- [x] **Step 3: Apply the permission at the AI context boundary so disabled access excludes both existing and newly captured memory.**
- [x] **Step 4: Connect the approved Settings UI and two-account browser journey for toggle, reload persistence, and independent account defaults.**
- [x] **Step 5: Verify focused `10/10`, serial user-product `173/173`, root `648/648`, TypeScript/UI builds, diff validation, and browser E2E.**

This slice adds personal-AI consent control only. It fails closed when an explicitly configured settings service cannot be read, while preserving the legacy no-settings-service path. It does not introduce team/other-user memory sharing, memory deletion, live model quality claims, operational Runtime changes, UNKNOWN replay, external integration calls, or AI Broadcast Room work.

### Task 44: Add durable team departure to the approved Teams UI

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/user-ui-team-recruitment-contract.test.ts`

- [x] **Step 1: Add RED coverage for the existing durable leave route, member UI action, and owner protection.**
- [x] **Step 2: Add the authenticated leave client and two-step inline confirmation; keep owners on the management path and count only memberships visible to the current viewer.**
- [x] **Step 3: Extend the isolated two-account browser journey so a member leaves, loses private team-project access, and the owner retains access.**
- [x] **Step 4: Verify focused UI `4/4`, serial user-product `174/174`, root `648/648`, TypeScript/UI builds, diff validation, and browser `teamLeaveAccessRevocation: passed`.**

The existing owner-bound team service and `POST /api/user/teams/:teamId/leave` route remain the durable authority. The approved Teams surface now exposes departure for members/admins, protects owners from self-removal, and verifies project ACL revocation after departure. No operational Runtime/Agent request, UNKNOWN replay, external provider call, data deletion, or AI Broadcast Room implementation occurred.

### Task 45: Add membership-scoped team chat to the approved Teams surface

**Files:**
- Add: `src/team-chat/contracts.ts`
- Add: `src/team-chat/store.ts`
- Add: `src/team-chat/service.ts`
- Modify: `src/collaboration-router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Teams.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/team-chat.test.ts`
- Add: `tests/team-chat-api.test.ts`
- Add: `tests/user-ui-team-chat-contract.test.ts`

- [x] **Step 1: Add RED coverage for membership-scoped durable messages and the approved Teams chat contract.**
- [x] **Step 2: Persist team-scoped messages and enforce active human membership on list/send, including after leave and service restart.**
- [x] **Step 3: Expose the authenticated team-chat API and connect the existing Teams surface without changing the approved visual system.**
- [x] **Step 4: Extend the isolated two-account browser journey for send → reload → member read and post-leave denial.**
- [x] **Step 5: Verify focused chat/API/UI checks `11/11`, serial user-product `178/178`, root `648/648`, TypeScript/UI builds, diff validation, and browser `teamChatMembership: passed`.**

Team chat is distinct from private direct messages: messages are readable only by active human members of the selected team, AI memberships are not human chat identities, and leaving a team revokes future chat reads/writes without deleting the durable team history. No external notification delivery, operational Runtime/Agent request, UNKNOWN replay, external provider call, or AI Broadcast Room implementation is included.

### Task 46: Add bounded AI team technical discussion to the approved Projects surface

**Files:**
- Add: `src/ai-team/discussion-store.ts`
- Add: `src/ai-team/discussion-service.ts`
- Modify: `src/ai-team/contracts.ts`
- Modify: `src/project-model/user-project-router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Projects.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `package.json`
- Add: `tests/ai-team-discussion.test.ts`
- Add: `tests/ai-team-discussion-api.test.ts`
- Add: `tests/user-ui-ai-team-discussion-contract.test.ts`

- [x] **Step 1: Add RED coverage for bounded discussion output, durable Runtime waiting, membership/capability ACL, and the approved Projects UI contract.**
- [x] **Step 2: Persist owner/project/team/AI assignment metadata and expose idempotent authenticated discussion request/list routes.**
- [x] **Step 3: Keep the default composition fail-closed with `waiting-runtime`; accept only validated local Runtime answers and never create a Work Request or Run from discussion.**
- [x] **Step 4: Connect the existing approved Projects surface and isolated deterministic Runtime fixture, including reload persistence.**
- [x] **Step 5: Verify focused discussion/API/UI checks `4/4`, serial user-product `182/182`, TypeScript/UI builds, and browser `aiTeamDiscussionRuntimeUi: passed` within the existing two-account/responsive matrix.**

Technical discussion is a bounded explanation path, not autonomous task generation or execution. Only active human members may access the project discussion records, and the selected AI member must carry `discussion.propose`; the default runtime composition stores a truthful waiting record when no dispatcher is configured. Live local-model quality and operational Runtime ownership remain unverified. No UNKNOWN replay, external provider call, data mutation outside isolated test roots, push, deployment, or AI Broadcast Room implementation occurred.

### Task 47: Bind Work Requests to Project Task nodes and attach Runs to those nodes

**Files:**
- Modify: `src/project-model/user-project-service.ts`
- Modify: `src/project-model/work-request.ts`
- Modify: `src/project-model/workspace-run-preparation.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/user-project-execution.test.ts`

- [x] **Step 1: Add RED coverage for a durable `ProjectTreeNode(kind:"task")`, its Work Request `nodeId`, and Task-scoped Run attachment.**
- [x] **Step 2: Create or repair the owner-bound Task node idempotently when a Work Request is created, including legacy requests without a node id.**
- [x] **Step 3: Pass the Work Request node id into Run preparation so the Run and history attach to the Task node while legacy callers retain the root fallback.**
- [x] **Step 4: Verify the approved Project UI exposes the Task node and its completed Run through the existing workspace tree.**
- [x] **Step 5: Verify focused project/recovery checks `21/21`, serial user-product `182/182`, root `648/648`, TypeScript/UI builds, and browser `projectRuntimeExecutionUi: passed` with the Task→Run assertion.**

The explicit `Project → Task → Run` relationship is now durable: a Work Request uses `task-<workRequestId>` as its task node identity, repeated creation does not duplicate the node, and project Run preparation attaches the Run to that node. Existing callers that do not supply a node id continue to attach to the project root for compatibility. The browser verification uses only the temporary deterministic isolated Runtime fixture; no operational Runtime/Agent request, UNKNOWN replay, external provider call, push, deployment, or AI Broadcast Room implementation occurred.

### Task 48: Enforce the approved team-document permission in private AI context

**Files:**
- Modify: `src/ai-chat/contracts.ts`
- Modify: `src/ai-chat/service.ts`
- Modify: `src/ai-chat/local-runtime.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/ai-chat-runtime-dispatch.test.ts`
- Modify: `tests/ai-chat-local-runtime.test.ts`
- Modify: `tests/user-ui-settings-contract.test.ts`

- [x] **Step 1: Add RED coverage for active-member-only shared study metadata, private submission exclusion, and `teamDocs` permission denial.**
- [x] **Step 2: Add a bounded `teamDocs` context section containing only StudySpace, curriculum-link, and study-task metadata.**
- [x] **Step 3: Wire the context through the normal local Runtime composition and loopback prompt adapter without exposing private submissions or other users' records.**
- [x] **Step 4: Verify the existing approved Settings switch persists per user and remains independent across the two-account browser journey.**
- [x] **Step 5: Verify focused AI checks `14/14`, product `183/183`, root `648/648`, TypeScript/UI builds, and browser E2E across two accounts and responsive routes.**

The setting `aiAccess.teamDocs` now has real effect. Its current scope is intentionally precise: active members may allow their private AI to read shared study-space descriptions, curriculum labels, and task instructions; personal task submissions, answers, private memory, and unrelated teams are never included. If the shared-study read fails, the entire optional section fails closed. External integrations, live local-model quality, operational Runtime ownership, UNKNOWN replay, and AI Broadcast Room remain outside this task.

### Task 49: Add an isolated local coding syntax receipt boundary

**Files:**
- Add: `src/learning/local-coding-verifier.ts`
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/service.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Add/Modify: `tests/learning-local-coding-verifier.test.ts`
- Modify: `tests/learning-coding-test.test.ts`
- Modify: `tests/learning-coding-test-api.test.ts`
- Modify: `tests/user-ui-coding-test-contract.test.ts`

- [x] **Step 1: Add RED coverage for an explicitly injected coding verifier and valid/invalid/unsupported language states.**
- [x] **Step 2: Add owner-bound `CodingAttemptVerifier` composition and persist bounded `syntax-verified`/`syntax-invalid` receipts without changing the default `environment-required` path.**
- [x] **Step 3: Implement a loopback-free, shell-disabled temporary-root JavaScript `node --check` verifier with bounded timeout, diagnostics, cleanup, and artifact references.**
- [x] **Step 4: Connect only the isolated browser server and approved Learning screen; restore attempt receipts after reload and render syntax state without claiming test pass, correctness, mastery, or growth.**
- [x] **Step 5: Verify focused coding checks `7/7`, product regression `185/185`, root regression `648/648`, TypeScript/UI builds, and browser `learningLocalSyntaxVerifierUi: passed` across two accounts and responsive routes.**

This is a syntax receipt and execution-environment boundary, not a coding-test answer evaluator. It does not execute submitted program behavior, establish a hidden rubric, award verified mastery/XP, contact external services, invoke the operational Runtime/Agent, replay UNKNOWN requests, or change the deferred AI Broadcast Room scope.

### Task 50: Compose the local coding syntax receipt into the Runtime service graph

**Files:**
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `tests/iseol-runtime-services.test.ts`

- [x] **Step 1: Add RED coverage for a Runtime-composed learning service persisting a JavaScript syntax receipt.**
- [x] **Step 2: Inject the existing bounded `createLocalCodingSyntaxVerifier()` into the default Runtime learning service composition.**
- [x] **Step 3: Verify the composed service preserves owner scope and records only `syntax-verified`/`syntax-invalid` evidence, without program execution or mastery claims.**
- [x] **Step 4: Run the focused Runtime and coding suites, then the existing build, product, browser, and root regressions.**

This connects the already-tested local syntax boundary to the normal ISEOL Runtime service graph. It does not start or modify the operational Runtime/Agent, execute submitted program behavior, evaluate correctness, award growth, call an external provider, replay UNKNOWN requests, or implement the deferred AI Broadcast Room.

### Task 51: Verify Project Run to growth and portfolio evidence in the approved user flow

**Files:**
- Modify: `tests/user-project-runtime-integration.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`

- [x] **Step 1: Extend the composed Runtime integration test through the owner-scoped ActivityEvent, development growth achievement, project evidence, and durable portfolio entry.**
- [x] **Step 2: Extend the isolated approved browser journey through project Run completion, ActivityEvent idempotency, development XP/achievement, Portfolio UI save/reload, and evidence attribution.**
- [x] **Step 3: Verify a second browser account cannot read the project, Run activity, growth achievement, or portfolio evidence.**
- [x] **Step 4: Run focused checks, TypeScript/root UI builds, product regression, full root regression, diff validation, and the complete isolated browser matrix.**

The `Project → Task → Run → Artifact/Revision/Deployment → ActivityEvent → Growth → Portfolio` chain now has fresh service, API, and browser evidence in the isolated environment. The ActivityEvent remains service-owned and idempotent; project evidence keeps its Runtime/Agent attribution; portfolio selection requires verified evidence. This does not claim operational Runtime ownership, live local-model quality, external connector delivery, UNKNOWN replay, or AI Broadcast Room implementation.

### Task 52: Verify Learning Project Application through Project Runtime

**Files:**
- Modify: `user-ui/src/pages/Learning.tsx`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/user-ui-project-runtime-browser-contract.test.ts`

- [x] **Step 1: Reproduce the no-session Learning application notice failure in the isolated browser journey.**
- [x] **Step 2: Move the shared Learning action notice to a global status region so project application feedback is visible even without an active Learning session.**
- [x] **Step 3: Verify the approved Learning UI application is accepted, creates one queued Work Request, executes through the isolated deterministic Project Runtime, and reaches verified activity, growth, and portfolio evidence.**
- [x] **Step 4: Verify focused contract checks, builds, product/root regressions, diff validation, and the complete browser matrix.**

The Learning-to-Project boundary now has fresh browser evidence without changing the approval model: accepting a learning application creates the existing queued Work Request, and only the separate Project execution action starts the Run. The global notice fix prevents a successful application from appearing silent when no session exists. No live local-model result, operational Runtime ownership, external connector call, UNKNOWN replay, or AI Broadcast Room implementation is claimed.

### Task 53: Add owner-approved Project Run failure recovery

**Files:**
- Modify: `src/project-model/user-project-service.ts`
- Modify: `src/project-model/user-project-router.ts`
- Modify: `src/project-model/work-request.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Projects.tsx`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `tests/project-work-request.test.ts`
- Modify: `tests/user-project-execution.test.ts`
- Modify: `tests/user-ui-project-resume-contract.test.ts`

- [x] **Step 1: Add RED coverage for terminal failure projection, preserved failure reason, same-Run retry, and the approved UI/API retry contract.**
- [x] **Step 2: Add owner-scoped `POST /runs/retry` backed by the existing explicit Harness same-Run retry record and persisted build approval.**
- [x] **Step 3: Preserve Harness failure reasons on Work Requests so the Project UI exposes an actionable blocker instead of an empty error state.**
- [x] **Step 4: Connect the approved Project UI retry checkpoint and an isolated deterministic fail-once Runtime fixture; verify failure does not create ActivityEvent/growth, then retry reaches completion with the same Run ID and fresh verified growth.**
- [x] **Step 5: Verify focused checks `13/13`, serial user-product `189/189`, root `650/650`, TypeScript/UI builds, diff validation, and browser `projectRuntimeFailureRecoveryUi: passed` across the existing responsive/two-account matrix.**

The retry is explicit, owner-bound, approval-aware, and reuses the durable Run identity; failed execution never projects completion evidence or growth before the retry succeeds. The isolated fixture is test-only. No operational Runtime/Agent restart or request, stale-lock repair, UNKNOWN replay, external provider call, push, deployment, or AI Broadcast Room implementation occurred.

### Task 54: Add operator Control Plane recovery for failed Project Runs

**Files:**
- Modify: `src/web-control-plane/router.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Modify: `tests/web-control-plane-router.test.ts`
- Modify: `tests/web-control-plane-static.test.ts`
- Modify: `tests/read-model-browser.test.ts`

- [x] **Step 1: Add an operator-only, revision-bound retry route that verifies the durable Work Request and Run identities before dispatch.**
- [x] **Step 2: Expose the existing local Project Runtime retry capability through the composed Runtime graph without creating a new Run identity.**
- [x] **Step 3: Connect the Control Plane with a separately stored operator token, explicit confirmation, and a failed-request `Retry Run` action.**
- [x] **Step 4: Verify the operator route/API contract and a real isolated Chrome flow from failed Work Request to same-Run retry and refreshed status.**
- [x] **Step 5: Verify focused checks `49/49`, browser Control Plane checks `2/2`, TypeScript/UI builds, serial user-product `189/189`, root `651/651`, diff validation, and the complete isolated two-account responsive browser matrix.**

The operator path is intentionally separate from the owner Project UI retry: it requires `ISEOL_OPERATOR_TOKEN`, never accepts the regular Web token, binds the request revision and exact Run ID, and records the retry actor as `operator`. The Chrome verification uses temporary fixture roots only. Operational Runtime ownership, stale-lock reconciliation, UNKNOWN requests, external providers, push, deployment, and AI Broadcast Room scope remain untouched.

## Task 55: user-scoped in-app notifications for team messages

1. Add a durable notification domain under the existing platform root. Records must be owner-scoped, reload-safe, deterministically ordered, and support an idempotent read transition.
2. Connect team-message creation to notification creation for other active human members only. Respect each recipient's persisted `settings.notifications.newMessage` value and exclude the sender, AI members, departed members, and users outside the team.
3. Expose authenticated list/read API routes without reusing the operator Control Plane SSE stream or leaking another user's records.
4. Add the notification affordance to the existing approved user shell language and connect it to real API data. Keep the existing visual system; do not introduce a replacement dashboard or placeholder notification state.
5. Verify with focused service/API/UI-contract tests, TypeScript and user-UI builds, product/root regressions, and an isolated two-account browser journey that covers creation, privacy, settings suppression, read persistence, and reload behavior.

## Task 56: direct-message notification producer

1. Reuse the Task55 user-scoped notification store and read API for accepted-friend direct messages.
2. Trigger only after the existing Social service passes recipient existence, block, and accepted-friend/shared-team authorization checks.
3. Respect the recipient's persisted `settings.notifications.newMessage`, exclude the sender, and route the existing notification panel back to the Friends surface.
4. Verify service isolation, full product/root regressions, builds, and the two-account browser flow including reload and notification read state.

## Task 57: private AI completion notification producer

1. Reuse the Task55 user-scoped notification store and read API for responses that the owner-bound AI Chat service durably completes.
2. Trigger only after the assistant message and its user message are persisted as completed, including later completion through the existing user-bound Runtime callback; repeated completion must remain idempotent.
3. Respect the owner's persisted `settings.notifications.aiDone` value and keep prompt/response content out of the notification payload. Route the existing notification panel back to AI Chat.
4. Verify service isolation, settings suppression, API/build regressions, and the isolated AI Runtime browser journey including reload and read persistence.

## Task 58: accepted-team-membership notification producer

1. Treat the existing manager-approved recruitment application as the current product's team-invite boundary; do not invent a parallel invitation entity.
2. After accepted membership is durably added and the application review is persisted, create one owner-scoped `team-invite` notification for the joining human only, with source idempotency bound to the application.
3. Respect the joining user's persisted `settings.notifications.teamInvite` value and route the existing notification panel back to Teams while preserving other unread notifications.
4. Verify recruitment/service isolation, settings suppression, full builds/regressions, and the two-account browser flow with multiple unread notification sources.

## Task 59: growth achievement notification producer

1. Reuse the existing GrowthService transition that projects a newly unlocked evidence-based achievement; do not create a second growth or notification source of truth.
2. Create one owner-scoped `achievement` notification per newly unlocked achievement, with source idempotency bound to the achievement ID and evidence event, only after the durable growth entry is saved.
3. Respect the user's persisted `settings.notifications.achieve` setting, fail closed when settings cannot be read, and route the existing notification panel back to My World without exposing private evidence content.
4. Verify achievement notification persistence, duplicate application idempotency, settings suppression, two-user isolation, read transition, full builds/regressions, and the responsive browser journey.

## Task 60: authenticated user-scoped notification SSE refresh

1. Add a separate authenticated `/api/user/notifications/stream` channel for user notification changes; keep the operator Control Plane SSE stream separate and preserve owner/session isolation.
2. Emit only bounded `created`/`read` refresh signals after durable notification writes. Do not put notification titles, bodies, prompts, or other private content into the stream, and keep REST notification records authoritative.
3. Connect the existing approved user-shell notification bell to refresh its owner-scoped REST snapshot when a signal arrives, with harmless disconnect/abort behavior and no replacement dashboard or new visual system.
4. Verify owner-only delivery, outsider isolation, bounded payloads, durable read behavior, live no-reload browser refresh, bounded client reconnect/backoff, full regressions, and builds. Reconnect/restart recovery must continue to use the durable REST snapshot rather than an invented replay buffer.

## Task 61: user-scoped durable Project History in the Project Workspace

1. Expose the already durable project `history.jsonl` records through the existing owner/team project ACL in `UserProjectView`; do not invent connector, Runtime, or deployment state that is not stored.
2. Add a Project Workspace activity panel using the existing approved user UI language. Show the bounded event type, timestamp, summary, source/action, Run, and reference fields when present, plus an honest empty state.
3. Verify that an owner can read stored history, an outsider cannot read the project, the browser Project Workspace shows the actual `run-attached` history produced by the isolated Runtime journey, and the existing lifecycle evidence remains unchanged.
4. Run focused tests, user-product and root regressions, TypeScript/UI builds, diff validation, and the two-account responsive browser matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 62: recent authenticated ActivityEvent feed in My World

1. Reuse the authenticated `/api/user/activity` read model and add a typed user UI API boundary; do not create a second activity store or trust client-submitted verified evidence.
2. Show the current user's five newest durable activity events in the approved My World layout, including event type, source identity, actor attribution, and an explicit verified/unverified/unknown status.
3. Keep the feed private to the authenticated principal, preserve the empty state for accounts without events, and link to the existing full Activity timeline without inventing completion, XP, or mastery.
4. Verify the feed after an isolated project Run completes, after reload, and in a second account; run focused contracts, full regressions, builds, diff validation, and the responsive browser matrix.

## Task 63: complete authenticated Activity timeline ledger

1. Reuse the typed authenticated `/api/user/activity` client boundary in the existing Activity timeline; do not create a second activity store or replace the existing Growth/Portfolio read models.
2. Add a durable activity ledger section that renders raw event type, source identity, actor attribution, active/retracted state, and verified/unverified/unknown status without converting unverified records into growth or portfolio claims.
3. Preserve the existing verified-evidence timeline, growth snapshot, portfolio evidence, and approved user UI language. Keep empty/loading/error states honest and owner-scoped.
4. Verify the owner/reload and second-account browser paths, focused UI contract, user-product/root regressions, TypeScript/UI builds, diff validation, and the responsive browser matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 64: truthful current Runtime status in Personal AI

1. Reuse the authenticated `/api/user/runtime-status` capability snapshot in the existing Personal AI screen; do not infer current Runtime availability from historical assistant messages.
2. Keep durable conversation persistence and the waiting/completed message boundary unchanged. Show `Runtime 연결됨` only when the current local AI capability `aiChat: ready` is present; project-execution readiness alone must not make Personal AI claim a connected model. Disabled, blocked, or unavailable AI status must remain waiting/unknown without fabricating an answer.
3. Verify the focused UI contract, isolated deterministic Personal AI response journey, user-product/root regressions, TypeScript/UI builds, diff validation, and the responsive browser matrix. Preserve user memory/context permissions, operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 65: separate Runtime and Personal AI capability status in Settings

1. Preserve the approved Settings · 연동 환경 surface and the existing broad `Runtime 실행 환경` status, while also rendering the authenticated `aiChat` capability from `/api/user/runtime-status` as a separate `개인 AI Runtime` row.
2. Keep unavailable and unknown states truthful; project-execution readiness must not imply that Personal AI answer generation is available. Do not add fake connect/disconnect actions or alter external integration states.
3. Verify the UI contract, isolated browser integration-state journey, user-product/root regressions, TypeScript/UI builds, diff validation, and the responsive browser matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 66: truthful Personal AI status in common navigation

1. Reuse authenticated `/api/user/runtime-status` in the existing user shell; show the AI navigation indicator from the `aiChat` capability instead of a static waiting state.
2. Keep ready, unavailable, and unknown states honest, preserve the approved shell, and keep project-execution and Personal AI capability boundaries separate.
3. Verify focused UI contracts, isolated browser E2E, user-product/root regressions, TypeScript/UI builds, diff validation, and the responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 67: evidence-backed My World mission details

1. Reuse the authenticated ActivityEvent read model already loaded by My World and associate only verified `project.run.completed`, `learning.session.completed`, and `learning.review.completed` events with the corresponding mission.
2. Show evidence count and latest recorded time without adding a fabricated completion flag, XP reward, percentage, or second activity store. Keep unverified and UNKNOWN events out of mission evidence.
3. Verify focused world/activity contracts, user-product/root regressions, TypeScript/UI builds, diff validation, and the responsive browser matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 68: truthful Runtime capabilities in Idea Lab

1. Reuse the authenticated `/api/user/runtime-status` snapshot in the existing Idea Lab; do not infer capability from static copy or historical state.
2. Display project execution and Personal AI candidate-generation capabilities separately, keeping ready, unavailable, and unknown states truthful. Preserve the explicit approval gate and do not fabricate a build result or generated project.
3. Verify the focused Idea Lab contract, user-product/root regressions, TypeScript/UI builds, diff validation, the no-Runtime and deterministic-Runtime browser paths, and the responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 69: truthful Personal AI state in My World

1. Reuse the authenticated `/api/user/runtime-status.aiChat` capability in the existing My World character area; do not present a static companion message as a live AI interaction.
2. Keep the approved world layout and character presentation intact while showing explicit `개인 AI 준비됨`, `개인 AI 연결 대기`, or `개인 AI 상태 확인 중` copy based on the current capability snapshot.
3. Verify the focused My World contract, user-product/root regressions, TypeScript/UI builds, the isolated no-Runtime browser path, and the responsive matrix. Preserve owner scope, operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 70: visible Task → Run traceability in Project Workspace

1. Reuse the existing owner-scoped `ProjectWorkRequest` fields in the current Project Workspace card and show request ID, attempt count, creation date, and Run ID when a Run has been assigned.
2. Keep the existing approval, waiting, retry, lifecycle, history, and evidence semantics unchanged. This is a read-only projection of durable state; do not create a new store or infer execution success.
3. Verify the focused Project Workspace and Runtime integration contracts, user-product/root regressions, TypeScript/UI builds, the deterministic Runtime browser journey, two-account isolation, and the responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 71: truthful Run status in the Project list and reconnect path

1. Reuse the existing owner/team-authorized `getUserProject()` read model to hydrate each Project list card with its durable Runtime status; do not infer a Run state from the project lifecycle `active` flag.
2. Map completed, running, waiting, failed, not-started, and unknown states to the existing approved status vocabulary, show the bounded Run summary, and keep per-project read failures as explicit unknown state rather than a success claim.
3. Verify the deterministic browser path after a real Run completes, list re-entry, and page reload, plus focused contracts, user-product/root regressions, TypeScript/UI builds, two-account isolation, and the responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 72: connect My World recent project to durable Run state

1. Reuse the existing authenticated `getUserProject()` view for My World’s first visible project, keeping the existing owner/team ACL and treating a detail-read failure as unknown rather than falling back to the project `active` flag.
2. Replace the static recent-project badge with the existing status vocabulary and a bounded summary for not-started, running, waiting, failed, completed, and unknown Runtime states; preserve the approved character/world layout and current project links.
3. Verify the focused My World contract, deterministic project completion → My World → reload browser path, user-product/root regressions, TypeScript/UI builds, two-account isolation, and responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 73: owner-scoped provenance navigation from evidence to source

1. Extend the existing portfolio evidence read model with an owner-only `projectId` for project evidence, while preserving the existing activity and project evidence identities and verification rules.
2. Add source navigation to the approved Activity/Portfolio surfaces: project evidence returns to the authenticated Project Workspace, activity evidence returns to the focused Activity ledger entry, and the Activity route highlights/scrolls to the requested event. Do not expose internal project IDs from public portfolio responses.
3. Verify the focused provenance contracts, portfolio privacy/provenance tests, UI build, deterministic browser navigation from Activity → Project and Portfolio preview → Activity/Project, two-account isolation, reload persistence, and responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 74: deep-link recent My World activity into the Activity ledger

1. Reuse the existing authenticated `UserActivityEvent` list on My World and add an event-specific link to `/activity?event=:id`; keep the existing full-ledger link and verified/unverified/unknown display unchanged.
2. Verify the focused My World contract, UI build, and deterministic browser path from My World’s recent activity to the highlighted ActivityEvent, while preserving owner isolation, reload behavior, responsive layout, operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 75: connect social discovery to public profiles

1. Reuse the existing authenticated profile route and social `PublicProfile` records; add owner-scoped profile links from Friends search results and the selected direct-message header using encoded user IDs.
2. Keep friend requests, messaging, block/report controls, and read-only public-profile semantics unchanged. Do not create a private profile data path or expose hidden profile fields.
3. Verify the focused Friends contract, user-UI build, full user-product/root regressions, and the isolated two-account browser path from search to profile to friend request. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 76: connect community authors to public profiles

1. Reuse the existing public `CommunityPost.author` profile record and authenticated profile route; make each visible community author name navigate to `/profile?userId=:id` with an encoded user ID.
2. Preserve public post visibility, per-user likes, post content, and profile read-only/privacy behavior. Do not expose private community or profile fields.
3. Verify the focused Community contract, user-UI build, full user-product/root regressions, and the isolated two-account browser path from public post to author profile and back. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 77: apply public-profile privacy settings to growth, projects, and learning

1. Reuse the persisted Settings privacy toggles so a public profile only includes the enabled, owner-approved summaries for growth, projects, and learning history.
2. Expose bounded summaries without internal project or learning IDs, workspace paths, raw answers, or growth evidence IDs. Preserve public-profile visibility, block, friend, community-author, and read-only semantics.
3. Fail closed when the target settings or source service is unavailable, and inject the same services into the isolated browser server used for product verification.
4. Render the optional summaries in the existing approved profile card language and verify enable → public read → disable → public removal across two isolated browser accounts and the responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external integrations, and the deferred AI Broadcast Room boundary.

## Task 78: connect public profiles to public portfolio entries

1. Reuse `PortfolioService` public visibility as the authority and project only public entry title, summary, updated time, and shareable entry ID into the existing public profile.
2. Keep unlisted and private entries out of profile listings, omit evidence IDs and internal owner/project fields, and route each listed entry through the existing public portfolio page.
3. Verify the service/API/UI contract and isolated two-account browser profile → public portfolio navigation. Preserve owner/ACL boundaries, Runtime/Agent separation, UNKNOWN records, approved design, and the deferred AI Broadcast Room boundary.

## Task 79: verify the user UI through an isolated local Desktop Core/Agent

1. Add an explicit `real-agent` mode to the isolated user UI server. Start a loopback-only temporary Desktop Core and an isolated local Agent transport, with workspace roots restricted to the temporary test root; never reuse the operational Runtime/Agent or dataRoot.
2. Reuse `createProjectWorkspaceExecutor` and the existing Harness/Project Work Request route. Let the local Agent execute the bounded CONTEXT, TEST, and COMMIT stages; complete Web/provider-owned stages only with a clearly labelled local deterministic provider so this path does not claim external AI or provider success.
3. Add a browser journey that creates a user project and task, submits the approved Run through the user UI, verifies local Agent evidence and durable Task → Run → lifecycle → Activity → Growth → Portfolio projections, reloads the result, and records a separate `projectRuntimeLocalAgentUi` result from the existing two-account responsive E2E command.
4. Verify focused contracts, the isolated local-Agent browser journey, user-product/root regressions, TypeScript/UI builds, and diff validation. Preserve the operational Runtime/Agent, stale lock, UNKNOWN records, external request boundary, approved design, and deferred AI Broadcast Room.

Task 79 verification result: complete for the isolated local Desktop Agent boundary. The browser path passed with `projectRuntimeLocalAgentUi: passed`; user-product `211/211`, root `661/661`, both builds, diff validation, reload persistence, two-account isolation, and the responsive 13-route matrix passed. Live external AI/provider, production Runtime ownership, deployment, and the explicitly deferred AI Broadcast Room remain outside this local verification gate.

## Task 80: verify configured Runtime execution approval through the user UI

1. Reuse the persisted `aiApproval.buildRun` setting and existing Project Workspace approval checkpoint; before approval, assert the Work Request remains queued without a Run and that cancellation does not dispatch.
2. In the isolated deterministic Runtime server, approve the same request through the UI and assert the durable Run completes only after approval. Do not alter the approval policy or use the operational Runtime.
3. Verify the browser journey with the existing two-account and responsive matrix, then run the user-product/root regressions. Preserve UNKNOWN records, external request boundaries, approved design, and the deferred AI Broadcast Room.

Task 80 verification result: complete. The browser output reported `projectRuntimeApprovalUi: passed`; user-product `212/212`, root `661/661`, and the full responsive matrix passed.

## Task 81: verify AI team proposal execution approval through the user UI

1. Reuse the existing deterministic local AI Team proposal dispatcher and human acceptance route. Assert that proposal acceptance creates exactly one durable Work Request identity, without creating a Run or dispatching the Runtime automatically.
2. Reuse the persisted `aiApproval.buildRun` checkpoint. Through the approved Project Workspace UI, verify queued/not-started state before approval, cancellation without mutation, then explicit approval and completion through the isolated Project Runtime. Preserve Task → Run, ActivityEvent, and reload projections.
3. Verify focused AI and learning local journeys, the full two-account responsive browser matrix, user-product/root regressions, TypeScript/UI builds, and diff validation. Preserve operational Runtime/Agent state, UNKNOWN records, external request boundaries, approved design, and deferred AI Broadcast Room.

Task 81 verification result: complete for the isolated AI team execution boundary. The new approval contract passed `3/3`; user-product passed `213/213`; root passed `661/661`; both builds and `git diff --check` passed; full isolated browser E2E reported `aiTeamProposalExecutionApprovalUi: passed` with two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` coverage.

## Task 82: verify in-progress project team transition through the user UI

1. Reuse the existing owner-only `updateProjectTeam` path and the approved Project Workspace `진행 중 팀 구성` controls. Do not create a second team/project state store or change the existing solo/AI/human/mixed authorization rules.
2. In an isolated two-account browser journey, create a queued Work Request, connect the second account through a private-team recruitment acceptance, and verify `solo → human → mixed → ai → solo`. Human/mixed must grant the member project read access; AI/solo must revoke it from both list and detail surfaces. Preserve the Work Request, workspace task node, owner access, and verified transition ActivityEvents.
3. Make the verification boundary explicit by checking the actual team PATCH and Run POST responses, scoping duplicate rendered task text, reloading before each mode save, and allowing the isolated local Agent path a bounded completion window. Do not touch the operational Runtime/Agent, stale lock, UNKNOWN records, external AI/providers, approved design, or deferred AI Broadcast Room.

Task 82 verification result: complete. The focused contract passed `3/3`; the focused browser journey and full isolated browser matrix reported `projectTeamTransitionUi: passed`; user-product passed `214/214`; root passed `661/661`; both builds and `git diff --check` passed. Full browser coverage also retained configured approval, deterministic Runtime, real isolated local Agent, failure recovery, collaboration, learning, growth, portfolio, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.

## Task 83: integrate project-bound character and AI companion assets

1. Use the approved redesign brief's asset requirements without inventing a final art approval: create real project-bound transparent PNG assets for the current user character and distinct personal AI companion because the supplied ZIP contains no reusable image assets.
2. Centralize the files and accessibility/failure behavior in `CharacterAssets.tsx`, use the `/app` static mount path, and connect the assets to the user/world, auth, onboarding, navigation, AI chat, and conversation avatar surfaces. Keep the existing customization SVG preview and missing environment/icon artwork explicitly tracked rather than silently declaring them final.
3. Verify the focused asset contract, actual browser resource loading, full user-product/root regressions, both builds, `git diff --check`, two-account isolation, persistence, and responsive browser matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external request boundaries, approved-source uncertainty, and the deferred AI Broadcast Room.

Task 83 verification result: complete for the project-bound character/AI asset boundary. The focused contract and `characterAssetsUi` browser journey passed; user-product passed `214/214`; root passed `661/661`; TypeScript/UI builds and diff validation passed; the full isolated browser matrix passed with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes. Final approved character variants/environment artwork remain blocked on the missing source asset package and are not claimed complete.

## Task 84: persist explicit My World mission completion actions

1. Reuse the existing owner-scoped ActivityEvent POST boundary to persist a user's explicit completion action as `world.mission.completed` with `actorType: user` and `verificationStatus: unverified`; do not create a parallel mission store or convert self-reporting into verified activity.
2. Keep user action state separate from durable project/learning/review evidence. Restore it after reload, exclude retracted or cross-user events, show `검증/XP 제외`, and preserve existing Growth/XP and mission routing semantics.
3. Verify the focused world-state contract, actual browser POST/read/reload journey, two-account isolation, user-product/root regressions, TypeScript/UI builds, diff validation, and the full responsive matrix. Preserve operational Runtime/Agent state, UNKNOWN records, external request boundaries, approved design-source uncertainty, and the deferred AI Broadcast Room.

Task 84 verification result: complete for the explicit unverified user-action boundary. The focused contract passed `4/4`; `worldMissionCompletionUi: passed`; user-product passed `215/215`; root passed `661/661`; both builds and `git diff --check` passed; full isolated browser E2E passed with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes. The first full browser attempt exposed an intermittent existing plan-preview `400`; the immediate rerun passed after retaining response-body diagnostics, with no production semantic change.

## Task 85: route achievement notifications to the character growth surface

1. Reuse the existing durable notification source discriminator and authenticated read transition. Route `achievement` notifications to the existing `/character` surface, keeping team, direct-message, AI-completion, and unknown notification behavior unchanged.
2. Verify the source-specific navigation after a real verified learning achievement, notification read persistence, account isolation, source-event retraction cleanup, reload behavior, and the existing responsive browser matrix. Do not create or infer achievements in the UI.
3. Preserve operational Runtime/Agent state, UNKNOWN records, external request boundaries, approved design-source uncertainty, and the deferred AI Broadcast Room.

Task 85 verification result: complete. The focused notification contract and `growthNotifications` browser journey passed; user-product passed `215/215`; root passed `661/661`; both builds and `git diff --check` passed; the full isolated browser E2E passed `achievementNotifications: passed` with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.

## Task 86: make My World mission re-recording idempotent

1. Keep mission completion as a date-scoped owner self-report in the existing ActivityEvent store with `actorType: user` and `verificationStatus: unverified`; do not change the verified-evidence, Growth, XP, or portfolio boundary.
2. Send a stable occurrence timestamp derived from the explicit occurrence date so repeated clicks and retries reuse the same semantic ActivityEvent identity rather than producing a conflict or duplicate. Preserve the existing owner/session and reload behavior.
3. Verify the second-click browser path after reload, active-event cardinality, actor/verification fields, account isolation, focused contracts, user-product/root regressions, both builds, diff validation, and the full responsive matrix without touching operational Runtime/Agent state, UNKNOWN records, external requests, approved design source uncertainty, or deferred AI Broadcast Room files.

Task 86 verification result: complete. The initial RED browser check reproduced the prior same-day re-recording identity conflict; the stable occurrence timestamp fix produced one active event and a successful second click. Focused world-state contract passed `4/4`; focused `worldMissionCompletionUi: passed`; user-product passed `215/215`; root passed `661/661`; both builds passed; and the full isolated browser E2E passed with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.

## Task 87: shared semantic icons and concurrent durable mutation safety

1. Replace the common user navigation/menu, notification, integration-navigation, mobile-menu, and close emoji controls with a shared semantic SVG `Icon` component. Preserve existing labels, routes, accessibility semantics, responsive layout, and the distinction between implementation icons and missing final approved character/background artwork.
2. Reuse the existing bounded Windows `renameWithTransientRetry()` helper for Learning durable JSON replacement, preserving atomic temporary-file semantics, owner-scoped paths, JSON shape, restart behavior, and the honest waiting boundary when a local Runtime is unavailable.
3. Serialize Settings read-modify-write patches per authenticated user so rapid independent AI-access toggles preserve every change and cannot overwrite adjacent changes. Preserve account isolation, persisted defaults, and the existing authenticated settings API.
4. Verify focused icon/persistence/settings checks, the full user-product and root regressions, both builds, and the isolated two-account browser matrix at `[390, 768, 1024, 1440]`. Do not touch the operational Runtime/Agent, stale lock, UNKNOWN records, external AI/providers, deployment, push, approved design source, or deferred AI Broadcast Room.

Task 87 verification result: complete. The focused icon/persistence/settings checks passed `9/9`; user-product passed `217/217`; root passed `661/661`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and full isolated browser E2E passed with `settingsPermissionPersistenceIsolation: passed`, `worldMissionCompletionUi: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes. The first parallel browser attempt exposed the Learning `EPERM` boundary and the later browser attempt exposed the Settings concurrent-update race; both were fixed and reverified without replaying external requests or mutating operational state.

## Task 88: semantic data-state icons in shared UI

1. Extend the existing shared inline SVG icon boundary with semantic names for status, mission, stat, locked-achievement, member-count, and AI-avatar expressions. Replace the corresponding shared UI Unicode symbols while preserving labels, routes, accessibility text, permissions, ActivityEvent evidence, Growth/XP rules, and persistence semantics.
2. Keep the scope limited to shared data-state components. Do not infer final approval for remaining page-level emoji labels or for character/background/art assets absent from the attached redesign ZIP; preserve those gaps for a later design-audit unit.
3. Verify the RED→GREEN focused contract, navigation/responsive contracts, user-product/root regressions, both builds, and the isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 88 verification result: complete for the shared data-state icon boundary. The initial contract failed on the missing semantic names; the fixed implementation passed focused icon/navigation/responsive checks `3/3`, user-product `217/217`, root `661/661`, both builds, and full isolated browser E2E with two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes. Remaining page-level emoji and missing final approved art are not claimed complete.

## Task 89: operational Settings and Personal AI semantic icons

1. Replace presentation Unicode symbols in the operational Settings integration catalog and Personal AI capability/scope notices with the existing shared semantic SVG `Icon` component. Add only the bounded icon shapes required for local Runtime, Personal AI, code hosting, browser AI, document, and deployment concepts.
2. Preserve the existing integration truthfulness, unavailable/coming states, owner-scoped settings, private conversation/memory scope, Runtime waiting boundary, accessible text, and all user data/permission semantics. Do not use the icon change to claim an external connector or local model is available.
3. Verify the RED→GREEN icon contract, user-product/root regressions, both builds, `git diff --check`, and the isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 89 verification result: complete for the Settings and Personal AI icon boundary. The initial contract failed on the missing `monitor` semantic icon; the fixed implementation passed focused contract `1/1`, user-product `217/217`, root `661/661`, both builds, diff validation, and full isolated browser E2E with `privateAiChatPersistenceIsolation: passed`, `settingsPermissionPersistenceIsolation: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes. External integrations and local model availability remain truthfully unverified or unavailable.

## Task 90: collaboration Teams and Community semantic icons

1. Replace presentation Unicode symbols in the approved Teams and Community surfaces with the existing shared semantic SVG `Icon` component. Cover collaboration headers, write/create controls, empty-state guidance, project/study badges, curriculum markers, and post reactions without changing routes, copy, data, permissions, or collaboration behavior.
2. Preserve the durable per-user Community like state and expose explicit accessible names (`좋아요 N` / `좋아요 취소 N`) so icon-only reaction controls remain usable without depending on Unicode glyphs in the accessibility tree.
3. Verify the RED→GREEN collaboration icon contract, the full user-product/root regressions, both builds, the isolated two-account browser matrix, and responsive `[390, 768, 1024, 1440]`. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 90 verification result: complete for the Teams and Community semantic icon boundary. The initial browser run exposed a stale E2E selector that still expected `❤️ 1` after the product correctly moved the heart into an SVG icon. Systematic debugging identified the missing product-level accessible label; the minimal fix added the explicit semantic label and updated the test to use it. The collaboration contract passed `1/1` (the combined icon/navigation/operational/state/responsive focus passed `5/5`), user-product passed `217/217`, root passed `661/661`, both builds passed, and full isolated browser E2E passed with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, `responsiveRoutes: 13`, and all collaboration journeys including `publicCommunityLikePersistence: passed` and `teamChatMembership: passed`. No operational process, durable UNKNOWN record, external provider, deployment, push, or AI Broadcast Room artifact was changed.

## Task 91: semantic icons for core user content surfaces

1. Extend the established shared semantic SVG `Icon` boundary to the general UI symbols in My World, Friends, Idea Lab, Activity/Portfolio, and Private Memory. Replace only generic presentation emoji used for navigation, status, headers, actions, privacy notices, and achievement/state markers; preserve character accessories and missing final approved art assets as separate design-source work.
2. Keep all existing user data, routes, persistence, owner-scoped APIs, social ACLs, Runtime truthfulness, export/share behavior, and accessibility names intact. `MyWorld` zone metadata must remain typed against `IconName`, and the private-memory notice must remain visibly and semantically locked to the current user scope.
3. Verify the RED→GREEN content icon contract, existing icon/navigation/operational/state/responsive contracts, user-product/root regressions, both builds, and the full isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 91 verification result: complete for the core content-surface presentation boundary. The new contract first failed on the existing Friends emoji header, then passed after semantic icons were added to My World, Friends, Idea Lab, PortfolioScreen, and MemoryVault. Focused icon/content/navigation/operational/state/responsive checks passed `6/6`; user-product passed `217/217`; root passed `661/661`; both builds passed; and full isolated browser E2E passed every existing journey with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. No product data/permission semantics, operational process, UNKNOWN record, external provider, deployment, push, or AI Broadcast Room artifact was changed.

## Task 92: semantic entry surfaces and durable Work Request write safety

1. Replace generic presentation emoji in Auth, Landing, Onboarding, and NotFound with the established shared semantic SVG `Icon` boundary. Preserve local-account authentication, truthful disabled external-provider states, onboarding persistence, actual character/AI companion assets, accessible labels, and all existing routes and API behavior.
2. Make the world-mission E2E journey identify the durable mission record by its stable `data-mission-id`, so dynamic mission copy changes cannot cause a false browser failure. Preserve the owner-scoped mission action, reload behavior, and explicit unverified/no-XP boundary.
3. Harden project Work Request durable writes for Windows transient rename contention by serializing writes per request path, reusing `renameWithTransientRetry()`, and cleaning failed temporary files without changing request identity, status semantics, or Runtime/Agent boundaries.
4. Verify RED→GREEN entry/content/collaboration/operational/state/navigation/responsive contracts, the Work Request store contract, user-product/root regressions, both builds, and the complete isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 92 verification result: complete for this implementation unit. The entry-surface contract passed `1/1`; the combined semantic-icon, responsive, world-state, and Work Request focus passed `16/16`; user-product passed `217/217`; root passed `662/662`; TypeScript and user UI builds passed; and the full isolated browser E2E passed all journeys with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. The first full browser run exposed a dynamic mission-label selector and an intermittent Windows Work Request rename race; systematic debugging reproduced the durable queued-file/temp-file mismatch and the fixes passed three repeated AI execution focuses plus the full matrix. No operational process, UNKNOWN request, external provider, deployment, push, or AI Broadcast Room artifact was changed.

## Task 93: semantic growth icons in the Character surface

1. Extend the shared semantic SVG `Icon` boundary with the bounded trophy shape required by the Character growth surface. Replace generic presentation symbols for development, learning, collaboration, consistency, customization, achievements, and locked cosmetic states in `user-ui/src/pages/Character.tsx`.
2. Preserve the existing project-bound character asset, accessory and room-item presentation, appearance persistence, owner-scoped API, growth/XP calculation, achievement evidence, routes, labels, and responsive layout. Do not convert character cosmetics into generic UI icons.
3. Verify the RED→GREEN Character icon contract, existing Character/state/navigation/responsive contracts, user-product/root regressions, both builds, and the complete isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external request boundaries, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 93 verification result: complete for the Character presentation boundary. The new contract first failed on the missing `trophy` icon, then passed after the shared icon and Character surface changes. Focused Character/state/navigation/responsive checks passed `5/5`; user-product passed `218/218`; root passed `662/662`; TypeScript and user UI builds passed; and full isolated browser E2E passed every journey with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. Cosmetic emoji assets were intentionally preserved as character/room-item presentation, not treated as generic controls. No operational process, UNKNOWN request, external provider, deployment, push, or AI Broadcast Room artifact was changed.

## Task 94: semantic growth icons in the public Profile surface

1. Reuse the established shared semantic SVG `Icon` boundary in `user-ui/src/pages/Profile.tsx` for development, learning, collaboration, consistency, and achievement expressions. Preserve the profile avatar initial and user-authored identity content; do not replace character or identity visuals with generic symbols.
2. Preserve owner-scoped profile editing, read-only public viewing, privacy-gated growth/projects/learning/portfolio projections, achievement evidence, routes, persistence, and accessible text. This is a presentation-only change and must not create new growth or portfolio data.
3. Verify the RED→GREEN Profile icon contract, related Profile/Character/state/navigation/responsive contracts, user-product/root regressions, both builds, and the complete isolated two-account browser matrix. Preserve operational Runtime/Agent state, stale lock, UNKNOWN records, external AI/providers, deployment, push, approved design-source uncertainty, and deferred AI Broadcast Room.

Task 94 verification result: complete for the Profile growth presentation boundary. The new contract first failed because `Profile.tsx` did not import the shared icon component; after the minimal implementation, focused Profile/Character/state/navigation/responsive checks passed `6/6`, user-product passed `219/219`, root passed `662/662`, TypeScript and user UI builds passed, and full isolated browser E2E passed every journey with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. No profile data, privacy, growth, portfolio, Runtime, UNKNOWN, external-provider, deployment, or deferred AI Broadcast Room boundary changed.

## Task 95: truthful weekly digest availability boundary

1. Preserve the existing owner-scoped `notifications.weekly` setting and API shape, but mark the user UI as unavailable because no approved producer, aggregation, or scheduling specification exists for a weekly digest.
2. Render the weekly activity digest row with `준비 중`, a disabled switch, and `aria-disabled`, while preserving the other notification producers/settings, routes, user isolation, and durable data compatibility.
3. Add RED→GREEN contract and focused/full browser verification. Do not call external providers, change the operational Runtime/Agent, replay UNKNOWN requests, or alter the deferred AI Broadcast Room boundary.

Task 95 verification result: complete for the truthful weekly digest availability boundary. The new contract first failed because the Settings source did not expose an unavailable-state contract; after the minimal UI change, focused notification/settings contracts passed `3/3`, user-product passed `220/220`, root passed `662/662`, both builds passed, and the focused and full isolated browser journeys passed. Full browser verification retained two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. The initial focused browser attempt exposed an ambiguous test locator shared by the notification bell and Settings navigation; scoping the locator to the Settings `nav` fixed the harness issue without changing product behavior.

## Task 96: semantic verification icons and resilient learning-runtime browser wait

1. Replace the remaining generic checkmark glyphs in the active `PortfolioScreen` and public portfolio surface with the established shared semantic SVG `Icon` component. Preserve portfolio evidence text, owner-scoped provenance links, visibility rules, public URLs, and verification semantics; do not alter the unused legacy page or character cosmetic presentation in this unit.
2. Make the isolated learning-to-project Runtime browser journey use a named 30-second condition-based completion window instead of a fixed 12-second attempt count. This is a test-harness reliability boundary for cumulative local load; it does not change production Runtime, Work Request, Run, or approval behavior.
3. Verify RED→GREEN portfolio/runtime-browser contracts, the focused and full browser journeys, user-product/root regressions, both builds, and diff validation. Preserve operational Runtime/Agent state, stale lock, UNKNOWN requests, external providers, deployment/push, and deferred AI Broadcast Room artifacts.

Task 96 verification result: complete for the active portfolio verification icon boundary and isolated browser wait reliability. The portfolio icon contract first failed on the active surfaces' remaining checkmark glyphs and passed after the minimal `Icon name="check"` implementation; the runtime-browser contract first failed because the named timeout was absent and passed after the 30-second condition window was added. Focused portfolio contracts passed `4/4`, the runtime-browser contract passed `1/1`, user-product passed `221/221`, root passed `662/662`, both builds passed, the focused learning-runtime browser journey passed, and the full isolated browser matrix passed with `learningProjectRuntimeIntegrationUi: passed`, two-account isolation, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. One pre-fix full browser run reproduced the old 12-second false negative with a queued Work Request; the focused journey then passed and the post-fix full run passed.

## Task 97: semantic entry-state confirmation icons

1. Replace the remaining generic checkmark glyphs in the active Auth, Landing, and Onboarding state/action UI with the established shared semantic SVG `Icon name="check"` boundary. Preserve local authentication, candidate selection, onboarding persistence, copy, accessible semantics, routes, and the existing character/AI visual assets.
2. Keep character accessories and room-item cosmetics as visual assets; this unit does not infer final approval for missing character/background/environment artwork or alter the approved design source.
3. Verify the RED→GREEN entry-state contract, the existing entry-icon contract, user-product/root regressions, both builds, full isolated browser journeys, and diff validation. Preserve operational Runtime/Agent state, stale lock, UNKNOWN requests, external providers, deployment/push, and deferred AI Broadcast Room artifacts.

Task 97 verification result: complete for the active entry-state confirmation icon boundary. The new contract first failed because the active pages still lacked the shared check icon; after the minimal presentation-only implementation, the focused entry-state and entry-icon contracts passed `2/2`, user-product passed `223/223`, root passed `662/662`, `npm.cmd run build` and `npm.cmd run user-ui:build` passed, `git diff --check` passed, and full isolated browser E2E passed all journeys with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. No user data, permission, Runtime, Work Request, UNKNOWN, external-provider, deployment, push, approved-design, or AI Broadcast Room boundary changed.

## Task 98: provisional personal-world environment asset

1. Add the generated original `v1-provisional` personal workshop raster asset under `user-ui/public/assets/environments` and expose it through a focused `EnvironmentAssets` component. Keep the asset explicitly provisional because the supplied redesign ZIP does not contain the final approved environment-art source.
2. Layer the environment image into the existing My World character header without replacing the existing SVG background, user character, AI companion, world data, routes, or permissions. The image and its fallback must be visual-only (`pointer-events-none`); a failed image must render an accessible fallback and leave the underlying information flow usable.
3. Verify the RED→GREEN environment asset contract, real browser image loading and fallback behavior, user-product/root regressions, both builds, full isolated browser journeys, and diff validation. Preserve operational Runtime/Agent state, stale lock, UNKNOWN requests, external providers, deployment/push, and deferred AI Broadcast Room artifacts.

Task 98 verification result: complete for the provisional personal-world environment integration, not final art approval. The environment contract first failed because the asset/component was absent, then passed; the first full browser run reproduced a pointer-event regression where the absolute image intercepted an existing activity link, the contract was extended to require the visual-only boundary, and the minimal `pointer-events-none` fix passed. Final focused environment/character contracts passed `3/3`, the character-assets browser focus passed with `personalWorldEnvironmentAssetUi: passed` for both real load and fallback, user-product passed `224/224`, root passed `662/662`, `npm.cmd run build` and `npm.cmd run user-ui:build` passed, and the final full isolated browser matrix passed with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, `responsiveRoutes: 13`, and `personalWorldEnvironmentAssetUi: passed`. The generated asset is not claimed as the missing final approved art source.

## Task 99: mobile Project Workspace navigation

### Completed in this unit

1. Added a mobile-only `role="tablist"` to the approved Project Workspace with `개요`, `작업`, `AI 협업`, and `실행·증거` tabs. The desktop layout keeps all existing sections visible through the `md` breakpoint boundary.
2. Kept project structure with the task/files surface, exposed the existing AI proposal/discussion panels through the AI collaboration surface, and kept lifecycle, history, Runtime state, and verified evidence under execution/evidence. Solo projects receive an explicit AI-collaboration unavailable state instead of a blank panel.
3. Preserved the existing owner scope, approval checkpoint, Run identity, Runtime evidence, team transition, and project data flows. No API, durable schema, Runtime, Agent, or external-provider boundary changed.

### TDD and verification

- The mobile workspace contract first failed because `Projects.tsx` had no workspace tab boundary; it passed after the minimal UI integration.
- The first focused browser run found that project structure was still placed in the evidence tab; it was moved to the task tab. The next run found an ambiguous `AI 협업` text locator; the browser harness was narrowed to the semantic heading. These were fixed without weakening product assertions.
- Focused mobile contract passed `1/1`; combined Project Workspace/lifecycle/runtime/mobile contracts passed `5/5`; user-product regression passed `225/225`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing warnings.
- Focused mobile browser verification and the final full isolated browser matrix passed. The full result includes `projectWorkspaceMobileTabsUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, external AI/provider request, GitHub push, or deployment occurred.

## Task 100: personal-space navigation truthfulness

### Completed in this unit

1. Replaced the desktop sidebar's non-functional `개인 공간` button with an accessible link to the existing `/world` route. The visual mode selector, team-space link, active-route semantics, and mobile menu remain unchanged.
2. Added a user-product contract and a focused/full browser journey that verify the control exposes the `/app/world` route and navigates there from an authenticated settings page.

### TDD and verification

- The RED contract reproduced the dead button in `user-ui/src/components/Navigation.tsx`; the minimal link replacement passed the contract.
- The first focused browser run correctly exposed a stale static UI bundle because the source change had not yet been rebuilt. After `npm.cmd run user-ui:build`, the same browser journey passed without changing the assertion.
- Focused navigation contract passed `1/1`; user-product regression passed `226/226`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; `git diff --check` passed with existing line-ending warnings; focused and full isolated browser E2E passed with `personalSpaceNavigationUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708` still owns loopback ports `18890` and `18891`; Desktop Agent PID `22416` is unchanged. The configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, external AI/provider request, GitHub push, or deployment occurred.

## Task 101: public profile and social character asset fidelity

### Completed in this unit

1. Replaced the public Profile name-initial color circle with the existing project-bound `UserCharacterAsset`, preserving the owner-scoped profile API, read-only public viewing, privacy projections, and authored identity fields.
2. Replaced the same initial-circle treatment in Friends search results, friend list, and the selected conversation header. Each rendered asset keeps a user-specific accessible label while using the existing `/app/assets/characters/iseol-user-character-v1.png` path and explicit image-failure fallback.
3. Updated the older Profile icon contract so it no longer asserts the superseded initial-circle behavior. No public avatar field, character privacy projection, durable schema, or cross-user ACL was invented in this presentation-only unit.

### TDD and verification

- The new `tests/user-ui-profile-character-asset-contract.test.ts` first failed because Profile and Friends still used `displayName.slice(0, 1)` / `displayName[0]`; it passed after the minimal shared-asset integration.
- The first user-product regression exposed the prior `tests/user-ui-profile-icon-contract.test.ts` expectation for the initial circle. That stale contract was updated to assert `UserCharacterAsset`; no product behavior was weakened.
- Focused Profile/Friends contracts passed `5/5`; user-product regression passed `227/227`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and full isolated browser E2E passed with the public-profile image source assertion, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Design and safety boundary

- The attached redesign ZIP still does not contain final approved per-user avatar/character variants. This unit reuses the existing real project-bound v1 asset and does not claim final art approval or user-specific visual variants.
- Public profile privacy/API projections remain unchanged; the character image is presentation-only and does not expose world appearance or private data. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched.

## Task 102: truthful AI Chat conversation export

### Completed in this unit

1. Added a real local Markdown export action to the existing AI Chat header. It exports only the currently selected, already-persisted conversation messages, uses a stable owner-bound conversation filename, and reports the download start through the existing status surface.
2. Disabled export until a conversation contains persisted messages or while another chat operation is busy. No fake AI response, Runtime call, file mutation, project execution, or external upload is introduced.
3. Extended the AI Chat contract and isolated browser journey to verify the local download event and filename while preserving private conversation and Runtime-waiting semantics.

### TDD and verification

- The AI Chat contract first failed because `AIChat.tsx` had no export action; it passed after the minimal browser-local Blob/download implementation.
- Focused AI Chat contracts passed `2/2`; user-product regression passed `227/227`; root build passed; `npm.cmd run user-ui:build` passed with only existing Vite warnings; and the full isolated browser matrix passed the real `download` event assertion plus two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Scope boundary

- File attachment, explicit project linking, execution-plan approval/rejection, and editable context remain unimplemented because the current AI Chat durable contract has no approved request/schema/ACL for them. They are not shown as active fake controls, and this unit does not invent a new AI execution path.
- The local export contains only data already visible to the authenticated user. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched.

## Task 103: My World AI approval visibility

### Completed in this unit

1. Read the existing owner-scoped AI Team proposal list for the current AI or mixed project and join accepted proposals to queued or waiting Project Work Requests through their durable `workRequestId`.
2. Add a truthful `사용자 확인이 필요한 AI 작업` surface to My World. It shows the persisted proposal title/objective, separates execution confirmation from resume confirmation, and links to the existing Project Workspace approval checkpoint. An empty state does not claim an AI result or completed Run.
3. Extend the isolated browser journey so the accepted AI proposal is visible in My World and the real link returns to the owner-scoped Project Workspace before the existing approval/cancel/execute checks continue.

### TDD and verification

- `tests/user-ui-world-ai-approval-contract.test.ts` first failed because My World did not load AI proposals or expose the pending-work boundary. The minimal read-only integration passed the focused contract.
- Focused My World/AI proposal contracts passed `3/3`; `npm.cmd run test:iseol-user-product` passed `228/228`; `npm.cmd run build` passed; `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings; `git diff --check` passed with existing line-ending warnings; and the full isolated browser matrix passed with `aiTeamProposalExecutionApprovalUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- This unit only reads existing authenticated proposal/project state and adds navigation to the existing workspace. It does not create a Work Request, dispatch a Run, alter approval settings, call external AI, replay UNKNOWN records, or touch operational data. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched.

## Task 104: owner-scoped project context in Personal AI Chat

### Completed in this unit

1. Added an optional project context selection to Personal AI Chat. The selector is populated from the authenticated user's visible projects, and the next user message carries only the selected project id.
2. Added server-side owner/team ACL validation and the `aiAccess.projectFiles` permission boundary. The durable user message stores the selected project id so the context indicator restores after reload; the Runtime context contains bounded project metadata only, never file contents or execution permission.
3. Added explicit UI truthfulness: the selected message reports `프로젝트 맥락 연결됨`, while the selector explains that files and execution rights are not automatically shared. Foreign-user project ids are rejected without appending a message.
4. Extended the real isolated browser journey to create a solo owner project, select it in the UI, verify durable message persistence and reload restoration, and verify that the second account cannot see the project.
5. Made the selector permission-aware: the UI reads the authenticated `aiAccess.projectFiles` setting, fails closed while settings are unavailable, and explains `프로젝트 맥락 권한 꺼짐` instead of exposing an active control when the user has disabled project context.

### TDD and verification

- Backend and UI contracts were RED before implementation and GREEN after the bounded changes. The product suite passed `232/232`; TypeScript build and user UI Vite build passed with only existing Vite config/chunk-size warnings; and the full isolated browser matrix passed all existing journeys plus project-context persistence, permission-off selector behavior, two-account isolation, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- The first browser attempt failed only because the E2E selector requested an exact match for a status span that also includes time and Runtime state. Systematic debugging traced the failure to that selector; the minimal selector correction passed the complete rerun.

### Scope boundary

- This unit does not add file attachment, editable context, execution-plan generation, or automatic execution approval. Those remain separate capabilities until an approved durable request/schema/ACL contract exists. AI Broadcast Room remains deferred.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched.

## Task 105: server-revoked logout and reconnect-safe relogin

### Completed in this unit

1. Added `POST /api/user/logout` to revoke the authenticated platform session on the server. The route resolves the bearer principal, revokes only that session, and returns a bounded `loggedOut` result; the old token is rejected afterward.
2. Connected Settings logout to the route while preserving local cleanup and guaranteed navigation to login when the server is unavailable.
3. Hardened the browser API boundary so a late `401` from an older authenticated request cannot clear a newer login session. Login also resets the user store to `loading` before the protected shell mounts, preventing a relogin race from redirecting a valid session back to login.
4. Added focused auth contracts and an isolated browser focus for server revocation, relogin, and the stale-request race. The full browser runner now includes the same journey.

### TDD and verification

- The logout route test was RED while the route returned `404`, then passed after the route and server allowlist implementation. The stale-session contract was RED before the token-aware cleanup guard, and the relogin contract was RED before the store reset; all focused auth contracts then passed `4/4`.
- Product regression passed `236/236`; root regression passed `662/662`; TypeScript build and user UI build passed with only the existing Vite config/chunk-size warnings; the focused `logout-relogin` browser journey passed; and the full isolated browser matrix passed with `logoutServerRevocationAndRelogin: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Debug evidence: the first browser attempt reproduced a real redirect race. A settings request in flight during logout left the store in `unauthenticated`, and the protected shell redirected before the new profile load completed. The final fix was limited to session-aware cleanup and authenticated-store initialization; no assertion was weakened.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 106: bounded owner-scoped AI Chat text attachments

### Completed in this unit

1. Added a real text-file attachment flow to the existing owner-scoped AI Chat. The browser reads bounded text files locally, the API validates the same contract, and persisted user messages restore their attachment name, MIME type, byte size, and content after reload.
2. Restricted the contract to at most three text attachments per message, 24KB per file, and 48KB aggregate content so the shared 64KB JSON request limit remains safe after metadata. Names are path-sanitized and generated attachment IDs are server-owned.
3. Passed attachments only as bounded user context to the loopback-only local Runtime adapter. No file execution, workspace write, binary upload, external AI request, or automatic execution permission is introduced. Markdown export includes the already-visible attachment content.
4. Added isolated two-account browser coverage for file selection, durable rendering, reload persistence, export, and existing project-context/privacy boundaries.

### TDD and verification

- RED contracts first reproduced the missing attachment schema, acceptance/rejection behavior, and UI file-input contract. Focused AI Chat/API/Runtime/UI tests passed `13/13`; `npm.cmd run test:ai-chat` passed `20/20`.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings. The full product regression remained green at `241/241`, and the root regression remained green at `662/662`.
- Focused and full isolated browser E2E passed `aiChatAttachmentsUi: passed`, including two-account isolation, reload persistence, export, project-context permission behavior, and responsive `[390,768,1024,1440]` across 13 routes. One initial browser failure was traced to an exact selector that no longer matched the composite message bubble; the product state was already correct, and the bounded locator correction passed the complete rerun.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 107: per-message AI Chat context editing

### Completed in this unit

1. Added a durable `contextSelection` to AI Chat user messages. Each message can explicitly choose personal memory, learning history, project metadata, verified activity timeline, and team-shared study documents; legacy messages remain compatible through the existing default behavior.
2. Added server-side normalization and permission enforcement. A disabled account permission never becomes enabled through the message request, a project id cannot be sent when project context is disabled for that message, and the selected context is the only context passed to the local Runtime adapter.
3. Added the real `맥락 편집` UI with permission-aware checkboxes, next-message scope semantics, reload restoration, and copy that explicitly excludes file changes and execution rights. The existing project selector and attachment flow remain owner-scoped and bounded.
4. Added a two-account isolated browser journey for editing memory/learning scope, durable API persistence, reload restoration, project context retention, and private conversation isolation.

### TDD and verification

- RED contracts first reproduced automatic memory leakage into a deselected context, missing durable selection state, and the missing UI editor. Focused context contracts passed `3/3`; the AI Chat suite passed `22/22`; user-product regression passed `241/241`; root regression passed `662/662`.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed with only existing Vite warnings and line-ending notices. Focused browser verification passed `aiChatContextSelectionUi: passed`; full isolated browser E2E passed both `aiChatContextSelectionUi: passed` and `aiChatAttachmentsUi: passed`, two-account isolation, reload persistence, all existing journeys, and responsive `[390,768,1024,1440]` across 13 routes.
- One regression was an obsolete source-string assertion for `projectId: selectedProjectId`; it was updated to assert the new `projectIdForMessage` safety normalization after browser/API behavior already passed.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 108: AI Chat execution-plan proposal approval boundary

### Completed in this unit

1. Added a versioned, owner-scoped `executionPlan` attached only to an assistant message when the injected/local Runtime actually returns a plan. The service validates bounded title, summary, step count, operation type, and approval flags; it does not invent a plan when Runtime is unavailable.
2. Added durable `approveExecutionPlan` and `rejectExecutionPlan` transitions with owner-bound conversation/message lookup, proposed-only state transitions, timestamps, idempotency for the same state, and no work-request, project-run, file-write, or external-call side effect.
3. Added authenticated API routes and real AI Chat controls for `실행 계획 승인` and `실행 계획 거절`. The UI renders plan steps and clearly states that approval/rejection is only a decision record and `별도 실행은 시작되지 않았습니다.`
4. Added a deterministic plan-producing Runtime only to the isolated browser harness. Focused and full browser journeys verify proposal rendering, approval, rejection, API persistence, reload persistence, two independent conversations, and that approval does not create a project/run.

### TDD and verification

- RED contracts first reproduced the missing Runtime plan persistence, approval/rejection methods, and UI/API controls. Focused execution-plan contracts passed `3/3`; the AI Chat suite passed `24/24`.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings. Focused browser verification passed `aiChatExecutionPlanUi: passed`; full isolated browser E2E passed every existing journey plus `aiChatExecutionPlanUi: passed`, `aiChatContextSelectionUi: passed`, and `aiChatAttachmentsUi: passed`, with responsive `[390,768,1024,1440]` across 13 routes.
- The plan-producing Runtime is test-only and separate from the operational Runtime PID `1708`; no live Ollama model was started or called.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 109: AI Chat plan to queued Project Work Request handoff

### Completed in this unit

1. Added an explicit `프로젝트 작업 요청 만들기` action for an approved AI Chat plan that carries owner-selected project context. The action creates an idempotent, owner-scoped `queued` Work Request from the bounded plan title, summary, and steps.
2. Persisted the resulting `workRequestId` back onto the execution plan so the conversation remains reconnectable and repeat handoff calls resolve the same project request without creating another identity.
3. Kept the execution boundary explicit: the handoff does not create a Run, claim a queue item, call the Runtime/Agent, write files, or call an external provider. Actual Run approval remains in the existing Project Workspace checkpoint.
4. Added API/UI/browser coverage for project selection, approval, handoff, queued status, reload persistence, rejection, and no-start behavior. After handoff, the owner can follow a real link into the selected Project Workspace to inspect the queued request and existing Run approval checkpoint. Plans without a project context cannot be converted to a project request.

### TDD and verification

- RED first reproduced the missing service handoff method. Focused execution-plan contracts passed `4/4`; the AI Chat suite passed `25/25`.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings. Focused browser verification passed `aiChatExecutionPlanUi: passed`; the journey verified a real owner project, a queued Work Request, `runtime.status: not-started`, rejection, and reload persistence.
- Focused browser verification passed `aiChatExecutionPlanUi: passed`; the full isolated browser regression passed every journey, including the Project Workspace link/checkpoint boundary, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes. No operational Runtime/Agent was used.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 110: Project Workspace bounded Run observability

### Completed in this unit

1. Added an owner-scoped `observability.runs` projection to `UserProjectView`. It is built only from evidence whose `projectId` and `runId` match the selected project Run; missing durable Runs remain `unknown` instead of becoming success.
2. The projection separates bounded evidence into changed files, test/build checks, and command-log summaries. Raw references and command output are not added to this user-facing read model, and each category is capped at 100 records.
3. Added a truthful preview state. Unless a future Runtime contract records a preview address, the Project Workspace says `미리보기 주소가 기록되지 않았습니다.`; no preview URL is fabricated from a deployment or workspace path.
4. Added the real Project Workspace `Run 관찰 기록` panel while preserving the approved desktop/mobile structure and existing lifecycle/history panels. Empty, waiting, unknown, and unavailable states remain explicit.

### TDD and verification

- RED first reproduced the missing observability read model and UI panel. Focused project/UI contracts passed `16/16` after the bounded projection and panel were implemented.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings. User-product regression passed `242/242`; root regression passed `662/662`; focused Project Workspace browser verification passed `projectWorkspaceMobileTabsUi: passed`; and the full isolated browser E2E passed every journey, including real project Runtime completion, failure recovery, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- The first focused browser rerun exposed a strict locator collision caused by the same verified evidence being intentionally rendered in both lifecycle and observability panels. The locator was narrowed to the first matching evidence item; no product assertion was weakened.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 111: bounded Project Workspace file inventory

### Completed in this unit

1. Added an owner-scoped `workspace.files` projection to `UserProjectView`. It recursively lists only bounded relative file paths and byte sizes from the already provisioned project workspace; it never reads or returns file contents.
2. Skipped secret-like names and generated/metadata directories (`.env`-like files, `.git`, `.iseol`, `node_modules`, build/cache directories), ignored symlinks, rejected path escape, and capped the result at 500 files/8 directory levels with an explicit truncation flag.
3. Added the real Project Workspace `실제 작업공간 파일` panel. The UI exposes truthful unavailable/empty/truncated states and preserves the approved desktop/mobile structure, lifecycle evidence, Run observability, approval, and recovery surfaces.
4. Extended the isolated browser journey to assert the bounded file schema and Project Workspace rendering after reload and in the mobile 작업 tab.

### TDD and verification

- RED first reproduced the missing `workspace.files` read model and UI contract. Focused project/UI tests passed `18/18` after implementation.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, user-product regression `244/244`, root regression `662/662`, focused `projectWorkspaceMobileTabsUi: passed`, and the full isolated browser E2E all passed. The browser matrix passed two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- The user UI build retains only the existing Vite native-config and chunk-size warnings. No assertion reads file contents; test fixtures verify that `.env`, `.git`, absolute paths, and content-shaped fields are not exposed.

### Scope boundary

- This unit exposes metadata only. It does not add file preview/content delivery, a fabricated live preview URL, a new Runtime execution path, or external upload. Actual project execution remains behind the existing owner approval and Runtime/Agent boundaries.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, approved design-source uncertainty, and deferred AI Broadcast Room artifacts remain untouched.

## Task 112: verified Project Workspace preview links

### Completed in this unit

1. Extended the owner-scoped Run observability projection so a preview is `ready` only when the selected Run contains a `production-verification` evidence record with a safe HTTP(S) reference. Deployment provider and verification time are carried through as bounded metadata.
2. Rejected `javascript:`, credential-bearing, malformed, and non-HTTP(S) references. Runs without a verified preview remain explicitly unavailable, and missing durable Runs remain `unknown`.
3. Added the real `미리보기 열기` link only for a recorded verified URL. The UI labels it as a recorded preview address and keeps the no-preview state; it does not fabricate a URL from a workspace path, deployment placeholder, or Run success status.

### TDD and verification

- RED first reproduced the missing verified-preview projection and UI branch. Focused project/UI tests passed `20/20` after implementation.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, user-product regression `246/246`, root regression `662/662`, and the full isolated browser E2E passed. Browser verification covered the existing no-preview state alongside Project Workspace execution/approval/recovery/team transitions, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- The ready branch is backed by a durable `deployment` plus `production-verification` evidence fixture; the browser matrix confirms the normal completed Run still does not show an active preview without such evidence. Vite emitted only the existing native-config and chunk-size warnings.

### Scope boundary

- This unit exposes an already-recorded preview URL; it does not start a preview server, deploy externally, revalidate a URL, or claim that a missing preview is live. External deployment remains approval/configuration-bound.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, approved design-source uncertainty, and deferred AI Broadcast Room artifacts remain untouched.

## Task 113: accessible mobile navigation modal

### Completed in this unit

1. Added a RED contract for the mobile 전체 메뉴 overlay before implementation.
2. Kept the approved visual menu and destinations while giving the overlay dialog semantics (`role="dialog"`, `aria-modal`, labelled title) and connecting the trigger through `aria-controls`/`aria-haspopup`.
3. Added Escape dismissal, Tab focus containment, initial focus on the close control, and focus return to the menu trigger after close. The close and trigger controls now have explicit button types.
4. Added the contract to the `test:iseol-user-product` regression command.

### TDD and verification

- The new accessibility contract and related navigation/notification/responsive contracts passed `5/5`.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, user-product regression `247/247`, root regression `662/662`, and the full isolated browser E2E all passed. The browser matrix retained two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, and responsive `[390,768,1024,1440]` coverage across 13 routes. The UI build emitted only the existing Vite native-config and chunk-size warnings.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 114: live browser proof for mobile navigation accessibility

### Completed in this unit

1. Added a RED contract requiring the browser runner to expose and execute a real mobile navigation keyboard flow; the contract failed before implementation because the runner lacked the verifier and explicit result field.
2. Added `verifyMobileNavigationAccessibilityUi` to `scripts/iseol-user-ui-e2e.ts`. It drives the real `/app/settings` page at 390px and checks the menu trigger semantics, modal dialog state, focus transfer, Tab/Shift+Tab wrapping, Escape close, and focus restoration.
3. Added the focused `mobile-navigation-accessibility` browser path and changed the full browser path to execute the personal-space and mobile navigation verifiers before emitting their pass fields.

### TDD and verification

- Focused navigation contract: `2/2` passed.
- Focused browser path: `mobileNavigationAccessibilityUi: "passed"`.
- `npm.cmd run user-ui:build`: passed.
- `npm.cmd run build`: passed.
- Isolated full browser E2E: passed all journeys with two accounts, 390/768/1024/1440 viewports, 13 responsive routes, and both navigation pass fields.
- `npm.cmd run test:iseol-user-product`: `248/248` passed.
- `npm.cmd test`: `662/662` passed.

### Safety boundary

- This unit used isolated browser accounts and local builds/tests only. Operational Runtime PID `1708`, Agent PID `22416`, ports `18890`/`18891`, stale lock metadata for PID `55000`, durable records, and UNKNOWN requests remained untouched. No Runtime/Agent/browser restart, external AI/provider request, deployment, push, or deferred AI Broadcast Room change occurred.

## Task 115: safe Runtime/Agent status and browser-verified UI trust fixes

### Completed in this unit

1. Added the safe authenticated `agent` capability state and surfaced it beside the existing Runtime state in Settings without exposing operational roots, ports, locks, or operator data.
2. Made Settings permission toggles resilient to immediate interaction and rapid independent clicks by awaiting initial settings, applying the latest owner-scoped state, and serializing durable patches.
3. Corrected browser-proven ISEOL trust-surface mismatches: mobile dialog naming, AI companion accessible naming, and canonical AI conversation export filenames. Fixed the missing `updateSettings` import exposed by the real browser path.
4. Made the runtime-status test session clock deterministic so its expiry fixture does not depend on wall-clock time.

### TDD and verification

- Focused Runtime/UI contracts passed `41/41`.
- `npm.cmd run test:iseol-user-product`: `248/248`.
- `npm.cmd test`: `662/662`.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed. UI build output retained only the existing Vite native-config and chunk-size warnings.
- Full isolated browser E2E passed every reported journey, including two-user isolation, reload persistence, project Runtime/Agent approval and recovery, character/environment assets, settings permission persistence, AI Chat export, mobile accessibility, and responsive `390/768/1024`/`1440` coverage across 13 routes.

### Scope and safety boundary

- This unit does not claim live Ollama/model generation, external connectors, final approved art originals, weekly digest production, or AI Broadcast Room completion. Broadcast artifacts remain preserved and deferred.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, prior durable records, deployment/push state, and external providers remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or deferred broadcast change occurred.

## Explicitly deferred

AI broadcast room implementation, TTS/video export, external streaming, and general-purpose social debate remain deferred. Existing broadcast-related plans and artifacts are preserved.

## Completion gate

Do not claim the product is complete until the full suite, user UI build, isolated browser journeys, persistence/reconnect checks, two-user authorization checks, actor-attributed growth/portfolio evidence, and failure/recovery behavior all have fresh evidence. If an external account, operator approval, or Runtime ownership decision remains necessary, report that blocker and continue independent local work instead of fabricating success.

## Task 116: live Agent capability refresh across Project Workspace and Settings

### Completed in this unit

1. Aggregated all configured required Desktop Agent IDs for the composed Runtime and updated the safe authenticated `agent` capability on connect/disconnect events, including Project-only Runtime configurations.
2. Added Settings Runtime-status polling with a 10-second bounded interval, visible-document refresh, and deterministic cleanup on unmount.
3. Hardened Settings durable writes with the existing transient Windows rename retry boundary after a real browser `EPERM` collision, with a durable reload test.
4. Added RED-first unit and source-contract coverage for Project Agent late reconnects, Idea Lab status transitions, UI refresh lifecycle behavior, and Settings persistence retry.

### TDD and verification

- Focused Runtime/UI contracts: `35/35` passed; Settings persistence contracts: `4/4` passed.
- `npm.cmd run test:iseol-user-product`: `249/249` passed.
- `npm.cmd test`: `663/663` passed.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed.
- Isolated full browser E2E passed all reported journeys, including Runtime status, Settings permission isolation, Project Workspace local-Agent/execution/recovery, two-account isolation, reload persistence, and responsive `390/768/1024/1440` coverage across 13 routes.

### Scope and safety boundary

- This unit does not claim live Ollama/model generation, external connector availability, final approved art originals, weekly digest production, or AI Broadcast Room completion. Broadcast artifacts remain preserved and deferred.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, durable records, deployment/push state, and external providers remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or deferred broadcast change occurred.

## 2026-09-27 continuation: character reset/hydration guard and AI Chat reconnect race

- RED → GREEN: added the character customization reset contract and browser journey. user-ui/src/pages/Character.tsx now keeps 초기화 as a draft-only action that restores the approved default accessory/appearance/room selection without persisting until 저장하기; profile hydration must finish before editor controls become active, preventing late API data from overwriting a user's immediate selection.
- RED → GREEN: reproduced and fixed an intermittent AI Chat browser failure where the initial conversation load could overwrite a just-created conversation before the first message. user-ui/src/pages/AIChat.tsx now uses load generations, owner/current-conversation refs, an in-flight conversation mutation boundary, a post-create refresh, and a conversation-id fallback for send; missing conversation state now reports an honest UI error instead of silently dropping the send.
- Evidence: tests/user-ui-character-contract.test.ts, tests/user-ui-ai-chat-execution-plan-contract.test.ts, scripts/iseol-user-ui-e2e.ts, user-ui/src/pages/Character.tsx, and user-ui/src/pages/AIChat.tsx. Focused contracts passed 2/2; character customization browser passed four repeated runs; AI execution-plan browser passed four repeated runs on the rebuilt UI; npm.cmd run test:iseol-user-product passed 249/249; npm.cmd test passed 663/663; root/UI builds and git diff --check passed; and the latest full isolated browser E2E passed every reported journey, including aiChatExecutionPlanUi, characterCustomizationUi, two-account isolation, reload persistence, Runtime/Agent approval and recovery, and responsive [390, 768, 1024, 1440] across 13 routes.
- Debug boundary: an initial full browser failure was traced to the AI Chat load/mutation race. A subsequent diagnostic run also exposed that browser verification must rebuild user-ui/dist after source changes; the final run used the freshly rebuilt bundle. Temporary request/DOM diagnostics were removed. Existing Vite native-config/chunk-size warnings remain non-fatal.
- Safety and scope: only isolated local accounts, tests, and builds were used. Operational Runtime PID 1708, Desktop Agent PID 22416, ports 18890/18891, configured dataRoot, stale lock PID 55000, UNKNOWN requests, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, prior durable records, and deferred AI Broadcast Room artifacts remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or broadcast change occurred.
## 2026-09-27 continuation: owner-controlled queued Work Request cancellation

- Project Workspace now exposes a truthful cancellation boundary for work that has not started a Run. src/project-model/user-project-service.ts adds owner-only cancelWorkRequest; it rechecks project ownership, accepts only queued requests, atomically persists cancelled with a bounded Korean reason, and never touches an existing Run or Runtime/Agent process.
- src/project-model/user-project-router.ts and user-ui/src/api/userApi.ts expose the authenticated POST /api/user/projects/:projectId/work-requests/:workRequestId/cancel path. user-ui/src/pages/Projects.tsx adds an explicit confirmation panel and 요청 취소 action only for queued work; cancelled requests render 취소됨, and waiting/running requests keep their resume/retry or status-only boundaries. The UI explicitly states that running Runs are not forcibly stopped here.
- RED evidence: before implementation, the new API journey returned 404 and the UI contract failed because the route/action did not exist. GREEN evidence: tests/user-project-api.test.ts and tests/user-ui-project-cancellation-contract.test.ts passed; focused browser projectWorkRequestCancellationUi: passed after narrowing one duplicate-title locator to the saved request card.
- Regression evidence: npm.cmd run test:iseol-user-product passed 251/251; npm.cmd test passed 663/663; npm.cmd run build; npm.cmd run user-ui:build; git diff --check; and full isolated browser E2E passed with projectWorkRequestCancellationUi: passed, two-account isolation, reload persistence, all existing Runtime/Agent and learning/collaboration/portfolio journeys, and responsive viewports [390,768,1024,1440] across 13 routes.
- Safety boundary: only isolated test accounts, the user API/UI, and local test roots changed. Operational Runtime PID 1708, Desktop Agent PID 22416, ports 18890/18891, configured dataRoot, stale lock PID 55000, UNKNOWN requests, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, external AI/provider request, UNKNOWN replay, operational data mutation, deployment, push, or broadcast change occurred.

## 2026-09-27 continuation: queued cancellation activity evidence

- RED → GREEN: cancellation now closes the local evidence loop. After the owner-only queued transition is persisted, `UserProjectService` records an idempotent `project.work.cancelled` event through the existing ActivityService. The event is `unverified`, user-attributed, owner-scoped, and contains only project/request identifiers.
- Growth projection remains intentionally unchanged: cancellation is not a verified project completion and contributes `0` XP. The UI and browser path verify the event after reload without exposing a force-stop control for running Runs.
- Verification: focused API/UI contracts `5/5`; focused browser cancellation journey; user-product `251/251`; root `663/663`; root/UI builds; `git diff --check`; and full isolated browser E2E with two-account isolation and responsive `390/768/1024/1440` coverage across 13 routes all passed.
- No operational Runtime/Agent restart, UNKNOWN replay, external AI/provider request, deployment, push, or AI Broadcast Room change occurred. Remaining external/live-runtime/design-source boundaries stay explicitly unverified or deferred.

## 2026-09-27 continuation: queued Work Request creation activity evidence

### Completed in this unit

1. Added the missing `Project → Task` activity edge: a newly created Work Request now emits one owner-scoped `project.work.created` ActivityEvent after durable creation.
2. Kept the event user-attributed and `unverified`, with only project/request identifiers in the payload and no growth XP implication.
3. Guarded the write with the service's `created` result so idempotent request replay cannot duplicate activity evidence.
4. Extended the isolated browser cancellation journey to verify both creation and cancellation events and the zero-XP boundary.

### TDD and verification

- RED first reproduced zero creation events; focused API/UI contracts then passed `6/6`.
- Focused browser `projectWorkRequestCancellationUi: passed`.
- `npm.cmd run test:iseol-user-product`: `252/252` passed.
- `npm.cmd test`: `663/663` passed.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed.
- A subsequent full isolated browser E2E passed every reported journey, including AI team execution approval, two-user isolation, reload persistence, and responsive `390/768/1024/1440` coverage across 13 routes. An earlier full-run AI team timing failure passed in focused and rerun full execution without relaxing assertions.

### Scope and safety boundary

- This unit proves the local durable activity edge only. It does not claim live Ollama/model generation, external connector availability, final approved art originals, weekly digest production, or AI Broadcast Room completion.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, durable operational records, deployment/push state, and external providers remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or deferred broadcast change occurred.

## Task 117: durable Community comments

### Completed in this unit

1. Added owner-attributed `CommunityComment` persistence under each public post, with chronological reads, published/hidden filtering, bounded content validation, and fail-closed missing/hidden-post access.
2. Added authenticated list/create comment routes, client API functions, and the approved Community screen's real comment list, author links, count, and submit form.
3. Preserved existing post visibility, per-user likes, profile navigation, and two-user isolation; no moderation or notification behavior was invented.

### TDD and verification

- RED reproduced the missing service method and missing UI/API comment contract.
- GREEN community service `2/2`, community UI contract `2/2`, user-product `274/274`, root `663/663`, root/UI builds, and diff validation passed.
- Full isolated browser E2E passed after narrowing one pre-existing like locator collision to `좋아요 0`; it reports `publicCommunityCommentPersistence: passed`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: Project Workspace line-numbered preview

### Completed in this unit

1. Added real line numbers and accessible line identifiers to the bounded Project Workspace text preview without modifying the source content or expanding the read-only boundary.
2. Extended the UI contract and isolated Local Agent browser journey to verify line 1 on the actual `package.json` preview.

### TDD and verification

- RED reproduced the missing line-number contract; GREEN focused UI contract passed `6/6`.
- `npm.cmd run test:iseol-user-product`: `276/276` passed; `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; existing Vite native-config and chunk-size warnings remained non-blocking.
- Full isolated browser E2E passed the real Local Agent file preview with line-number verification, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: learning report to portfolio publication bridge

### Completed in this unit

1. Added an owner-scoped Portfolio evidence projection for verified Learning Report outcomes.
2. Added the explicit Learning UI action that creates a private Portfolio draft linked to the selected report evidence; the user can explicitly edit that draft to public, and public views do not expose internal report provenance.
3. Added a separate `학습 보고서` evidence count to the existing Activity Timeline without changing the approved shell or evidence semantics.
4. Preserved the evidence boundary: unverified self-reports are excluded, and draft creation does not publish, grant XP, dispatch Runtime work, or call an external provider.
5. Added TDD/API/UI contract and isolated browser coverage through plan → session → verified attempt → report → private draft → edit visibility → public API/route → reload.

### TDD and verification

- RED reproduced missing learning-report evidence, the missing UI action, the missing learning-report count, and the missing stable edit locator; focused GREEN coverage passed `11/11`.
- `npm.cmd run test:iseol-user-product`: `272/272` passed; `npm.cmd test`: `663/663` passed.
- Root TypeScript and approved user UI builds passed; focused browser `learningReportPortfolioDraftUi: passed`; full isolated browser E2E passed all reported journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: public product information routes

### Completed in this unit

1. Replaced the landing footer's three dead `href="#"` targets with real local information routes: `/terms`, `/privacy`, and `/help`.
2. Added one shared accessible information-page surface that explains current data isolation, approval/Runtime boundaries, public portfolio visibility, external connector availability, and AI Broadcast Room deferral without inventing live capability.
3. Added contract and browser coverage for the three HTTP 200 routes and the existing 404 boundary.

### Verification

- Focused information-route contracts passed `2/2`; focused browser `informationRoutesUi: passed`; user-product regression passed `272/272`; root TypeScript and approved user UI builds passed; and full isolated browser E2E passed all journeys with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: password-change completion slice

### Completed in this unit

1. Added the authenticated password-change service, route, server dispatch entry, and Settings UI.
2. Persisted a new password salt/hash only after current-credential verification, then revoked every active session for the account.
3. Added the browser journey for password change, old-session invalidation, old-password rejection, new-password login, and return to the user's world.

### TDD and verification

- RED first reproduced a missing service method; the server integration RED then reproduced the omitted route allowlist as `404`.
- GREEN focused auth/UI/server coverage passed `12/12`.
- `npm.cmd run test:iseol-user-product`: `270/270` passed; `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only the existing native-config and chunk-size warnings.
- Full isolated browser E2E passed `passwordChangeUi` and all existing journeys with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: owner-scoped Personal AI profile Runtime context

1. Connected the existing Settings AI profile (`name`, `personality`, `tone`, `role`) to the owner-scoped AI Chat context and loopback local adapter. The profile is bounded style metadata and never changes authorization, privacy, approval, or execution behavior.
2. Wired the profile service into both the composed Runtime and isolated browser server, avoiding a second unscoped profile store. Added RED/GREEN coverage for owner isolation, bounded prompt mapping, and the safety label in the local system prompt.
3. Added a browser focus journey that saves a profile through `/app/settings`, reloads it, opens `/app/ai-chat`, observes the configured name, and sends a message through the deterministic isolated Runtime.

Verification: AI Chat/profile focused tests `33/33`; product regression `267/267`; root regression `663/663`; root/UI builds passed; and browser focus `aiAgentProfileUi: passed`. Ollama was not started or called; the operational Runtime/Agent, UNKNOWN records, and deferred AI Broadcast Room remained untouched.

## 2026-09-28 continuation: local AI execution-plan envelope

### Completed in this unit

1. Extended the loopback Ollama adapter in `src/ai-chat/local-runtime.ts` to parse the existing structured `executionPlan` contract when the local model explicitly returns a JSON envelope containing `assistantContent` and bounded plan steps.
2. Added validation for plan title/summary, step count, step text, allowed operations, and `approvalRequired`; malformed envelopes remain `waiting` with a bounded blocker, while ordinary plain-text model responses remain unchanged.
3. Preserved the existing owner-scoped service/API/UI approval boundary. The adapter only returns a plan; it does not approve, enqueue, create a Run, execute code, or perform external calls.

### TDD and verification

- RED reproduced the adapter persisting a structured response as raw assistant text; GREEN local-runtime coverage and the AI Chat focused suite passed `28/28`.
- `npm.cmd run test:iseol-user-product`: `264/264` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.
- Focused browser verification reported `aiChatExecutionPlanUi: passed`; full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No live Ollama model was started or called. No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, approval mutation, Run creation, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: learning → project application provenance

### Completed

1. Added a durable `learning.project.application.accepted` ActivityEvent after LearningProjectApplication acceptance, LearningLink persistence, and linked Work Request persistence.
2. Preserved owner scoping, user attribution, `unverified` status, bounded identity payload, no-XP behavior, and idempotent repeated acceptance.
3. Added API and isolated-browser assertions across the learning acceptance and reload boundary.

### Verification

- Focused learning application API: `1/1`.
- User-product regression: `254/254`; root regression: `663/663`.
- Root/UI builds passed; full isolated browser E2E passed all journeys, including `learningProjectApplicationUi`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: project lifecycle activity provenance

### Completed in this unit

1. Completed the local durable edge from verified Project lifecycle evidence to ActivityEvent: completed Runs now project Artifact, Revision, and Deployment evidence into distinct activity event types.
2. Kept the projection owner-scoped, `system` attributed, `verified`, idempotent, and outside Growth/XP. Only evidence matching both the current project and Run is eligible.
3. Normalized ActivityEvent source identity with a deterministic SHA-256-derived value while retaining the original evidence ID in the bounded payload, covering Harness evidence IDs that contain filesystem path characters.

### TDD and verification

- RED reproduced an empty lifecycle activity ledger; the first integration pass also reproduced the invalid source-ID failure for path-like evidence.
- GREEN focused Project lifecycle/API/isolated Core+Desktop Agent integration passed `21/21`.
- `npm.cmd run test:iseol-user-product`: `265/265` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.
- Full isolated browser E2E passed Project Runtime growth/portfolio, Activity timeline, Runtime/Agent approval and recovery, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, live Ollama/model call, external provider/connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Project Run resume/retry activity provenance

### Completed

1. Added durable `project.run.resumed` and `project.run.retried` activity edges after successful owner-controlled recovery transitions.
2. Preserved `user` + `unverified` attribution, no-XP behavior, Run identity, approval gates, and the waiting boundary when Runtime is unavailable; resume events use the durable waiting checkpoint as their identity boundary.
3. Included the persisted retry cycle in retry event identity/payload so repeated terminal failures retain separate provenance.
4. Added API and browser assertions for the recovery activity without changing operational process ownership.

### Verification

- RED→GREEN project API/execution coverage: `23/23`.
- User-product regression: `256/256`; root regression: `663/663`.
- Root/UI builds passed; full isolated browser E2E passed `projectRuntimeFailureRecoveryUi` and all existing journeys with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Project → Task → Run request activity evidence

### Completed in this unit

1. Added a bounded `project.run.requested` ActivityEvent after the initial project Run is durably created and the Work Request state is persisted.
2. Preserved the trust boundary: user attribution is `unverified`, the event carries only project/work-request/Run identities, and the existing Growth projection ignores it.
3. Added replay coverage so an already-active request does not duplicate the ActivityEvent.
4. Added browser coverage for the request event without changing Runtime dispatch, completion, evidence, or approval semantics.

### Verification

- RED→GREEN focused API coverage: `7/7`.
- User-product regression: `254/254`; root regression: `663/663`.
- Root TypeScript and approved user UI builds passed; full isolated browser E2E passed all journeys and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: Project Task dependency execution boundary

### Completed in this unit

1. Added a user-facing Project Workspace dependency planner that creates a follow-up Task with selected prerequisite Work Request IDs and renders the persisted dependency graph.
2. Added an execution guard in `startProjectRun` before approval and Runtime enqueue. Incomplete prerequisites produce a durable `waiting` request with an explicit blocker and no Run identity or completion evidence.
3. Preserved owner ACL, idempotency, scheduler checks, separate approval boundaries, and truthful Runtime-unavailable behavior.
4. Added API, UI contract, focused browser, and full browser regression coverage.

### TDD and verification

- RED API coverage reproduced the defect: a dependent Task could receive HTTP `202` and a Run despite an incomplete prerequisite.
- GREEN focused project API/execution/work-request coverage passed `36/36`; dependency UI contract `2/2`.
- Full isolated browser E2E passed all reported journeys, including `projectTaskDependencyUi`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `258/258` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: explicit Project queue scheduler

### Completed in this unit

1. Added the authenticated Project Workspace schedule route and service method for an explicit user-triggered queue pass.
2. Limited selection to queued, dependency-ready Work Requests and clamped the requested concurrency to `1..8`; each selected item reuses the existing durable Run identity, approval, Runtime enqueue, and waiting-state boundaries. Same-project scheduler calls are serialized in-process and re-read durable state before a second selection pass.
3. Added the `ProjectQueueScheduler` UI with a persisted Build Run approval checkpoint and truthful selected/started/waiting result copy. Scheduling is never invoked implicitly during startup or recovery.
4. Added focused API/UI contracts and deterministic isolated browser coverage for one-at-a-time selection, durable queue preservation, reload-safe state, and approval blocking.

### TDD and verification

- RED reproduced the missing user route (`404` for `POST /api/user/projects/:id/schedule`).
- GREEN focused project/API/execution/work-request/UI contracts passed `42/42`, including the already-active Run concurrency guard and concurrent scheduler serialization; scheduler browser focus passed; full isolated browser E2E passed all journeys, including scheduler approval, active-Run slot preservation, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `262/262` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: AI team discussion request provenance

### Completed in this unit

1. Added the missing `ai.team.discussion.requested` ActivityEvent after a completed or Runtime-waiting AI team discussion is durably saved.
2. Kept the event owner-scoped, user-attributed, `unverified`, bounded to project/team/discussion/request/agent/status identities, and outside Growth/XP. Discussion requests do not create Work Requests or cross the Run approval boundary.
3. Preserved request-id idempotency: replaying the same discussion request returns the existing durable discussion and does not create another activity event.
4. Extended the isolated browser journey to verify the activity event after answer persistence and reload.

### TDD and verification

- RED focused API coverage reproduced zero matching discussion-request events.
- GREEN focused AI-team discussion/API/UI contracts passed `4/4`.
- Full isolated browser E2E passed all reported journeys, including AI-team discussion, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `256/256` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: AI team proposal acceptance provenance

### Completed in this unit

1. Added the missing `ai.team.proposal.accepted` ActivityEvent after the accepted AI-team proposal and queued Work Request are durably saved.
2. Kept the event owner-scoped, user-attributed, `unverified`, bounded to project/team/proposal/Work Request/agent identities, and outside Growth/XP. Proposal acceptance does not cross the separate Run-approval boundary.
3. Preserved idempotency: repeated acceptance returns the existing accepted proposal and does not create another acceptance event.
4. Extended the isolated browser journey to verify the durable acceptance event after the approval flow.

### TDD and verification

- RED focused API coverage reproduced zero matching acceptance events.
- GREEN focused AI-team proposal/API/UI contracts passed `5/5`.
- Full isolated browser E2E passed all reported journeys, including AI-team proposal execution approval, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `256/256` passed; `npm.cmd test`: `663/663` passed; root TypeScript and approved user UI builds passed.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: project creation activity and My World ledger layout

### Completed in this unit

1. Added the missing `project.created` ActivityEvent after durable Project and initial workspace creation.
2. Kept the event owner-scoped, user-attributed, `unverified`, bounded to project identity/purpose/team mode, and outside Growth/XP.
3. Diagnosed the browser regression caused by the additional durable activity record: the My World recent-activity card was clipped inside the fixed character header when the ledger reached five items.
4. Moved only the recent-activity card into the scrollable content region, preserving the approved UI style, labels, and deep-link behavior.

### TDD and verification

- RED project-creation API test: `0` events before implementation.
- GREEN focused API/UI contracts: `6/6`.
- Browser RED: existing `projectRuntimeExecutionUi` reproduced the clipped `활동 상세 보기` link after the new event increased the ledger.
- Browser GREEN: rebuilt isolated full E2E passed all reported journeys, including the repaired Project Runtime execution path, AI team approval, two-user isolation, reload persistence, and responsive `390/768/1024/1440` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `253/253` passed.
- `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite native-config/chunk-size warnings.

### Scope and safety boundary

- This unit extends local durable activity evidence and repairs a real approved-UI overflow/clipping integration defect. It does not claim live Ollama/model generation, external connector availability, final approved art originals, weekly digest production, or AI Broadcast Room completion.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, durable operational records, deployment/push state, and external providers remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or deferred broadcast change occurred.

## 2026-09-28 continuation: owner-controlled Project Run pause checkpoint

### Completed

- Added the owner-scoped pause API/UI and durable `PAUSED` checkpoint projection to the existing Project → Work Request → Run flow.
- Preserved the same `runId` through pause, reload, and resume, including the race where resume arrives before the in-flight executor returns.
- Added the Harness supervisor stale-result guard and bounded `project.run.paused` provenance event. The UI describes checkpoint pause honestly and does not claim process termination.

### TDD and verification

- RED covered the missing API/UI and the `READY` stale-result race; GREEN focused Harness/project/API/UI coverage passed `48/48`.
- Product regression passed `280/280`; root regression passed `665/665`; root and approved user UI builds passed.
- Focused and full isolated browser E2E passed, including pause/resume, reload persistence, two-user isolation, responsive `[390,768,1024,1440]`, and 13 routes.

### Safety

- Pause-gate execution was isolated to the browser test server. Operational Runtime/Agent, stale lock metadata, UNKNOWN requests, durable operational data, external AI/providers, deployment/push state, approved design sources, and deferred AI Broadcast Room were untouched.

## 2026-09-28 continuation: Project Workspace bounded file preview

### Completed in this unit

1. Added an authenticated `GET /api/user/projects/:id/files?path=...` read-only preview boundary backed by the real project workspace and the existing owner/team ACL.
2. Added path containment, symlink, secret-name, regular-file, 128 KiB, NUL-byte, and UTF-8 validation so unavailable content is reported explicitly rather than guessed or exposed.
3. Added the approved UI's explicit `파일 열기` action and bounded read-only code/text preview without enabling mutation or execution.
4. Extended the isolated Local Agent browser journey to create a real `package.json`, select it through Project Workspace, and verify the rendered preview after Runtime completion.

### TDD and verification

- RED reproduced the missing API route, service method, and UI contract.
- GREEN focused service/API/UI tests passed `36/36`; browser contract passed `1/1`.
- `npm.cmd run test:iseol-user-product`: `276/276` passed; `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite native-config and chunk-size warnings.
- Full isolated browser E2E passed all reported journeys, including the real Local Agent file preview, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Safety

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
