# ISEOL autonomous development log

This log records implementation and verification facts without secrets. It does not claim production or external-account success from fixture tests.

## 2026-09-27 continuation: owner-scoped project context in Personal AI Chat

### Completed in this unit

- Added an optional `AI 대화 프로젝트 연결` selector backed by `listUserProjects()`. The next user message sends only the selected project id; the UI restores the last user-message selection after conversation reload and marks the message `프로젝트 맥락 연결됨`.
- The selector now reads the authenticated `aiAccess.projectFiles` setting and fails closed while settings are unavailable. When the permission is off, it is disabled and reports `프로젝트 맥락 권한 꺼짐`; the browser journey toggles the real persisted setting off and restores it after verification.
- `src/ai-chat/service.ts` validates the project against the authenticated user's visible project ACL and `aiAccess.projectFiles`, persists `projectId` on the user message, and passes one bounded project metadata record to the local Runtime context. File contents and execution rights are not shared automatically. Invalid or foreign ids fail closed before message append.
- Added backend/UI contracts and extended the real two-account browser journey to verify owner selection, durable persistence, reload restoration, and foreign-project isolation.

### Verification and safety

- RED → GREEN focused contracts; `npm.cmd run test:iseol-user-product` passed `232/232`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed all journeys with `privateAiChatPersistenceIsolation: passed`, permission-off selector behavior, two isolated accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- The first E2E run exposed only an exact-text selector mismatch for a compound status span. The selector was corrected after tracing the rendered text; the full rerun passed.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, approved-design uncertainty, and deferred AI Broadcast Room remained untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 continuation: My World AI approval visibility

### Completed in this unit

- Connected the character-centered My World overview to the existing owner-scoped AI Team proposal and Project Work Request APIs. For the current AI or mixed project, accepted proposals are joined to their queued or waiting Work Requests by the durable `workRequestId`.
- Added a truthful `사용자 확인이 필요한 AI 작업` surface. It shows the persisted proposal title/objective, distinguishes `실행 확인 대기` from `재개 확인 대기`, and links to the existing Project Workspace checkpoint. Empty state explicitly says that no AI work is awaiting confirmation; it does not imply an AI result or Run completion.
- Extended the isolated browser journey so AI proposal acceptance is followed by My World visibility and a real navigation back to the owner-scoped Project Workspace before the existing approval/cancel/execute assertions continue.

### TDD and verification

- `tests/user-ui-world-ai-approval-contract.test.ts` first failed because My World did not load AI proposals or expose the pending-work boundary. The minimal read-only integration passed the focused contract.
- Focused My World/AI proposal contracts passed `3/3`; `npm.cmd run test:iseol-user-product` passed `228/228`; `npm.cmd run build` passed; `npm.cmd run user-ui:build` passed with only the existing Vite config/chunk-size warnings; `git diff --check` passed with existing LF/CRLF warnings; and the full isolated browser matrix passed with `aiTeamProposalExecutionApprovalUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- This unit only reads existing authenticated proposal/project state and adds a navigation link. It does not create a Work Request, dispatch a Run, alter approval settings, call external AI, replay UNKNOWN records, or touch operational data. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched.

## 2026-09-27 continuation: personal-space navigation truthfulness

### Completed in this unit

- Replaced the desktop sidebar's non-functional `개인 공간` button with an accessible link to `/world` in `user-ui/src/components/Navigation.tsx`. The existing team-space route, visual mode styling, active-route semantics, and mobile navigation remain unchanged.
- Added `tests/user-ui-navigation-personal-space-contract.test.ts` to the user-product gate and added a focused/full browser journey that opens Settings and follows the personal-space link to `/app/world`.

### TDD and verification

- The RED contract reproduced the dead button and passed after the minimal link replacement. The first focused browser attempt detected the expected stale static bundle because the UI build had not yet been refreshed; after `npm.cmd run user-ui:build`, the same journey passed.
- Focused navigation contract passed `1/1`; user-product passed `226/226`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; `git diff --check` passed with existing line-ending warnings; and the full isolated browser matrix passed with `personalSpaceNavigationUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708` still owns ports `18890` and `18891`; Desktop Agent PID `22416` remains unchanged. Configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts were not changed. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, GitHub push, or deployment occurred.

## 2026-09-27 continuation: public profile and social character asset fidelity

- RED → GREEN: the approved redesign brief explicitly rejected simple color circles as completed profile images. Added `tests/user-ui-profile-character-asset-contract.test.ts`; it initially failed because `Profile.tsx` and `Friends.tsx` still used name initials, then passed after the minimal shared `UserCharacterAsset` integration.
- `user-ui/src/pages/Profile.tsx` now renders the project-bound character asset with an accessible `${displayName} 개인 캐릭터` label. `user-ui/src/pages/Friends.tsx` uses the same asset in search results, friend list, and the selected conversation header. The asset remains `/app/assets/characters/iseol-user-character-v1.png` and retains the existing explicit `사용자 캐릭터 자산 대기` failure fallback.
- No public avatar/character API field, privacy projection, world appearance exposure, durable schema, or social ACL changed. The existing public profile remains owner-scoped and privacy-gated; this is a presentation-only correction.
- Verification: focused Profile/Friends contracts passed `5/5`; the first user-product regression found the old `user-ui-profile-icon-contract.test.ts` expectation for the name-initial circle, which was updated to the current asset contract; user-product passed `227/227`; root passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and full isolated browser E2E passed the public-profile character `src` assertion plus all existing two-account, reload, and responsive checks (`[390, 768, 1024, 1440]`, 13 routes).
- Design boundary: the supplied ZIP still lacks final approved per-user profile/character variants. The current v1 asset is a real project-bound implementation asset, not proof of final art approval or user-specific visual customization. AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, browser profile, deployment, and push state were preserved. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 continuation: truthful AI Chat conversation export

- RED → GREEN: the latest AI Chat brief listed conversation export among the user-facing controls. Added export assertions to `tests/user-ui-ai-chat-contract.test.ts`; the first run failed because `AIChat.tsx` had no export action, then passed after the minimal local download implementation.
- `user-ui/src/pages/AIChat.tsx` now exports the selected persisted conversation as Markdown through a browser-local Blob and stable `iseol-ai-conversation-<id>.md` filename. The action is disabled for an empty conversation or while another chat operation is busy and reports `대화 내보내기를 시작했습니다.` through the existing status surface.
- `scripts/iseol-user-ui-e2e.ts` now waits for the actual browser download event and validates the filename inside the existing private AI chat journey. This exports only already visible owner-scoped messages; it does not call Runtime, create an AI answer, upload data, mutate a project, or bypass approval.
- Verification: focused AI Chat contracts passed `2/2`; user-product passed `227/227`; root build passed; `npm.cmd run user-ui:build` passed with only existing Vite warnings; and full isolated browser E2E passed the download assertion plus two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Scope boundary: file attachment, explicit project linking, execution-plan approval/rejection, and editable context remain unimplemented because no approved durable request/schema/ACL exists for those actions. They are not exposed as active fake controls. Operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and deferred AI Broadcast Room remain untouched.

## 2026-09-27 continuation: mobile Project Workspace navigation

### Completed in this unit

- Added a mobile-only Project Workspace tablist in `user-ui/src/pages/Projects.tsx` for 개요, 작업, AI 협업, and 실행·증거. On desktop, the existing multi-section workspace remains visible; on mobile, only the selected workspace surface is shown.
- Kept project structure in the 작업 surface, existing AI proposal/discussion panels in AI 협업, and lifecycle/history/Runtime/verified evidence in 실행·증거. Solo projects render an explicit AI collaboration unavailable state rather than implying an active AI team.
- Added `tests/user-ui-project-workspace-mobile-contract.test.ts` to the user-product gate and added a 390px tab-switching journey to `scripts/iseol-user-ui-e2e.ts`.

### TDD and verification

- The new contract first failed because the workspace had no mobile tab boundary, then passed after the minimal integration. The first browser attempt exposed a misplaced project-structure panel; moving it to 작업 fixed the product behavior. A subsequent strict-mode locator collision was fixed by selecting the semantic AI 협업 heading.
- Focused mobile contract passed `1/1`; combined Project Workspace/lifecycle/runtime/mobile contracts passed `5/5`; user-product passed `225/225`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only existing warnings.
- Focused and full isolated browser E2E passed. The final full output included `projectWorkspaceMobileTabsUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved-design source uncertainty, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, external AI/provider request, GitHub push, or deployment occurred.

## 2026-09-27 continuation: provisional personal-world environment asset

### Completed in this unit

- Generated and copied the original `v1-provisional` personal workshop environment raster to `user-ui/public/assets/environments/iseol-personal-workshop-v1-provisional.png` because the supplied redesign ZIP contains no final environment-art source.
- Added `user-ui/src/components/EnvironmentAssets.tsx` with an accessible `onError` fallback and layered the asset into `user-ui/src/pages/MyWorld.tsx` while preserving the existing SVG fallback, character assets, world data, routes, and permissions.
- Kept both the loaded image and fallback `pointer-events-none` so the visual layer cannot intercept activity or navigation links.
- Added `tests/user-ui-world-environment-asset-contract.test.ts` to the user-product gate and extended the isolated character-assets browser focus to verify image load and fallback rendering.

### TDD and verification

- The environment contract first failed because the asset/component was absent and then passed after the minimal integration. The first full browser run exposed the absolute image intercepting an activity link; the contract was extended to require the visual-only boundary, the `pointer-events-none` fix passed, and the final full browser run passed.
- Final focused environment/character contracts passed `3/3`; user-product passed `224/224`; root regression passed `662/662`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and final full isolated browser E2E passed. Browser output included `personalWorldEnvironmentAssetUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- The generated image is provisional and not claimed as final approved art. Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or external AI/provider call occurred.

## 2026-09-27 continuation: semantic entry-state confirmation icons

### Completed in this unit

- Replaced the remaining generic checkmark glyphs in the active Auth, Landing, and Onboarding confirmation/progress states with the shared semantic SVG `Icon name="check"`. Account creation, candidate approval, onboarding progress, character selection, and activity selection retain their existing copy, routes, local auth, persistence, accessibility semantics, and user data behavior.
- Preserved character/accessory/room-item visual assets and the uncertainty around missing final approved character/background/environment art. No AI Broadcast Room file or boundary was changed.
- Added `tests/user-ui-entry-state-icon-contract.test.ts` and registered it with the existing entry icon contract in the user-product gate.

### TDD and verification

- The new entry-state contract first failed on the remaining generic checkmark glyphs and then passed after the minimal presentation-only implementation. Focused entry-state/entry-icon contracts passed `2/2`; user-product passed `223/223`; root regression passed `662/662`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed.
- Full isolated browser E2E passed all journeys with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, and approved design uncertainty were not changed. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or external AI/provider call occurred.

## 2026-09-27 continuation: semantic portfolio verification icons and resilient learning-runtime browser wait

### Completed in this unit

- Replaced the remaining generic checkmark glyphs used by the active `PortfolioScreen` verification badge, portfolio preview evidence, and public portfolio evidence list with the shared semantic SVG `Icon` component. Portfolio data, actor attribution, provenance links, visibility, public URLs, and ACL behavior remain unchanged.
- Added `tests/user-ui-portfolio-icon-contract.test.ts` to the user-product gate.
- Reproduced an intermittent full-browser false negative in the learning-to-project Runtime journey: the isolated Work Request remained queued/not-started after the old 12-second polling window, while the same focused journey passed under the same deterministic Runtime. Replaced the fixed attempt count with the named `LEARNING_PROJECT_RUNTIME_TIMEOUT_MS = 30_000` condition window and added a contract assertion for that boundary.

### TDD and verification

- The portfolio icon contract first failed on the active checkmark glyphs and then passed after the minimal presentation-only implementation. The runtime-browser contract first failed because the named timeout boundary was absent and then passed after the harness change.
- Focused portfolio contracts passed `4/4`; the runtime-browser contract passed `1/1`; user-product passed `221/221`; root regression passed `662/662`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed with only existing CRLF/Vite warnings.
- Focused learning-runtime browser verification passed. The first post-portfolio full browser run reproduced the old 12-second timeout; after the 30-second condition window, the full isolated browser E2E passed all journeys with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved design uncertainty, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or external AI/provider call occurred.

## 2026-09-27 continuation: truthful weekly digest availability

### Completed in this unit

- Preserved the existing owner-scoped `notifications.weekly` setting and API shape, while making the Settings UI explicitly report that the weekly activity digest is not yet available.
- Added a visible `준비 중` marker, a disabled switch, and `aria-disabled` to the weekly digest row. Other notification controls, persistence, routing, and user isolation remain unchanged.
- Added `tests/user-ui-notification-availability-contract.test.ts` to the user-product gate and a focused browser journey in `scripts/iseol-user-ui-e2e.ts`.

### TDD and verification

- The new contract first failed because the Settings source had no unavailable-state boundary, then passed after the minimal production change.
- Focused notification/settings contracts passed `3/3`; user-product passed `220/220`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Focused browser verification passed after scoping the Settings sidebar locator to its `nav`; full isolated browser E2E passed all journeys with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved design uncertainty, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, or external AI/provider call occurred.

## 2026-09-27 continuation: public Profile growth semantic icons

### Completed in this unit

- Reused the shared semantic `Icon` boundary in `user-ui/src/pages/Profile.tsx` for development, learning, collaboration, consistency, and achievement expressions. The display-name initial and user-authored profile content remain unchanged.
- Preserved owner-scoped editing, read-only public viewing, privacy-gated growth/projects/learning/portfolio projections, evidence-backed achievements, routes, persistence, and cross-account isolation. No growth, XP, achievement, or portfolio data is created by this presentation change.
- Added `tests/user-ui-profile-icon-contract.test.ts` to the user-product gate in `package.json`.

### TDD and verification

- The new Profile icon contract first failed because `Profile.tsx` did not use the shared `Icon` boundary, then passed after the minimal production implementation.
- Focused Profile/Character/state/navigation/responsive checks passed `6/6`; user-product passed `219/219`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed every journey with two isolated accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, approved design uncertainty, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, or external AI/provider call occurred.

## 2026-09-27 continuation: Character growth semantic icons

### Completed in this unit

- Added the shared semantic `trophy` icon and replaced generic Character-page symbols for growth stats, customization, achievements, and locked states.
- Preserved the real project-bound user character asset, accessory/room-item cosmetic tokens, appearance persistence, evidence-backed Growth/XP behavior, and owner-scoped routes/API. Cosmetic emoji were intentionally not treated as generic controls.
- Added `tests/user-ui-character-icon-contract.test.ts` to the user-product gate in `package.json`.

### TDD and verification

- The new Character icon contract first failed on the missing `trophy` icon, then passed after the minimal production implementation.
- Focused Character/state/navigation/responsive checks passed `5/5`; user-product passed `218/218`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed every journey with two isolated accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, or external AI/provider call occurred.

## 2026-09-27 continuation: entry surfaces and durable Work Request persistence

### Completed in this unit

- Added the bounded semantic `eye`, `eyeOff`, and `mail` icons to `user-ui/src/components/Icon.tsx` and replaced generic presentation emoji in Auth, Landing, Onboarding, and NotFound. Local account authentication, disabled external-provider states, onboarding persistence, actual character/AI companion assets, accessible labels, and routes were preserved.
- Changed the world-mission browser journey to click the durable action by `data-mission-id`, keeping dynamic mission copy from becoming a false selector failure while preserving the explicit unverified/no-XP boundary.
- Hardened `src/project-model/work-request.ts` against Windows transient rename contention by serializing writes per Work Request path, reusing `renameWithTransientRetry()`, and cleaning temporary files after final failure. The fix preserves request identity and status semantics.

### TDD and verification

- The entry icon contract first failed on the missing semantic icon type, then passed after the production change. The Work Request store contract first failed because the production source did not use the retry boundary, then passed after implementation.
- Focused entry/content/collaboration/operational/state/navigation/responsive/world-state/Work Request checks passed `16/16`; user-product passed `217/217`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed every journey with two isolated accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`. The AI proposal execution focus passed three consecutive times after the Work Request fix.
- Systematic debugging captured the real failure boundary: the durable request file remained `queued` while a transient write file contained `running` and the linked Run was `DONE`. No UNKNOWN request was replayed and no external request was created.

### Safety boundary

- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, existing UNKNOWN records, Ollama/model state, external connectors/providers, browser profile, deployment/push state, and AI Broadcast Room artifacts were not changed. No Runtime/Agent/browser restart, data deletion, or external AI/provider call occurred.

## 2026-09-26

### Completed in this cycle

- Added durable user settings under `data/platform/users/<userId>/settings.json` with authenticated GET/PATCH API routes and fail-closed boolean validation.
- Connected Settings UI toggles and logout/account state to the user API; removed the no-op account save action.
- Added public/unlisted portfolio read API and public portfolio route/page; private entries return 404.
- Added durable portfolio edit controls and backend update coverage.
- Added user-scoped AI conversations/messages, private-memory provenance, authenticated API routes, and `waiting_runtime` state. Removed fake AI plan/result cards and fake assistant completion claims from the user UI.
- Replaced no-op integration “연결하기” controls and unsupported demo badges with explicit unavailable/status-pending states; removed fake landing user-count/XP/build claims while preserving the approved visual composition.
- Preserved the existing Control Plane, Runtime/Agent, UNKNOWN records, and AI broadcast files. No external AI request, production Runtime mutation, GitHub push, or deployment was performed.

### Verification

- `node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false`: exit 0.
- `cd user-ui && npm.cmd run build`: exit 0. Vite reports existing native-config and chunk-size warnings only.
- Expanded user-platform suite: 43/43 pass with serial test concurrency.
- Focused settings suite: 2/2 pass.
- Focused AI chat suite: 2/2 pass.
- Portfolio provenance/public suite: 2/2 pass.
- Runtime/Control Plane compatibility regression: 56/56 pass serially (`iseol-runtime-services`, `web-control-plane-server/router`, `identity-scope`).
- Browser verification is partially blocked: the CUA automation service timed out while the isolated local server itself remained HTTP-healthy. Earlier isolated browser evidence for onboarding, learning, projects, teams/recruitment, and portfolio create/reload remains valid; Community, Settings, public portfolio, and AI Chat browser flows still need a fresh CUA session.

### Known blockers and safety boundaries

- Local AI Runtime answer generation and real Agent project execution remain unverified because the current Runtime/Agent ownership and UNKNOWN state must not be disturbed without separate approval.
- The root legacy suite is not a green gate in the current environment: 23 failures are concentrated in older live/external execution and timeout paths. New user-platform tests are green under serial execution.
- AI broadcast room, TTS/video export, external streaming, and general-purpose debate remain explicitly deferred.

### 2026-09-26 continuation

- Added authenticated ongoing project team transitions through `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `src/runtime/iseol-runtime-services.ts`, and `scripts/iseol-user-ui-isolated-server.ts`.
- Connected the approved Project Workspace screen to the transition API in `user-ui/src/pages/Projects.tsx`; the UI exposes solo, AI, human, and mixed modes and requires a team ID for human/mixed modes.
- Fixed repeated transition activity identity conflicts by giving each persisted transition event a unique source identity, and removed stale workspace `teamId` on solo return.
- Added `tests/user-project-team-transition.test.ts` covering membership ACL, durable workspace updates, repeated transition events, and post-transition visibility.
- Normalized project creation so stale team IDs are ignored for solo/AI modes and human/mixed creation requires a team ID; the transition test now covers both invalid combinations.
- Replaced the user-facing Idea Lab's hard-coded candidate/build demo with an API-backed natural-language project creation flow in `user-ui/src/pages/IdeaLab.tsx`. It preserves the approved visual tone, requires an explicit save step, stores the user's objective/features as a real project, and shows `Runtime 연결 대기` without inventing AI/build success.
- Added an explicit public/unlisted portfolio share-link button in `user-ui/src/pages/PortfolioScreen.tsx`, while preserving the existing `Portfolio.tsx` module and approved visual tokens.

### Continuation verification

- `node --import tsx --test --test-concurrency=1 tests/user-project-team-transition.test.ts`: 1/1 pass.
- Project/API/evidence focused tests: 5/5 pass.
- `node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false`: exit 0.
- `cd user-ui && npm.cmd run build`: exit 0; only existing Vite native-config and chunk-size warnings.
- Fresh isolated browser server `58960`: onboarding/world, learning plan/session/verified attempt, public portfolio creation, visible share-link control and link-copy status, portfolio reload persistence, project creation, and solo→AI team transition/reload were visibly verified.
- Isolated browser server `58959`: durable community post/like reload, settings toggle reload, and private AI message reload with honest `Runtime 대기` state were visibly verified.
- Public portfolio API/page, private 404, export, two-user browser ACL, live Runtime execution, and responsive viewport matrix remain not fully browser-verified.
- Fresh legacy `npm.cmd test`: 645/646 pass, with one parallel-environment failure in `harness-build-evidence.test.ts`; the same test file passes 7/7 when run alone, so no product change was made for that transient build-resource contention.
- The same isolated portfolio browser session also visibly confirmed the JSON export trigger (`iseol-portfolio.json 내보내기를 시작했습니다.`) and the preview rendered the public entry with its verified learning evidence.
- Fresh isolated browser server `58961` visibly confirmed Idea Lab input → project plan → explicit approval → durable user project creation and a link to the project workspace; the page correctly retained `Runtime 연결 대기`.

### Integrated HTTP journey verification

- Added `tests/iseol-user-journeys.test.ts` as the first cross-domain user journey gate.
- The isolated server created two users and exercised signup/me, onboarding world update, private memory isolation, learning plan/session/attempt/local-static analysis, project/work request creation, honest `Project Runtime is not configured` waiting, project team transition, community post/like, verified activity→growth, public portfolio evidence/export, settings persistence, and AI-chat conversation isolation.
- `node --import tsx --test tests/iseol-user-journeys.test.ts`: 1/1 pass.
- This verifies the durable HTTP/API boundary only. It does not claim live Runtime/Agent execution, external AI output, production state, or the remaining browser viewport/two-user browser matrix.

### Fresh regression and two-account browser evidence

- `node --import tsx --test --test-concurrency=1` across the user-platform/domain suite: `45/45` pass.
- `npm.cmd test`: `646/646` pass, `0` fail.
- Isolated browser server `58962`: account A signup/onboarding → Idea Lab plan approval → real user project save → logout; account B signup/onboarding → Projects. Account B visibly received the empty state `아직 저장된 프로젝트가 없습니다`, confirming account A's saved project was not rendered in B's workspace.
- No production Runtime/Agent/Chrome state, UNKNOWN request, external AI request, GitHub push, or deployment was changed.

### Actor attribution hardening

- Added `tests/portfolio-actor-attribution.test.ts` and included it in `npm.cmd run test:iseol-user-product`.
- The isolated test persists one verified user activity and one verified `iseol-desktop-agent` project evidence record, then confirms portfolio provenance retains `actorType: user` and `actorType: ai` separately, including provider and export content.
- `npm.cmd run test:iseol-user-product`: `46/46` pass.

### Responsive UI hardening

- Added a mobile reflow contract for dense AI Chat, Friends, and Settings workspaces in `user-ui/src/index.css`; the approved desktop structure and bottom mobile navigation remain intact.
- The contract is checked by `tests/user-ui-responsive-contract.test.ts`.
- `node --import tsx --test tests/user-ui-responsive-contract.test.ts`: 1/1 pass.
- `npm.cmd run test:iseol-user-product`: `47/47` pass after including the responsive contract.
- `npm.cmd --prefix user-ui run build`: exit 0. Vite reports only its existing native-config warnings.

### Public portfolio navigation

- Added `공개 보기` to each public/unlisted portfolio entry in `user-ui/src/pages/PortfolioScreen.tsx`; it points to the tokenless public route while keeping private entries without a public link.
- Public API, static serving, responsive contract, and root TypeScript checks passed after the change; the user UI build exited 0.

### Latest regression confirmation

- Added `tests/user-ui-portfolio-contract.test.ts` to lock the public/unlisted-only visibility rule and tokenless public route link in the user UI source contract.
- `npm.cmd run test:iseol-user-product`: `48/48` pass.
- A second fresh `npm.cmd test` completed `646/646` with `0` failures after one earlier parallel timing failure; the focused `tests/idea-lab-live-smoke.test.ts` also passed `14/14`.

### Responsive and navigation hardening

- Added explicit approved layout tokens for 390px, 768px, 1024px, and 1440px breakpoints plus `prefers-reduced-motion` handling in `user-ui/src/index.css`.
- Converted the desktop `팀 공간` control from a non-functional button to a real `/app/teams` link and added accessible labels to desktop/mobile navigation in `user-ui/src/components/Navigation.tsx`.
- Updated `tests/user-ui-responsive-contract.test.ts`; focused contract passed `1/1`, product regression passed `48/48`, and the user UI build passed.
- On isolated browser server `58962`, the narrow viewport mobile menu visibly navigated from Projects to `/app/teams`; the team page rendered its real empty state and count text.

### Character persistence and navigation hardening

- `user-ui/src/pages/Character.tsx` now loads persisted appearance state, saves accessory/hair/skin/outfit/shoe/room selections through `/api/user/character`, reloads the user profile after saving, and uses basename-safe `Link` routes for customization, cancellation, and activity history.
- `user-ui/src/components/Character.tsx` maps persisted appearance values to the rendered character colors, shoes, and accessory marker; locked/unlocked choices are keyboard-accessible controls.
- The mobile full-menu now includes a real Character route without displacing the five approved bottom-nav items.
- Added `tests/user-ui-character-contract.test.ts`; the character contract, TypeScript check, user UI build, and `npm.cmd run test:iseol-user-product` (`49/49`) pass.
- After the character/navigation changes, a fresh `npm.cmd test` completed `646/646` with `0` failures; `git diff --check` also completed without diff errors.

### Profile surface continuation

- Connected the existing durable social profile API to a new user-facing `/app/profile` page in `user-ui/src/pages/Profile.tsx`.
- Own profiles can edit handle, bio, skills, and public/private visibility; another user's profile is rendered read-only and a missing/private profile has an explicit empty state.
- Added `/api/user/social/profile` client methods, the `/profile` route, and a Settings account link; no new data store or external service was introduced.
- Added `tests/user-ui-profile-contract.test.ts` and included it in the serial user-product gate.

### Profile verification

- `node --import tsx --test tests/user-ui-profile-contract.test.ts`: 1/1 pass before the production change, then 1/1 pass after implementation.
- `npm.cmd run test:iseol-user-product`: `50/50` pass.
- `node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false`: exit 0.
- `npm.cmd --prefix user-ui run build`: exit 0; existing Vite native-config and chunk-size warnings only.
- The already-open browser tab still served its prior cached menu tree after F5/hard-refresh attempts, while read-only HTTP checks on isolated server `58962` confirmed the current hashed `/app` bundle. No Runtime or browser process was restarted; newest profile/character browser flows remain unclaimed until a fresh tab/session is available.
- The integrated HTTP journey was rerun after the profile change; it now verifies user A profile editing and user B public profile reading, and passed 1/1.

### SPA refresh and API boundary hardening

- Fixed direct/reload navigation for approved user routes such as `/app/profile`, `/app/projects/:id`, and `/app/character` by falling back to the user UI `index.html` only for extensionless non-asset paths. Missing assets remain 404s and the Control Plane root remains separate (`src/web-control-plane/server.ts`, `tests/user-ui-static-serving.test.ts`).
- Added an isolated HTTP boundary test proving a user session cannot authenticate as the operator, anonymous access remains unauthorized, and a user token cannot open the operator SSE stream (`tests/user-ui-api-boundary.test.ts`).
- The integrated HTTP journey now also verifies public-to-private profile visibility changes without exposing the private profile to the second user.

### Latest verification

- `npm.cmd run test:iseol-user-product`: `51/51` pass.
- `npm.cmd test`: `646/646` pass.
- `npm.cmd run build`: exit 0.
- `npm.cmd --prefix user-ui run build`: exit 0; only existing Vite native-config and chunk-size warnings.
- `git diff --check`: no diff errors; only existing LF/CRLF normalization warnings.
- No Runtime, Agent, Chrome process, production data, UNKNOWN request, external AI request, GitHub push, or deployment was changed.
- Added a visible `/app/profile` entry to the approved shared sidebar; profile contract and user-product regression remain green at `51/51`.

### Fresh isolated browser profile verification

- Started a new isolated user UI server on `58963` with a fresh temporary data root; the existing server and Runtime/Agent were not restarted.
- In the browser, created a local QA account, completed onboarding, opened `/app/profile` directly, edited handle/bio/skills, saved, reloaded the route, and observed the persisted values and `프로필을 저장했습니다.` status.
- Opened the mobile full menu and observed the accessible `👤 프로필` link to `/app/profile` alongside the Character and product routes.
- This is fresh isolated browser evidence for the profile and SPA refresh path. It does not satisfy the remaining two-simultaneous-user browser ACL matrix or all four physical viewport sizes.

### My World durable data integration

- Replaced the remaining hard-coded My World project/learning placeholders in `user-ui/src/pages/MyWorld.tsx` with authenticated reads from `listUserProjects()`, `listLearningPlans()`, and `listDueReviewItems()`. The world now renders the latest user-owned project, active learning plan, review count, explicit loading/error states, and evidence-derived next actions without inventing progress or XP.
- Removed the stale `/projects/todo-app` link and numeric demo mission progress. The missions tab now derives its labels and completion state from durable project and learning records; the achievements tab exposes actor-attributed growth counts when the growth snapshot exists.
- Added `tests/user-ui-my-world-contract.test.ts` to prevent the placeholder surface from returning and included it in `npm.cmd run test:iseol-user-product`.

### My World verification

- `node --import tsx --test tests/user-ui-my-world-contract.test.ts`: 1/1 pass.
- `npm.cmd run test:iseol-user-product`: `52/52` pass.
- `node node_modules\\typescript\\bin\\tsc -p tsconfig.json --pretty false`: exit 0.
- `npm.cmd --prefix user-ui run build`: exit 0; existing Vite native-config and chunk-size warnings only.
- `npm.cmd run build`: exit 0.
- `npm.cmd test`: `646/646` pass on the final rerun. Two earlier parallel runs each had one non-reproducible failure; the final run passed without changing legacy Runtime/Agent code.
- Fresh isolated browser server `58964`: local signup/onboarding, durable project creation, durable learning-plan creation, `/app/world` rendering of the saved project and active plan, mission derivation from the saved records, and reload persistence were visibly verified. The isolated server was stopped after verification; operational Runtime/Agent/browser state was not changed.

### Settings honesty hardening

- Changed non-persisted account inputs in `user-ui/src/pages/Settings.tsx` to read-only values and changed password, activity export, and account deletion controls to disabled states with explicit unsupported copy. Existing durable AI access, approval, notification, and privacy toggles remain API-backed and usable.
- Added `tests/user-ui-settings-contract.test.ts`; `npm.cmd run test:iseol-user-product` now passes `53/53`. The user UI build and root TypeScript check also pass; the final `npm.cmd test` is `646/646` with `0` failures and `git diff --check` has no diff errors. No external or destructive action was introduced.

### Two-user browser ACL attempt

- Isolated server `58966` was used to create two local users and exercise project creation from separate in-app tabs and separate Chrome session tabs.
- The browser automation environment reused the same `localStorage` session across those tabs, so the second tab was visibly still authenticated as the first user. This is an automation-context limitation, not evidence of a product ACL leak; no user B token was actually active in that run.
- The two-user durable HTTP journey remains the authoritative current ACL evidence: two separately signed platform sessions passed world/memory, project, community, portfolio, settings, and AI-chat isolation in `tests/iseol-user-journeys.test.ts`. The browser two-context matrix remains unclaimed and the isolated server was stopped after the attempt.

### AI Chat local Runtime dispatch boundary

- Added an explicit `AiChatRuntimeDispatcher` boundary in `src/ai-chat/contracts.ts` and `src/ai-chat/service.ts`. A caller that owns an approved local Runtime may receive the authenticated principal, conversation ID, message ID, and user content; only a returned `completed` result can append a durable assistant message.
- The default path remains fail-closed: no dispatcher, an accepted/waiting result, or a dispatcher error leaves the user message in `waiting_runtime` and creates no invented assistant response. Runtime injection is available through `IseolRuntimeInput.aiChatRuntimeDispatcher` in `src/runtime/iseol-runtime-services.ts`, but no operational Runtime was connected or invoked.
- `tests/ai-chat-runtime-dispatch.test.ts` covers attributed completion, restart persistence, user isolation, non-completing Runtime behavior, and later completion through a user-bound callback with duplicate-result suppression. The UI API type and status copy now distinguish a real completed response from Runtime waiting.

### AI Chat dispatch verification

- `npm.cmd run test:ai-chat`: `5/5` pass.
- `npm.cmd run test:iseol-user-product`: `56/56` pass after the async completion extension.
- Latest `npm.cmd test`: `646/646` pass with exit 0 after the async Runtime-boundary extension.
- `npm.cmd run build`: exit 0; root TypeScript check and approved user UI build also pass. The UI build retains only the existing Vite native-config and chunk-size warnings.
- This is an isolated injection contract, not proof of live local AI generation. No external AI request, operational Runtime/Agent mutation, UNKNOWN request replay, GitHub push, deployment, or data deletion occurred.

### Local Ollama Runtime adapter

- Added `src/ai-chat/local-runtime.ts` with a localhost-only Ollama `/api/chat` adapter and explicit environment configuration. `src/runtime/iseol-runtime-services.ts` wires it only when `ISEOL_LOCAL_AI_RUNTIME_ENABLED=true` and `ISEOL_LOCAL_AI_RUNTIME_MODEL` is present; the default remains disabled.
- The adapter sends only the current user message to the configured loopback Runtime, rejects non-loopback URLs, bounds response size, and accepts only a non-empty real Runtime response. Connection errors, non-OK responses, malformed payloads, and empty answers stay in `waiting_runtime`.
- Read-only environment inspection found Ollama client `0.34.0` installed, but `/api/tags` returned `{"models":[]}`. The inspection command temporarily started Ollama; the two exact processes it created were stopped immediately. No model was downloaded and no external AI request was made.

### Local Ollama adapter verification

- `npm.cmd run test:ai-chat`: `9/9` pass, including fake-fetch response mapping, loopback restriction, fail-closed behavior, and environment gating.
- `npm.cmd run test:iseol-user-product`: `60/60` pass; `npm.cmd test`: `646/646` pass; root build, TypeScript check, approved UI build, and `git diff --check` also pass.
- Latest TypeScript check: exit 0. Live local generation remains unverified because the installed Ollama instance has no model configured.

### Private memory vault CRUD

- Added owner-bound private-memory editing to `src/memory/contracts.ts`, `src/memory/service.ts`, and `src/personal-world/router.ts`. PATCH/PUT updates kind, content, and optional source; foreign or missing records fail closed, and updated records survive a service restart. Existing DELETE semantics remain owner-bound.
- Added `user-ui/src/pages/MemoryVault.tsx` at `/app/memory`, with durable search/list/add/edit/delete actions, explicit loading/error/status states, private-only copy, and a link from Settings/AI Chat. `user-ui/src/api/userApi.ts`, `user-ui/src/app/routes.ts`, and `user-ui/src/components/Navigation.tsx` provide the authenticated boundary and navigation.
- Added `tests/user-ui-memory-contract.test.ts` and extended the API/persistence coverage in `tests/personal-world-api.test.ts` and `tests/personal-memory-isolation.test.ts`. The contract intentionally checks for real API actions rather than treating form placeholder text as data.

### Private memory vault verification

- Focused UI contract: `1/1` pass.
- `npm.cmd run test:iseol-user-product`: `62/62` pass, including two-session HTTP isolation and memory edit/delete persistence.
- `npm.cmd test`: `646/646` pass; `npm.cmd run build`, root TypeScript check, and `npm.cmd --prefix user-ui run build` all exit successfully. UI build retains only the existing Vite native-config and chunk-size warnings; `git diff --check` reports no diff errors.
- This unit did not claim a new browser CRUD run. The live local AI model, operational Runtime-backed response, simultaneous independent browser contexts, and physical viewport matrix remain unverified. AI broadcast room remains deferred. No operational Runtime/Agent/browser process, UNKNOWN request, external AI request, production data, push, or deployment was changed.

### Learning session reconnect

- Added an owner-scoped `GET /api/user/learning/sessions` read model through `src/learning/contracts.ts`, `src/learning/service.ts`, and `src/learning/router.ts`. It returns only the authenticated user's durable sessions, ordered by latest resume time; the existing session resume endpoint remains the write-on-reconnect boundary.
- `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Learning.tsx` now load the saved session list on entry, resume the newest active session, and reload its attempts after a browser/app reconnect. The UI continues to show explicit empty and unavailable states and does not synthesize learning progress.
- Added `tests/user-ui-learning-contract.test.ts` and extended `tests/learning-api.test.ts` and `tests/learning-persistence.test.ts` for session listing, owner isolation, and API behavior.

### Learning session verification

- Focused learning/API/UI tests: `4/4` pass.
- `npm.cmd run test:iseol-user-product`: `63/63` pass. Root build and TypeScript/UI build verification are run again with the next regression pass.
- This is durable session reconnect evidence, not proof of live local-AI tutoring or Runtime-backed code explanation. Existing local-static analysis remains the only completed analysis provider, and AI broadcast room remains deferred.

### Learning reconnect browser verification

- Fresh isolated server `58968` and a temporary local QA account verified the real browser path: signup/onboarding → create a durable learning plan → start a session → reload `/app/learning` → the same session ID and `활성 세션` state were rendered again.
- The first reload exposed a real runtime error (`resumeLearningSession is not defined`) that static contract/build checks did not catch. The missing import in `user-ui/src/pages/Learning.tsx` was fixed, the UI bundle was rebuilt, and the same browser reload then passed with the session ID and recent-resume timestamp visible.
- The isolated server and agent-created browser tab were closed after verification. No operational process, user data, UNKNOWN request, external service, or deployment was touched.

### Integration settings route honesty

- Fixed the approved user navigation path `/app/integrations`: it now opens Settings directly on the `연동 환경` section instead of silently landing on the default account section (`user-ui/src/pages/Settings.tsx`).
- The visible status policy remains fail-closed: Runtime is shown as requiring verification, GitHub/ChatGPT Web/Discord remain API-unconnected, and Notion/Vercel remain explicitly deferred. No connection is presented as successful without current evidence.
- Added `tests/user-ui-integrations-contract.test.ts`; the serial user-product suite now passes `64/64`. Root/UI builds, TypeScript, and diff checks pass. This is a route/honesty fix, not live external integration verification.

### Growth timeline read-model integration

- Connected `user-ui/src/pages/PortfolioScreen.tsx`'s `ActivityTimeline` to both `getPortfolio()` and `getGrowth()`. The activity surface now renders durable level/XP, verified-evidence count, development/learning/collaboration/consistency stats, and separate user/AI/system XP attribution alongside the evidence timeline.
- Added `tests/user-ui-activity-contract.test.ts` to prevent the surface from reverting to demo growth values. The product suite now passes `65/65`; root build, TypeScript, and approved UI build pass with only the existing Vite warnings.
- Growth remains evidence-backed: unverified activity is not projected into the snapshot, and this UI change does not claim live Runtime activity that has not been observed.

### Project execution profile visibility

- Extended `user-ui/src/api/userApi.ts` so `UserProjectView.workspace.purposeSelection.profile` preserves the durable execution profile: selected roles, executable roles, planned roles, verification stages, documentation requirement, and the server-generated Korean summary.
- Added an `AI 팀 역할` panel to `user-ui/src/pages/Projects.tsx`. It distinguishes roles with registered stage adapters (`실행 어댑터`) from roles that remain planned (`계획 상태`), and shows the verification stages without claiming that planned specialists or live Runtime execution are available.
- Added `tests/user-ui-project-profile-contract.test.ts`; the serial user-product suite now passes `66/66`. The isolated browser flow visibly verified the new panel after a real project save. The full root suite passes `646/646`, root/UI builds and TypeScript pass, and `git diff --check` has no errors. This is a read-model/UI integration only: no Runtime job was submitted, no external service was called, and AI broadcast room remains deferred.

### Project execution approval checkpoint

- `user-ui/src/pages/Projects.tsx` now reads the persisted `aiApproval.buildRun` setting through `getSettings()` before allowing a project work request to proceed. If the setting is enabled, the Workspace first shows `실행 승인 확인`; only `승인하고 실행` calls the existing user-project run endpoint, while `승인 취소` returns to the queued state without sending a Runtime/Agent request. If the setting cannot be read, execution remains disabled and the UI directs the user to Settings.
- Added `tests/user-ui-project-approval-contract.test.ts`; the serial user-product suite passes `67/67`. On isolated server `59988`, browser verification covered Settings approval toggle → real project/work request → `승인 후 실행` → checkpoint → cancellation. The final approval control was not pressed, so no Runtime request was submitted.
- This is a user-facing UI checkpoint, not proof of server-side authorization enforcement or live Runtime/Agent execution. The operational Runtime remained `127.0.0.1:18890`/PID `1708`; no external AI request, UNKNOWN replay, production data mutation, push, or deployment occurred. AI broadcast room remains deferred.

### Project execution approval enforcement

- Promoted the build approval boundary from UI-only behavior to the authenticated project execution path. `UserProjectService` reads the owner-scoped settings record and rejects a run before Run preparation or Runtime enqueue unless `approved: true` is supplied. The user-project router also validates the approval field, fails closed when approval state is unavailable, and applies the same check when a separately injected project service is used.
- Runtime composition now injects the existing per-user SettingsService into the UserProjectService. The approved UI sends `approved: true` only from the explicit `승인하고 실행` action; ordinary execution with approval disabled keeps the previous request shape.
- Evidence: `tests/user-project-execution.test.ts` covers no-enqueue rejection and approved execution; `tests/user-project-api.test.ts` covers real temporary HTTP rejection/acceptance-to-waiting behavior; `tests/user-ui-project-approval-contract.test.ts` covers the final UI payload. Product suite passes `69/69`; the latest full root suite passes `646/646`; TypeScript and approved UI builds pass; `git diff --check` has no errors apart from existing LF/CRLF warnings.
- This is authorization-boundary verification, not live Runtime/Agent success. No request was sent to operational PID `1708`/port `18890`, no UNKNOWN request was replayed, no external AI/provider was called, and AI broadcast-room files/specification remain preserved and deferred.

### User project Run reconciliation and isolated Harness completion

- `src/project-model/user-project-service.ts` now projects each durable user work request through the existing `reconcileProjectWorkRequest` boundary while building the authenticated project view. Terminal, waiting, failed, cancelled, and missing/mismatched Run identities remain explicit; a terminal Harness Run no longer leaves the user request falsely stuck at `running`.
- Added `tests/user-project-execution.test.ts` coverage for terminal projection and a fully isolated Harness supervisor journey. The temporary dataRoot supplies only a local policy document; the fixture supervisor advances the project Run through its stages, persists identity-bound test/review/commit/PR/CI/deployment/production-verification evidence, and the user project view reconstructs `completed` status and filtered evidence.
- Focused project execution suite passes `6/6`; serial product suite passes `71/71`; the latest full regression passes `646/646`. One preceding parallel full run reported one failure while the same `harness-build-evidence.test.ts` passes `7/7` alone; a full rerun passed with zero failures. This is isolated Harness evidence, not live operational Agent or external-provider evidence.
- Root build, TypeScript check, approved UI build, and diff validation remain required for the final verification pass. Operational Runtime PID `1708`/port `18890`, UNKNOWN records, external services, and AI broadcast-room files were untouched.

### Composed Runtime HTTP-to-Harness integration verification

- Added `tests/user-project-runtime-integration.test.ts` as an isolated composition test. It starts the same `startIseolRuntimeServices` path with temporary roots, a fake connected Desktop transport, a local deterministic Harness executor, and the real Control Plane HTTP server; it then creates a signed-in user project and work request over HTTP and starts the Run with explicit approval.
- The test verifies that the composed Runtime accepts the request, persists the Harness Run through all project-workspace stages with project/Run-bound evidence, reconciles the durable work request to `completed`, and returns the completed state again through the final authenticated HTTP read. It does not use the operational Runtime, browser profile, external AI, or any external provider.
- `npm.cmd run test:iseol-user-product`: `72/72`; `npm.cmd test`: `647/647`; root build, approved UI build, TypeScript check, and `git diff --check` pass. The UI build retains only the existing Vite native-config and chunk-size warnings.
- This upgrades the isolated Runtime composition evidence, not live operational Agent evidence. PID `1708` remains the untouched Control Plane listener on `127.0.0.1:18890`; UNKNOWN requests, external integrations, production data, push/deployment, and deferred AI broadcast-room files remain unchanged.

### Portfolio link-sharing fallback honesty

- Hardened `user-ui/src/pages/PortfolioScreen.tsx` so the share action only reports clipboard success when `navigator.clipboard.writeText` exists and completes. Browsers without the Clipboard API now show the public URL fallback instead of a false success message.
- Added a UI contract regression in `tests/user-ui-portfolio-contract.test.ts`; focused contract passes `2/2`, and the approved UI production build passes with only the existing Vite warnings. No portfolio data, Runtime state, external service, or public entry was mutated by this change.

### Isolated browser journey runner

- Added `scripts/iseol-user-ui-e2e.ts` and the explicit `npm.cmd run test:iseol-browser-e2e` command. It starts `scripts/iseol-user-ui-isolated-server.ts` with temporary roots, launches a fresh headless Chrome context, aborts non-loopback requests, and never uses the operational browser profile.
- Fresh run passed with two independent browser contexts: account A and account B completed signup/onboarding, B did not see A's private world, A's community post appeared to B after a new-page load, and the world page had no horizontal overflow at 390, 768, 1024, or 1440px.
- Root TypeScript check and `git diff --check` passed. This closes the basic two-context/world/public-community browser boundary, but it does not certify private team ACL in two browser contexts, every route at every viewport, live Runtime/Agent execution, external providers, or production deployment.
- The same work unit's serial user-product suite passed `73/73`, the full root suite passed `647/647`, and the approved UI build passed with only the existing Vite warnings.

### Portfolio browser journey expansion

- Expanded the isolated runner to create a real verified learning attempt through the authenticated browser session, create a public portfolio entry from that evidence, trigger the JSON download, open the tokenless public route from both browser contexts, and verify the explicit missing-entry state.
- Fresh `npm.cmd run test:iseol-browser-e2e` passed with `publicPortfolioRouteAndJsonExport: passed`. The fixture is local and temporary; it proves the browser/API boundary and download trigger, not an external portfolio host or production export storage.

### Private team ACL browser journey

- Expanded the same isolated runner to create a private team and human-team project as account A, verify account B cannot list the project before joining, create and apply to a recruitment post, accept the application as the team owner, and verify the project becomes visible to B only after durable membership acceptance.
- Fresh result includes `privateTeamAcl: passed` using two independent headless Chrome contexts. This is browser-backed local ACL evidence; it does not authorize or verify the ambiguous operational Runtime.

### Major-route responsive browser matrix

- Expanded the isolated runner's overflow assertion from the world route to 13 authenticated user routes: World, Idea Lab, Projects, Learning, AI Chat, Teams, Community, Friends, Profile, Activity, Portfolio, Memory, and Settings.
- Fresh `npm.cmd run test:iseol-browser-e2e` passed at 390, 768, 1024, and 1440px (`responsiveRoutes: 13`). This verifies horizontal layout containment for the rendered local flows; it does not replace visual approval against every design artifact or test the operator Control Plane UI.

### Owner-bound workspace provisioning and local Core/Agent integration

- Fixed `src/project-model/user-project-service.ts` so creating a user project provisions the generated owner-scoped `workspaceRoot` directory before the durable project record is saved. This closes the real Desktop Agent failure mode where Run preparation could receive a path that did not exist.
- Added `tests/user-project-execution.test.ts` coverage for the physical owner-bound workspace directory, and extended `tests/user-project-runtime-integration.test.ts` to start the real `startDesktopAgentCoreService`, connect an isolated authenticated fake Agent over WebSocket, and execute the real CONTEXT and TEST Desktop stages through the composed Runtime and HTTP project flow. The test uses temporary roots and a permitted local `node --test` smoke file; it never connects to the operational Runtime.
- Verification: focused composed Runtime integration `2/2`; serial user-product suite `75/75`; full root regression `648/648`; root build exit 0; approved UI build exit 0 with only the existing Vite config/chunk-size warnings; browser E2E passed with two isolated accounts, private-team ACL, public portfolio export, and 13 routes at 390/768/1024/1440px; root TypeScript check exit 0; `git diff --check` has no diff errors apart from existing LF/CRLF warnings.
- This is fresh isolated local Core/Agent evidence, not operational PID `1708` evidence. No live Runtime/Agent/browser process, UNKNOWN request, external AI/provider, production data, push, deployment, or deferred AI broadcast-room file was changed.

### Project completion activity and growth projection

- Connected a terminal successful user Project Run to the existing evidence-based growth path. `src/project-model/user-project-service.ts` now records one owner-bound, verified `project.run.completed` ActivityEvent when the durable Run is `DONE`, and applies the existing GrowthService projection; repeated project reads reuse the same event/ledger identity.
- The projection is deliberately attributed as `system`: the completion fact comes from the verified Runtime Run, while Desktop Agent evidence keeps its own AI/provider attribution in the evidence and portfolio layers. Team members can read an accessible project but cannot cause an owner’s growth event to be written because projection is owner-bound.
- Added assertions to `tests/user-project-runtime-integration.test.ts`; composed Runtime integration `2/2`, user-project execution `7/7`, serial product suite `75/75`, full root regression `648/648`, root build exit 0, and diff validation pass. No unverified Run, waiting state, UNKNOWN request, external service, or operational Runtime state is promoted to success.

### Project lifecycle evidence read model

- Added `src/project-model/lifecycle.ts` as a pure projection from identity-bound durable `HarnessEvidenceRecord`s. Explicit `build`, `test`, and `file-change` evidence becomes `Artifact`; `commit`, `pull-request`, and `ci` becomes `Revision`; `deployment` and `production-verification` becomes `Deployment`. Foreign project IDs, foreign Run IDs, unbound records, and unsupported evidence kinds are excluded.
- `UserProjectView.lifecycle` now exposes deterministic, provenance-preserving IDs with Run/evidence identity, stage, summary, timestamp, provider, and reference. No missing stage is represented as a pending or successful placeholder.
- `user-ui/src/pages/Projects.tsx` renders the three lifecycle groups with counts and explicit empty states. Added `tests/project-lifecycle.test.ts` and `tests/user-ui-project-lifecycle-contract.test.ts`; lifecycle/UI contract tests pass `4/4`, serial product suite passes `79/79`, root `npm.cmd test` passes fresh with exit 0, root TypeScript/build and approved UI build pass, and isolated browser E2E passes with the existing 2-account/ACL/portfolio/13-route responsive matrix.
- This is verified against temporary local Runtime/Core/Agent fixtures only. Operational PID `1708`, stale lock PID `55000`, UNKNOWN records, external providers, production deployment, and deferred AI broadcast-room files remain untouched.

### Project Run resume flow

- Added an owner-only resume path for waiting user-project Runs. `src/harness/run-service.ts` now transitions the same durable Run identity from `WAITING_AGENT`, `WAITING_EXTERNAL`, `BLOCKED_USER`, `PAUSED`, or `RECOVERING` back to `READY` with an event/checkpoint; `src/project-model/user-project-service.ts` and `src/project-model/user-project-router.ts` preserve the existing project, work request, Run ID, stage, approval boundary, and enqueue ownership.
- `user-ui/src/pages/Projects.tsx` now shows an explicit `Run 재개` confirmation for waiting requests with a durable Run. The owner must approve the resume action; team viewers cannot resume another owner’s Run. No new Run identity or fake success state is created.
- Evidence: `tests/user-project-execution.test.ts` resume identity test, `tests/user-project-api.test.ts` authenticated HTTP resume test, and `tests/user-ui-project-resume-contract.test.ts`; those focused checks pass `8/8`, `3/3`, and `1/1`, respectively. The serial user-product suite passes `82/82`; isolated browser E2E passes the existing account/ACL/portfolio/13-route responsive matrix; root TypeScript, root build, approved UI build, and `git diff --check` pass.
- A full root regression initially exposed one intermittent local Core/Agent timing failure under suite load; the affected integration test passed alone three consecutive times, and the subsequent full rerun passed `648/648` with zero failures. This remains isolated test evidence, not operational PID `1708` execution. The operational Runtime, stale lock/UNKNOWN records, external providers, production deployment, and deferred AI broadcast-room files remain untouched.

### Learning session completion flow

- Added `completeLearningSession` across `src/learning/contracts.ts`, `src/learning/service.ts`, and `src/learning/router.ts`. `POST /api/user/learning/sessions/:sessionId/complete` is owner-scoped, persists the same session as `completed` with `completedAt`, returns the existing completed record on repeat calls, and records one verified user-attributed `learning.session.completed` ActivityEvent only after the session save succeeds.
- `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Learning.tsx` now expose an explicit `학습 세션 완료` action, render `완료된 세션`, and disable further attempt submission for a completed session. The service also rejects direct post-completion attempt writes, so the boundary is not UI-only. No AI answer or external provider is fabricated; code analysis remains explicitly `local-static`.
- The Runtime composition now injects the existing owner-scoped GrowthService into LearningService, so the verified completion event immediately projects the existing +100 learning XP rule without a caller-side manual step. Evidence: `tests/learning-session-completion.test.ts`, `tests/learning-api.test.ts`, and `tests/user-ui-learning-contract.test.ts` pass `1/1`, `1/1`, and `1/1` in the focused slice; the serial user-product suite passes `83/83`; the isolated browser run reports `learningSessionCompletion: passed` alongside two-account ACL, portfolio, community, world-isolation, and 13-route responsive checks. Root TypeScript/build, approved UI build, and final root regression `648/648` pass. The real Core/Agent integration observation window is bounded at 60 seconds for full-suite Windows load and remains isolated from operational PID `1708`.

### Coding exercise and attempt persistence flow

- Added an owner-bound coding exercise/attempt slice across `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, and `src/learning/router.ts`. Users can save a problem with a learning-session reference, submit a code/solution response, reload it after a service restart, and list the append-only attempt history.
- The submission boundary uses `clientRequestId` idempotency: a same-body retry returns the same attempt, while a changed body returns a conflict. The stored attempt keeps `revealedBeforeSubmit: false` and an explicit `practiceResult.status: environment-required`; no local execution, test pass, or AI evaluation is fabricated while the isolated executor is unavailable.
- Connected `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Learning.tsx` with a real problem/answer flow. The UI labels the current state as `환경 필요 · 실행/채점 보류`, so a saved answer is not presented as a verified coding skill.
- Added `tests/learning-coding-test.test.ts`, `tests/learning-coding-test-api.test.ts`, and `tests/user-ui-coding-test-contract.test.ts`. Focused coding slice passes `3/3`; the serial user-product suite passes `86/86`; the isolated browser E2E verifies `codingExercisePersistence: passed` alongside the existing two-account ACL, portfolio, learning completion, and 13-route responsive matrix. Actual sandbox execution and feedback remain separate Runtime work and were not submitted to the operational Runtime.

### Personal AI private-context dispatch boundary

- Extended `src/ai-chat/contracts.ts` with a private `AiChatContextSnapshot` and connected `src/ai-chat/service.ts` to pass only the authenticated user's private memories to the injected Runtime dispatcher. The snapshot is bounded to 20 records and 16,000 characters, omits the storage owner id from the payload, and is rebuilt from the durable owner-scoped memory store for each dispatch.
- Updated `src/ai-chat/local-runtime.ts` so an explicitly enabled loopback Ollama adapter receives the bounded private context alongside the user request. No external endpoint, model download, or operational Runtime call was introduced; absent/non-completing local Runtime behavior remains `waiting_runtime`.
- Added regression coverage that user A's dispatcher never receives user B's memory and that the local adapter includes only the supplied private context. The focused AI slice passes `11/11`, the serial user-product suite passes `88/88`, TypeScript/build pass, and the final root suite passes `648/648`.

### Personal AI learning-history permission boundary

- Extended the private AI context in `src/ai-chat/service.ts` to include only the authenticated user's bounded learning sessions and attempts when the persisted `settings.aiAccess.learningHistory` permission is enabled. The snapshot is capped at 12 sessions and 24 attempts, clips answer text, omits the owner id, and fails closed to memory-only context if the settings or learning read is unavailable.
- `src/ai-chat/local-runtime.ts` formats the permitted learning context for the loopback-only adapter; disabling the setting removes learning history from the dispatch payload. This is an AI data-access permission, separate from public learning-history visibility, and no external model or live operational Runtime was called.
- Evidence: `tests/ai-chat-runtime-dispatch.test.ts` and `tests/ai-chat-local-runtime.test.ts`; focused AI slice `12/12`, serial user-product suite `89/89`, full root regression `648/648`, root TypeScript/build, and approved UI build pass. The isolated browser result remains valid for the unchanged UI journeys; this permission boundary is covered at the service/dispatcher boundary, not by a fabricated live-model result.

### Windows Harness Run atomic-save hardening

- The full regression exposed a real isolated Windows failure where `run.json` had the next state in a temporary file but a transient destination rename prevented the Harness supervisor from advancing past `CONTEXT`. `src/harness/run-store.ts` now reuses the bounded `renameWithTransientRetry` helper for `EPERM`/`EBUSY`/`EACCES` and cleans up the temporary file on terminal failure.
- The focused Run-store/atomic-file/real local Core-Agent checks pass `10/10`; the subsequent full root regression passes `648/648`. This change affects temporary/isolated durable Run persistence only; operational Runtime PID `1708`, stale lock PID `55000`, UNKNOWN records, external services, and deferred AI broadcast-room files were untouched.

### Learning Goal minimum-input flow

- Added the latest learning-spec minimum-input contract without deleting the existing `LearningPlan`: `subjectText`, `duration` (`days` or future `targetDate`), and `dailyMinutes` are stored in a user-owned durable `LearningGoal` draft with revision `1`. Range validation follows the spec bounds (subject ≤200 characters, days 1–3650, minutes 1–1440); no AI interpretation or plan success is fabricated.
- Added authenticated `GET/POST /api/user/learning/goals` and owner-bound goal detail reads, `user-ui/src/api/userApi.ts` bindings, and an approved Learning screen panel that saves/reloads the three-input draft. The existing plan/session/attempt/review/coding flows remain unchanged.
- Evidence: `tests/learning-goals.test.ts`, `tests/learning-goals-api.test.ts`, `tests/user-ui-learning-goal-contract.test.ts`; focused `4/4`, serial user-product `93/93`, root `648/648`, TypeScript/build, approved UI build, and isolated browser E2E pass. The browser runner now reports `learningGoalDraftPersistence: passed` in addition to the two-account ACL, portfolio/export, coding, completion, and responsive matrix.

### Learning Goal local-template plan preview

- Added immutable owner-scoped `GoalInterpretation` and `LearningPlanVersion` records without replacing the existing manual `LearningPlan`. `POST /api/user/learning/goals/:goalId/plan-preview` validates the goal revision, stores the local-template source and bounded assumptions, creates daily time-budgeted segments/activities/checkpoints, and advances the goal only to `preview-ready`; no external AI or operational Runtime is called.
- Added `GET /api/user/learning/goals/:goalId/plans`, restart-safe reads, same-input idempotent preview reuse, revision conflict handling, authenticated UI/API bindings, and an explicit `학습 계획 미리보기` action. The UI labels `local-template` and states that the result is not AI interpretation or a mastery guarantee. Target-date previews use the injected server-day boundary; full user-timezone semantics remain open because the current Principal does not carry timezone.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-plan-preview.test.ts`, `tests/learning-plan-preview-api.test.ts`, and `tests/user-ui-learning-plan-preview-contract.test.ts`. Focused slice `4/4`, serial user-product `98/98`, root regression `648/648`, TypeScript build, approved UI build, and isolated browser result `learningPlanPreviewPersistence: passed` all pass. AI-backed interpretation, plan activation, session/day linkage, and content generation remain follow-up work.

### Learning Goal activation and first-day session

- Added the authenticated `POST /api/user/learning/goals/:goalId/start` boundary. It checks the owner and `expectedRevision`, binds the selected immutable plan version and existing planned day, activates the goal/version, and persists an owner-scoped `LearningSession` with `goalId`, `planVersionId`, `dayId`, and `contentStatus: not-requested`. Repeated starts reuse the same active day session; stale revisions, foreign plans, and unknown days fail closed.
- Extended the approved Learning UI with `오늘의 학습 세션 시작`. The screen now connects the local-template preview to a real durable session, but explicitly says `AI 콘텐츠 요청 전`; no generated lesson, evaluation, or mastery is fabricated. Legacy manual `LearningPlan` sessions remain compatible through optional session fields.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-goal-start.test.ts`, `tests/learning-goal-start-api.test.ts`, and `tests/user-ui-learning-goal-start-contract.test.ts`. Focused `4/4`, serial user-product `102/102`, TypeScript build, approved UI build, root regression `648/648`, and isolated browser `learningGoalDaySession: passed` all pass. Local AI content generation, timezone-complete day scheduling, feedback/evaluation, and plan adjustment remain open.

### Learning Goal today-content request boundary

- Added owner-scoped durable `LearningContentRequest` records and optional `LearningContentDispatcher` injection. `POST /api/user/learning/sessions/:sessionId/content` creates one idempotent private request for an activated goal day, stores an input hash/template version/budget, changes the session to `contentStatus: pending`, and remains `waiting-runtime` when no local content Runtime is configured. `GET` reconnects to the same request; no external request or fabricated lesson is produced.
- An explicitly injected local dispatcher can complete later through an owner-bound callback. The service validates block ids/kinds/text, daily time budget, source session/plan/day identity, and persists a `validated` `LearningLessonContent` only after validation; duplicate completion returns the original lesson. The approved Learning UI exposes `오늘 수업 콘텐츠 준비 요청`, restores the waiting/validated state after reload, and labels the current absence of a local Runtime honestly.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-content-request.test.ts`, `tests/learning-content-request-api.test.ts`, and `tests/user-ui-learning-content-contract.test.ts`. Focused slice `4/4`, serial user-product `106/106`, root/UI TypeScript builds, and isolated two-account browser E2E with `learningGoalContentRequest: passed` all pass. Actual local model generation, content accuracy, answer evaluation/feedback, timezone-complete scheduling, and live operational Runtime execution remain unverified.

### Learning actions and answer evaluation-pending boundary

- Added owner-bound `POST/GET /api/user/learning/sessions/:sessionId/actions`. `self-report` actions are append-only and recorded as user statements; explanation/example/hint actions remain `waiting-runtime` when no local action Runtime is configured. Action ids are idempotent and conflicting reuse is rejected. The UI exposes `이해했어요 기록` and explicitly says the self-report is not mastery evidence.
- Added `POST /api/user/learning/sessions/:sessionId/answers` and `GET /api/user/learning/answers/:answerId/feedback`. A receipt must reference the same owner's session, coding exercise, and durable coding attempt; response/artifact refs are bounded and idempotent. The answer is stored as `evaluation-pending` with an evaluation request id and a separate `pending` feedback record. No score, correctness, or mastery is generated without an evaluator.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-actions-answers.test.ts`, `tests/learning-actions-answers-api.test.ts`, and `tests/user-ui-learning-actions-answers-contract.test.ts`. Focused slice `4/4`, serial user-product `110/110`, root regression `648/648`, TypeScript/root/UI builds, and isolated browser E2E with `learningAnswerEvaluationPending: passed` all pass. Runtime action generation, evaluator feedback, disputes, and verified mastery remain open.

### Learning progress evidence read model

- Added `LearningProgress` and owner-bound `GET /api/user/learning/goals/:goalId/progress`. The read model separates planned days, completed/active goal sessions, verified-correct/unverified/reported-incorrect study attempts, self-reports, Runtime-waiting actions, evaluation-pending/feedback-ready/disputed answer receipts, and due reviews. It exposes evidence IDs and explicit warnings; it does not calculate a percentage or claim mastery.
- The service selects the newest non-superseded active/validated plan, derives completed days only from completed sessions bound to that plan, filters reviews through the goal's session IDs, and preserves the same projection after a new service instance. Foreign users receive no goal progress. The Learning UI renders `진도 근거` with 예정/실제/평가 대기/복습 대기 counts and the explicit no-fabricated-mastery boundary.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-progress.test.ts`, `tests/learning-progress-api.test.ts`, and `tests/user-ui-learning-progress-contract.test.ts`. Focused progress slice `4/4`, serial user-product `114/114`, root regression rerun `648/648`, root/UI builds, and isolated browser E2E with `learningProgressEvidence: passed` all pass. Authenticated requests use the account timezone; direct principals without one retain a visible server-day fallback. Evaluator/runtime-backed mastery projection remains open; operational Runtime, UNKNOWN requests, external providers, and deferred AI broadcast-room files remain untouched.

### Learning today read model and timezone boundary

- Added owner-bound `GET /api/user/learning/goals/:goalId/today`. It selects the current non-superseded plan and the day matching the authenticated user's timezone, returns the existing day session when present, and distinguishes `available`, `active`, `content-pending`, `completed`, and `locked`. It never creates a session or calls an external/local AI provider.
- The user router attaches the persisted platform-user timezone only for learning service calls; legacy direct principals remain compatible and receive a visible server-date fallback. The Learning UI/API now show `오늘 상태` and the planned day/minutes beside each goal. The state follows the same durable session after content request and reload.
- Evidence: `src/identity` was not changed; implementation is in `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-today.test.ts`, `tests/learning-today-api.test.ts`, and the learning UI contract test. Focused today/progress/UI slice `7/7`, serial user-product `117/117`, root regression `648/648`, TypeScript/root/UI builds, and isolated browser E2E with `learningTodayState: passed` all pass. No live operational Runtime, UNKNOWN replay, external AI, data deletion, push, deployment, or deferred broadcast-room change occurred.

### Learning feedback dispute and re-evaluation boundary

- Added `LearningFeedbackDispute` as a separate owner-scoped durable record. `POST /api/user/learning/feedback/:feedbackId/disputes` validates the feedback and answer ownership, preserves the user's reason, transitions both feedback and answer to `disputed`, and reports `waiting-runtime` with an explicit local Runtime re-evaluation blocker. Same-reason retries are idempotent; changed reasons conflict; foreign users receive no record.
- Connected `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Learning.tsx` with `평가 이의 제기 사유`, `평가 이의 제기 저장`, and `재평가 대기`. The UI never presents the dispute as a completed evaluation, and the existing pending-evaluation boundary remains visible.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-feedback-dispute.test.ts`, `tests/learning-feedback-dispute-api.test.ts`, and `tests/user-ui-learning-feedback-dispute-contract.test.ts`. Focused slice `3/3`, serial user-product `120/120`, TypeScript/root build, approved UI build, root regression `648/648`, and isolated browser E2E with `learningFeedbackDispute: passed` all pass. Actual evaluator/runtime re-evaluation remains unconfigured; operational Runtime, UNKNOWN requests, external providers, and deferred AI broadcast-room files remain untouched.

### Learning evaluator structured feedback boundary

- Added an optional, explicitly injected `LearningFeedbackDispatcher` for the learning F-stage. A local evaluator receives the owner-bound immutable answer, exercise, and practice attempt, then completes through `completeLearningFeedback` with bounded `criteriaResults`, evidence references, feedback, misconceptions, verification, next action, rubric version, and evaluator version.
- The service validates exact answer/attempt identity and all result bounds, persists the structured evaluation, changes the answer to `feedback-ready`, and maps the feedback to `tentative`/`verified`. A `verified` result is downgraded to `tentative` when the attempt has no verifier evidence; evaluator timeout/waiting leaves the answer `evaluation-pending` and does not invent feedback. The runtime composition accepts the dispatcher only through explicit local injection; no operational call was made.
- The Learning UI/API expose the structured result and state that a result without verifier evidence is still unverified. Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-feedback-evaluator.test.ts`, and `tests/user-ui-learning-feedback-evaluator-contract.test.ts`. Focused slice `3/3`, serial user-product `123/123`, TypeScript/root build, approved UI build, root regression `648/648`, and browser E2E (unchanged no-evaluator path) all pass. Live evaluator execution, actual verifier receipts, re-evaluation after disputes, operational Runtime requests, UNKNOWN state, and deferred broadcast-room files remain untouched.

### Learning dispute re-evaluation version preservation

- Extended the explicit local evaluator boundary to run after a persisted dispute. A successful re-evaluation transitions the dispute to `recorded` and the answer back to `feedback-ready`; the previous structured evaluation remains in `evaluationHistory` while the new evaluator version becomes current. If no evaluator is injected, the original `waiting-runtime` behavior remains unchanged.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `user-ui/src/api/userApi.ts`, `tests/learning-feedback-reevaluation.test.ts`. Focused re-evaluation `1/1`, serial user-product `124/124`, root regression `648/648`, TypeScript/root/UI builds, and isolated browser E2E all pass. This is an isolated injected-adapter verification; no operational Runtime request or external AI call occurred.

## 2026-09-26 continuation: authenticated user shell and truthful world states

- Added `user-ui/src/domain/worldState.ts` as a pure state adapter. My World now distinguishes a durable project/learning record (`저장된 기록`) from an action the user still needs to take (`다음 행동`); it no longer labels record existence as `확인됨` and no longer exposes fabricated mission progress or XP.
- Updated `user-ui/src/components/UI.tsx` so the reusable `MissionItem` accepts only the explicit `recorded`/`next-action` state. Updated `user-ui/src/pages/Settings.tsx` to keep Runtime/external integrations in truthful unknown/unavailable/deferred states and removed the non-functional disconnect button.
- Added an authenticated `AppShell` boundary in `user-ui/src/components/Navigation.tsx`: an unauthenticated direct visit to a private user route is routed to `/app/login` with a visible local-login status before user-world content is presented.
- Added `tests/user-ui-world-state-contract.test.ts` and `tests/user-ui-auth-boundary-contract.test.ts`; extended `tests/user-ui-integrations-contract.test.ts`. The browser runner `scripts/iseol-user-ui-e2e.ts` now checks the unauthenticated route guard, truthful My World labels, unavailable integration state, two-account isolation, 13 authenticated routes, and 390/768/1024/1440px containment in a temporary loopback-only server.
- Verification: focused UI contracts `4/4`; `npm.cmd run test:iseol-user-product` `127/127`; `npm.cmd test` `648/648`; `npm.cmd run build` exit 0; `npm.cmd run user-ui:build` exit 0 with only existing Vite config/chunk-size warnings; browser JSON reported `unauthenticatedRouteGuard: passed`, `truthfulWorldAndIntegrationStates: passed`, and all prior journey fields `passed`; `git diff --check` exit 0 with existing line-ending warnings.
- Runtime safety: PID 1708 is still `scripts/iseol-runtime-host.ts start` with authoritative `iseol-runtime.json` dataRoot `data/dogfood-01-20260919`, lock path under that root, and listeners on `127.0.0.1:18890`/`:18891`; PID 22416 remains the Desktop Agent connected to `18891`; stale PID 55000 remains absent. No operational Runtime/Agent restart or request, UNKNOWN replay, external provider call, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-26 continuation: loopback local learning Runtime adapter and bounded smoke cleanup

- Added `src/learning/local-runtime.ts` with an opt-in, loopback-only Ollama adapter for structured learning lesson generation and answer evaluation. `ISEOL_LEARNING_RUNTIME_ENABLED` defaults to disabled; enabling it requires a model and accepts only `127.0.0.1`, `localhost`, or `::1`. Malformed, unavailable, non-2xx, or oversized responses remain `waiting-runtime` and never become a lesson, score, mastery claim, or verified evidence.
- Wired the adapter into `src/runtime/iseol-runtime-services.ts` only when the dedicated learning Runtime config is explicitly enabled. Content completion and feedback completion still pass through the existing owner-bound durable service callbacks, so user scope, validation, evaluation-history, and verifier-evidence rules remain authoritative. No operational Runtime or local model was called.
- Added `tests/learning-local-runtime.test.ts`; the learning Runtime contract slice and all prior user-product contracts pass `131/131`. The full root regression passes `648/648`, the approved UI build and root build pass, and isolated browser E2E reports `unauthenticatedRouteGuard: passed`, `truthfulWorldAndIntegrationStates: passed`, all learning fields `passed`, and the four required viewport sizes.
- Fixed `scripts/idea-lab-live-smoke.ts` so a timed-out service disposal is not started a second time from `finally`; the focused live-smoke file passes `14/14`, and the full suite passes `648/648` under load. This only affects isolated smoke cleanup and does not touch the operational Runtime.
- Live Ollama generation/evaluation, verifier-backed evidence, external connectors, operational Runtime ownership, durable UNKNOWN requests, and AI Broadcast Room/TTS/video export remain unverified or deferred. PID `1708`/Agent `22416` and the authoritative dogfood dataRoot were inspected read-only and left unchanged.

## 2026-09-26 continuation: local learning action responses

- Extended `src/learning/contracts.ts` and `src/learning/service.ts` with an optional owner-bound `LearningActionDispatcher` for `explanation`, `example`, and `hint`. A completed response is validated, marked `recorded`, tagged `source: local-runtime`, and survives a new service instance; absent/accepted/failed Runtime work remains `waiting-runtime`. Self-report actions remain append-only user statements and are never converted into mastery evidence.
- Added `createOllamaLearningActionDispatcher` in `src/learning/local-runtime.ts` and wired it through `src/runtime/iseol-runtime-services.ts` under the same explicit loopback-only `ISEOL_LEARNING_RUNTIME_ENABLED` gate. The prompt contains only bounded private action/session context and expects structured JSON; malformed or unavailable responses do not complete the action.
- Evidence: `tests/learning-local-runtime.test.ts` and `tests/learning-actions-answers.test.ts` action/runtime cases pass `8/8`; user-product regression passes `133/133`; root regression passes `648/648`; root TypeScript build passes; isolated browser E2E remains fully green with two accounts, 13 routes, and 390/768/1024/1440px containment.
- No live Ollama model call, operational Runtime/Agent request, external provider call, UNKNOWN replay, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-26 continuation: Learning UI action states

- Extended `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Learning.tsx` to load and display durable learning actions. Users can enter a bounded help question and request an explanation, example, or hint; recorded local responses are shown as `로컬 Runtime 응답 저장`, while absent Runtime work remains `로컬 Runtime 대기`. Self-report remains visibly separate from AI help and is not shown as mastery.
- The browser E2E now clicks the approved Learning UI hint flow, verifies the private action through the authenticated API, reloads the page, and confirms the action history remains visible. `learningActionWaiting: passed` joins the existing two-account, 13-route, 390/768/1024/1440px matrix.
- Verification: the focused Learning UI contract passes `1/1`, user-product regression passes `133/133`, approved UI build passes with only the existing Vite config/chunk-size warnings, and isolated browser E2E passes. No local model was enabled or called.

## 2026-09-26 continuation: authenticated Runtime capability status

- Added `GET /api/user/runtime-status` to the authenticated user boundary. It projects only the safe local Runtime capability state (`disabled`, `blocked`, or `ready`) and project-execution availability; it does not expose operator credentials, data roots, lock paths, ports, or internal blocker text.
- Connected `user-ui/src/pages/Settings.tsx` and `user-ui/src/api/userApi.ts` to the durable server capability. The approved integration surface now shows `Runtime 준비됨`, `Runtime 확인 필요`, `Runtime 미연결`, or the fail-closed `상태 확인 필요` fallback instead of a hardcoded unknown state. Existing external connectors remain unavailable/deferred and have no fake actions.
- Evidence: `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/user-runtime-status-api.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused runtime-status/UI tests pass `3/3`, serial user-product regression passes `135/135`, root TypeScript build and approved UI build pass, `git diff --check` reports only existing line-ending warnings, and isolated browser E2E reports `runtimeStatusSurface: passed` plus the existing two-account/13-route/390/768/1024/1440px matrix.
- The full root suite exposed a Windows worker-load race in the live-smoke watchdog (`did-not-settle` before bounded cleanup could report). The watchdog in `tests/idea-lab-live-smoke.test.ts` now remains above the 5ms cleanup budget while tolerating concurrent test-worker scheduling; focused live-smoke verification passes `14/14`, and the fresh full root regression passes `648/648`.
- Runtime safety: no operational Runtime/Agent/browser restart, request, UNKNOWN replay, external provider call, data mutation, push, deployment, or AI Broadcast Room change occurred. The local Ollama probe remains unavailable/timed out, so live model-backed responses are still unverified.

## 2026-09-26 continuation: private AI chat browser journey

- Added an explicit browser journey for the existing approved AI Chat surface. Account A creates a private conversation, sends a message, receives the truthful `waiting_runtime` state, reloads, and sees the durable message again. Account B sees no saved conversation and cannot see A's prompt.
- Added `tests/user-ui-ai-chat-contract.test.ts` and included it in `test:iseol-user-product`. This verifies the UI is bound to the durable conversation API, keeps the user-only boundary visible, and does not claim an assistant answer before Runtime completion.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-ai-chat-contract.test.ts`, existing `src/ai-chat/*` API/service tests. Product regression passes `136/136`, approved UI build passes with only existing Vite warnings, and isolated browser E2E reports `privateAiChatPersistenceIsolation: passed` alongside the two-account/13-route/390/768/1024/1440px matrix.
- This verifies the user-facing persistence/isolation path only. Live local model generation, Runtime ownership, evaluator-backed answers, external AI, UNKNOWN replay, and AI Broadcast Room remain unverified/deferred; no operational service or user data was changed.

## 2026-09-26 continuation: owner-scoped activity export

- Implemented `GET /api/user/activity/export?format=json|markdown` behind the existing authenticated activity route. The response contains only the requesting user's durable activity events; unsupported formats fail with `400`, unauthenticated requests fail with `401`, and another user's export is empty.
- Connected the approved Settings privacy/data-management surface to a real JSON download. The button is now enabled only for the supported owner-scoped export, while account deletion remains explicitly disabled until its recovery policy exists.
- Evidence: `src/growth/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/activity-export-api.test.ts`, `tests/user-ui-settings-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused API/UI tests pass `2/2`, serial user-product regression passes `137/137`, root regression passes `648/648`, root build and approved UI build pass, and browser E2E reports `activityExportDownload: passed` plus the existing two-account/13-route/390/768/1024/1440px matrix.
- No operational Runtime/Agent/browser, UNKNOWN request, external provider, database reset, push, deployment, or AI Broadcast Room file was changed. Live local model execution and external connectors remain unverified/deferred.

## 2026-09-26 continuation: private friend messaging browser journey

- Extended the isolated browser runner to exercise the existing Friends surface with two independent accounts: account A searches account B and sends a friend request, account B accepts it, account A sends a direct message, and account B reloads twice to confirm the message remains available.
- Added `tests/user-ui-friends-contract.test.ts` to protect the API/UI wiring for profile search, friendship request/acceptance, and private direct messages. The UI keeps the message save/error states visible and delegates ACL enforcement to the authenticated social service.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-friends-contract.test.ts`, existing `src/social/*` and collaboration API tests. Serial user-product regression passes `138/138`; browser E2E reports `privateFriendMessagingPersistence: passed` plus the existing activity export, AI chat, team ACL, portfolio, learning, two-account, and 390/768/1024/1440px checks.
- This is isolated local browser evidence, not production multi-device delivery or external notification evidence. No operational Runtime/Agent/browser, UNKNOWN request, external provider, data deletion, push, deployment, or AI Broadcast Room file was changed.

## 2026-09-26 continuation: private memory vault browser journey

- Extended the isolated browser runner to exercise the existing private memory UI. Account A saves a memory, reloads it, edits and reloads it again, deletes it through the confirmation dialog, and account B confirms that the memory was never visible in its private vault.
- The first run exposed a test-only strict-selector collision because the AI Chat journey had already created a second legitimate private memory. The runner now scopes edit/delete controls to the article containing the target memory; no product behavior was weakened or broadened.
- Evidence: `user-ui/src/pages/MemoryVault.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-memory-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Browser E2E reports `privateMemoryCrudIsolation: passed` with the existing two-account, private AI, friend messaging, portfolio, learning, export, and 390/768/1024/1440px checks.
- This remains isolated local persistence evidence. Live local AI retrieval/answer generation, multi-device storage, operational Runtime ownership, UNKNOWN replay, external providers, and deferred AI Broadcast Room work remain unverified/deferred.

## 2026-09-26 continuation: evidence-derived growth achievements

- Added a bounded `GrowthAchievement` projection to `GrowthSnapshot`. The current internal evidence milestone catalog contains first verified evidence, learning session, project run, collaboration, and consistency achievements. Each earned item includes a stable `badgeKey`, unlock timestamp, and the exact positive growth evidence event IDs that unlocked it.
- Achievement eligibility is derived from the durable growth ledger, not client counters. Only net-positive verified projections are eligible; duplicate projection is idempotent, unverified events create no achievement, and a retracted event's compensating ledger entry removes its achievement evidence. No unearned/locked achievement is returned as earned.
- Connected `MyWorld` and `Character` to display earned achievements and their evidence counts. Because the repository has no approved final achievement/badge artwork or catalog, the UI uses the existing approved text surface and a neutral text badge marker; it does not invent final visual assets or unlock customization items.
- Evidence: `src/growth/contracts.ts`, `src/growth/read-model.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `user-ui/src/pages/Character.tsx`, `tests/growth-achievements.test.ts`, `tests/activity-growth-ledger.test.ts`, `tests/user-ui-character-contract.test.ts`, `tests/user-ui-my-world-contract.test.ts`, `scripts/iseol-user-ui-isolated-server.ts`, and `scripts/iseol-user-ui-e2e.ts`. Product regression passes `139/139`; root TypeScript build and approved UI build pass (existing Vite warnings only); isolated browser E2E reports `growthAchievementsPersistenceIsolation: passed` after real learning-session completion, two-account isolation, reload, and evidence retraction.
- The first browser attempt exposed a test-composition gap: the isolated server omitted `growthService` from its learning service. The fixture now mirrors the production composition; no operational Runtime or browser was restarted. Live local model generation, approved badge artwork/catalog, external providers, UNKNOWN replay, and AI Broadcast Room remain unverified/deferred.

## 2026-09-26 continuation: project approval and no-Runtime waiting browser path

- Extended the isolated two-account browser runner to create a solo user project and work request, enable the owner-scoped `aiApproval.buildRun` setting, cancel the approval confirmation without sending a request, then approve the request against a server with no Runtime enqueue capability.
- The approved request remains `waiting` with `Project Runtime is not configured`, no fake success/evidence is shown, and no resume action appears because no durable Run identity exists in this no-Runtime boundary. The same waiting state survives page reload, and account B cannot list the solo project.
- Evidence: `user-ui/src/pages/Projects.tsx`, `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, existing project approval/resume tests, and `scripts/iseol-user-ui-e2e.ts`. Browser E2E reports `projectApprovalWaiting: passed`; the full two-account and 390/768/1024/1440px matrix remains green. Durable Run resume with an existing Run identity remains covered by isolated service/API tests and still requires an explicitly configured Runtime boundary for live execution.

## 2026-09-26 continuation: verified evidence ownership boundary

- Hardened `POST /api/user/activity` so an authenticated user client cannot self-submit `verificationStatus=verified`; the route returns `403` with a service-owned boundary. User-submitted `unverified`/`unknown` records remain owner-scoped and exportable, while internal LearningService and ProjectService paths continue to create verified events.
- Updated the integrated HTTP journey to complete a real learning session and read the resulting verified `ActivityEvent` before creating portfolio evidence; no manual verified activity injection remains.
- Evidence: `src/growth/router.ts`, `tests/activity-growth-api.test.ts`, `tests/activity-export-api.test.ts`, `tests/iseol-user-journeys.test.ts`. Product regression passes `139/139`, root regression `648/648`, root/UI builds pass, and isolated browser E2E reports `growthAchievementsPersistenceIsolation: passed` and `learningSessionCompletion: passed`.
- No operational Runtime/Agent/browser/UNKNOWN/external call, database reset, push, deployment, or AI Broadcast Room file was changed.

## 2026-09-26 continuation: permission-aware personal AI project/activity context

- Extended the private AI Runtime dispatch snapshot with bounded project summaries and active verified activity timeline records. Project visibility still comes from the owner/team ACL in `UserProjectService`; activity visibility is owner-bound and filters out unverified or retracted events.
- Wired `aiAccess.projectFiles` and `aiAccess.activityTimeline` independently. Revoking either setting removes only that context section; settings/project/activity read failures fail closed without exposing partial data or changing the durable conversation boundary.
- The loopback-only Ollama prompt formatter now renders the supplied project/activity context without enabling external calls or claiming live model output. Production composition and the isolated user server pass the existing services into the AI boundary.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, and `tests/ai-chat-local-runtime.test.ts`. Focused AI tests pass `11/11`, product regression `140/140`, root regression `648/648`, root/UI builds pass, and isolated browser E2E remains green.
- No operational Runtime/Agent/browser/UNKNOWN replay, external AI call, database reset, push, deployment, or AI Broadcast Room file was changed. Live local model generation remains unverified because no Ollama model is installed.

## 2026-09-26 continuation: settings permission persistence browser path

- Extended the isolated two-account browser journey to toggle `내 프로젝트 파일 접근` and `활동 타임라인 참조` off for account A, reload the approved AI Settings screen, and verify both values remain disabled.
- Account B independently retains the default enabled values, proving the permission records remain user-scoped at the UI/API boundary. The journey does not call an external provider or operational Runtime.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/pages/Settings.tsx`, `tests/settings-api.test.ts`, `tests/user-ui-settings-contract.test.ts`. Browser E2E reports `settingsPermissionPersistenceIsolation: passed` with the existing two-account, 13-route, and responsive matrix.

## 2026-09-26 continuation: portfolio share-control browser path

- Extended the isolated portfolio journey to use the approved visible `공개 링크 복사` control and verify its status remains truthful when clipboard access is unavailable, then opened the `공개 포트폴리오 열기` link before rechecking the tokenless public route.
- Evidence: `user-ui/src/pages/PortfolioScreen.tsx`, `tests/user-ui-portfolio-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`. Browser E2E reports `publicPortfolioShareControl: passed`, `publicPortfolioRouteAndJsonExport: passed`, and the full two-account/responsive matrix remains green.
- No public/private visibility rules were broadened; private entries remain without share controls and the public route still filters private entries.

## 2026-09-27 continuation: learning review scheduling browser path

- Extended the isolated Learning journey to save a real review question/answer, complete it with `이해함`, confirm the due queue clears, and query the durable future schedule.
- The persisted review record reports `reviewCount=1` and `intervalDays=2`; no mastery or AI evaluation is inferred from this spaced-review action.
- Evidence: `user-ui/src/pages/Learning.tsx`, `src/learning/service.ts`, `tests/learning-review-flow.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Browser E2E reports `learningReviewScheduling: passed` with the existing learning, portfolio, two-account, and responsive matrix.

## 2026-09-27 continuation: bounded local Runtime learning-plan proposal

- Added an optional `LearningPlanDispatcher` boundary for the learning goal preview flow. The default path remains the existing `local-template` plan; only an explicitly configured loopback local Runtime can produce a `local-runtime` proposal.
- Added strict proposal validation for owner scope, unknown fields, normalized subject, outcomes, segment coverage, continuous day indexes, daily/total time budgets, activity kinds, and the final checkpoint. Valid proposals are persisted as a durable runtime-sourced interpretation and plan; repeated previews reuse the existing version without dispatching again.
- Runtime `waiting`, malformed, unavailable, over-budget, incomplete, or otherwise invalid responses fail closed before any goal/plan mutation. The adapter sends only the private goal input, request hash, timezone, and bounded output schema; no external AI endpoint or live model was enabled.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/learning-plan-preview.test.ts`, and `tests/learning-local-runtime.test.ts`. Focused learning tests pass `10/10`, product regression passes `143/143`, TypeScript build passes, and the approved UI build remains green with only existing Vite warnings.
- Live Ollama generation remains unverified because no local model is available. No operational Runtime/Agent/browser restart, UNKNOWN replay, external provider call, data mutation, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: learning plan provenance reaches the approved UI

- Updated the existing Learning screen and user API types to render persisted plan provenance dynamically. The default `local-template` label remains intact; a validated `local-runtime` plan will be labeled from the durable interpretation rather than being misrepresented as a template.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/user-ui-learning-plan-preview-contract.test.ts`. The focused UI contract passes `1/1`, serial user-product regression passes `143/143`, TypeScript and approved UI builds pass, and isolated browser E2E reports `learningPlanPreviewPersistence: passed` with the two-account/responsive matrix.

## 2026-09-27 continuation: evidence-preserving learning plan adjustment

- Added a durable plan-adjustment proposal and explicit acceptance flow. An owner can propose a changed daily time or duration against a base PlanVersion; the proposal records preserved completed day IDs, day-level before/after changes, tradeoffs, and `requiresAcceptance=true` without mutating the active plan.
- Acceptance is revision-bound. It rejects stale goals, foreign/superseded plans, and no-op schedules; only after the current owner accepts does it supersede the old PlanVersion, create a new validated draft, update the goal revision/input, and preserve completed historical day shapes and sessions in the old version. Repeated acceptance returns the same new version.
- Connected the existing approved Learning screen with a small plan-adjustment section: create a proposal, inspect its waiting-for-acceptance state, and accept it. No new visual system or fabricated progress/mastery state was introduced.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-plan-preview.test.ts`, `tests/learning-plan-preview-api.test.ts`, `tests/user-ui-learning-plan-preview-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused adjustment/API tests pass `7/7`, product regression passes `145/145`, TypeScript/UI builds pass, and browser E2E reports `learningPlanAdjustment: passed` plus the existing two-account/responsive matrix.
- No live AI planning call, operational Runtime/Agent change, UNKNOWN replay, external provider call, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: learning evidence reaches portfolio projection

- Review completion now records an owner-scoped, idempotent `learning.review.completed` activity event with the review quality and next interval. The event records that the review action occurred; it does not claim mastery or add an unapproved XP rule.
- Local static code analysis now records a `learning.code.analyzed` activity event with `system` attribution, provider, language, and finding count. The analysis remains explicitly `local-static` and does not call an external service.
- The existing Portfolio read model therefore exposes verified review and analysis activity as selectable evidence while retaining actor attribution and user isolation.
- Evidence: `src/learning/service.ts`, `tests/learning-review-flow.test.ts`, `scripts/iseol-user-ui-e2e.ts`. Focused learning/growth/portfolio tests pass `6/6`, user-product regression passes `145/145`, root regression passes `648/648`, TypeScript/UI builds pass, and browser E2E reports `learningEvidenceProjection: passed`.
- No operational Runtime/Agent/browser restart, UNKNOWN replay, external provider call, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: recruitment application review UI

- Extended the existing Team · Study recruitment detail screen with a manager-only application review panel. Applicants continue to use the existing support form; managers see only the applications returned by the authenticated manager-scoped API and can accept or reject a pending application.
- Acceptance and rejection use the existing durable `reviewRecruitmentApplication` route. The UI updates the stored application status and surfaces an explicit save result; no client-only membership or access grant is fabricated.
- Evidence: `user-ui/src/pages/Teams.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-team-recruitment-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. UI contract `1/1`, user-product regression `146/146`, TypeScript/UI builds, and isolated two-account browser E2E report `recruitmentApplicationReviewUi: passed`.
- No operational Runtime/Agent/browser restart, UNKNOWN replay, external provider call, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: project Runtime completion through the approved UI

- Added an opt-in deterministic Runtime mode to the isolated user UI server only. It uses a temporary data/policy root and the existing Harness supervisor to complete a user-owned project Run with identity-bound stage evidence; the default isolated server remains Runtime-unconfigured so the existing honest waiting journey is preserved.
- Extended the isolated Chrome journey to create a project and work request through the approved UI, submit the execution request, poll the authenticated project view until the Run and work request are completed, reload the workspace, and verify the visible `성공` state plus Artifact/Revision/Deployment evidence.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`. Contract `1/1`, user-product regression `147/147`, root regression `648/648`, root/UI builds, and diff validation pass; browser E2E reports `projectRuntimeExecutionUi: passed` alongside the existing `projectApprovalWaiting: passed`, two-account ACL/recruitment flow, 13 routes, and 390/768/1024/1440px matrix.
- This is fresh isolated Runtime/Harness browser evidence, not an operational PID `1708`/Agent claim. No production Runtime, UNKNOWN request, external AI/provider, data root, push, deployment, or AI Broadcast Room file was changed.

## 2026-09-27 continuation: private AI Runtime response through the approved UI

- Added an opt-in deterministic `runtimeDispatcher` only to the temporary isolated user UI server. The default server continues to persist a user message as `waiting_runtime` when no Runtime is configured; the production loopback Ollama boundary remains unchanged.
- Extended the isolated Chrome journey to create a private AI conversation, send a user message, receive the owner-scoped Runtime response, reload the page, and verify the assistant message remains durable. The existing two-account waiting/persistence journey remains in the default server.
- Updated `user-ui/src/pages/AIChat.tsx` so the existing approved surface derives its Runtime badge and notice from a persisted assistant response. It no longer says `Runtime 연결 대기` after a verified response, while keeping execution/file-change approval language visible.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/user-ui-ai-chat-runtime-browser-contract.test.ts`, and `tests/user-ui-ai-chat-contract.test.ts`. Focused AI Chat UI/runtime contracts pass `1/1` each, user-product regression passes `148/148`, full root regression passes `648/648`, TypeScript/root UI builds pass, and browser E2E reports `privateAiChatRuntimeResponse: passed`.
- This is isolated dispatcher/UI evidence, not live Ollama quality or operational Runtime evidence. No external AI request, UNKNOWN replay, production Runtime/Agent mutation, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: Learning Runtime responses through the approved UI

- Added an opt-in deterministic Learning Runtime only to the temporary isolated user UI server. It injects owner-bound content, action, and feedback dispatchers into the existing LearningService; the default server remains unchanged and keeps content/actions/evaluation waiting when no Runtime is configured.
- Extended the approved Learning browser journey through goal draft → plan preview → active day session → validated lesson content → persisted Runtime explanation → coding answer evaluation. The evaluator deliberately requests `verified` without execution evidence; the service stores `tentative` and renders the existing verification-waiting copy instead of claiming mastery.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-learning-runtime-browser-contract.test.ts`, and `package.json`. Contract `1/1`, user-product regression `149/149`, full root regression `648/648`, TypeScript/root UI builds, and diff validation pass; browser E2E reports `learningRuntimeResponse: passed` while the existing waiting, two-account, project Runtime, private AI, portfolio, and responsive journeys remain green.
- This is isolated dispatcher/UI evidence, not live Ollama quality or operational Runtime evidence. No external AI request, UNKNOWN replay, production Runtime/Agent mutation, push, deployment, database reset, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: durable Learning evaluation feedback after reconnect

- Added an owner-scoped `GET /api/user/learning/sessions/:id/answers` read boundary backed by `LearningService.listLearningAnswers`. Unknown or foreign sessions return no answer data, and the response is ordered by durable submission time.
- Updated the existing Learning screen to reload the latest persisted coding answer and fetch its current feedback after reconnect. Pending, tentative, and disputed feedback now remain visible instead of disappearing from the page after a browser reload; no mastery or verified claim is added.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-feedback-evaluator.test.ts`, `tests/learning-feedback-dispute-api.test.ts`, `tests/user-ui-learning-feedback-evaluator-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused evaluator/API/UI checks pass `4/4`, user-product regression `149/149`, full root regression `648/648`, TypeScript/UI builds, and isolated browser E2E reports `learningRuntimeResponse: passed` and `learningFeedbackDispute: passed` after reload.
- No operational Runtime/Agent/browser restart, UNKNOWN replay, external AI request, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: durable community reactions through two UI sessions

- Extended the existing isolated two-account browser journey so account A creates a public community post, account B likes it, reloads the Community screen, and retains the liked state and count.
- Reopened the post as account A and verified the count is shared while the viewer-specific liked state remains independent. The existing `Community.tsx`/`toggleCommunityLike` implementation and public visibility boundary were preserved; no external notification was fabricated.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/pages/Community.tsx`, `user-ui/src/api/userApi.ts`, and `tests/user-ui-team-recruitment-contract.test.ts`. Focused contract checks pass `2/2`, user-product regression `150/150`, full root regression `648/648`, TypeScript/UI builds, diff validation, and isolated browser E2E reports `publicCommunityLikePersistence: passed`.
- No operational Runtime/Agent/browser restart, UNKNOWN replay, external service call, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 operational reconnect recheck

- Read-only process inspection confirms the Runtime host command is PID `1708` (`scripts/iseol-runtime-host.ts start`) and the Desktop Agent command is PID `22416` (`src/desktop-agent/main.ts`). Runtime `18890` and Agent bridge `18891` are listening on loopback; Agent `52961` is established to Runtime `18891`, and Runtime has the expected Agent-side `18890` connection.
- The durable lock still reports `pid=55000` and the same dataRoot `data/dogfood-01-20260919`, so it identifies the same Runtime data domain but not the current process owner. Its recorded codeVersion `d8654f...` also differs from the current `iseol-runtime.json` value `d983937`; this is retained as an operational reconciliation blocker, not silently repaired.
- No Runtime, Agent, browser, lock, dataRoot, UNKNOWN record, or external service was changed. No UNKNOWN request was replayed.

## 2026-09-27 continuation: owner-scoped AI team membership permissions

- Added explicit team membership metadata for human versus AI members. AI assignments now persist an agent ID, bounded assignment role, capability set, and approval scope; legacy human membership JSON is normalized to the explicit human shape without changing its access semantics.
- Added manager-only add/remove API routes and connected the approved Teams surface. Owners can assign AI permissions as suggestion-only or owner-approved-execution, while AI members do not become human social/collaboration ACL entries and no autonomous execution claim is shown.
- The isolated browser journey creates a public team, adds an AI member from account A, confirms the stored role/capabilities/scope after reload, removes the assignment, and confirms account B cannot see the owner-scoped panel.
- Evidence: `src/teams/contracts.ts`, `src/teams/store.ts`, `src/teams/service.ts`, `src/collaboration-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `scripts/iseol-user-ui-e2e.ts`, and the team/API/UI contract tests. Focused checks pass `6/6`, serial user-product regression passes `152/152`, full root regression passes `648/648`, TypeScript/root UI builds and diff validation pass, and browser E2E reports `aiTeamMemberPermissions: passed`.
- This is durable permission metadata plus isolated UI/API evidence, not live operational Runtime execution or live local-model output. No Runtime/Agent/browser restart, lock repair, UNKNOWN replay, external request, data deletion, push, deployment, or AI Broadcast Room change occurred.

## 2026-09-27 continuation: bounded AI team proposal to human-approved project work request

- Added a durable owner/project/team/AI-assignment proposal service with bounded title, objective, acceptance criteria, rationale, capability, and approval-scope validation. Requests are idempotent; when no dispatcher is configured they remain `waiting-runtime` and do not create a task or execution.
- Added authenticated proposal list/request/accept/reject routes. Only a manager of an AI or mixed team can accept or reject a proposed item; acceptance creates the existing project Work Request with an `ai-proposal:<proposalId>` idempotency key and no Run. Existing per-Run approval and Runtime execution boundaries remain intact.
- Connected the existing approved Projects surface to show truthful waiting/proposed/accepted/rejected states and an explicit human approval action. The isolated browser server alone can opt into a deterministic owner-bound dispatcher for end-to-end verification; the default server remains unconfigured.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/store.ts`, `src/ai-team/service.ts`, `src/project-model/user-project-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, and the proposal/API/UI contract tests. Focused proposal/UI checks pass `5/5`, serial user-product regression passes `156/156`, full root regression passes `648/648`, TypeScript/root UI builds and diff validation pass, and browser E2E reports `aiTeamProposalRuntimeUi: passed` alongside the existing two-account, 13-route, 390/768/1024/1440px matrix.
- This slice does not claim live local-model quality, operational Runtime ownership, autonomous execution, external AI/provider success, UNKNOWN replay, data mutation, push, deployment, or AI Broadcast Room implementation.

## 2026-09-27 continuation: shared study space with private member submissions

- Added the missing `StudySpace`, `CurriculumLink`, shared `StudyTask`, and `StudyTaskSubmission` durable domain. Study spaces belong to `study` teams; every read and write rechecks active human team membership, and only team managers can create spaces, shared curriculum links, or tasks.
- Added authenticated `/api/user/studies` routes and composed the service into the Control Plane, Runtime service graph, and isolated browser server. Curriculum metadata is shared, while the study view returns only the requesting user's `mySubmissions`; member answers are stored as unverified activity and are not projected to other users.
- Connected the existing Teams surface to create/open a study space, add shared resource links, add team tasks, submit a user's own answer, and restore it after reload. The approved card/layout system remains unchanged.
- Evidence: `src/study/contracts.ts`, `src/study/store.ts`, `src/study/service.ts`, `src/study/router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, and the study/API/UI tests. Focused study checks pass `4/4`, serial user-product regression passes `160/160`, full root regression passes `648/648`, TypeScript/root UI builds and diff validation pass, and isolated browser E2E reports `studyWorkspacePersistencePrivacy: passed` with the existing two-account, 13-route, 390/768/1024/1440px matrix.
- This slice does not expose private Learning answers, claim AI-generated teaching quality, call external services, mutate the operational Runtime/Agent, replay UNKNOWN, push, deploy, or implement the deferred AI Broadcast Room.

## 2026-09-27 continuation: user-scoped social blocking and reporting

- Added durable `SocialBlock` records with active/removed status and reporter-scoped `SocialReport` records. Block relationships are checked in both directions before exposing profiles, friends, incoming requests, or direct messages; unblocking restores the existing friendship/discovery path without deleting history.
- Added authenticated block/list/unblock and report/list routes. Reports remain private to the reporter, are not exposed to the target or other users, and are recorded as `unverified` user statements rather than growth evidence.
- Connected the approved Friends surface with report-reason input, report/block controls on search results and message headers, blocked-user explanation, and durable unblock controls. The existing user UI visual system was preserved.
- Extended the isolated two-account browser journey to report account B, block it, verify reciprocal discovery suppression and reporter-only report visibility, then unblock and verify friendship restoration. Browser reports `socialSafetyBlockReportUi: passed`.
- Evidence: `src/social/contracts.ts`, `src/social/store.ts`, `src/social/service.ts`, `src/collaboration-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Friends.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/social-safety.test.ts`, `tests/social-safety-api.test.ts`, and `tests/user-ui-social-safety-contract.test.ts`. Focused safety `4/4`, collaboration `8/8`, serial user-product `164/164`, root `648/648`, TypeScript/UI builds, and isolated browser E2E are green.
- This slice does not add moderation automation, change external providers, mutate the operational Runtime/Agent, replay UNKNOWN, push, deploy, alter approved design assets, or implement the deferred AI Broadcast Room.

## 2026-09-27 continuation: learning evidence to approval-gated project application

- Added owner-scoped `LearningProjectApplication` and `LearningLink` persistence. A proposal references the learning goal and permitted project snapshot, validates project ACL and bounded acceptance criteria/tests, rejects execution/deployment/push claims, and remains `proposed` until the user accepts it.
- Added authenticated learning project-proposal list/create/accept routes. Acceptance creates exactly one existing queued project Work Request through the owner-bound `UserProjectService`; repeated acceptance reuses the linked request and never starts a Run. Project execution and deployment remain separate approval/runtime steps.
- Injected `UserProjectService` into the composed production and isolated browser Learning service graphs. Connected the approved Learning surface with project selection, draft creation, explicit acceptance, truthful waiting copy, and reload-safe proposal state without changing the approved visual system.
- Extended the isolated two-account browser runner to create a learning goal and solo project, use the Learning UI to create and accept the application, verify the queued Work Request in the project workspace, and confirm the durable LearningLink after navigation. Browser reports `learningProjectApplicationUi: passed`.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-project-application.test.ts`, `tests/learning-project-application-api.test.ts`, and `tests/user-ui-learning-project-application-contract.test.ts`. Focused checks `4/4`, serial user-product `168/168`, root `648/648`, TypeScript/UI builds, and isolated browser E2E are green.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: evidence-separated weekly/final learning reports

- Added durable owner-scoped `LearningReport` records and authenticated list/create routes for a bounded reporting period. Reports deduplicate by goal, period, source revision, and local template version, and survive a new service instance.
- The local report compiler reads existing plan days, goal sessions, study attempts, self-report actions, and review items. Evidence-backed outcomes always carry evidence references; self-reports and unverified attempts remain separate; remaining days and review suggestions are listed explicitly. The summary states that it does not claim mastery or competence.
- Connected the approved Learning surface with start/end date controls, weekly/final report selection, `local-evidence` provenance, separate verified/unverified counts, remaining work, and review suggestions. The isolated browser journey generates both report kinds, reloads the report, and verifies that no verified outcome is invented. The browser assertion now waits for the final durable record instead of reusing a stale success notice.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-report.test.ts`, `tests/learning-report-api.test.ts`, and `tests/user-ui-learning-report-contract.test.ts`. Focused checks `3/3`, serial user-product `171/171`, root `648/648`, TypeScript/UI builds, and isolated browser E2E are green.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: deterministic weekly/final report browser verification

- Added the approved Learning UI's `보고 유형` selector for `주간 보고` and `최종 보고`, passing the selected kind through the existing authenticated report API without changing the report evidence boundary.
- Fixed a browser-test race where the second report request could be read before its durable record existed because the first request's success notice was still visible. The isolated runner now polls only for the expected final report record with a bounded timeout.
- Fresh focused report/API/UI checks `3/3`, root/UI builds, and two consecutive complete isolated browser runs passed; both runs report `learningReportUi: passed`, with two accounts and responsive routes `[390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: user-controlled private memory access for personal AI

- Added `aiAccess.memory` to the durable per-user settings contract with a backward-compatible default-on migration for existing settings records. The memory records themselves remain owner-scoped and `visibility: private`.
- The personal AI context compiler now reads private memories only when that user permission is enabled. Disabling it removes both prior memory and newly captured `ai-chat-context` records from the Runtime dispatch context; it does not delete durable memory or broaden sharing to teams/other users.
- Connected the approved Settings → AI 설정 surface with the `개인 기억 참조` switch. The isolated two-account browser journey verifies account A's off state survives reload while account B keeps its independent default-on state.
- Evidence: `src/settings/contracts.ts`, `src/settings/service.ts`, `src/ai-chat/service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/settings-isolation.test.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/user-ui-settings-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused checks `10/10`, product regression `173/173`, root regression `648/648`, TypeScript/UI builds, diff validation, and browser E2E are green.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

### Settings read failure boundary

- Added a regression guard so an explicitly configured settings service fails closed: if the user's AI-access settings cannot be read, the personal AI dispatch receives no private-memory context. The legacy path with no settings service remains compatible for existing callers.
- Focused AI/settings/UI checks remain `10/10`; product regression is `173/173`; root regression is `648/648`; root/UI builds and the isolated browser matrix remain green.

## 2026-09-27 continuation: team departure and ACL revocation

- Integrated the existing owner-bound `POST /api/user/teams/:teamId/leave` route into the approved Teams surface. Members/admins receive a two-step inline confirmation; owners have no self-removal action and remain on the team-management path.
- The team list now distinguishes the authenticated user's memberships from publicly visible teams. After departure, the member list refreshes and the durable membership status removes private team-project access through the existing ACL boundary.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-team-recruitment-contract.test.ts`, and the existing `src/teams/service.ts` / `src/collaboration-router.ts` leave implementation. Focused UI `4/4`, product `174/174`, root `648/648`, TypeScript/UI builds, diff validation, and the isolated two-account browser matrix are green; `teamLeaveAccessRevocation: passed`.
- The browser check confirms member B loses the private project in both `/api/user/projects` and `/app/projects`, while owner A retains it. No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: membership-scoped team chat

- Added a durable team-chat domain under `src/team-chat`. Messages are stored by team, attributed to the authenticated human sender, ordered by durable timestamp/ID, and recorded as user activity without exposing private-memory or AI-member context.
- Added authenticated `GET/POST /api/user/teams/:teamId/messages` routes. The service requires an active human membership on every read/write; a public team does not make its chat public, AI memberships are not chat principals, and a departed member receives a bounded access failure while existing history remains for active members.
- Connected the approved Teams surface with a team selector, durable message list, send action, loading/error/status states, and reload restoration. No new visual system or placeholder data was introduced.
- Evidence: `src/team-chat/contracts.ts`, `src/team-chat/store.ts`, `src/team-chat/service.ts`, `src/collaboration-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `tests/team-chat.test.ts`, `tests/team-chat-api.test.ts`, `tests/user-ui-team-chat-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused collaboration `11/11`, product regression `178/178`, root regression `648/648`, TypeScript/UI builds, diff validation, and browser `teamChatMembership: passed` are green.
- The full isolated matrix still uses two accounts and responsive routes `[390, 768, 1024, 1440]`. Operational Runtime/Agent state, stale lock metadata, UNKNOWN records, external notification delivery, external providers, data deletion, push, deployment, and AI Broadcast Room scope were untouched.

## 2026-09-27 continuation: bounded AI team technical discussion

- Added a durable `AiTeamDiscussion` domain under `src/ai-team`. Each record keeps the project/team/AI assignment, question, bounded answer sections, capability, approval scope, source, and Runtime status; request IDs are idempotent and conflicting reuse is rejected.
- Active human project-team membership is checked on every read/request, and the selected AI member must have `discussion.propose`. Without a dispatcher the request remains `waiting-runtime`; a local dispatcher result is validated before it is persisted as `completed`.
- Added authenticated project routes and composed the service through the normal and isolated Control Plane graphs. Technical discussion is separate from proposal acceptance and creates no Work Request, Run, growth evidence, or autonomous execution.
- Connected the approved Projects UI with question input, agent selection, Runtime waiting/answer states, key points, alternatives, risks, and reload restoration. The isolated browser server opts into a deterministic dispatcher only for this temporary verification path.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/discussion-store.ts`, `src/ai-team/discussion-service.ts`, `src/project-model/user-project-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/ai-team-discussion.test.ts`, `tests/ai-team-discussion-api.test.ts`, `tests/user-ui-ai-team-discussion-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `4/4`, serial product `182/182`, TypeScript/UI builds, and browser `aiTeamDiscussionRuntimeUi: passed` are green; the browser result still includes two isolated accounts and responsive routes `[390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Project Task → Run binding

- Work Request creation now materializes an idempotent `ProjectTreeNode(kind:"task")` with `nodeId=task-<workRequestId>` under the owning project. Preparing a Run for that Work Request attaches the Run/history to the task node; legacy callers without a task node retain the project-root fallback.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `src/project-model/contracts.ts`, `src/project-model/store.ts`, `tests/user-project-service.test.ts`, `tests/user-project-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `21/21`, product `182/182`, root `648/648`, TypeScript/UI builds, and browser `projectRuntimeExecutionUi: passed` are green.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: team-document permission in private AI context

- Connected the existing Settings → AI 설정 `팀 공유 문서 접근` permission to the private AI Runtime context. Active human members may contribute only StudySpace descriptions, curriculum-link labels, and study-task instructions from accessible study spaces; personal submissions/answers, private memory, and unrelated team data are excluded.
- The context compiler fails closed when the optional study/team context cannot be read. Disabling the permission removes team-document context without deleting durable study data, and outsiders receive no team-document context through the membership boundary.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-local-runtime.test.ts`, `tests/user-ui-settings-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `14/14`, product `183/183`, root `648/648`, TypeScript/UI builds, diff validation, and the isolated two-account browser matrix are green; the settings permission persistence journey passed across responsive routes `[390, 768, 1024, 1440]`.
- Operational Runtime/Agent state, stale lock metadata, UNKNOWN records, external providers/notifications, data deletion, push, deployment, design assets, and AI Broadcast Room scope remain unchanged.

## 2026-09-27 continuation: isolated local coding syntax receipt

- Added an optional owner-bound `CodingAttemptVerifier` boundary. The normal learning service remains `environment-required`; only an explicitly injected verifier may persist a bounded `syntax-verified` or `syntax-invalid` practice receipt on the same attempt.
- Added `src/learning/local-coding-verifier.ts`, which writes JavaScript to a temporary root and invokes `node --check` with `shell:false`, a capped timeout, minimal environment, bounded diagnostics, stable `coding-syntax:<attemptId>` artifact reference, and cleanup. Unsupported languages and timeout/spawn failures remain waiting. Submitted program behavior is never executed.
- Connected the verifier only to the isolated browser server and updated the approved Learning screen to restore and display `구문 확인됨`, `구문 오류`, or `환경 필요` without claiming test pass, correctness, mastery, XP, or growth evidence.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/local-coding-verifier.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-coding-test.test.ts`, `tests/learning-coding-test-api.test.ts`, `tests/learning-local-coding-verifier.test.ts`, and `tests/user-ui-coding-test-contract.test.ts`. Focused checks `7/7`, product `185/185`, root `648/648`, TypeScript/UI builds, diff validation, and browser `learningLocalSyntaxVerifierUi: passed` are green with two accounts and responsive routes `[390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Runtime-composed local coding syntax receipt

- Connected the existing bounded `createLocalCodingSyntaxVerifier()` to the default `startIseolRuntimeServices` learning graph, so the normal local service can persist JavaScript `syntax-verified`/`syntax-invalid` receipts without requiring an external AI provider.
- Added a Runtime-composition regression that creates an owner-scoped coding exercise and attempt in a temporary root and verifies the durable `syntax-only` receipt. The verifier remains syntax-only: it never executes submitted program behavior or claims correctness, test pass, mastery, XP, or growth.
- Focused integration/coding checks pass `40/40`; TypeScript/UI builds pass, product regression passes `185/185`, root regression passes `649/649`, and the two-account responsive browser journey reports `learningLocalSyntaxVerifierUi: passed`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external request, data deletion, push, deployment, design asset change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Project Run evidence reaches growth and portfolio

- Extended the composed Runtime project integration test to assert the owner-scoped `project.run.completed` ActivityEvent, development growth XP and `project-run` achievement, verified ActivityEvent/project evidence in the Portfolio snapshot, and a durable Portfolio entry containing both evidence sources.
- Extended the isolated approved browser journey through project Run completion, Task→Run linkage, ActivityEvent idempotency, development growth projection, Portfolio UI evidence selection/save/reload, and a second-account isolation check for project, activity, growth, and portfolio evidence.
- Evidence: `tests/user-project-runtime-integration.test.ts`, `scripts/iseol-user-ui-e2e.ts`, `src/project-model/user-project-service.ts`, `src/activity/service.ts`, `src/growth/read-model.ts`, `src/portfolio/service.ts`, and `user-ui/src/pages/PortfolioScreen.tsx`. Focused Runtime/project checks pass `3/3`, product regression `185/185`, root regression `649/649`, TypeScript/UI builds, `git diff --check`, and isolated browser E2E reports `projectRuntimeGrowthPortfolioUi: passed` with responsive routes `[390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: growth achievement notifications

- Implemented Task59 at the existing GrowthService new-achievement boundary. Verified activity projections now create one durable owner-scoped `achievement` notification per newly unlocked achievement after the ledger entry is saved; source IDs are achievement-bound and duplicate application is idempotent, while `settings.notifications.achieve` suppresses later records and settings read failures fail closed.
- The notification payload is bounded to achievement/evidence identifiers and title/body, and the approved shell marks it read and routes to My World. Fixed the isolated browser server's initialization order so GrowthService is available before UserProjectService, and hardened the browser assertion to observe the asynchronous durable read transition.
- Evidence: `src/growth/contracts.ts`, `src/growth/read-model.ts`, `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/growth-achievements.test.ts`, `tests/user-notifications.test.ts`, `tests/user-ui-notifications-contract.test.ts`, and `tests/iseol-runtime-services.test.ts`.
- Verification: focused checks `41/41`, user-product `197/197`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated browser `achievementNotifications: passed` with team-invite/direct-message/AI-completion notification journeys, two-account isolation, and responsive `[390,768,1024,1440]`. Weekly digest/live push, operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN replay, external providers, and AI Broadcast Room remain unverified/deferred or untouched.

2026-09-27 user-notifications note: implemented Task55 as the next local product slice. Added `src/notifications/` durable records under the platform root, authenticated owner-scoped list/read routes, and Runtime composition. Team chat now creates one notification per other active human member only when that recipient's persisted `settings.notifications.newMessage` is enabled; the sender, AI members, departed users, and outsiders are excluded. The notification source is bound to the durable team message, duplicate source delivery returns the existing record, and read state is idempotent and reload-safe. The approved user shell now reads the real notification API in `user-ui/src/components/Navigation.tsx`, shows an unread badge/panel, marks records read, and returns to Teams without introducing a replacement dashboard or reusing Control Plane SSE. The isolated browser server uses the same service composition, and the two-account flow verifies sender exclusion, recipient visibility, read persistence, and reload behavior. Evidence: `src/notifications/contracts.ts`, `src/notifications/store.ts`, `src/notifications/service.ts`, `src/notifications/router.ts`, `src/team-chat/contracts.ts`, `src/team-chat/service.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-api.test.ts`, and `tests/user-ui-notifications-contract.test.ts`. Verification: focused `37/37`, collaboration `14/14`, user-product `193/193`, root `654/654`, TypeScript/UI builds, `git diff --check`, and browser `teamMessageNotifications: passed` with two accounts and responsive viewports `[390,768,1024,1440]`. Direct-message and AI-completion notification producers, live push/SSE delivery, operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN replay, external providers, and AI Broadcast Room remain unverified/deferred or untouched.
2026-09-27 ai-completion-notifications note: connected the existing owner-scoped notification service to the durable private AI Chat completion boundary. The service emits one `ai-completion` notification only after an assistant response is persisted, suppresses it when the owner disables `settings.notifications.aiDone`, omits private content, and keeps repeated completion idempotent. The user shell routes the notification back to AI Chat and preserves read/conversation state after reload. Focused AI/notification/API/runtime/UI checks `49/49`, user-product `195/195`, root `656/656`, TypeScript/UI builds, and the isolated browser matrix report `privateAiChatRuntimeResponse: passed` and `aiDoneNotifications: passed`, alongside direct/team notification journeys and responsive `[390,768,1024,1440]`. Team-invite/achievement/weekly producers and live push remain open; operational Runtime/Agent, stale lock, UNKNOWN records, external providers, and AI Broadcast Room remain untouched/deferred.
2026-09-27 team-invite-notifications note: connected the existing owner-scoped notification service to manager-approved recruitment acceptance. After active membership and accepted application state are durable, the joining user receives one `team-invite` record when `settings.notifications.teamInvite` is enabled; different applications remain distinct, muted users receive none, and the existing shell routes the notification to Teams without clearing other unread records. Focused recruitment/notification/runtime/UI checks `40/40`, user-product `196/196`, root `657/657`, TypeScript/UI builds, and the isolated browser matrix report `teamInviteNotifications: passed`, with AI-completion/direct/team-message notification journeys and responsive `[390,768,1024,1440]` also green. Achievement/weekly producers and live push remain open; operational Runtime/Agent, stale lock, UNKNOWN records, external providers, and AI Broadcast Room remain untouched/deferred.

## 2026-09-27 continuation: operator Control Plane Project Run recovery

- Added an operator-only `POST /api/projects/:projectId/work-requests/:workId/retry` route. It requires the configured operator token, binds the Work Request revision and exact durable Run identity, and reuses the existing same-Run Harness retry record; the regular Web token is rejected.
- Composed the route with the local Project Runtime capability and connected the Control Plane UI to a separately stored operator token, explicit confirmation, and `Retry Run` action for failed requests. No new Run, automatic retry, or success claim is created by the UI.
- Evidence: `src/web-control-plane/router.ts`, `src/runtime/iseol-runtime-services.ts`, `web/index.html`, `web/app.js`, `web/styles.css`, `tests/web-control-plane-router.test.ts`, `tests/web-control-plane-static.test.ts`, and `tests/read-model-browser.test.ts`. Focused checks pass `49/49`; the isolated Control Plane Chrome checks pass `2/2`; TypeScript and user UI builds pass; product regression passes `189/189`; root regression passes `651/651`; `git diff --check` passes; and the complete two-account responsive browser matrix remains green with `responsiveViewports: [390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external provider call, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: Project Run terminal failure recovery

- Added owner-scoped `POST /api/user/projects/:id/runs/retry` backed by the existing Harness explicit same-Run retry record. The Project UI now exposes an approval checkpoint for failed durable Runs and reuses the same Run ID.
- Reconciliation now preserves the Harness failure reason on the Work Request, so the failure remains actionable after reload. The isolated fail-once Runtime journey verifies no completion ActivityEvent or development growth before retry, then retry → completion → one verified ActivityEvent → development growth.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `src/project-model/work-request.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/project-work-request.test.ts`, `tests/user-project-execution.test.ts`, and `tests/user-ui-project-resume-contract.test.ts`. Focused checks `13/13`, product `189/189`, root `650/650`, TypeScript/UI builds, `git diff --check`, and browser `projectRuntimeFailureRecoveryUi: passed` are green. A reconciliation regression test also confirms an explicit failed-Run retry can reproject the same durable Run to completion while late completed→failed observations remain protected.
- No operational Runtime/Agent restart or request, stale-lock repair, UNKNOWN replay, external provider call, data deletion, push, deployment, design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Learning application reaches Project Runtime

- Added a second isolated browser journey that creates a learning goal and project, uses the approved Learning UI to create and accept the project application, confirms the single queued Work Request and durable application link, then runs that exact Work Request from the Project UI through the temporary deterministic Runtime.
- The journey verifies terminal project completion, service-owned verified activity, development growth/`project-run`, and Portfolio activity evidence. Existing direct project execution and two-account evidence journeys remain intact.
- Fixed a real UI boundary found by the journey: `Learning.tsx` previously rendered the shared action notice only inside the Learning session card, so application success was invisible when no session existed. The notice now renders once in a global `role=status` region.
- Evidence: `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/project-model/user-project-service.ts`, and `src/portfolio/service.ts`. Product regression `185/185`, root regression `649/649`, TypeScript/UI builds, `git diff --check`, and isolated browser E2E report `learningProjectRuntimeIntegrationUi: passed` plus `projectRuntimeGrowthPortfolioUi: passed` with two accounts and responsive routes `[390, 768, 1024, 1440]`.
- No operational Runtime/Agent/browser restart, stale lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: authenticated user notification SSE refresh

- Implemented the separate authenticated `/api/user/notifications/stream` channel. Durable notification creation/read transitions now publish bounded owner-scoped refresh signals only after persistence; the stream includes no title, body, prompt, response, or other private notification content and cannot deliver another user's events.
- Connected the existing approved notification bell to re-fetch the owner-scoped REST snapshot on a live signal. The client now retries a disconnected stream with bounded backoff and refreshes the REST snapshot after reconnection. REST remains the canonical source after disconnect/reload/restart; the implementation does not claim a durable replay buffer and does not reuse operator Control Plane SSE.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-notifications-stream.test.ts`, `tests/user-ui-notifications-contract.test.ts`, and `package.json`.
- Verification: focused stream/API/UI checks `9/9`, user-product `197/197`, root `657/657`, TypeScript and user-UI builds, `git diff --check`, and isolated browser `liveUserNotificationStream: passed` with achievement/team-invite/direct-message/AI-completion journeys, two-account isolation, and responsive `[390,768,1024,1440]`. Weekly digest remains unspecified; operational Runtime/Agent, stale lock, UNKNOWN records, external providers, and AI Broadcast Room were untouched.

## 2026-09-27 continuation: user-scoped Project History in Workspace

- Added the existing durable project `history.jsonl` read model to `UserProjectView` behind the existing owner/team project ACL. The new user Project Workspace panel renders bounded stored event fields (`type`, time, summary, source/action, Run, and reference) and an honest empty state; it does not fabricate external integration or deployment status.
- Added focused coverage for durable history persistence/isolation and the approved Project Workspace contract. The browser journey now verifies the actual isolated Runtime `run-attached` event after project execution and reload, alongside the existing lifecycle, growth, portfolio, failure-recovery, and two-account checks.
- Evidence: `src/project-model/history-store.ts`, `src/project-model/user-project-service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/UI checks `13/13`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated browser `projectHistoryUi: passed` with responsive `[390,768,1024,1440]` are green.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: truthful Idea Lab Runtime capability states

- RED → GREEN: added `tests/user-ui-idea-lab-contract.test.ts` first, then implemented `user-ui/src/domain/ideaLabState.ts` and connected the existing `user-ui/src/pages/IdeaLab.tsx` to authenticated `/api/user/runtime-status`.
- Idea Lab now distinguishes project execution readiness from Personal AI candidate-generation readiness and renders explicit ready, unavailable, or status-checking copy. The existing approval gate remains in place; no fake project build, AI answer, or execution result was introduced.
- Browser coverage now checks both the default no-Runtime account and the deterministic project Runtime path. Final isolated E2E reports `ideaLabRuntimeStatus: passed` and retains the existing lifecycle, growth, portfolio, collaboration, notification, learning, failure/recovery, and two-account checks with responsive `[390,768,1024,1440]` across 13 routes.
- Verification: Idea Lab focused checks `3/3`, combined World/activity checks `6/6`, user-product `202/202`, root `657/657`, TypeScript/UI builds, root build, `git diff --check`, and final browser E2E all passed.
- Read-only operational recheck kept Runtime PID `1708`, Desktop Agent PID `22416`, and dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919` unchanged and alive. No Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: truthful Personal AI state in My World

- RED → GREEN: extended the existing My World UI contract before implementation, then connected `user-ui/src/pages/MyWorld.tsx` to the authenticated `/api/user/runtime-status.aiChat` capability.
- The character area now shows `개인 AI 준비됨`, `개인 AI 연결 대기`, or `개인 AI 상태 확인 중` instead of a static message that could imply live AI availability. The approved world layout and character visual remain unchanged; the copy is only a capability indicator.
- Browser coverage verifies the no-Runtime account path through `truthfulWorldAndIntegrationStates: passed` and `worldIsolation: passed`, alongside all existing product journeys and responsive `[390,768,1024,1440]` across 13 routes.
- Verification: focused My World contract `1/1`, user-product `202/202`, UI build, root build/regression evidence, `git diff --check`, and final browser E2E passed.
- No operational Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: visible Task to Run traceability in Project Workspace

- RED → GREEN: extended `tests/user-ui-project-lifecycle-contract.test.ts` first, confirmed the missing traceability labels failed, then added a read-only metadata row to the existing Work Request card in `user-ui/src/pages/Projects.tsx`.
- The card now displays the durable request ID, attempt count, creation date, and Run ID after assignment. It does not create a new state, change approval semantics, or claim execution success; existing lifecycle/history/evidence projections remain the source of truth.
- Browser coverage asserts `요청 ID` and `시도 0회` before execution and `Run ID` after the deterministic Runtime completes. The final E2E retains project completion, history, failure recovery, growth/portfolio, two-account isolation, and responsive `[390,768,1024,1440]` across 13 routes.
- Verification: focused project integration checks `16/16`, user-product `202/202`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and final browser E2E all passed.
- No operational Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: evidence-backed My World mission details

- Extended `user-ui/src/domain/worldState.ts` and the approved My World mission list to show evidence count and latest recorded time from the already loaded owner-scoped ActivityEvent feed. The mapping is explicit: project Run completion, learning session completion, and learning review completion.
- The implementation accepts only `verified` records and valid timestamps. It keeps the existing record/next-action state and deliberately does not add completion badges, XP, fabricated progress, or another storage path.
- Verification: focused world/activity contracts `5/5`, user-product `199/199`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated two-account browser E2E with all existing journeys and responsive `[390,768,1024,1440]` passed.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, and configured dataRoot were rechecked read-only. No Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: truthful Personal AI status in common navigation

- Reused the authenticated `getRuntimeStatus()` boundary in `user-ui/src/components/Navigation.tsx` so the common AI navigation indicator reflects the actual owner-bound `aiChat` capability. The shell now distinguishes `AI Runtime 준비`, `AI Runtime 연결 대기`, and `AI Runtime 상태 확인 중` instead of presenting a permanent waiting dot.
- Added the focused UI contract and isolated browser assertion for the default unavailable state. The approved navigation structure and external integration boundaries remain unchanged.
- Verification: focused UI checks `3/3`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated browser E2E with runtime status, Personal AI, notification, project, learning, collaboration, and responsive `[390,768,1024,1440]` journeys all passed.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, and the configured dataRoot were rechecked as read-only state.

## 2026-09-27 continuation: separate AI Chat capability from project Runtime readiness

- Corrected the Runtime status contract so `/api/user/runtime-status` exposes `aiChat: ready|unavailable` independently from the broader project-execution `state`. A ready project executor no longer makes the Personal AI screen claim that a local AI dispatcher/model is connected.
- Wired the composed Runtime service and isolated UI server to derive the AI capability from the actual owner-bound `aiChatRuntimeDispatcher`, and changed `user-ui/src/pages/AIChat.tsx` to use that explicit capability while preserving durable conversations and honest waiting states.
- Evidence: `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/user-runtime-status-api.test.ts`, and `tests/user-ui-ai-chat-contract.test.ts`. Focused checks pass `3/3`, user-product `198/198`, root `657/657`, TypeScript/UI builds, and browser E2E reports `runtimeStatusSurface: passed` and `privateAiChatRuntimeResponse: passed` across the existing two-account responsive matrix.
- Final read-only checks confirmed operational Runtime PID `1708` and Desktop Agent PID `22416` remain alive with dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919`. No Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: Settings capability split and notification E2E race hardening

- Extended the existing Settings · `연동 환경` screen with a separate `개인 AI Runtime` row backed by `/api/user/runtime-status.aiChat`; the existing `Runtime 실행 환경` row continues to represent project execution. This prevents a ready project executor from being presented as a ready Personal AI answer generator.
- Added the UI contract for ready/unavailable AI capability labels and browser coverage for the default isolated unavailable state. The existing external integration rows remain unavailable/coming-soon without invented connection controls.
- The browser runner now waits for the actual `/app/world` navigation after an achievement notification read click before asserting durable read state. This fixes a test synchronization race without changing notification or read-transition behavior.
- Evidence: `user-ui/src/pages/Settings.tsx`, `tests/user-ui-integrations-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused checks `2/2`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and browser E2E pass with the full two-account responsive matrix.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: truthful Run status in Project list and reconnect verification

- RED → GREEN: extended `tests/user-ui-project-lifecycle-contract.test.ts` first to require a `ProjectListItem` Runtime projection, `getUserProject(project.id)`, the Runtime-derived badge, and honest not-started/completed summaries. The contract failed before implementation, then passed after the UI change.
- `user-ui/src/pages/Projects.tsx` now hydrates the existing visible project list with owner/team-authorized `getUserProject()` views, maps `runtime.status` through the existing `runtimeStatus` helper, and shows bounded Run summaries. Per-project read errors stay `unknown`; no project status or execution record was changed.
- Browser coverage now completes a deterministic isolated Runtime Run, returns to `/app/projects`, verifies the actual `status-success` badge and `Run 완료 · <Run ID>` summary, reloads the list, and verifies the same durable state again. The diagnostic pass confirmed both list/detail APIs returned `runtime.status: completed`; the final locator targets the existing status class because the generic 안내문 also contains the word `성공`.
- Verification: focused project/UI checks `17/17`, user-product `203/203`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and full isolated browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across 13 routes.
- Read-only operational recheck kept Runtime PID `1708`, Desktop Agent PID `22416`, and dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919` alive and unchanged. No Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: My World recent project reflects durable Run state

- RED → GREEN: extended `tests/user-ui-my-world-contract.test.ts` before production changes to require the authenticated project detail read, current-project view state, Runtime summary, honest failure copy, and removal of the static `active` badge claim. The contract failed for the missing `getUserProject` boundary, then passed after implementation.
- `user-ui/src/pages/MyWorld.tsx` now loads the first visible project’s existing owner/team-authorized `UserProjectView` and maps its Runtime state to the existing `StatusBadge`. The card reports not-started/running/waiting/failed/completed/unknown states and keeps detail-read failures as explicit unknown.
- Browser coverage now verifies the deterministic completed project Run on `/app/world`, then reloads My World and verifies the same `status-success`/`Run 완료` projection while retaining recent ActivityEvent and mission evidence checks.
- Verification: focused project/world checks `17/17`, user-product `203/203`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and full isolated browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across 13 routes.
- Read-only operational recheck kept Runtime PID `1708`, Desktop Agent PID `22416`, and dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919` alive and unchanged. Ollama is installed but not running/listening; no model generation, external AI request, Runtime/Agent restart, stale-lock repair, UNKNOWN replay, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 read-only recheck: local AI Runtime capability boundary

- Re-ran `tests/ai-chat-local-runtime.test.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-api.test.ts`, and `tests/user-runtime-status-api.test.ts`: `17/17` passed. The evidence covers loopback enforcement, bounded private-memory/learning/project/activity/team context, independent user permissions, owner isolation, durable waiting/callback behavior, and safe capability projection.
- Host inspection found Ollama installed at `C:\Users\user\AppData\Local\Programs\Ollama\ollama.exe`, with `processCount=0` and `listenCount=0` for port `11434`. No generation, model pull, installation, start/restart, external AI call, or operational Runtime/Agent mutation was attempted.
- The live-model boundary remains explicitly waiting/unavailable and was not reclassified as complete. Existing UNKNOWN records, stale PID `55000`, external connectors, and deferred AI Broadcast Room remain preserved.

## 2026-09-27 continuation: recent authenticated activity in My World

- Connected the existing authenticated `/api/user/activity` read model to the approved My World home surface. The page now displays up to five newest durable ActivityEvents with `eventType`, source identity, actor attribution, and verified/unverified/unknown state, plus an honest empty state and a link to the existing full Activity timeline.
- Added a typed `UserActivityEvent` boundary and `listActivityEvents()` client function. The feature does not add a new activity store, accept client-submitted verified evidence, or infer XP/mastery/completion from a record.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-my-world-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and browser `project.run.completed` owner/reload visibility plus second-account empty-state isolation pass with responsive `[390,768,1024,1440]`.
- The first browser attempt exposed a test-route defect (`/app` is not the My World route); the E2E now uses the authoritative `/app/world` route. No production workaround or operational Runtime/Agent change was made. UNKNOWN records, external providers, deployment, push, and AI Broadcast Room remain untouched/deferred.

## 2026-09-27 continuation: complete authenticated Activity timeline ledger

- Extended the existing Activity timeline at `/app/activity` to load the typed owner-scoped `/api/user/activity` ledger alongside the existing Growth and Portfolio evidence snapshots. The new `전체 활동 원장` section shows raw `eventType`, source identity, actor attribution, active/retracted state, and verified/unverified/unknown status with honest loading and empty states.
- Added browser coverage for owner visibility after project Run completion and reload, plus second-account empty-state isolation. The existing verified evidence and growth projections remain unchanged and are not inferred from the raw ledger.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/user-ui-activity-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated browser `activityTimelineUi: passed` with responsive `[390,768,1024,1440]`.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: truthful current Runtime status in Personal AI

- Fixed the Personal AI status surface so `user-ui/src/pages/AIChat.tsx` reads the authenticated `/api/user/runtime-status` capability snapshot. Historical persisted assistant messages no longer make the screen claim `Runtime 연결됨`; only a current `state: ready` capability does. Disabled/unavailable states retain the waiting boundary.
- Kept conversation persistence, owner isolation, private context permission checks, and deterministic local response handling unchanged. No model installation or external AI request was made.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/user-ui-ai-chat-contract.test.ts`, `tests/user-runtime-status-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused AI UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and browser `runtimeStatusSurface: passed`/`privateAiChatRuntimeResponse: passed` with responsive `[390,768,1024,1440]`.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: owner-scoped evidence provenance navigation

- RED → GREEN: added contract assertions for the `PortfolioEvidence.projectId` boundary, owner-only source links, stable Activity event anchors, and browser coverage for both provenance labels before production changes. The focused contracts failed before implementation and passed after the change.
- `src/portfolio/service.ts` now attaches the authenticated project ID to project-derived evidence. `getPublicEntry()` removes that internal field before returning public evidence, preserving the existing public/private portfolio boundary. `user-ui/src/pages/PortfolioScreen.tsx` now links project evidence to `/projects/:id`, activity evidence to `/activity?event=:id`, and highlights/scrolls to the selected ActivityEvent.
- Browser coverage completed the deterministic project Run, followed Activity → Project, created a public portfolio from activity/project evidence, followed Portfolio preview → Activity and Portfolio preview → Project, and preserved the existing reload, two-account isolation, and responsive 13-route matrix. The full run reported `projectRuntimeExecutionUi: passed`, `activityTimelineUi: passed`, `projectRuntimeGrowthPortfolioUi: passed`, and all existing journeys passed.
- Verification: focused provenance contracts passed, user-product `205/205`, root `657/657`, `npm.cmd run user-ui:build`, `npm.cmd run build`, `git diff --check`, and `npm.cmd run test:iseol-browser-e2e` all passed. The browser result preserved two-account isolation and responsive `[390,768,1024,1440]` across 13 routes.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: My World recent activity deep link

- RED → GREEN: extended `tests/user-ui-my-world-contract.test.ts` to require an event-specific Activity route and label before changing the page. The contract failed until the owner-scoped link was added.
- `user-ui/src/pages/MyWorld.tsx` now renders `활동 상세 보기 →` for each visible recent ActivityEvent using `/activity?event=${encodeURIComponent(event.id)}`. The Activity screen already provides the stable event anchor and focused scroll/highlight, so no new persistence or completion semantics were introduced.
- Browser coverage now clicks the recent My World activity link, verifies the `/app/activity?event=...` route and the exact `project.run.completed` event, then returns to My World. The full isolated E2E still passes with two-account isolation and responsive `[390,768,1024,1440]` across 13 routes.
- Verification: focused My World contract, user-product regression `205/205`, `npm.cmd run user-ui:build`, and the full isolated browser E2E passed.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: social discovery to public profile navigation

- RED → GREEN: extended `tests/user-ui-friends-contract.test.ts` to require encoded owner-scoped profile links for searchable and selected users. The new contract failed before implementation and passed after the links were added.
- `user-ui/src/pages/Friends.tsx` now links search results and the active direct-message header to the existing read-only `/profile?userId=...` surface. Friend requests, messaging, block/report actions, and profile privacy semantics remain unchanged.
- Browser coverage now verifies account A searches for account B, opens B's public profile, returns to Friends, and sends the friend request; the existing two-account messaging, notification, block/report, reload, and responsive journeys remain green.
- Verification: focused Friends contract `2/2`, user-product regression `206/206`, root regression `657/657`, `npm.cmd run user-ui:build`, `git diff --check`, and `npm.cmd run test:iseol-browser-e2e` passed. Browser output reported `isolatedAccounts: "2"`, all existing journeys passed, and responsive `[390,768,1024,1440]` across 13 routes.
- No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: community author to public profile navigation

- RED → GREEN: added `tests/user-ui-community-contract.test.ts` and included it in the serial user-product command. The contract required the existing community author record to resolve to an encoded public profile link and failed before implementation.
- `user-ui/src/pages/Community.tsx` now renders each post author as a link to `/profile?userId=${encodeURIComponent(post.author.userId)}`. This reuses the existing public profile API and does not alter post visibility, like state, or private profile handling.
- Browser coverage verifies account B opens account A's author profile from the public community post, returns to the community, and then completes the existing like/reload journey. The two-account and responsive matrix remains green.
- Verification: focused Community/Friends contracts `3/3`, user-product regression `207/207`, root regression `657/657`, `npm.cmd run user-ui:build`, `npm.cmd run build`, `git diff --check`, and `npm.cmd run test:iseol-browser-e2e` passed. Browser output reported `isolatedAccounts: "2"`, all existing journeys passed, and responsive `[390,768,1024,1440]` across 13 routes.
- Operational recheck: Runtime PID `1708` and Desktop Agent PID `22416` remained alive; Ollama remained stopped with no listener on `11434`. No operational process, stale lock, UNKNOWN record, external provider, deployment, or AI Broadcast Room state was changed.

## 2026-09-27 continuation: public-profile privacy projections

- RED → GREEN: added `tests/social-public-profile-privacy.test.ts` with real platform, settings, Growth, User Project, Learning, and Social services. It failed before the projection existed, then passed after enabling all three privacy flags, checking bounded fields, disabling all three, and preserving private-profile behavior.
- `src/social/service.ts` now reads the target user's persisted privacy settings through a system-scoped read and conditionally projects bounded `publicGrowth`, `publicProjects`, and `publicLearning` fields. Internal IDs, workspace roots, raw learning answers, and growth evidence IDs are not copied. Missing settings or source services fail closed. The composed Runtime and isolated browser server now inject the same service instances into Social.
- `user-ui/src/pages/Profile.tsx` renders optional Growth / 공개 프로젝트 / 학습 기록 sections using the existing profile card language. Hidden settings remove both the API fields and visible sections; profile visibility, block ACL, and read-only viewing remain unchanged.
- Browser coverage now performs the full two-account flow: account A enables 학습 기록 공개, creates durable project/learning records, account B reads all enabled summaries, then account A disables all three and account B confirms the summaries disappear after reload and from the API. The final result reported `publicProfilePrivacy: passed`, `isolatedAccounts: "2"`, and responsive `[390,768,1024,1440]` across 13 routes.
- Verification: focused service/profile checks `2/2`, user-product `208/208`, root TypeScript build, approved UI build, and full isolated browser E2E passed. No operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider request, data deletion, push, deployment, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: public profile to public portfolio navigation

- RED → GREEN: added `tests/social-public-profile-portfolio.test.ts` first. The initial service assertion failed because public profiles had no portfolio projection; the follow-up no-settings test also failed until portfolio ACL projection was made independent of optional privacy-summary services.
- `src/portfolio/contracts.ts` and `src/portfolio/service.ts` now expose an owner-validated `listPublicEntries()` projection that includes only `visibility: public` entries in deterministic order. `src/social/service.ts` maps only `id`, `title`, `summary`, and `updatedAt`; evidence IDs, owner IDs, project IDs, unlisted entries, and private entries remain excluded. `src/runtime/iseol-runtime-services.ts` and `scripts/iseol-user-ui-isolated-server.ts` inject the same durable Portfolio service into Social.
- `user-ui/src/api/userApi.ts` and `user-ui/src/pages/Profile.tsx` render the approved profile card section and link entries to the existing public portfolio route. The browser journey verifies account B reads account A's public profile, sees the public entry, and reaches `/app/portfolio/public/:id`; it also checks the API projection contains no internal provenance fields.
- Verification: focused service/profile checks `3/3`, `npm.cmd run build`, `npm.cmd run user-ui:build`, user-product `210/210`, root `657/657`, and full isolated browser E2E all passed. Browser output reported `publicProfilePortfolio: passed`, `isolatedAccounts: "2"`, and responsive `[390, 768, 1024, 1440]` across 13 routes. The first browser attempt failed only on an exact accessible-name test locator; after correcting the locator, the full E2E passed.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, and stale lock PID `55000` were not mutated. No Runtime/Agent/browser restart, UNKNOWN replay, Ollama/model generation, external AI/provider request, data deletion, deployment, push, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: isolated local Desktop Agent project execution

- RED → GREEN: the isolated browser contract first required the local Core/Agent wiring, then the implementation added an explicit `real-agent` mode with temporary loopback Core, fake local Agent transport, temporary workspace roots, and a clearly labelled local provider for Web-owned stages. The operational Runtime/Agent and dataRoot were never reused.
- RED → GREEN: a first-commit test exposed that `GIT_COMMIT` assumed an existing HEAD. The Desktop Agent now handles an empty/unborn branch, validates the expected branch/worktree, and uses a command-scoped fallback Git identity only when no local identity is configured. A second RED exposed that a combined TEST/BUILD job produced duplicate TEST evidence; the compiler now emits purpose-bound TEST and BUILD operations and the executor records both evidence kinds.
- Browser verification completed the real local path through the user UI: project/task creation, approved Run, local Agent CONTEXT/TEST/BUILD/COMMIT, durable lifecycle and activity projections, growth/portfolio projection, and reload persistence. Result: `projectRuntimeLocalAgentUi: passed`, `projectRuntimeExecutionUi: passed`, `projectRuntimeGrowthPortfolioUi: passed`; two isolated accounts and responsive `[390, 768, 1024, 1440]` across 13 routes remained green.
- Verification: user-product `211/211`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, focused compiler/build-evidence/empty-HEAD tests, and the full isolated browser E2E passed. Build output contained only the existing Vite config/chunk-size warnings.
- Safety and remaining boundary: PID `1708`/`22416` remained alive, stale lock PID `55000` and UNKNOWN records were preserved, Ollama stayed stopped with no listener, and no external AI/provider call, live ChatGPT Web request, Runtime/Agent restart, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: configured Runtime approval checkpoint

- RED → GREEN: the UI contract first required a browser journey for the existing `aiApproval.buildRun` checkpoint; the initial contract failed because the runner had no configured-Runtime approval verification. The runner now creates an isolated project and Work Request, confirms the pre-approval API state is still `queued` with no Run, exercises cancel, then approves and waits for the same isolated Runtime path to complete.
- Browser result: `projectRuntimeApprovalUi: passed`, alongside the existing project execution, local Agent, growth/portfolio, failure recovery, learning, AI, collaboration, notification, social, and responsive journeys. The complete browser run passed with two isolated accounts and `[390, 768, 1024, 1440]` across 13 routes.
- Verification: approval contract `2/2`, user-product `212/212`, root `661/661`, and full isolated browser E2E passed. No production behavior was loosened or bypassed; the test proves that the existing explicit owner approval is the only transition from queued Work Request to Runtime dispatch.
- Safety: operational Runtime/Agent, stale lock PID `55000`, UNKNOWN records, Ollama state, external providers/connectors, deployment, push, approved UI design, and deferred AI Broadcast Room were not changed.

## 2026-09-27 continuation: AI team proposal execution approval

- RED → GREEN: extended the approval contract with a configured local AI Team journey. The runner now verifies that a deterministic proposal is durably accepted into one Work Request, that the Work Request stays `queued` with no Run before and during the approval checkpoint, that cancellation does not dispatch it, and that only explicit owner approval starts the Run.
- The browser path then verifies completed Work Request → Run identity, Task node attachment, verified project ActivityEvent, and reload persistence. The existing `AiTeamProposalService` human-acceptance boundary and `ProjectWorkspace` approval policy remain the authorities; no autonomous AI execution was introduced.
- Verification: approval contract `3/3`, user-product `213/213`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, focused AI and learning Runtime journeys, and full isolated browser E2E passed. Full browser output included `aiTeamProposalExecutionApprovalUi: passed`, `aiTeamProposalRuntimeUi: passed`, two isolated accounts, and responsive `[390,768,1024,1440]` across 13 routes. Build output contained only the existing Vite config/chunk-size warnings.
- Safety: operational Runtime PID `1708` and Desktop Agent PID `22416` remained alive with the configured dataRoot; stale lock PID `55000`, UNKNOWN records, Ollama state, external providers/connectors, approved UI/design state, deployment, push, and AI Broadcast Room remained untouched or deferred.

## 2026-09-27 continuation: in-progress project team transition

- RED → GREEN: added the browser contract to `tests/user-ui-project-lifecycle-contract.test.ts`; the initial focused run failed because the E2E runner had no `verifyProjectTeamTransitionUi` journey. The implementation reused the existing `PATCH /api/user/projects/:id/team` route and `updateProjectTeam` service rather than adding a parallel state path.
- The isolated two-account browser journey now creates a private team, recruits and accepts the second account, and exercises `solo → human → mixed → ai → solo` through the actual Project Workspace controls. It checks before/after ACL lists and detail responses, UI not-found behavior after access removal, queued Work Request and workspace task preservation, reload persistence, and four unique verified `project.team.changed` events.
- The first full-run attempts exposed only verification-harness issues: duplicate accessible text for a task rendered in both the request card and workspace tree, and long full-suite local execution windows. The locator was scoped explicitly, mode saves reload the authoritative project view, team PATCH/Run POST responses are checked, and local Agent polling is bounded at 30 seconds. No production authorization or team transition code was weakened.
- Verification: focused contract `3/3`, focused team-transition browser `projectTeamTransitionUi: passed`, user-product `214/214`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and full isolated browser E2E passed with `projectTeamTransitionUi: passed`, `projectRuntimeLocalAgentUi: passed`, two accounts, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, and dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919` remained unchanged; stale lock PID `55000`, UNKNOWN records, Ollama state, external providers/connectors, approved design, deployment, push, and AI Broadcast Room remained untouched or deferred.

## 2026-09-27 continuation: project-bound character and AI companion assets

- RED → GREEN: the approved redesign brief explicitly required real character/AI image assets, but the attached ZIP had no image files. Added a contract for project-bound PNG assets, accessible alt text, `/app`-correct static URLs, and failure fallback; the focused contract was red before the component/assets existed and passed after implementation.
- Added `user-ui/public/assets/characters/iseol-user-character-v1.png` and `user-ui/public/assets/characters/iseol-ai-companion-v1.png`. The assets were generated as original transparent-alpha UI artwork, inspected for alpha-channel corners, copied into the repository, and wired through `user-ui/src/components/CharacterAssets.tsx`. The user/world, auth, onboarding, landing, navigation profile, AI chat companion, and conversation avatars now use actual files. The fallback states are explicit and accessible rather than pretending that an unavailable image loaded.
- The first browser attempt exposed two real integration issues: the UI server mounts user static content under `/app` rather than `/`, and lazy-loading a hidden AI chat companion did not guarantee a loaded pixel resource. Both were corrected by using `/app/assets/...` and eager loading for these above-the-fold character assets. No production Runtime semantics were changed.
- Verification: focused character contract passed; focused `ISEOL_BROWSER_FOCUS=character-assets` returned `characterAssetsUi: passed`; user-product passed `214/214`; root passed `661/661`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed; full isolated browser E2E passed with `characterAssetsUi: passed`, `isolatedAccounts: 2`, all existing journeys, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Design boundary: the ZIP still lacks final approved source artwork for variants and environments. The v1 character/AI files are real implementation assets, not evidence that a missing Figma/art source was approved. SVG backgrounds, emoji labels, and the customization preview remain explicitly tracked as follow-up design-asset work. AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama state, external providers, deployment, push, and browser state were preserved; no external AI/provider request, restart, deletion, or replay occurred.

## 2026-09-27 continuation: explicit My World mission completion records

- RED → GREEN: extended `tests/user-ui-world-state-contract.test.ts` to distinguish durable project/learning/review evidence from a user's own mission completion action. The initial run failed because the mission read model had no action state and My World had no recording path.
- Reused the existing owner-scoped `POST /api/user/activity` boundary. `recordWorldMissionCompletion()` writes `world.mission.completed` with `actorType: user`, `verificationStatus: unverified`, the mission ID, and the occurrence date; `worldState.ts` restores only active, matching, valid unverified events and keeps retracted events excluded.
- `user-ui/src/pages/MyWorld.tsx` now renders a bounded `완료 기록` action and reload-persistent `사용자 완료 기록됨 · 검증/XP 제외` state. It does not change verified evidence, Growth, XP, or existing mission routing. The isolated browser journey checks the actual ActivityEvent, actor/verification fields, reload state, and account isolation.
- Verification: focused world-state contract `4/4`, focused `worldMissionCompletionUi: passed`, user-product `215/215`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and full isolated browser E2E all passed with two accounts and responsive `[390,768,1024,1440]` across 13 routes. A first full E2E attempt showed an intermittent existing plan-preview `400`; retaining response-body diagnostics and rerunning produced a complete pass.
- Safety: operational Runtime PID `1708` and Desktop Agent PID `22416` stayed alive; configured dataRoot and stale lock PID `55000` were not changed. No UNKNOWN replay, external AI/provider call, Ollama start, Runtime/Agent/browser restart, data deletion, deployment, push, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 continuation: achievement notification destination

- RED → GREEN: extended `tests/user-ui-notifications-contract.test.ts` to require a dedicated achievement source branch and `/character` destination. The initial focused contract failed because achievement notifications fell through to `/world`.
- `user-ui/src/components/Navigation.tsx` now routes `source.type === 'achievement'` to `/character` after the existing authenticated read transition. The E2E journey was updated to assert the real character destination and to explicitly reopen My World only for its later source-event cleanup check.
- Verification: focused notification contract passed; focused `growthNotifications: passed`; user-product `215/215`; root `661/661`; `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and full isolated browser E2E passed. Full output included `achievementNotifications: passed`, two isolated accounts, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- The first post-change browser run correctly exposed a stale UI `dist` serving old source, then the UI build was refreshed; the next run reached `/app/character` and exposed only the test's old post-navigation assumption. After the harness boundary was corrected, the focused and full runs passed. No production semantics were weakened.
- Safety: operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama state, external providers, deployment, push, approved design source uncertainty, and AI Broadcast Room remained untouched or deferred.

## 2026-09-27 continuation: idempotent My World mission re-recording

- RED → GREEN: extended `scripts/iseol-user-ui-e2e.ts` so the real browser journey clicks the same My World mission again after reload and requires one active `world.mission.completed` ActivityEvent. The initial run reproduced an `Activity event identity conflict` because the client generated a new occurrence timestamp on the second click.
- `user-ui/src/api/userApi.ts` now derives `occurredAt` from the explicit occurrence date at `T00:00:00.000Z`. The existing date-scoped ActivityEvent identity then makes same-day retries idempotent while preserving the user self-report, unverified status, Growth/XP exclusion, and owner boundary.
- Verification: focused world-state contract `4/4`, focused `worldMissionCompletionUi: passed`, user-product `215/215`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, and full isolated browser E2E passed. The final browser output reported two isolated accounts, reload persistence, responsive `[390,768,1024,1440]`, and `worldMissionCompletionUi: passed`.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers, approved design-source uncertainty, deployment, push, and deferred AI Broadcast Room remained untouched; no external AI/provider request or process restart occurred.

## 2026-09-27 continuation: semantic data-state icons

- RED → GREEN: added `tests/user-ui-state-icon-contract.test.ts` before implementation. The initial run failed because the shared icon type did not contain the required semantic state names; the contract now passes after the implementation was added.
- `user-ui/src/components/Icon.tsx` now exposes `rotate`, `check`, `alertTriangle`, `clock`, `help`, and `lock` alongside the existing shared icon set. `user-ui/src/components/UI.tsx` uses the semantic component for StatusBadge, locked achievements, mission/stat/member-count expressions, and the AI avatar; `user-ui/src/domain/worldState.ts` and `user-ui/src/pages/MyWorld.tsx` use typed semantic mission/stat icons. Existing user text, navigation, permissions, ActivityEvent evidence, Growth/XP boundaries, and persistence behavior are unchanged.
- Verification: focused icon/navigation/responsive contracts passed `3/3`; user-product passed `217/217`; root passed `661/661`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and full isolated browser E2E passed with two isolated accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, `responsiveRoutes: 13`, and all existing journeys including `worldMissionCompletionUi` and `settingsPermissionPersistenceIsolation`.
- Scope boundary: this removes shared data-state Unicode symbols, not every page-level emoji or missing final approved art asset. Remaining visual asset/design-source gaps stay tracked for a later bounded unit. Operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment, push, and AI Broadcast Room remained untouched; no external AI/provider request or restart occurred.

## 2026-09-27 continuation: operational Settings and Personal AI icons

- RED → GREEN: added `tests/user-ui-operational-icon-contract.test.ts` before implementation. The first run failed on the missing `monitor` semantic icon name, confirming that the two operational surfaces still depended on presentation Unicode symbols.
- Added `monitor`, `robot`, `code`, `fileText`, and `rocket` to `user-ui/src/components/Icon.tsx`. `user-ui/src/pages/Settings.tsx` now keeps the integration catalog typed as `IconName` and renders the shared component; `user-ui/src/pages/AIChat.tsx` uses it for the companion avatar, private memory/user-only scope indicators, and the ready/not-ready Runtime banner.
- Existing data and permission semantics are unchanged: integration cards still report unavailable/coming rather than inventing connections, Personal AI still stores private conversations and truthful Runtime waiting states, and no external provider was contacted.
- Verification: focused operational icon contract `1/1`, user-product `217/217`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and full isolated browser E2E passed. Full browser output included `privateAiChatPersistenceIsolation: passed`, `settingsPermissionPersistenceIsolation: passed`, two isolated accounts, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety: operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment, push, approved design uncertainty, and AI Broadcast Room remained untouched; no external AI/provider request or process restart occurred.

## 2026-09-27 continuation: semantic navigation icons and concurrent durable updates

- RED → GREEN: added `tests/user-ui-navigation-icon-contract.test.ts` before implementation. `user-ui/src/components/Icon.tsx` now provides a shared semantic inline-SVG icon set, and `user-ui/src/components/Navigation.tsx` uses it for primary navigation, notification, integration navigation, mobile menu, and close controls. Existing routes, accessible names, and responsive behavior remain unchanged; the missing final approved art package is not being inferred from this implementation.
- RED → GREEN: the first parallel full browser run exposed a real Windows `EPERM` during learning plan-preview JSON replacement. `src/learning/store.ts` now uses the existing bounded `renameWithTransientRetry()` helper; the durable JSON shape, owner-scoped path, temporary-file replacement, and restart semantics remain unchanged.
- RED → GREEN: a later browser run exposed that four rapid Settings AI-access toggles could race through the server's read-modify-write path. `tests/settings-isolation.test.ts` now asserts concurrent independent patches, and `src/settings/service.ts` serializes updates per authenticated user. This preserves account B defaults and prevents one user's setting changes from overwriting another user's or their own adjacent changes.
- Verification: focused icon/persistence/settings checks `9/9`, user-product `217/217`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, and the full isolated browser E2E passed. Browser output included `settingsPermissionPersistenceIsolation: passed`, `worldMissionCompletionUi: passed`, `responsiveViewports: [390,768,1024,1440]`, and `responsiveRoutes: 13`.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design source uncertainty, deployment, push, and deferred AI Broadcast Room were preserved. No external AI/provider call, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 continuation: semantic icons for core user content surfaces

- RED → GREEN: added `tests/user-ui-content-icon-contract.test.ts` before implementation. The first run failed on the existing Friends emoji header, confirming that the generic content surfaces had not yet adopted the shared icon boundary.
- `user-ui/src/pages/MyWorld.tsx` now keeps zone metadata typed with `IconName` and uses semantic icons for zone navigation, Runtime speech state, quick actions, today’s learning, and achievement markers. `Friends.tsx`, `IdeaLab.tsx`, `PortfolioScreen.tsx`, and `MemoryVault.tsx` now use the shared `Icon` for generic conversation, idea, activity/portfolio, and private-memory symbols. Character accessories and final approved art assets were intentionally left unchanged.
- This unit changes presentation only. Existing user-scoped API calls, private-memory scope, social ACLs, project approval/runtime truthfulness, portfolio export/share behavior, routes, persistence, and accessible text remain intact.
- Verification: content contract `1/1`; combined icon/navigation/operational/state/responsive checks `6/6`; user-product `217/217`; root `661/661`; `npm.cmd run build`; `npm.cmd run user-ui:build`; and full isolated browser E2E passed every journey with two accounts, reload persistence, `responsiveViewports: [390,768,1024,1440]`, and `responsiveRoutes: 13`.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design source uncertainty, deployment, push, and deferred AI Broadcast Room remained untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 continuation: server-revoked logout and reconnect-safe relogin

- Authentication logout is **A — server session revocation, stale-request protection, and full browser verified**. `src/web-control-plane/user-router.ts` and `src/web-control-plane/server.ts` now expose `POST /api/user/logout`; it revokes only the authenticated platform session. `user-ui/src/api/userApi.ts` always clears local storage while only clearing a session after `401` when the failed token is still current.
- `user-ui/src/store/userStore.ts`, `user-ui/src/pages/Settings.tsx`, and `user-ui/src/pages/Auth.tsx` now preserve local cleanup, guaranteed navigation, and a loading transition before the protected shell mounts after relogin. The old bearer token is rejected by `/api/user/me`, and a new login returns to the durable world.
- Evidence: `tests/platform-user-auth.test.ts`, `tests/user-ui-auth-boundary-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused auth contracts passed `4/4`; product regression passed `236/236`; root regression passed `662/662`; both builds passed; focused logout/relogin passed; and the full isolated browser matrix passed `logoutServerRevocationAndRelogin: passed`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Debug evidence: the first browser run reproduced a valid-session redirect race caused by the protected shell seeing the post-logout `unauthenticated` store state before the new profile load. The fix was limited to token-aware stale-401 cleanup and the login loading transition; no assertion was weakened.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, approved-design uncertainty, and AI Broadcast Room remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider call, deployment, or push occurred.

## 2026-09-27 continuation: collaboration Teams and Community semantic icons

- RED → GREEN: added `tests/user-ui-collaboration-icon-contract.test.ts` before implementation. The contract required semantic `Icon` usage in Teams and Community and rejected the targeted generic UI emoji. It now passes after the shared icon set gained `edit`, `compass`, and `heart`.
- `user-ui/src/pages/Teams.tsx` now uses semantic icons for collaboration headers, create/recruit actions, empty-state guidance, project/study badges, and curriculum markers. `user-ui/src/pages/Community.tsx` uses semantic icons for the header, write action, and per-user reaction control. Durable routes, post data, membership ACLs, study/chat/recruitment behavior, and like persistence are unchanged.
- The first full browser attempt failed at the old `❤️ 1` accessible-name locator after the heart moved into an SVG. Systematic debugging traced the issue to the missing product-level label, not to a collaboration data failure. The minimal fix added `좋아요 N` / `좋아요 취소 N` to the real button and updated the harness to assert those semantic names. The rerun passed `publicCommunityLikePersistence` and all existing journeys.
- Verification: collaboration contract `1/1`; combined icon/navigation/operational/state/responsive focus `5/5`; user-product `217/217`; root `661/661`; `npm.cmd run build`; `npm.cmd run user-ui:build`; and full isolated browser E2E with two accounts, reload persistence, `responsiveViewports: [390,768,1024,1440]`, `responsiveRoutes: 13`, `publicCommunityLikePersistence: passed`, and `teamChatMembership: passed`.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design source uncertainty, deployment, push, and deferred AI Broadcast Room remained untouched. No external AI/provider call, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 continuation: bounded owner-scoped AI Chat text attachments

- RED → GREEN: added durable attachment contracts and tests before implementation. The backend now accepts only bounded text attachments, strips path components from names, persists attachment metadata/content on the authenticated user's message, rejects binary/empty/oversized/excessive input before appending a message, and keeps foreign conversations inaccessible.
- `user-ui/src/pages/AIChat.tsx` now exposes a real multiple-file input with local text reading, removal, clear pending-state behavior, truthful 3-file/24KB-per-file/48KB-per-message limits, durable attachment rendering, and Markdown export. `src/ai-chat/local-runtime.ts` receives attachment text only as explicitly non-executable user context; no file execution or workspace write path was added.
- Verification: focused AI Chat/API/Runtime/UI tests passed `13/13`; `npm.cmd run test:ai-chat` passed `20/20`; user-product passed `241/241`; root passed `662/662`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and diff validation passed with only existing warnings/line-ending notices; focused and full isolated browser E2E passed `aiChatAttachmentsUi: passed` with two accounts, reload persistence, export, project-context permission behavior, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety and scope: the first browser failure was a harness exact-text selector mismatch after the message gained an attachment block; the API returned 201 and the UI had already rendered the correct state. The selector was corrected and the full rerun passed. Operational Runtime/Agent, dataRoot, stale lock, UNKNOWN records, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, and deferred AI Broadcast Room remain untouched. Editable AI context and execution-plan approval remain separate unimplemented units.

## 2026-09-27 continuation: per-message AI Chat context editing

- RED → GREEN: added `AiChatContextSelection` and durable `contextSelection` state to user messages. The service normalizes the five bounded context switches, applies the authenticated settings permissions, and passes only the selected sections to the local Runtime dispatcher. A selected project is rejected or omitted when project context is disabled for that message.
- `user-ui/src/pages/AIChat.tsx` now exposes the real `맥락 편집` panel with permission-aware checkboxes for personal memory, learning history, project context, verified activity timeline, and team-shared documents. The selection applies to the next message, restores after reload, and explicitly excludes file changes and execution rights. Existing attachments, project ACL, private conversation, and Runtime-waiting behavior remain unchanged.
- Verification: RED contracts became GREEN; focused context checks passed `3/3`; `npm.cmd run test:ai-chat` passed `22/22`; user-product passed `241/241`; root passed `662/662`; both builds and diff validation passed; focused browser passed `aiChatContextSelectionUi: passed`; and full isolated browser E2E passed all existing journeys plus `aiChatContextSelectionUi: passed` and `aiChatAttachmentsUi: passed`, two accounts, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.

## 2026-09-27 continuation: AI Chat execution-plan proposal approval boundary

- RED → GREEN: added a bounded `AiChatExecutionPlan` attached to an assistant message only when the injected/local Runtime returns a valid plan. The service persists `proposed`, `approved`, or `rejected` state with owner-bound conversation/message checks and restart durability; approval/rejection records a decision only and does not create a Work Request, project Run, file change, or external request.
- `user-ui/src/pages/AIChat.tsx` now renders the actual plan title, summary, bounded steps, `실행 계획 승인`, and `실행 계획 거절` controls. After a decision it shows that `별도 실행은 시작되지 않았습니다.`; no automatic execution path was added.
- Verification: execution-plan contracts passed `3/3`; `npm.cmd run test:ai-chat` passed `24/24`; root build and user UI build passed with existing Vite warnings; focused browser passed `aiChatExecutionPlanUi: passed`; and full isolated browser E2E passed every prior journey plus `aiChatExecutionPlanUi: passed`, `aiChatContextSelectionUi: passed`, and `aiChatAttachmentsUi: passed`, with two-account isolation, reload persistence, and responsive `[390,1440]` coverage across 13 routes.
- The deterministic plan-producing Runtime exists only in `scripts/iseol-user-ui-isolated-server.ts` under the explicit browser-test environment flag. Operational Runtime PID `1708`, Desktop Agent PID `22416`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, deployment, or push occurred.

## 2026-09-27 continuation: AI Chat plan to queued Project Work Request handoff

- RED → GREEN: an approved AI Chat plan with an owner-selected project can now be explicitly converted into one idempotent queued Work Request. The plan persists `workRequestId`, remains owner-bound, and can be safely re-requested without changing the Work Request identity.
- `src/ai-chat/service.ts`, `src/ai-chat/router.ts`, and `user-ui/src/api/userApi.ts` add the handoff contract. `user-ui/src/pages/AIChat.tsx` exposes `프로젝트 작업 요청 만들기` only for an approved plan with project context and states that Run execution has not started.
- Verification: execution-plan contracts passed `4/4`; `npm.cmd run test:ai-chat` passed `25/25`; root/UI builds passed with existing Vite warnings; focused browser passed `aiChatExecutionPlanUi: passed`; the isolated journey verified project selection, queued request persistence, `runtime.status: not-started`, rejection, reload, and no automatic Run start.
- Safety: this unit creates no Run and does not claim or dispatch a Work Request. Operational Runtime PID `1708`, Desktop Agent PID `22416`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, deployment, or push occurred.
- Debug boundary: one product regression was an obsolete source-string expectation for `projectId: selectedProjectId`. It was updated to assert the new `projectIdForMessage` safety normalization after API and browser behavior had already passed. Operational Runtime/Agent, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, and AI Broadcast Room remain untouched.

## 2026-09-27 continuation: AI plan handoff to Project Workspace approval

- RED → GREEN: extended `tests/user-ui-ai-chat-execution-plan-contract.test.ts` so a handed-off plan must expose a real `프로젝트 작업실에서 실행 승인 검토` link. `user-ui/src/pages/AIChat.tsx` now links the owner-scoped plan to `/projects/:projectId` only after the Work Request has been durably created, and states that the existing workspace checkpoint—not AI Chat—decides whether a Run starts.
- Extended `scripts/iseol-user-ui-e2e.ts` to enable build approval in the isolated account, follow the real link into Project Workspace, open `실행 승인 확인`, verify the linked request is still `queued` with no Run and runtime `not-started`, cancel the checkpoint, and then continue the existing rejection/reload checks.
- Verification: focused UI contract `1/1`; `npm.cmd run test:ai-chat` `25/25`; user-product `241/241`; root regression `662/662`; `npm.cmd run build`; `npm.cmd run user-ui:build`; focused browser `aiChatExecutionPlanUi: passed`; and full isolated browser E2E passed all journeys with `aiChatExecutionPlanUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390,768,1024,1440]`, and `responsiveRoutes: 13`.
- Debug boundary: the first focused browser run used a stale `user-ui/dist`; rebuilding the UI reached the new link, then one strict locator was narrowed because the same plan title is intentionally rendered in both the workspace summary and request card. No assertion was weakened and no product execution boundary changed.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design sources, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, operational data mutation, UNKNOWN replay, deployment, or push occurred.

## 2026-09-27 continuation: bounded Project Workspace Run observability

- RED → GREEN: added project/UI contracts before implementation. `src/project-model/run-observability.ts` now creates a bounded owner-facing projection for each durable project Run, separating `file-change` evidence into 변경 파일, `build`/`test` evidence into 테스트·빌드 결과, and `command` evidence into 실행 로그 요약. Project and Run identity filtering remains enforced by the existing evidence selector.
- `src/project-model/user-project-service.ts` returns `observability.runs` alongside the existing runtime, evidence, lifecycle, and history views. Missing durable Runs produce `unknown` with an explicit blocker; absent preview evidence produces `미리보기 주소가 기록되지 않았습니다.` rather than a fabricated URL. The projection omits raw references/command output and caps each category at 100 records.
- `user-ui/src/api/userApi.ts` types the new read model. `user-ui/src/pages/Projects.tsx` renders the real `Run 관찰 기록` panel without changing the approved layout or deferred broadcast scope. Existing lifecycle/history and mobile tabs remain intact.
- Verification: focused project/UI tests passed `16/16`; `npm.cmd run build`; `npm.cmd run user-ui:build`; user-product regression `242/242`; root regression `662/662`; focused browser `projectWorkspaceMobileTabsUi: passed`; and full isolated browser E2E passed all journeys, two-account isolation, reload persistence, `responsiveViewports: [390,768,1024,1440]`, and `responsiveRoutes: 13`.
- Debug boundary: the first focused browser run hit a strict locator collision because the same evidence summary appears in lifecycle and observability panels by design. Narrowing the locator to `.first()` resolved the harness issue without weakening the product check.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.




## 2026-09-27 continuation: bounded Project Workspace file inventory

- RED → GREEN: added backend and UI contracts before implementation. The first focused run failed because `UserProjectView.workspace` had no file projection and Project Workspace had no real file-list panel.
- `src/project-model/workspace-files.ts` now recursively lists only bounded relative paths and byte sizes from the owner-bound workspace. It never reads file contents, skips symlinks and secret-like names, ignores `.git`/`.iseol`/dependency/build/cache directories, rejects path escape, and caps traversal at 500 files and eight directory levels.
- `src/project-model/user-project-service.ts` joins the projection to the existing owner/project ACL read model. `user-ui/src/api/userApi.ts` types it, `user-ui/src/pages/Projects.tsx` renders `실제 작업공간 파일`, and `scripts/iseol-user-ui-e2e.ts` verifies the real bounded fields after reload and in the mobile 작업 tab. No file preview, content upload, or execution permission was added.
- Verification: focused project/UI tests passed `18/18`; `npm.cmd run build`; `npm.cmd run user-ui:build`; user-product `244/244`; root `662/662`; focused `projectWorkspaceMobileTabsUi: passed`; and full isolated browser E2E passed all journeys, two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Build output contains only the existing Vite native-config/chunk-size warnings. The full browser run passed `projectRuntimeExecutionUi`, `projectRuntimeFailureRecoveryUi`, and `projectWorkspaceMobileTabsUi` while the new file metadata remained bounded and content-free.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 continuation: verified Project Workspace preview links

- RED → GREEN: added project/UI contracts before implementation. The first focused run reproduced that even a durable `deployment` plus `production-verification` evidence pair was still projected as `not-available`, and the UI had no ready-preview branch.
- `src/project-model/run-observability.ts` now accepts a preview only from a selected Run's `production-verification` evidence with a safe HTTP(S) reference. It joins the matching deployment provider, strips no content into the read model, rejects `javascript:`/credential-bearing/malformed URLs, and keeps missing/unknown Run states explicit.
- `user-ui/src/api/userApi.ts` types the ready/not-available/unknown union. `user-ui/src/pages/Projects.tsx` renders `기록된 미리보기 주소` and `미리보기 열기` only for the durable verified URL; ordinary completed browser Runs without deployment evidence continue to say that no preview address was recorded.
- Verification: focused project/UI tests passed `20/20`; `npm.cmd run build`; `npm.cmd run user-ui:build`; user-product `246/246`; root `662/662`; and full isolated browser E2E passed all journeys, two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Build output contains only the existing Vite native-config/chunk-size warnings. No preview server was started and no external deployment, URL revalidation, or provider request was made.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 continuation: accessible mobile navigation modal

- RED → GREEN: added `tests/user-ui-navigation-accessibility-contract.test.ts` before implementation. The contract reproduced that the mobile 전체 메뉴 overlay had no dialog semantics, keyboard dismissal, focus containment, or focus return.
- `user-ui/src/components/Navigation.tsx` now exposes the approved mobile menu as `role="dialog"` with `aria-modal`, a labelled title, and an `aria-controls`/`aria-haspopup` trigger. Escape closes the menu, Tab focus is contained within the menu, opening moves focus to the close control, and closing returns focus to the triggering control. The visual layout and route destinations were preserved.
- `package.json` includes the new contract in `test:iseol-user-product` so the accessibility boundary remains part of the product regression suite.
- Verification: the new contract and four related navigation/notification/responsive contracts passed `5/5`; user-product regression passed `247/247`; root regression passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed all existing journeys with two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, and responsive `[390,768,1024,1440]` across 13 routes. The user UI build retained only the existing Vite native-config and chunk-size warnings.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 continuation: live browser proof for mobile navigation accessibility

- RED first: extended `tests/user-ui-navigation-accessibility-contract.test.ts` with a contract requiring the browser runner to exercise the mobile navigation keyboard flow and report it explicitly. The new contract failed before implementation because the runner had no corresponding verifier or result field.
- Implemented `verifyMobileNavigationAccessibilityUi` in `scripts/iseol-user-ui-e2e.ts`. The verifier uses an isolated 390px browser viewport and checks the real `/app/settings` UI for the mobile menu trigger semantics, dialog naming and modal state, focus transfer, Tab/Shift+Tab wrapping, Escape close, and focus restoration.
- Added the focused `mobile-navigation-accessibility` browser path and made the full browser run execute both the personal-space navigation verifier and the mobile keyboard verifier before emitting their pass fields. The full result therefore no longer reports navigation success without running the corresponding browser checks.
- Verification: focused navigation contract `2/2` passed; focused browser run reported `mobileNavigationAccessibilityUi: "passed"`; `npm.cmd run user-ui:build` and `npm.cmd run build` passed; isolated full browser E2E passed all journeys with two accounts, 390/768/1024/1440 viewports, 13 responsive routes, and both navigation pass fields; `npm.cmd run test:iseol-user-product` passed `248/248`; `npm.cmd test` passed `662/662`.
- Safety: this unit used only isolated browser accounts and local builds/tests. Operational Runtime PID `1708`, Agent PID `22416`, ports `18890`/`18891`, stale lock metadata for PID `55000`, durable records, and UNKNOWN requests were left untouched. No Runtime/Agent/browser restart, external AI/provider request, deployment, push, or deferred AI Broadcast Room change occurred.

## 2026-09-27 continuation: safe Runtime/Agent status and browser-verified UI trust fixes

- Status: A for the bounded Runtime status, settings persistence, character asset accessibility, export naming, and browser regression slice; this is not a claim that the entire ISEOL product is complete.
- Implemented: `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/user-router.ts`, and `user-ui/src/api/userApi.ts` now carry only the safe `agent: ready|unavailable` capability state to the authenticated user surface. `user-ui/src/pages/Settings.tsx` renders the bounded Desktop Agent state and serializes rapid permission toggles after the initial settings load so changes are not silently dropped. The AI companion defaults and AI Chat sidebar use the approved `ISEOL 개인 AI 동반자` accessible name, and conversation exports use the canonical `iseol-ai-conversation-<id>.md` filename.
- Debug boundary: browser-first verification exposed a legacy `NPC 전체 메뉴` dialog title, a legacy conversation export prefix, an AI companion accessible-name mismatch, and a missing `updateSettings` import that caused a real `ReferenceError`. Each was fixed with a focused contract before the next browser rerun. A stale session-expiry fixture was also made deterministic by injecting a fixed test clock; production session behavior was not changed.
- Evidence: focused Runtime/UI contracts passed `41/41`; `npm.cmd run test:iseol-user-product` passed `248/248`; `npm.cmd test` passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; `git diff --check` passed; and full isolated browser E2E passed all reported journeys, including two-account isolation, reload persistence, Runtime/Agent approval and recovery paths, character/environment assets, settings permission persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Remaining boundary: live Ollama/model generation remains unavailable/unverified, external connectors and final approved art sources remain unavailable, weekly digest remains intentionally unavailable without its producer/spec, and AI Broadcast Room remains deferred with its files preserved. These are not replaced by deterministic browser fixtures.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and prior durable records were preserved. No Runtime/Agent/browser restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or broadcast change occurred.

## 2026-09-27 continuation: live Agent capability refresh across Project Workspace and Settings

- Implemented a bounded live-status slice: `src/runtime/iseol-runtime-services.ts` now treats every configured required Agent (Idea Lab and/or Project Workspace) as one capability set, updates `agent: ready|unavailable` on connect/disconnect, and preserves the separate Project execution registration boundary. `user-ui/src/pages/Settings.tsx` refreshes the authenticated Runtime snapshot on a bounded interval and when the document becomes visible; it stops polling and removes the listener on unmount.
- Hardened `src/settings/store.ts` with the existing bounded transient Windows rename retry boundary after browser verification exposed a real `EPERM` save collision. The new `tests/settings-isolation.test.ts` case verifies retry and durable reload.
- Added RED-first coverage for Project-only Agent reconnects, Idea Lab Agent status transitions, the Settings visibility/interval cleanup contract, and Settings transient persistence in `tests/iseol-runtime-services.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `tests/settings-isolation.test.ts`.
- Verification after the final type-safe implementation: focused Runtime/UI contracts `35/35`, Settings persistence contracts `4/4`; `npm.cmd run test:iseol-user-product` `249/249`; `npm.cmd test` `663/663`; `npm.cmd run build`; `npm.cmd run user-ui:build`; `git diff --check`; and isolated browser E2E with all reported journeys passed, including `runtimeStatusSurface`, `settingsPermissionPersistenceIsolation`, Project Workspace local-Agent/execution/recovery paths, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- The browser E2E used its isolated local server/accounts and did not connect to the operational Runtime. Existing Vite native-config/chunk-size warnings remain non-fatal.
- Scope boundary remains explicit: live Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unavailable/unverified or deferred; no deterministic fixture is presented as live external proof.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, durable records, external providers, deployment/push state, and broadcast artifacts remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or broadcast change occurred.

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

- RED → GREEN: the cancellation API test first reproduced that a successful queued Work Request cancellation changed the durable request but left the activity timeline empty. `src/project-model/user-project-service.ts` now records exactly one owner-scoped `project.work.cancelled` ActivityEvent after the durable transition, with `sourceType: project-work-request`, `actorType: user`, and `verificationStatus: unverified`.
- The event payload retains only the project and Work Request identities. It intentionally does not create growth XP because cancellation is a user action and not verified development/learning evidence. Repeated cancellation remains rejected and cannot duplicate the event; queued cancellation still never force-stops a Run or Runtime/Agent process.
- Verification: focused API/UI contracts passed `5/5`; focused browser `projectWorkRequestCancellationUi: passed` verified the durable event and XP `0`; `npm.cmd run test:iseol-user-product` passed `251/251`; `npm.cmd test` passed `663/663`; `npm.cmd run build`; `npm.cmd run user-ui:build`; `git diff --check`; and full isolated browser E2E passed with two-account isolation, reload persistence, `projectWorkRequestCancellationUi: passed`, and responsive viewports `[390,768,1024,1440]` across 13 routes.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No Runtime/Agent/browser restart, external AI/provider request, UNKNOWN replay, operational data mutation, deployment, push, or broadcast change occurred.

## 2026-09-27 continuation: queued Work Request creation activity evidence

- RED → GREEN: the Project Workspace API test first reproduced that creating a Work Request persisted the request but emitted no activity event. `src/project-model/user-project-service.ts` now records one owner-scoped `project.work.created` ActivityEvent after a newly created request and its workspace tree are durable.
- The event is `actorType: user` and `verificationStatus: unverified`; its bounded payload contains only `projectId` and `workRequestId`. The `result.created` guard makes idempotent request replay return the existing request without duplicating the event, and it does not grant growth XP.
- Verification: focused API/UI contracts passed `6/6`; focused browser `projectWorkRequestCancellationUi: passed` verified one creation event plus one cancellation event and growth XP `0`; `npm.cmd run test:iseol-user-product` passed `252/252`; `npm.cmd test` passed `663/663`; `npm.cmd run build`; `npm.cmd run user-ui:build`; and the rerun of full isolated browser E2E passed every reported journey, including AI team execution approval, two-account isolation, reload persistence, and responsive viewports `[390,768,1024,1440]` across 13 routes.
- The first full browser attempt exposed a timing/interference failure in the pre-existing AI team approval journey; the focused journey passed immediately, and a subsequent full rerun passed without weakening assertions or changing production timing.
- Safety: only isolated test accounts, local test roots, and the activity projection changed. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or broadcast change occurred.

## 2026-09-27 continuation: project creation activity and My World ledger layout

- RED → GREEN: added API coverage for the missing project-creation edge. `src/project-model/user-project-service.ts` now records one owner-scoped `project.created` ActivityEvent only after the project record and initial workspace are durably saved. The event is user-attributed and `unverified`, carries only project ID/purpose/team mode, and does not grant XP.
- The browser run exposed a real UI integration defect caused by the new durable event: My World rendered the growing recent-activity ledger inside the fixed 320px, `overflow-hidden` character header. With five records, the first `활동 상세 보기` link was clipped and the real browser could not click it. `user-ui/src/pages/MyWorld.tsx` now keeps the same approved card/style and moves that ledger into the scrollable content region below the header.
- Verification: RED focused API test reproduced `0` project-creation events; GREEN API/UI contracts passed `6/6`; the project Runtime browser journey first reproduced the clipped link, then the rebuilt full isolated browser run passed every reported journey, AI team approval, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes. User-product regression passed `253/253`; root regression passed `663/663`; TypeScript/UI builds passed.
- Safety: only project activity projection, user UI layout, isolated tests, and local UI build output changed. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, Ollama/model state, external providers/connectors, approved design-source uncertainty, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, push, or broadcast change occurred.

## 2026-09-27 continuation: Project → Task → Run request activity evidence

### Completed in this unit

1. Added the missing initial Run request activity edge. After a durable Work Request is connected to a durable Run and its status is persisted as `running` or `waiting`, `src/project-model/user-project-service.ts` records one `project.run.requested` ActivityEvent.
2. Kept the event owner-scoped, user-attributed, `unverified`, bounded to project/work-request/Run identities, and outside Growth/XP. It does not claim that the Run completed or that Runtime/Agent produced evidence.
3. Preserved replay idempotency: a repeated request against an already-running Work Request returns the existing Run state and does not create a second request event.
4. Extended the isolated browser Runtime journey to verify the request event alongside the existing verified completion event, growth projection, portfolio evidence, and reload behavior.

### TDD and verification

- RED API test: the new Run request path initially produced `0` matching activity events. GREEN focused API coverage passed `7/7` after the minimal post-persistence write.
- Isolated full browser E2E passed all reported journeys, including `projectRuntimeExecutionUi: passed`, AI team approval, two-user isolation, reload persistence, and responsive `390/768/1024/1440` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `254/254` passed.
- `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only the existing Vite native-config and chunk-size warnings.

### Scope and safety boundary

- This unit adds only a local durable audit edge. It does not dispatch an operational Runtime request, call Ollama or an external AI/provider, grant XP, alter the approved UI, replay UNKNOWN work, change the stale lock, or implement the deferred AI Broadcast Room.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers, deployment/push state, and approved design-source uncertainty remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: durable community comments

- Added the missing Community comment slice without replacing the approved screen: `CommunityComment` records are now owner-attributed, published/hidden-state aware, stored under the post's durable community scope, and reloaded with the public post view. Authenticated users can list comments for a published post and create a bounded comment; hidden or missing posts fail closed.
- Connected `src/community/contracts.ts`, `src/community/store.ts`, `src/community/service.ts`, and `src/community/router.ts` to the user API and `user-ui/src/pages/Community.tsx`. The UI renders real comment authors, owner-scoped profile links, counts, and an explicit comment form; no fake reaction or success state is added.
- TDD RED reproduced the missing service method and UI/API contracts. GREEN passed community service `2/2`, community UI contract `2/2`, user-product regression `274/274`, root regression `663/663`, root/UI builds, and `git diff --check`.
- Full isolated browser E2E initially exposed a strict locator collision after adding the comment button. The selector was narrowed to the semantic `좋아요 0` control; the rerun passed all journeys, including `publicCommunityCommentPersistence`, two-user isolation, reload persistence, `responsiveViewports: [390,768,1024,1440]`, and `responsiveRoutes: 13`.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: Learning AI Runtime readiness status surface

### Completed in this unit

1. Added `learningAi: "ready" | "unavailable"` to the authenticated `/api/user/runtime-status` snapshot.
2. Derived readiness from all four explicit Learning dispatchers: plan, content, action, and feedback. Partial configuration remains unavailable instead of being overstated as ready.
3. Passed deterministic isolated-server readiness into the endpoint and added the existing Settings integration row with truthful Korean status labels.
4. Added browser coverage for `학습 AI 미연결` in the default isolated configuration without changing the approved compact integration layout or existing deterministic learning behavior.

### TDD and verification

- RED reproduced the missing API field and Settings contract.
- GREEN focused API/UI contract coverage passed `3/3`.
- `npm.cmd run test:iseol-user-product`: `299/299` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, Learning Runtime, AI Team proposal/discussion flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- `git diff --check` reported no whitespace errors.

### Scope and safety boundary

- The status is a local configuration/readiness signal only. Tests used deterministic fixtures and injected adapters; no Ollama request was made and no live model quality was claimed.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, approved design sources, and deferred AI Broadcast Room artifacts remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: learning coding-attempt activity provenance

### Completed in this unit

1. Added the missing provenance edge from a durable coding-learning answer to the owner activity ledger. `src/learning/service.ts` records `learning.coding.attempt.submitted` after the final persisted attempt state, including a local syntax receipt when the explicitly injected verifier completes.
2. Kept the event user-attributed and `unverified`. The payload contains only bounded exercise/language/practice/executor metadata; submitted source text is never copied into the activity ledger.
3. Preserved `environment-required` honesty, syntax-only verification semantics, owner ACL, durable persistence, and request idempotency. Repeated submissions do not duplicate the activity event, and existing attempts can be safely backfilled through the same deterministic event identity.
4. Added the user-facing `코딩 연습 답안 제출` label to the existing Activity Timeline while retaining the raw source identity and `미검증` badge.

### TDD and verification

- RED focused test reproduced zero coding-attempt ActivityEvents before the implementation.
- GREEN focused learning/coding/activity coverage passed `9/9`; the Activity Timeline UI contract passed `1/1`.
- `npm.cmd run test:iseol-user-product`: `305/305` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; only existing Vite native-config and chunk-size warnings remained.
- Full isolated browser E2E passed all reported journeys, including coding persistence and local syntax verifier UI, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- This unit adds local learning activity provenance only. It does not execute arbitrary user code, claim correctness/mastery, grant XP, invoke Ollama/external providers, change approved UI, replay UNKNOWN work, or implement the deferred AI Broadcast Room.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external connectors, deployment/push state, and approved design-source uncertainty remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: Learning Answer verifier-artifact linkage

### Completed in this unit

1. Fixed the evidence handoff that previously dropped `CodingAttempt.practiceResult.artifactRefs` when the Learning UI created its `LearningAnswerReceipt` with `artifactRefs: []`.
2. Made `src/learning/service.ts` authoritative: it validates and merges owner-bound verifier refs with optional submitted file refs, limits the combined set, preserves idempotency, and repairs legacy receipts that predate a verifier receipt.
3. Kept the truth boundary intact. A syntax receipt is execution evidence for syntax only; it does not become a correctness, mastery, verified-growth, or XP claim. No verifier refs are invented for `environment-required` attempts.

### TDD and verification

- RED focused tests reproduced an empty Answer Receipt and missing UI artifact propagation.
- GREEN focused learning/action/coding/verifier/UI coverage passed `15/15`.
- `npm.cmd run test:iseol-user-product`: `306/306` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; only existing Vite native-config and chunk-size warnings remained.
- Full isolated browser E2E passed all reported journeys, including coding persistence/local syntax verifier and answer-evaluation pending states, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- This unit connects already-produced local evidence; it does not add arbitrary code execution, hidden-test evaluation, external AI/provider calls, XP projection, approved-design changes, UNKNOWN replay, or the deferred AI Broadcast Room.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external connectors, deployment/push state, and approved design-source uncertainty remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: account-timezone My World mission dates

### Completed in this unit

1. Added `calendarDateForTimeZone` with fixed-instant coverage for UTC date boundaries, daylight-saving transitions, and invalid timestamps.
2. Propagated the persisted platform-user timezone into the authenticated UI profile and used it to build the existing date-scoped My World mission identity.
3. Preserved the existing owner-scoped `world.mission.completed` unverified activity event, retry idempotency, no-XP boundary, and approved My World layout.

### TDD and verification

- RED confirmed the missing calendar helper before implementation.
- Focused timezone and existing World Mission contract coverage passed `7/7`.
- `npm.cmd run test:iseol-user-product`: `304/304` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; only the existing Vite warnings remain.
- Full isolated browser E2E passed `worldMissionCompletionUi`, every existing reported journey, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- `git diff --check` returned exit `0`.

### Scope and safety boundary

- The date calculation is local UI logic; it made no AI/provider request and did not modify the API's verification semantics.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, and durable operational data were not changed or restarted.
- No external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. AI Broadcast Room remains deferred.

## 2026-09-28 continuation: AI Team Runtime readiness status surface

### Completed in this unit

1. Added `aiTeam: "ready" | "unavailable"` to the authenticated `/api/user/runtime-status` snapshot.
2. Derived readiness from both explicit AI Team proposal and technical-discussion dispatchers in the composed Runtime; a partially configured team Runtime remains unavailable rather than being overstated as ready.
3. Passed deterministic isolated-server readiness into the same endpoint and added the existing Settings integration row with truthful Korean status labels.
4. Added browser coverage for `AI 팀 미연결` in the default isolated configuration without changing the approved compact integration layout or external connector claims.

### TDD and verification

- RED reproduced the missing API field and Settings contract.
- GREEN focused API/UI contract coverage passed `3/3`.
- `npm.cmd run test:iseol-user-product`: `299/299` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, AI Team proposal/discussion flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- `git diff --check` reported no whitespace errors.

### Scope and safety boundary

- The status is a local configuration/readiness signal only. Tests used deterministic fixtures and injected adapters; no Ollama request was made and no live model quality was claimed.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, approved design sources, and deferred AI Broadcast Room artifacts remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: AI Team loopback Ollama Runtime adapter

### Completed in this unit

1. Added `src/ai-team/local-runtime.ts` with separate bounded Ollama adapters for AI Team proposal drafts and technical discussions.
2. Enforced loopback-only URLs, no URL credentials, explicit model/timeout validation, JSON response size limits, markdown-fence tolerance, and fail-closed `waiting` blockers.
3. Wired the adapters into `startIseolRuntimeServices` behind the existing `ISEOL_LOCAL_AI_RUNTIME_ENABLED` configuration family. Explicit injected dispatchers remain higher priority, and the disabled default still produces `waiting-runtime`.
4. Preserved the existing team ACL, per-user dispatch gate, human proposal acceptance, Work Request creation, and execution approval boundaries.

### TDD and verification

- RED reproduced the missing AI Team local adapter module and then exposed a composed-config activation bug; the test was corrected by making the `enabled` state explicit rather than weakening the assertion.
- Focused adapter/composed Runtime coverage passed `41/41`.
- `npm.cmd run test:iseol-user-product`: `299/299` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed all existing journeys, including AI Team proposal/discussion, project Runtime, learning, collaboration, growth, and portfolio flows with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- Tests used injected fetch functions only; no Ollama request was made. The browser suite continued to use its deterministic isolated Runtime fixtures and is not evidence of live model quality.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, approved design sources, and deferred AI Broadcast Room artifacts remained untouched.

## 2026-09-28 continuation: explicit AI Team dispatcher injection in composed Runtime

### Completed in this unit

1. Added optional `aiTeamProposalDispatcher` and `aiTeamDiscussionDispatcher` inputs to `startIseolRuntimeServices`.
2. Forwarded those explicit local dispatchers into the existing AI Team proposal and technical-discussion services while preserving the shared per-user FIFO gate.
3. Kept the no-dispatcher default truthful: proposal/discussion requests remain `waiting` rather than creating an implicit provider call.
4. Added composed Runtime coverage that creates owner-scoped team/project state, injects both dispatchers, and verifies durable proposal/discussion outcomes.

### TDD and verification

- RED reproduced the composed Runtime construction gap: AI Team services could accept dispatchers directly, but the production composition input had no explicit injection point.
- GREEN focused composed Runtime coverage passed `36/36`.
- `npm.cmd run test:iseol-user-product`: `295/295` passed.
- `npm.cmd test`: `670/670` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed all reported journeys, including AI Team proposal/discussion Runtime and approval, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- This unit changes only local Runtime dependency injection. It does not add a default AI/model provider, claim operational Runtime throughput, or alter external execution behavior.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, approved design sources, and deferred AI Broadcast Room artifacts remained untouched.

## 2026-09-28 continuation: Project Workspace diff-aware and binary-safe preview

### Completed

- Added a bounded unified-diff parser to the existing owner/team-scoped workspace file read. A requested patch file now returns hunk headers, old/new line positions, context/addition/deletion line kinds, and addition/deletion counts while retaining the original bounded text.
- Binary NUL-containing files now return `Binary files cannot be previewed.` without decoding or exposing their bytes. Existing traversal, secret-like name, symlink, invalid UTF-8, and 128 KiB limits remain in force.
- Extended the approved Project Workspace file panel with a read-only diff view. It distinguishes additions, deletions, and context lines, exposes accessible labels, and does not introduce patch mutation controls.
- Extended the isolated Local Agent browser fixture with a real `change.patch` and verified the end-to-end file selection and diff rendering path.

### TDD and verification

- RED reproduced the missing structured diff metadata before implementation.
- Focused project service/API/UI checks passed `41/41`.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite native-config and chunk-size warnings.
- `npm.cmd run test:iseol-user-product` passed `295/295`; `npm.cmd test` passed `669/669`.
- Full isolated browser E2E passed `projectRuntimeLocalAgentUi` with `change.patch`, `+1 추가`, diff hunk assertions, and an `image.bin` NUL-byte blocker assertion, plus every existing AI/project/learning/collaboration/growth/portfolio journey, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- The first browser run exposed a strict selector collision from the newly added read-only copy; narrowing the selector to the size metadata span fixed it, and the full rerun passed.

### Safety boundary

- This unit is local product code plus isolated test fixtures only. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, approved design sources, deployment/push state, and AI Broadcast Room artifacts were untouched.
- No process restart, UNKNOWN replay, external AI/provider request, connector mutation, data deletion, deployment, or push occurred. Patch application/editing and final approved design changes remain out of scope.

## 2026-09-28 continuation: shared Personal AI/Learning Runtime dispatch gate

### Completed in this unit

1. Extracted `createUserRuntimeDispatchGate` into `src/runtime/user-runtime-dispatch-gate.ts` and made Personal AI and learning services accept an injected gate while retaining private defaults for direct construction.
2. Wired one shared gate into the composed Runtime service and isolated browser server, so one user cannot occupy the local Personal AI and learning dispatch boundaries at the same time; different users remain independent.
3. Preserved durable message/action writes before dispatch, owner-bound completion callbacks, accepted/waiting states, and existing privacy/approval behavior.

### TDD and verification

- RED reproduced both same-user Personal AI overlap and cross-domain learning/Personal AI overlap before shared injection.
- AI Chat/runtime focused coverage and the new cross-domain test passed; composed Runtime service coverage passed `35/35`.
- `npm.cmd run test:iseol-user-product`: `293/293` passed. `npm.cmd test`: `669/669` passed. `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only existing Vite warnings.
- Full isolated browser E2E passed all journeys with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: AI Team proposal/discussion shared Runtime gate

### Completed in this unit

1. Added `dispatchForUser` injection to AI Team proposal and technical-discussion services, with a private process-local default for direct construction.
2. Wired the shared Runtime gate into the composed Runtime and isolated browser server. Same-user proposal/discussion dispatcher calls now serialize with Personal AI and learning; different users remain independent.
3. Preserved AI Team membership/capability ACLs, durable waiting/proposed/completed states, request idempotency, activity provenance, and human approval before project work creation.

### TDD and verification

- RED reproduced same-user proposal/discussion overlap before gate injection.
- Focused AI Team service/API/UI coverage passed `9/9`.
- `npm.cmd run test:iseol-user-product`: `294/294` passed. `npm.cmd test`: `669/669` passed. Root/UI builds passed with only existing Vite warnings.
- Full isolated browser E2E passed AI Team permissions, proposal Runtime/approval, discussion Runtime, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: explicit personal-memory team sharing

### Completed in this unit

1. Added durable owner-selected `sharedTeamIds` to personal memories, preserving private-by-default behavior and normalizing legacy records as private.
2. Added authenticated sharing and shared-memory read routes with active human team membership checks. Owner unshare and team leave/removal revoke access on the next read without copying memory content.
3. Added Memory Vault team checkboxes and a read-only received-memory section. Personal AI includes shared-memory context only for an active selected team when team-document access is enabled; private memories and private study submissions remain excluded.
4. Hardened the replacement-scope ACL so an owner who has left a selected team cannot re-save the stale team scope through the API.

### TDD and verification

- RED reproduced missing sharing service methods and UI contract coverage before implementation.
- Focused memory, AI-context, isolation, and UI coverage passed `19/19` after the ACL hardening.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the approved UI build retained only existing Vite warnings.
- Focused browser `memory-sharing` and full isolated browser E2E passed, including two-account sharing/revocation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- `npm.cmd run test:iseol-user-product`: `288/288` passed. `npm.cmd test`: `668/668` passed. `git diff --check` reported only existing line-ending warnings and no errors.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: learning Runtime per-user dispatch concurrency

### Completed in this unit

1. Added an in-process per-user FIFO gate in `src/learning/service.ts` around local plan, lesson-content, learning-action, feedback, and dispute re-evaluation dispatches. Same-user requests no longer overlap; different users remain concurrent.
2. Preserved existing owner-bound durable state, callbacks, idempotency, and pending behavior. The implementation does not claim cross-process or operational Runtime scheduling guarantees.

### TDD and verification

- RED reproduced two overlapping same-user learning Runtime dispatches before the gate was added.
- Focused learning dispatch/content/evaluator/re-evaluation/plan coverage passed `16/16`, including different-user concurrency.
- `npm.cmd run test:iseol-user-product`: `288/288` passed. `npm.cmd test`: `668/668` passed. `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only existing Vite warnings.
- Full isolated browser E2E passed learning Runtime response, plan/content/action/feedback/completion/review flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: Personal AI Runtime per-user dispatch concurrency

### Completed in this unit

1. Added an in-process per-user FIFO gate in `src/ai-chat/service.ts` around Personal AI `runtimeDispatcher` calls. Same-user local Runtime calls no longer overlap; different users remain concurrent.
2. Kept user messages durable before dispatch and preserved private context selection, owner-bound async completion callbacks, accepted/waiting states, assistant persistence, notifications, attachments, and execution-plan approval behavior.

### TDD and verification

- RED reproduced two overlapping same-user Personal AI Runtime dispatcher calls before the gate was added.
- Focused AI Chat/runtime/UI coverage passed `40/40`, including different-user concurrency and existing private AI boundaries.
- `npm.cmd run test:iseol-user-product`: `292/292` passed. `npm.cmd test`: `668/668` passed. `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only existing Vite warnings.
- Full isolated browser E2E passed private AI persistence/isolation, Runtime response, attachments, context selection, execution-plan approval, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: durable Control Plane event replay

### Completed in this unit

1. Added an optional Control Plane event journal in `src/web-control-plane/event-bus.ts`. Published bounded events are written as one atomic JSON record per event under an explicit journal root; a new bus instance can return only events after a known cursor, while an unknown/stale cursor returns no fabricated history.
2. Added reconnect-safe `/api/events` handling in `src/web-control-plane/server.ts`: authentication remains first, subscription happens before replay, a replay request is surfaced in the connected frame, live events are buffered during the async read, and replay/live duplicates are suppressed by event id.
3. Connected the legacy Control Plane browser script in `web/app.js` to retain the last received event id for the current page lifetime and send `Last-Event-ID` on the next fetch reconnect. Credentials and event payloads are not placed in the cursor.

### TDD and verification

- RED: the restart/cursor, SSE replay/race, and static reconnect tests failed before implementation because the bus had no `replayAfter` contract, `/api/events` always emitted `replay:false`, and the browser did not send a cursor.
- GREEN: focused Control Plane server/static checks `15/15`; `npm.cmd run build`; `npm.cmd run test:iseol-user-product` `288/288`; `npm.cmd test` `668/668`; `npm.cmd run user-ui:build`; and full `npm.cmd run test:iseol-browser-e2e` passed. The browser report included two isolated accounts, live user notification stream, project/learning/collaboration/growth/portfolio journeys, Runtime approval/recovery paths, and responsive `[390,768,1024,1440]` over `13` routes.
- `git diff --check` passed with exit `0`; the command emitted only pre-existing Git LF→CRLF normalization warnings.

### Scope and safety boundary

- The journal is enabled only when the server has an explicit `eventJournalRoot`, or when a configured `platformRoot` derives its separate `web-events` child. The existing no-root bus remains live-only for compatibility.
- No operational Runtime/Agent process was stopped, restarted, or repaired. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, existing durable operational records, external AI/providers/connectors, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts were not changed.

## 2026-09-28 continuation: community moderation report intake

### Completed in this unit

1. Added a durable `CommunityReport` contract and Community store records for published post/comment reports. Target authors are resolved from persisted content; self-reports, foreign targets, mismatched comment/post pairs, and invalid bounded reasons fail closed. Repeated reports by the same reporter for the same target reuse one open report.
2. Added authenticated `POST /api/user/community/:postId/report` and typed `reportCommunityContent` client access. Reports have no public list route and do not enter public post/comment payloads.
3. Added existing-pattern Community controls for post/comment reporting, bounded reason entry, API error handling, and truthful saved status. The reported content remains visible and unchanged.
4. Added a two-account isolated browser journey proving report persistence, reload-safe target content, and that the other account cannot see the private report reason.
5. Keyed report drafts and busy state by target type and target id so post and comment report controls remain independent within one browser session.

### TDD and verification

- RED reproduced the missing service producer, route/client method, and UI controls; GREEN focused service/UI coverage passed `9/9`.
- `npm.cmd run test:iseol-user-product`: `287/287` passed.
- `npm.cmd test`: `666/666` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Focused browser reported `communityModerationUi: "passed"`; full isolated browser E2E passed every reported journey, including two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

## 2026-09-28 continuation: durable user notification SSE replay

### Completed in this unit

1. Added an owner-scoped durable notification stream journal under each user's notification root. Created/read transitions receive stable event identities and are stored atomically alongside the existing notification record; duplicate notification producers remain idempotent.
2. Added cursor-filtered `NotificationService.listStreamEvents`. Unknown or foreign cursors return an empty replay and never expose another user's events or fabricate history.
3. Updated the authenticated notification SSE route to read `Last-Event-ID` only after bearer authentication, subscribe before replay, buffer concurrent live events, and de-duplicate an event appearing in both the replay result and live buffer.
4. Updated the browser stream helper to retain the last received event id for the current stream and send it on reconnect. Notification REST snapshots remain the canonical UI state and no private notification content is placed in browser storage or SSE frames.

### TDD and verification

- RED reproduced the missing durable replay interface, missing server replay, and missing browser cursor header. GREEN focused notification/service/stream/UI coverage passed `13/13`, including owner isolation and replay/live-race de-duplication.
- `npm.cmd run test:iseol-user-product`: `288/288` passed.
- `npm.cmd test`: `666/666` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Focused `growth-notifications` browser verification and the full isolated browser E2E passed every journey, including `liveUserNotificationStream: "passed"`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- `git diff --check` passed. No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

### Scope and safety boundary

- This unit implements moderation report intake only. It does not add an operator moderation queue/resolution workflow or external moderation integration, and it does not treat reports as growth evidence, learning evidence, or portfolio evidence.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers, deployment/push state, and approved design-source uncertainty remained untouched. No process restart, UNKNOWN replay, external mutation, data deletion, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: community comment notifications

### Completed in this unit

1. Added an owner-scoped `community-comment` notification contract with bounded copy, persisted post/comment/actor identity, idempotency by comment identity, and the existing user notification stream publication.
2. Wired comment creation to read the persisted post owner and `notifications.newMessage` setting. The commenter is never notified about their own comment; muted owners are skipped; notification failures do not discard an already durable public comment.
3. Added the approved notification-bell route so a comment notification is read through the authenticated API and returns the user to `/app/community`. No replacement dashboard or private comment content was introduced.
4. Extended the real two-account browser journey and added a dedicated `community-comment-notification` focus.

### TDD and verification

- RED tests first reproduced the missing service method, owner notification producer, and browser journey contract.
- Focused service/UI checks passed `14/14`.
- `npm.cmd run test:iseol-user-product`: `284/284` passed.
- `npm.cmd test`: `666/666` passed.
- `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed. The UI build retained only the existing Vite native-config and chunk-size warnings.
- Focused browser verification reported `communityCommentNotificationUi: "passed"`; full isolated browser E2E passed every reported journey, including the new notification flow, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: Project Workspace line-numbered preview

- The real bounded Project Workspace text preview now renders source lines with stable, non-selectable line-number spans and accessible `파일 줄 번호 N` labels. The underlying file content is unchanged, remains escaped by React, stays inside the existing read-only `<pre>`, and is still fetched only after the owner explicitly selects `파일 열기`.
- Evidence: `user-ui/src/pages/Projects.tsx`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The focused UI contract passed `6/6`; user-product regression passed `276/276`; root regression passed `663/663`; TypeScript and approved user UI builds passed; and the isolated browser E2E passed the real Local Agent `package.json` preview with line 1 verified by `[aria-label="파일 줄 번호 1"]`, alongside the existing two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: learning report to portfolio publication bridge

- A verified learning outcome can now be carried into the owner's selectable Portfolio evidence projection. `src/portfolio/service.ts` reads only the authenticated user's verified `LearningReport.verifiedOutcomes` through the injected `LearningService`, records a bounded `learning-report` evidence item with the report identity and local provenance, and omits the internal report identity from public portfolio views.
- The Learning screen exposes an explicit `학습 보고서를 포트폴리오 초안으로 저장` action only when verified outcomes exist. The Portfolio screen now exposes a stable, entry-specific edit control so the user can explicitly change the draft to public; the public API and public route then show only verified evidence. It does not auto-publish, grant XP, dispatch Runtime work, or treat self-report outcomes as verified evidence.
- TDD RED reproduced missing learning evidence, the missing UI action, the missing learning-report count, and the missing stable edit locator. GREEN focused portfolio/report/UI coverage passed `11/11`; the product regression passed `272/272`; root regression passed `663/663`; root TypeScript and approved user UI builds passed; focused browser `learningReportPortfolioDraftUi: passed`; and full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/portfolio-learning-report.test.ts`, `tests/user-ui-learning-report-contract.test.ts`, `tests/user-ui-portfolio-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Operational PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: public product information routes

- Removed three dead landing-page footer links (`href="#"`) and added real local `/terms`, `/privacy`, and `/help` routes. The new information surface uses the approved NPC visual language while documenting the current user-data, approval, Runtime, external-connector, public-portfolio, and deferred AI Broadcast Room boundaries without claiming unavailable capabilities.
- Added browser coverage for all three information routes, HTTP 200 responses, key content, and the existing 404 route. Focused contract coverage passed `2/2`; focused browser `informationRoutesUi: passed`; user-product regression remained `272/272`; root TypeScript build and approved UI build passed; and the full isolated browser E2E passed every journey with `informationRoutesUi: passed`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Evidence: `user-ui/src/pages/Information.tsx`, `user-ui/src/pages/Landing.tsx`, `user-ui/src/app/routes.ts`, `tests/user-ui-landing-links-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: authenticated password change and session revocation

- Password change is **B — locally implemented, authenticated, durably persisted, session-revoking, and isolated-browser verified**. The flow verifies the current credential with the existing timing-safe password boundary, writes a new salt/hash, revokes every active session for the user, and returns a bounded success envelope.
- The Settings screen now collects current/new/confirmation passwords, explains that all existing sessions end, signs the browser out, returns to login, rejects the old password, and accepts the new password. The web server route allowlist was also wired after the first integration RED exposed a `404` boundary.
- Evidence: `src/identity/store.ts`, `src/platform-user/service.ts`, `src/platform-user/contracts.ts`, `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/platform-user-auth.test.ts`, `tests/user-ui-settings-contract.test.ts`, `tests/user-ui-auth-boundary-contract.test.ts`, `tests/iseol-user-journeys.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused auth/UI/server coverage passed `12/12`; user-product `270/270`; root `663/663`; root and user UI builds passed; and full isolated browser E2E passed `passwordChangeUi` plus all existing journeys with responsive `[390,768,1024,1440]` coverage across 13 routes.
- TDD/debug evidence: the initial RED showed a missing service method and a route `404`; the service/store/router implementation and server dispatch allowlist then produced GREEN. No operational Runtime/Agent restart, UNKNOWN replay, Ollama or external-provider request, XP projection, approved-design change, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, and durable operational records remained untouched.

## 2026-09-28 continuation: owner-scoped Personal AI profile Runtime context

- The existing authenticated AI profile settings are now connected to the real Personal AI request path. `src/ai-chat/service.ts` reads only the current user's bounded name, personality, tone, and role from `AiAgentProfileService`; `src/ai-chat/contracts.ts` carries that metadata in the private `AiChatContextSnapshot`; and `src/ai-chat/local-runtime.ts` passes it to the loopback model as style guidance only.
- The local adapter explicitly keeps profile metadata below the safety, privacy, authorization, and execution-policy boundary. A profile cannot grant data access, approve an execution plan, dispatch a Run, or change the local-only endpoint policy. Runtime composition now injects one owner-scoped profile service in both `src/runtime/iseol-runtime-services.ts` and `scripts/iseol-user-ui-isolated-server.ts`.
- RED reproduced a Runtime dispatch with no authenticated AI profile. GREEN focused AI Chat/profile coverage passed `33/33`; product regression passed `267/267`; root regression passed `663/663`; TypeScript and approved UI builds passed; and the new isolated browser focus `aiAgentProfileUi: passed` verified Settings save, reload persistence, and the configured name rendered in `/app/ai-chat` before sending a message.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/pages/Settings.tsx`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-local-runtime.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Safety boundary: Ollama was not running or called, so live model generation remains unverified. No operational Runtime/Agent restart, external AI/provider request, UNKNOWN replay, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Operational PIDs `1708`/`22416`, stale PID `55000`, configured dataRoot, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: project lifecycle activity provenance

- The Project → Task → Run → Artifact → Revision → Deployment → ActivityEvent chain now records owner-scoped lifecycle activity after a completed Run. `src/project-model/user-project-service.ts` maps only identity-bound Harness evidence into `project.artifact.recorded`, `project.revision.recorded`, and `project.deployment.recorded` events.
- Events are `system` + `verified`, carry project/Run/evidence identities, do not grant additional Growth/XP, and remain idempotent on repeated project reads. Original evidence IDs are retained in payloads; the ActivityEvent source identity uses a deterministic hash so path-like evidence IDs cannot violate the activity source ID contract.
- RED reproduced the missing lifecycle ledger records; the first integration regression exposed a real path-like evidence ID boundary. GREEN focused Project lifecycle/API/isolated Core+Desktop Agent integration passed `21/21`; user-product passed `265/265`; root passed `663/663`; root/UI builds passed; and full isolated browser E2E passed Project Runtime growth/portfolio, activity timeline, Runtime/Agent approval/recovery, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, lock repair, Ollama startup, external AI/provider request, UNKNOWN replay, external deployment, design change, push, or AI Broadcast Room implementation occurred. Operational PID `1708`, Agent PID `22416`, stale PID `55000`, configured dataRoot, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: local AI execution-plan envelope

- The loopback Ollama AI Chat adapter now supports the existing owner-scoped execution-plan contract. `src/ai-chat/local-runtime.ts` accepts a bounded JSON envelope only when the local model explicitly returns `assistantContent` plus `executionPlan`; normal plain-text replies remain unchanged.
- Plan steps are limited to `read|write|run|external`, bounded title/description/step counts, and carry `approvalRequired`; malformed envelopes remain durable `waiting` with a bounded blocker. The adapter does not approve plans, create Work Requests, dispatch Runs, execute code, or call anything outside the configured loopback Runtime.
- Evidence: `src/ai-chat/local-runtime.ts`, `tests/ai-chat-local-runtime.test.ts`, existing `src/ai-chat/service.ts` / API/UI plan approval path. RED reproduced raw JSON being persisted as assistant text; GREEN AI Chat focused suite passed `28/28`; `npm.cmd run test:iseol-user-product` passed `264/264`; `npm.cmd test` passed `663/663`; root/UI builds passed; focused browser `aiChatExecutionPlanUi: passed`; full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, Ollama startup, external AI/provider request, UNKNOWN replay, approval mutation, Run creation, deployment, push, design change, or AI Broadcast Room implementation occurred. Operational PID `1708`, Agent PID `22416`, stale PID `55000`, configured dataRoot, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-27 continuation: Project Run resume/retry activity provenance

### Completed in this unit

1. Added `project.run.resumed` after a waiting Run is durably resumed and its Work Request returns to `running`.
2. Added `project.run.retried` after a failed Run is durably moved into the next retry state, including the Runtime-unavailable path that remains `waiting`.
3. Kept both events owner-scoped, user-attributed, `unverified`, and outside Growth/XP. They record an owner action, not Runtime success, mastery, or verified contribution. Resume identity is tied to the durable waiting checkpoint; retry identity is tied to the durable retry cycle.
4. Bound retry activity identity to the durable retry cycle (`<runId>:retry:<cycle>`) so later retry cycles cannot overwrite the first audit record. Existing initial request/completion evidence and Run identity are unchanged.

### TDD and verification

- RED focused API test reproduced zero resume/retry activity events.
- GREEN focused project API + execution coverage passed `23/23`.
- Full isolated browser E2E passed `projectRuntimeFailureRecoveryUi` with the retry activity assertion, alongside all existing journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Product regression passed `256/256`; root regression passed `663/663`; TypeScript build passed after fixing retry-cycle narrowing; UI build passed with only existing Vite warnings.

### Scope and safety boundary

- This unit adds local durable recovery provenance only. It does not force-stop Runs, restart Runtime/Agent, replay UNKNOWN work, call Ollama/external providers, grant XP, alter approved UI, or implement the deferred AI Broadcast Room.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers, deployment/push state, and approved design-source uncertainty remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: Project Task dependency execution boundary

- Project Task dependencies are now **B — user-visible, durably persisted, owner-scoped, and isolated-browser verified**. The approved Project Workspace exposes a dependency planner, sends `dependencies` through the user API, restores the graph after reload, and labels each dependent task with its prerequisites.
- `src/project-model/user-project-service.ts` now applies the dependency guard before build approval or Runtime enqueue. An incomplete prerequisite transitions the dependent request to durable `waiting` with an explicit blocker and creates no Run or `project.run.requested` evidence. Existing scheduler dependency checks remain unchanged.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `src/project-model/user-project-service.ts`, `src/project-model/work-request.ts`, `tests/user-project-api.test.ts`, `tests/user-ui-project-workspace-mobile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project API/execution/work-request coverage passed `36/36`; dependency UI contract passed `2/2`; user-product `258/258`; root `663/663`; both builds passed; and full isolated browser E2E passed `projectTaskDependencyUi` plus all existing journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, UNKNOWN replay, Ollama or external-provider request, XP projection, approved-design change, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, and durable operational records remained untouched.

## 2026-09-28 continuation: explicit Project queue scheduler

- The Project Workspace now exposes an **explicit, user-triggered bounded queue scheduler**. `POST /api/user/projects/:id/schedule` selects only queued Work Requests whose dependencies are completed, clamps `maxConcurrent` to `1..8`, subtracts already-running durable Runs from the available slots, creates durable Run identities through the existing approval and Runtime boundary, and never runs automatically during Runtime startup or recovery.
- The approved user UI adds `ProjectQueueScheduler`: the user chooses the concurrency limit, sees a truthful queue result (`selected` / `started` / `waiting`), and receives an explicit Build Run approval checkpoint before any Runtime dispatch. Runtime-unavailable or preflight-blocked work remains durable `waiting` rather than being reported as success. Competing scheduler calls for the same project are serialized in the service process and re-read durable Work Request state before selecting again, preventing duplicate Run creation; different projects retain independent scheduling lanes.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-api.test.ts`, `tests/user-ui-project-workspace-mobile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/API/execution/work-request/UI contracts passed `42/42`; scheduler browser focus passed; full isolated browser E2E passed all journeys including the scheduler, active-Run concurrency guard, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes; user-product `262/262`; root `663/663`; root TypeScript and approved user UI builds passed.
- Safety boundary: no operational Runtime/Agent restart, UNKNOWN replay, Ollama or external-provider request, XP projection, approved-design change, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, and durable operational records remained untouched.

## 2026-09-28 continuation: AI team discussion request provenance

- AI team technical discussion requests are **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the activity-evidence slice. After a completed or Runtime-waiting discussion is durably saved, `src/ai-team/discussion-service.ts` records one `ai.team.discussion.requested` ActivityEvent.
- The event is user-attributed and `unverified`, bounded to project/team/discussion/request/agent/status identities, and does not grant XP or create a Work Request. Repeated requests with the same request ID return the existing discussion without duplicating the event.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/discussion-service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-team-discussion-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused discussion/API/UI contracts passed `4/4`; user-product `256/256`; root `663/663`; both builds passed; and full isolated browser E2E passed the AI-team discussion journey with durable reload verification and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, UNKNOWN replay, Ollama or external-provider request, XP projection, approved-design change, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, and durable operational records remained untouched.

## 2026-09-28 continuation: AI team proposal acceptance provenance

- AI team proposal acceptance is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the human-approval provenance slice. After the accepted proposal and queued Work Request are durably saved, `src/ai-team/service.ts` records one `ai.team.proposal.accepted` ActivityEvent.
- The event is user-attributed and `unverified`, carries only project/team/proposal/Work Request/agent identities, and does not grant XP or start a Run. Repeated acceptance returns the existing proposal and does not duplicate the event.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-team-proposals-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused AI-team proposal/API/UI contracts passed `5/5`; user-product `256/256`; root `663/663`; both builds passed; and full isolated browser E2E passed the AI-team proposal execution-approval journey, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, UNKNOWN replay, Ollama or external-provider request, XP projection, approved-design change, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, and durable operational records remained untouched.

## 2026-09-27 continuation: learning → project application provenance

### Completed in this unit

1. Added the missing provenance edge for accepting a Learning → Project application. After the application, LearningLink, and linked Work Request are durably saved, `src/learning/service.ts` records one `learning.project.application.accepted` ActivityEvent.
2. Kept the event owner-scoped, user-attributed, `unverified`, and bounded to goal/project/proposal/Work Request identities. It does not grant XP, claim mastery, or claim project execution.
3. Preserved idempotency for repeated acceptance of the same proposal; the durable link and activity projection are not duplicated.
4. Extended the isolated browser learning journey to verify the event after navigation/reload boundaries.

### TDD and verification

- RED focused API test reproduced zero matching events; GREEN focused learning-application API coverage passed `1/1`.
- Full isolated browser E2E passed all reported journeys, including `learningProjectApplicationUi`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- `npm.cmd run test:iseol-user-product`: `254/254` passed.
- `npm.cmd test`: `663/663` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only the existing Vite native-config and chunk-size warnings.

### Scope and safety boundary

- This unit adds only a local durable learning-to-project audit edge. It does not dispatch an operational Runtime request, call Ollama or an external AI/provider, grant XP, alter approved design, replay UNKNOWN work, change the stale lock, or implement the deferred AI Broadcast Room.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, durable operational data, external providers, deployment/push state, and approved design-source uncertainty remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: owner-controlled Project Run pause checkpoint

### Completed in this unit

1. Added an authenticated, project-owner-only `POST /api/user/projects/:id/runs/pause` boundary. A running or ready durable Run transitions to `PAUSED`, the linked Work Request projects to `waiting`, and the same Run identity remains available for resume.
2. Added `pauseHarnessRun` and a supervisor checkpoint guard. An executor already in flight is not force-terminated; its stale result cannot overwrite the user pause. If the owner resumes before that executor returns, the stale result is discarded and the same durable checkpoint is started again.
3. Added the approved Project Workspace control flow: `실행 중단` confirmation, explicit no-force-termination copy, reload-safe `Run 재개`, and owner/foreign-user boundaries. No generic dashboard redesign was introduced.
4. Recorded one bounded, user-attributed, `unverified` `project.run.paused` ActivityEvent per durable pause checkpoint. Pause/resume does not grant XP or claim verified execution.

### TDD and verification

- RED reproduced the missing pause API/UI and then reproduced the in-flight pause→resume race (`Stage completion requires RUNNING status, got READY`).
- GREEN focused Harness/project/API/UI coverage passed `48/48`.
- `npm.cmd run test:iseol-user-product`: `280/280` passed.
- `npm.cmd test`: `665/665` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only the existing Vite native-config and chunk-size warnings.
- Focused browser verification passed `projectRuntimePauseUi`. Full isolated browser E2E passed every reported journey, including `projectRuntimePauseUi`, two-user isolation, reload persistence, responsive `[390,768,1024,1440]` coverage, and `13` routes.

### Scope and safety boundary

- The pause-gate Runtime is an isolated browser-test Runtime only. The operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, and durable operational data were not changed or restarted.
- No UNKNOWN replay, Ollama or external AI/provider request, connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. AI Broadcast Room remains deferred.

## 2026-09-28 continuation: Project Workspace bounded file preview

- Project Workspace now provides a user-triggered, read-only text preview for files already discovered in the authenticated user's visible workspace. `GET /api/user/projects/:id/files?path=...` reuses the existing owner/team ACL, returns only canonical workspace-relative paths, rejects traversal, symbolic links, secret-like names, non-regular files, files over 128 KiB, NUL-containing content, and invalid UTF-8, and returns an explicit unavailable state instead of exposing content.
- The approved user UI keeps the existing workspace file inventory and adds `파일 열기`; content is fetched only after an explicit click and rendered in a bounded `<pre>` marked `읽기 전용`. No file mutation, execution, download, or fake file data is introduced.
- Evidence: `src/project-model/workspace-files.ts`, `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused service/API/UI tests passed `36/36`; browser contract passed `1/1`; user-product `276/276`; root `663/663`; TypeScript and approved user UI builds passed; full isolated browser E2E passed the real local Agent project flow through file selection and preview, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: timezone-aware learning review scheduling

### Completed in this unit

1. Added a regression for a New York spring-forward transition and verified the pre-fix UTC-24-hour calculation returned the wrong local time.
2. Added `addCalendarDays` in `src/learning/service.ts`, using bounded `Intl.DateTimeFormat` offset resolution and a safe existing fallback for missing/invalid timezone metadata.
3. Applied the helper only to `reviewItem` next-due calculation; review interval policy, persistence, ACL, activity provenance, and UI behavior remain unchanged.
4. Added a fall-back transition regression so both DST directions preserve the learner's local calendar schedule.

### TDD and verification

- Focused `tests/learning-review-flow.test.ts`: `4/4` passed.
- `npm.cmd run test:iseol-user-product`: `301/301` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `learningReviewScheduling`, all existing user journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- `git diff --check` returned exit `0`.

### Scope and safety boundary

- No Ollama or external provider request was made. This unit changes only local calendar arithmetic for durable review scheduling.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, approved design sources, and deferred AI Broadcast Room artifacts remained untouched. No process restart or external mutation occurred.

## 2026-09-28 continuation: Learning syntax-only evidence boundary

### Completed in this unit

1. Traced the learning feedback path and confirmed that a `local-syntax-verifier` receipt could previously be promoted to verified correctness feedback merely because it contained artifact references.
2. Added a regression proving syntax-only evidence remains tentative when a feedback request asks for verified correctness or mastery.
3. Added a minimal service guard: `local-syntax-verifier` evidence cannot satisfy the correctness-verifier requirement; existing artifact evidence and environment-required handling remain intact.
4. Kept the boundary explicit: no correctness executor, test runner, or external AI/provider was introduced in this unit.

### TDD and verification

- RED: `tests/learning-feedback-evaluator.test.ts` failed as expected before the guard; the test input was corrected from an invalid legacy value to the current `correct` contract before implementation.
- GREEN: focused feedback regression `5/5` passed; broader learning/provenance contract set `21/21` passed.
- `npm.cmd run test:iseol-user-product`: `307/307` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- A focused project browser journey passed. The first full isolated E2E run hit a transient approval-view timeout; after the focused check, a fresh full run passed all product journeys, including learning syntax verification, feedback dispute, review scheduling, evidence projection, project runtime approval/execution/failure recovery, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: authenticated Markdown activity export surface

### Completed in this unit

1. Extended the existing owner-scoped Settings data-management flow to expose the already-supported Markdown activity export beside JSON.
2. Kept the server-provided filename and content authoritative; the UI only downloads the authenticated response and does not create a parallel activity store.
3. Added a separate Markdown completion status while preserving the existing JSON button behavior and account-deletion boundary.
4. Strengthened the browser journey to parse the downloaded JSON `events` array and inspect the Markdown file heading, rather than checking filenames alone.

### TDD and verification

- RED: `tests/user-ui-settings-contract.test.ts` failed because the Settings source had no Markdown export call or button.
- GREEN: focused API/settings checks passed `2/2`.
- `npm.cmd run test:iseol-user-product`: `308/308` passed.
- `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed `activityExportDownload` with JSON parsing and Markdown content checks, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: durable cross-instance learning session CAS

- Learning session mutation safety is now **B — owner-scoped, durable, cross-service-instance serialized, API/UI propagated, and isolated-browser verified**. The existing in-process promise tail remains, and `src/learning/session-lock.ts` adds an exact owner/session filesystem lock below the learning data root before resume/completion reads and writes.
- A competing service instance receives the existing bounded `Learning session revision conflict` rather than overwriting the session. Lock metadata is bounded to version/PID/token/timestamp; normal and exceptional paths remove the exact lock in `finally`, while a dead owner PID can reclaim only that exact session lock. Active owner processes and malformed lock records fail closed.
- Evidence: `src/learning/session-lock.ts`, `src/learning/service.ts`, `tests/learning-session-completion.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-session-durable-cas-lock.md`.
- Verification: RED reproduced two concurrent completions across two service instances; GREEN learning coverage `69/69`, user-product regression `315/315`, serial root regression `678/678`, root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E all passed. Browser coverage included `learningSessionCompletion: "passed"`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: this is a same-host filesystem lock, not a distributed or cross-machine coordinator, and it does not claim provider-side exactly-once semantics. Content correctness, live Runtime throughput, external connectors, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain bounded/deferred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, and approved design artifacts remained untouched.

## 2026-09-28 continuation: durable learning content reservation

### Completed in this unit

- Learning session content request creation and completion now use the owner/session mutation tail plus the exact durable session lock. A bounded wait mode is available only for these idempotent content operations; ordinary session CAS mutations remain fail-fast on an active competing lock.
- The lock is released before the explicitly injected local content Runtime dispatcher is called. A second service instance therefore observes the persisted request and returns the same identity without dispatching a duplicate request. Duplicate completion callbacks reload the validated request and do not create another lesson or session revision.

### TDD and verification

- RED: the new reservation-boundary test reproduced a content request being persisted while a competing session lock was held.
- GREEN: focused learning content coverage passed `5/5`; full user-product regression passed `318/318`; serial root regression passed `678/678`; root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E all passed. Browser E2E reported `learningGoalContent`, `learningSessionCompletion`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Evidence: `src/learning/session-lock.ts`, `src/learning/service.ts`, `tests/learning-content-request.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-content-reservation-lock.md`.

### Scope and safety boundary

- The boundary is same-host/shared-root only. It does not claim cross-machine distributed locking, provider-side exactly-once delivery, lesson correctness, or mastery. No external AI/provider request, live connector request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, data deletion, deployment, push, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, approved design artifacts, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: durable Project Work Request idempotency

### Completed in this unit

- Lower-level Project Work Request creation now serializes the list/validate/save sequence under an exact hashed `projectId + idempotencyKey` lock below the project model root. Concurrent service instances converge on one durable Work Request identity; a differing payload for the same key remains an explicit idempotency conflict.
- Dependency existence checks, task node reconciliation, user attribution, activity evidence, and the existing per-file write queue remain unchanged. The lock metadata is bounded to version/PID/token/timestamp, preserves active or malformed owners, reclaims only dead owner PIDs at the exact lock path, and cleans up in `finally`.

### TDD and verification

- RED: the new creation-boundary test reproduced durable mutation while a competing idempotency lock was held.
- GREEN: focused Project Work Request coverage passed `14/14`; full user-product regression passed `319/319`; serial root regression passed `680/680`; root and user UI TypeScript checks, backend build, `git diff --check`, and isolated browser E2E all passed. Browser E2E reported project Runtime execution, learning content/session completion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Evidence: `src/project-model/work-request-lock.ts`, `src/project-model/work-request.ts`, `tests/project-work-request.test.ts`, and `docs/superpowers/plans/2026-09-28-project-work-request-idempotency-lock.md`.

### Scope and safety boundary

- This is same-host/shared-root Work Request creation serialization only. It does not claim database or cross-machine distributed semantics, provider-side exactly-once delivery, live operational Runtime throughput, or automatic execution. No external AI/provider request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, data deletion, deployment, push, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, approved design artifacts, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: durable project queue scheduling

### Completed in this unit

- Project queue scheduling now uses the existing per-service project promise tail plus an exact project-scoped durable lock below `projectModelRoot/.locks/project-schedules`. A second service instance waits for the first owner-triggered scheduler to finish, re-reads the durable project state, and no longer selects the same queued Work Request twice.
- Lock metadata is bounded to version/PID/token/timestamp, active owner processes and malformed records are preserved, dead owner PIDs can reclaim only the exact project lock, and cleanup is performed in `finally`. The existing `1..8` concurrency limit, dependency gating, Build Run approval, explicit user trigger, Run identity, and Runtime waiting states remain unchanged.

### TDD and verification

- RED: the new cross-service scheduler test reproduced two enqueue calls while the first service was held before its Work Request transition.
- GREEN: focused user-project execution coverage passed `19/19`; full user-product regression passed `319/319`; serial root regression passed `678/678`; root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E all passed. Browser E2E reported project Runtime execution, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Evidence: `src/project-model/schedule-lock.ts`, `src/project-model/user-project-service.ts`, `tests/user-project-execution.test.ts`, and `docs/superpowers/plans/2026-09-28-project-scheduler-durable-lock.md`.

### Scope and safety boundary

- This is same-host/shared-root queue-selection serialization only. It does not claim live operational Runtime throughput, cross-machine distributed locking, provider-side exactly-once delivery, automatic startup/recovery scheduling, or successful execution when the Runtime is unavailable. No external AI/provider request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, data deletion, deployment, push, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, approved design artifacts, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: serialize user notification writes

### Completed in this unit

- Added a process-local per-user/source Promise tail around notification load → save → stream-publish sequences, including owner-scoped read transitions. Concurrent producers for the same durable source now converge on one notification and one bounded `created` event.
- Kept notification source payloads, settings gates, owner isolation, SSE replay contracts, and approved UI unchanged. Weekly digest remains intentionally unimplemented because its scheduler/selection specification is still absent.

### TDD and verification

- RED: concurrent direct-message notification creation returned two different notification IDs before the keyed lock.
- GREEN: focused notification/service/API/SSE/UI checks passed `15/15`; TypeScript, root build, and user UI build passed with only the existing Vite warnings.
- Full user-product regression ran `312` tests: `309` passed and `3` existing Learning Session Revision expectation tests failed; notification-related tests passed. Root regression passed `678/678`.
- Full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes, including direct/team/achievement/live-stream notifications.
- Feature commit: `fix: serialize user notification writes`.

### Scope and safety boundary

- The lock is process-local and does not claim cross-process distributed exactly-once behavior. Weekly digest production remains unspecified/deferred; AI Broadcast Room remains deferred.
- No external AI/provider request, external connector mutation, operational Runtime/Agent restart/recovery, stale-lock repair, UNKNOWN replay, deployment, push, data deletion, or approved-design change occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, dataRoot, stale PID `55000`, UNKNOWN/durable records, and approved design sources remained untouched.

## 2026-09-28 continuation: enforce Learning Session revision CAS

### Completed in this unit

- Added a durable numeric `LearningSession.revision` with owner-scoped, process-local mutation serialization. Session resume, content-state transitions, and completion increment the revision; callers can supply `expectedRevision` and stale writes fail closed with a bounded conflict.
- Preserved terminal completion idempotency, owner isolation, durable restart behavior, activity/growth attribution, and the existing no-external-provider boundary.
- Propagated the latest session revision through the authenticated Learning API and UI resume/completion actions. Stale API mutations map to HTTP `409` rather than overwriting the current session.

### TDD and verification

- RED coverage established stale completion and concurrent completion races before the CAS guard; focused Learning Session coverage passed `8/8` after implementation.
- Full user-product regression passed `313/313`; serial root regression passed `678/678`.
- Root and user UI TypeScript checks, `npm.cmd run build`, and `npm.cmd run user-ui:build` passed. User UI build retained only the existing Vite native-config and chunk-size warnings.
- Full isolated browser E2E passed all journeys, Learning Runtime/session flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Commits: `49bbfff feat: add learning session revision guards`, `acd5560 feat: enforce learning session CAS at user boundary`.

### Scope and safety boundary

- The revision lock is process-local; cross-process CAS still depends on a shared durable coordination mechanism. Learning content correctness, evaluator quality, hidden-test execution, mastery, and XP projection remain bounded by their existing evidence contracts.
- No external AI/provider request, operational Runtime/Agent restart/recovery, stale-lock repair, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, and approved design sources remained untouched.

## 2026-09-28 continuation: portfolio actor provenance labels

### Completed in this unit

1. Added the shared `actorLabel` projection for durable provenance actors: `user` → `사용자 기여`, `ai` → `AI 기여`, and `system` → `시스템 기록`.
2. Applied the projection to the authenticated Activity/Portfolio evidence view and the public Portfolio evidence view; raw actor codes are no longer the primary user-facing label.
3. Added a RED/GREEN UI contract covering both screens and kept the existing evidence identity, verification state, visibility, export, and link behavior unchanged.

### TDD, verification, and commit

- The new contract first failed because the screens exposed raw actor values, then passed `6/6` after implementation.
- `npm.cmd run test:iseol-user-product` passed `309/309`; `npm.cmd run user-ui:build` passed with only existing Vite warnings; full isolated browser E2E passed every journey, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- The previously untracked approved NPC user UI and isolated server/test surface were recorded as `6f3935f feat: add owner-scoped NPC user UI`.

### Scope and safety boundary

- No evidence was reclassified, no growth/XP/mastery value was changed, and no external AI/provider or connector request was made.
- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, deployment, push, data deletion, approved-design source change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: Learning progress UI coding-practice count

### Completed in this unit

1. Added a UI contract assertion requiring the Learning progress projection to expose the durable coding-practice count.
2. Rendered `코딩 실습 {progress.actual.codingAttempts}건` beside the existing verified/unverified/pending evidence counts.
3. Kept the copy descriptive only; it does not imply correctness, mastery, XP, or portfolio eligibility.

### TDD and verification

- RED: `tests/user-ui-learning-progress-contract.test.ts` failed because the page did not contain the coding-practice projection.
- GREEN: focused Learning progress/report/API/UI coverage passed `8/8`.
- `npm.cmd run test:iseol-user-product`: `308/308` passed.
- `npm.cmd test`: `675/675` passed in a clean serial run. The first concurrent all-suite run had two unrelated Desktop Agent timing failures; the focused `tests/desktop-agent-runtime.test.ts` rerun passed `20/20`, followed by the clean serial root pass.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed all journeys, including `learningProgressEvidence`, `learningReportUi`, coding exercise persistence, syntax verifier, pending evaluation, feedback dispute, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, and approved design sources remained untouched.

## 2026-09-28 continuation: Learning report unverified-detail projection

### Completed in this unit

1. Added a UI contract asserting that report-level unverified outcomes are rendered as detail, not only as an aggregate count.
2. Rendered each durable unverified outcome label and its evidence-reference count in the existing Learning report card.
3. Preserved the evidence boundary: no coding practice was promoted to correctness, mastery, XP, or portfolio eligibility.

### TDD and verification

- RED: `tests/user-ui-learning-report-contract.test.ts` failed because the page lacked `미검증 기록 상세` and `unverifiedOutcomes.map`.
- GREEN: focused report/API/UI coverage `4/4` passed.
- `npm.cmd run test:iseol-user-product`: `308/308` passed.
- `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed `learningReportUi`, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.

### Scope and safety boundary

- No correctness evaluator, hidden tests, operational Runtime/Agent restart, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, and approved design sources remained untouched.

## 2026-09-28 continuation: coding practice in Learning progress and reports

### Completed in this unit

1. Added the owner/session-bound `LearningProgress.actual.codingAttempts` projection so coding practice is counted separately from legacy question attempts.
2. Added local-evidence report projection for coding attempts in the requested account-timezone period. Environment-required, syntax-only, and syntax-invalid results are labeled as unverified outcomes with the durable attempt id as evidence.
3. Kept verified report outcomes restricted to existing verified study attempts; no correctness, mastery, XP, or portfolio eligibility was inferred from coding submission or syntax receipts.
4. Updated the approved Learning copy from `미검증 self-report` to `미검증 기록` so the aggregate remains truthful when it contains coding practice.

### TDD and verification

- RED: the new progress field was `undefined` and the coding attempt was absent from the report before production changes.
- GREEN: focused learning/API/UI coverage `20/20` passed.
- `npm.cmd run test:iseol-user-product`: `308/308` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed all journeys, including Learning evidence/report projection, coding syntax boundary, feedback dispute, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: portfolio export content verification

### Completed in this unit

1. Strengthened the existing isolated browser portfolio journey to parse the downloaded JSON and require the durable entry plus `entries`/`evidence` collections.
2. Added a second browser download assertion for `iseol-portfolio.md`, including the portfolio heading, saved entry title, and saved summary.
3. Kept the existing Portfolio UI, public route, visibility rules, and link fallback unchanged; this unit improves verification evidence rather than inventing a new export format.

### TDD and verification

- Portfolio API/UI journey checks passed `6/6`; root TypeScript check passed.
- Full isolated browser E2E passed `publicPortfolioRouteAndJsonExport` with JSON and Markdown content assertions, `publicPortfolioShareControl`, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.

### Scope and safety boundary

- No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: user integration consent and delivery ledger

### Completed in this unit

1. Added an owner-scoped `IntegrationDelivery` contract/store/service for Calendar, GitHub, and Discord. Delivery identity is deterministic, payloads are bounded, and dispatch uses only explicitly injected adapters.
2. Added opt-out-by-default `UserSettings.integrations`, backward-compatible normalization, authenticated integration status/delivery routes, and isolated-server composition. `unknown`, `not-configured`, and `blocked` outcomes are durable terminal observations for the same source identity.
3. Connected the approved Settings integration cards to persisted consent switches. The UI reports `어댑터 준비됨` only from configured local adapters and otherwise keeps the truthful `연동 API 미연결` state.
4. Added browser verification for two-account consent isolation, reload persistence, configured-adapter truthfulness, and local API status.

### TDD, verification, and commits

- RED tests first exposed the missing delivery service, API route, and UI contract; focused integration/settings/UI checks then passed `12/12`.
- The full `npm.cmd run test:iseol-user-product` regression passed `309/309`, and the serial `npm.cmd test -- --test-concurrency=1` root regression passed `676/676`.
- `npx.cmd tsc -p user-ui/tsconfig.json --noEmit`, `npm.cmd run build`, and `npm.cmd run user-ui:build` passed with only the existing Vite warnings.
- Full isolated browser E2E passed `integrationConsentPersistenceIsolation: "passed"` plus all existing journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Commits: `0314081 feat: add user integration delivery ledger`, `565ea8f feat: expose user integration consent status`, `5ed02e5 fix: restore user ui typecheck`, and `d6a1245 feat: wire user integration consent settings`.

### Scope and safety boundary

- No live Calendar/GitHub/Discord authorization or external delivery was attempted. No external AI/provider request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: serialize owner-scoped integration deliveries

### Completed in this unit

- Closed a real concurrency gap in `IntegrationDeliveryService`: concurrent dispatches for the same owner/provider/source identity now share one in-process delivery tail, so one durable delivery identity cannot invoke an injected provider adapter twice.
- The lock is scoped to the service instance, authenticated owner, and delivery identity. It preserves the existing fail-closed `queued`/`delivered`/`unknown`/`not-configured`/`blocked` states and does not retry an ambiguous provider outcome.

### TDD and verification

- RED: the new concurrent-delivery test reproduced two adapter calls (`2 !== 1`) before the fix.
- GREEN: integration delivery checks passed `7/7`; combined integration/API/settings/UI checks passed `13/13`.
- Full `npm.cmd run test:iseol-user-product` passed `309/309`; serial root regression `npm.cmd test -- --test-concurrency=1` passed `676/676`.
- `npm.cmd run user-ui:build` passed with only the existing Vite configuration/chunk-size warnings. Full isolated browser E2E passed `integrationConsentPersistenceIsolation` and all existing journeys, with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Commit: `43cbec9 fix: serialize integration delivery attempts`.

### Scope and safety boundary

- No live Calendar/GitHub/Discord authorization or external delivery was attempted. No external AI/provider request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: compose explicit user integration adapters

### Completed in this unit

- Extended the composed ISEOL Runtime input with explicit Calendar/GitHub/Discord `IntegrationAdapter` injection. The composed integration service now forwards only supplied adapters to the owner-scoped delivery ledger.
- The user Control Plane receives the configured provider list from those explicit adapters, so Settings can distinguish a configured local capability from the default `연동 API 미연결` state. No adapter is created or contacted by default.

### TDD and verification

- RED: the composition test observed an undefined configured-provider list and no adapter delivery before the wiring change.
- GREEN: Runtime/integration/settings/UI focused coverage passed `51/51`; TypeScript and root build passed.
- Full user-product regression passed `309/309`; serial root regression passed `677/677`; user UI build passed with only existing Vite warnings; isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Commit: `39cef53 feat: wire explicit user integration adapters`.

### Scope and safety boundary

- Only a temporary fake Calendar adapter was exercised in an isolated test root. No live Calendar/GitHub/Discord authorization or delivery, external AI/provider request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

## 2026-09-28 continuation: direct Project Run start serialization

- Status: **B — owner/project-scoped, durable, same-host cross-service direct-start serialization, and browser-regression verified; provider-side exactly-once and live operational Runtime throughput remain unverified**. `src/project-model/work-request-lock.ts` now provides a validated `<projectId>-<workRequestId>` Run-start lock below the configured project model root. `startProjectRun` re-reads the Work Request while holding that lock, and a waiting Work Request with an existing durable Run identity is returned as `already-active` instead of creating or enqueueing a second Run.
- The RED test held the first injected Runtime enqueue and reproduced two direct enqueue calls before the fix. The GREEN test proves one enqueue call, one durable Run identity, `already-active` for the competing service instance, and no durable record for the competing Run ID. Active owners remain protected, dead-owner reclamation is restricted to the exact lock, and normal/error paths clean up in `finally`.
- Evidence: `src/project-model/work-request-lock.ts`, `src/project-model/user-project-service.ts`, `tests/user-project-execution.test.ts`, and `docs/superpowers/plans/2026-09-28-project-run-start-lock.md`. Implementation commit: `4106127 feat: serialize project Run starts`.
- Verification: focused project execution `20/20`; user-product regression `320/320`; final serial root regression `680/680`; independent Idea Lab E2E rerun `4/4`; backend/user UI TypeScript checks, backend build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser E2E included project Runtime execution, learning content/session completion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Safety boundary: no operational Runtime/Agent restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remained untouched.

### Post-verification Runtime observation

- A final read-only process/port check after the regression and browser runs found PID `1708` absent, PID `22416` reused by a Codex `cua_node` process created at `11:57:28`, and ports `18890`/`18891` not listening. No command in this unit targeted either PID, and no Runtime/Agent recovery or restart was attempted. The previously recorded operational Runtime state is therefore retained as **UNKNOWN**, not reclassified as healthy or replayed.

## 2026-09-28 continuation: Project Run lifecycle lock boundary

- Project Run `start`, `resume`, `pause`, and `retry` now share one exact owner/project/Work Request durable lock below the configured project-model root. Each lifecycle action re-reads the durable Work Request and Run state while holding the lock, preserving an existing Run identity and returning `already-active` instead of enqueueing a duplicate operation.
- The lock records bounded version/PID/token/timestamp metadata, protects active owners, reclaims only the exact lock for a dead owner, and removes its exact record in `finally`. This is a same-host cross-service serialization boundary; it does not claim database, cross-machine, provider-side exactly-once, or live operational Runtime guarantees.
- Evidence: `src/project-model/work-request-lock.ts`, `src/project-model/user-project-service.ts`, and `tests/user-project-execution.test.ts`.
- Confirmed verification: lifecycle-focused `3/3`, `tests/user-project-execution.test.ts` `23/23`, user-product regression `321/321`, serial root regression `680/680`, backend/user UI TypeScript checks, backend/user UI builds, and full isolated browser E2E all passed. Browser E2E covered all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. One initial full E2E attempt hit a transient isolated AI-proposal timeout; the focused journey and immediate full rerun both passed, so no product change was inferred from that transient run.
- Safety boundary: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, external connector delivery, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service user notification idempotency

- Status: **B — owner-scoped, durable, same-host cross-service notification serialization, and isolated-product verified; external push/provider delivery and cross-machine coordination remain unverified**. Notification create and read mutations now use the existing per-service promise tail plus an exact hashed filesystem lock below the notification root. Competing service instances wait for the same identity lock, so one source identity produces one durable notification and one stream event.
- The lock stores bounded version/PID/token/timestamp metadata, preserves active owners, reclaims only an exact lock whose owner PID is dead, treats malformed records as a fail-closed conflict, and removes the exact record in `finally`. Windows `EPERM` responses for an already-open lock are normalized to bounded contention only when the lock record is still present.
- Evidence: `src/notifications/notification-lock.ts`, `src/notifications/service.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-api.test.ts`, `tests/user-notifications-stream.test.ts`, and `docs/superpowers/plans/2026-09-28-notification-durable-lock.md`.
- Verification: notification/API/SSE focus `14/14`; user-product regression `325/325`; final serial root regression `682/682`; backend and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage included notification creation/read journeys, two-account isolation, reload persistence, live user notification stream, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `f84c261 feat: serialize user notification mutations`. Documentation commit follows this implementation commit.
- Remaining boundary: this is a same-host/shared-root lock only; it does not claim a database/cross-machine coordinator, external push/provider delivery, provider-side exactly-once semantics, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project binding mutation synchronization

- Status: **B — Discord Project binding 생성/삭제가 guild와 StoredProject 조합의 durable lock 안에서 직렬화되며, 동일 binding의 idempotency와 conflicting rebind 보호를 유지한다; live Runtime/provider 실행은 여전히 검증되지 않음**. 공유 binding 파일을 동시에 변경할 때 한 target이 조용히 덮어써지는 경로를 차단했다.
- Evidence: `src/discord-project/binding-lock.ts`, `src/discord-project/binding-store.ts`, `tests/discord-project-binding.test.ts`.
- TDD: RED에서 binding lock 모듈 부재를 확인했고, GREEN에서 lock 대기, stale owner 정리, 생성/삭제 경계 직렬화와 현재 binding 보존을 검증했다.
- Verification: Discord Project 관련 회귀 `41/41`; 전체 테스트 `728/728`; backend `tsc` build와 `git diff --check` 통과.
- Implementation commit: `66878d0 fix: synchronize Discord project binding writes`; merged by PR #108 with merge commit `249d827`.
- Boundary: same-host/shared-root Discord Project binding 생성/삭제 mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Personal Memory document synchronization

- Status: **B — Personal Memory public reads, writes, lists, and deletes now coordinate through canonical per-memory locks, while live Runtime/provider execution remains unverified**. private/shared projections use unlocked helpers after acquiring the same memory lock.
- Evidence: `src/memory/store.ts`, `src/memory/memory-lock.ts`, `src/memory/service.ts`, `tests/personal-memory-isolation.test.ts`, `tests/personal-memory-sharing.test.ts`.
- TDD: RED reproduced public Memory access completing while the per-memory lock was held; GREEN added locked public store boundaries, fixed private/shared/update/delete reentrancy, and preserved bounded lock waiting.
- Verification: Personal Memory isolation/sharing focused regression `11/11`; serial full test suite `752/752`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `f644546 fix: synchronize memory document store`; merged by PR #160 with merge commit `c872f4b`.
- Boundary: same-host/shared-root Personal Memory document coordination and existing team-sharing ACL only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Team Proposal/Discussion document synchronization

- Status: **B — AI Team Proposal and Discussion public stores now coordinate reads and writes through canonical requestId locks, while live Runtime/provider execution remains unverified**. service request/list paths use internal unlocked helpers after acquiring the same lock.
- Evidence: `src/ai-team/store.ts`, `src/ai-team/discussion-store.ts`, `src/ai-team/proposal-lock.ts`, `src/ai-team/discussion-lock.ts`, `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `tests/ai-team-proposals.test.ts`, `tests/ai-team-discussion.test.ts`.
- TDD: RED reproduced public Proposal/Discussion store access completing while the request lock was held; GREEN added locked public read/write/list boundaries, fixed request/list projection reentrancy, and preserved bounded EPERM retry.
- Verification: AI Team Proposal/Discussion focused regression `13/13`; serial full test suite `752/752` on rerun after one non-reproduced flaky first run; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `567acc9 fix: synchronize AI team document stores`; merged by PR #158 with merge commit `7d323f9`.
- Boundary: same-host/shared-root AI Team Proposal/Discussion document coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Workspace document write synchronization

- Status: **B — Project Workspace public writes now wait on the canonical durable Workspace lock, while live Runtime/provider execution remains unverified**. purpose/team/task/Run attachment paths use an internal unlocked helper after acquiring the same lock.
- Evidence: `src/project-model/workspace-store.ts`, `src/project-model/workspace-lock.ts`, `src/project-model/user-project-service.ts`, `src/project-model/workspace-run-preparation.ts`, `tests/project-model-stores.test.ts`, `tests/user-project-execution.test.ts`.
- TDD: RED reproduced Workspace writes completing while the Workspace lock was held; GREEN added the locked public write, fixed purpose/team/task/Run attachment reentrancy, updated lock-held test mutation to use the unlocked helper, and preserved bounded lock waiting.
- Verification: Project/Discord/Web focused regression `105/105`; serial full test suite `752/752`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ce52f62 fix: synchronize Project Workspace writes`; merged by PR #156 with merge commit `14b4865`.
- Boundary: same-host/shared-root Project Workspace document write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Campaign document write synchronization

- Status: **B — Idea Lab Campaign public writes now wait on the canonical durable Campaign lock, while live Runtime/provider execution remains unverified**. supervisor and Web action writes use an internal unlocked helper after acquiring the same lock.
- Evidence: `src/idea-lab/campaign-store.ts`, `src/idea-lab/campaign-lock.ts`, `src/idea-lab/campaign-supervisor.ts`, `src/web-control-plane/idea-lab-actions.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced Campaign writes completing while the Campaign lock was held; GREEN added the locked public write, fixed supervisor/Web action reentrancy, and preserved bounded EPERM retry.
- Verification: Idea Lab store/supervisor/Web/runtime/e2e focused regression `48/48`; serial full test suite `751/751`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `b8eae6a fix: synchronize Idea Lab campaign writes`; merged by PR #154 with merge commit `ae40328`.
- Boundary: same-host/shared-root Idea Lab Campaign document write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Study submission read synchronization

- Status: **B — Study Space detail reads now keep the canonical Team membership → Study space → personal Submission lock order and reload each task answer before projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent personal answer save cannot leave a member with an unlocked stale submission in the Study Space view.
- Evidence: `src/study/service.ts`, `src/study/submission-lock.ts`, `src/study/space-lock.ts`, `src/teams/membership-lock.ts`, `tests/study-space.test.ts`.
- TDD: RED reproduced Study Space detail reads completing while the personal submission lock was held; GREEN added the per-submission lock/reload boundary and verified the latest answer after release.
- Verification: Study Space regression `9/9`; Study API/Team/Collaboration related coverage `19/20` due the existing concurrent submission environment race, with the affected test rerun alone `1/1`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `20bd918 fix: synchronize study submission reads`; merged by PR #90 with merge commit `8c04947`.
- Boundary: same-host/shared-root Study personal submission read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable recruitment application read synchronization

- Status: **B — Recruitment manager application reads now keep the canonical per-application Review → Team lock order and reload the current post, manager access, and application before projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent application review cannot leave a manager with an unlocked stale application status in the recruitment post detail view.
- Evidence: `src/recruitment/service.ts`, `src/recruitment/review-lock.ts`, `src/teams/membership-lock.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED reproduced recruitment post detail reads completing while an application review lock was held; GREEN added the per-application review-lock/reload boundary and verified the accepted status after release. The read path uses the same Review → Team order as application acceptance to avoid an inverse lock order.
- Verification: Recruitment/Collaboration/Team focused regression `17/17`; recruitment-focused regression `7/7`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ac2de5b fix: synchronize recruitment application reads`; merged by PR #92 with merge commit `c40bdad`.
- Boundary: same-host/shared-root recruitment application read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable notification list read synchronization

- Status: **B — Notification list reads now acquire each notification's canonical identity lock before reloading the owner-scoped record; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent mark-read operation cannot leave an authenticated inbox with an unlocked stale unread projection.
- Evidence: `src/notifications/service.ts`, `src/notifications/notification-lock.ts`, `src/notifications/store.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-api.test.ts`, `tests/user-notifications-stream.test.ts`.
- TDD: RED reproduced notification list reads completing while the notification identity lock was held; GREEN added per-notification lock/reload coordination and verified the latest `readAt` state after release.
- Verification: notification/API/SSE focused regression `15/15`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `be27505 fix: synchronize notification list reads`; merged by PR #94 with merge commit `f71bc60`.
- Boundary: same-host/shared-root notification list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable shared memory lock-order alignment

- Status: **B — Shared memory read and write paths now use one canonical Team membership → Memory lock order; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. The read hardening from PR #86 no longer has an inverse write order that could deadlock cross-service sharing operations.
- Evidence: `src/memory/service.ts`, `src/memory/memory-lock.ts`, `src/teams/membership-lock.ts`, `tests/personal-memory-sharing.test.ts`.
- TDD: the lock-order review identified the inverse `Memory → Team` write path after the `Team → Memory` read boundary; GREEN moved team membership acquisition outside the memory lock and retained the existing membership revalidation tests.
- Verification: focused Memory/Team/Collaboration regression `17/17`; backend `tsc` build; `git diff --check` passed. Shared read lock/reload and Team membership revalidation remain covered.
- Implementation commit: `cd7bfb4 fix: align shared memory lock ordering`; merged by PR #88 with merge commit `a99731d`.
- Boundary: same-host/shared-root shared-memory lock ordering only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable shared memory read synchronization

- Status: **B — Shared memory list reads now keep the canonical Team membership → per-memory lock order and reload each current owner-scoped record before projecting team-visible content; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent memory edit, unshare, or delete cannot leave a team member with an unlocked stale shared projection.
- Evidence: `src/memory/service.ts`, `src/memory/memory-lock.ts`, `src/memory/store.ts`, `src/teams/membership-lock.ts`, `tests/personal-memory-sharing.test.ts`.
- TDD: RED reproduced shared memory reads completing while the memory lock was held; GREEN added the per-memory lock/reload boundary and verified the latest shared content after release.
- Verification: focused Memory/Team/Collaboration regression `17/17`; backend `tsc` build; `git diff --check` passed. Existing Team membership revalidation and private memory ownership boundaries remain covered.
- Implementation commit: `bf7defb fix: synchronize shared memory reads`; merged by PR #86 with merge commit `f67ff06`.
- Boundary: same-host/shared-root shared-memory read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Platform User email read synchronization

- Status: **B — Platform User email lookups now acquire each candidate's canonical per-user lock before reloading the current profile; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent profile email update cannot leave authentication lookup with an unlocked stale email projection.
- Evidence: `src/platform-user/service.ts`, `src/platform-user/user-lock.ts`, `src/platform-user/store.ts`, `tests/platform-user-isolation.test.ts`.
- TDD: RED reproduced email lookup completing while the user lock was held and missing a newly persisted email; GREEN added the per-user lock/reload boundary and verified the updated email after release.
- Verification: focused Platform User/auth/identity regression `22/22`; backend `tsc` build; Study Space focused regression `8/8`. The full Iseol user-product reruns exposed the same unrelated Study submission concurrency race (`427/429`, then `428/429`); the affected `tests/study-space.test.ts` rerun passed `8/8`. `git diff --check` passed.
- Implementation commit: `45d478e fix: synchronize platform user email lookups`; merged by PR #84 with merge commit `21c1024`.
- Boundary: same-host/shared-root Platform User email lookup coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Platform User read synchronization

- Status: **B — Platform User direct and list reads now acquire the canonical per-user lock before reloading owner-scoped profiles; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent profile update cannot leave user reads with an unlocked stale projection.
- Evidence: `src/platform-user/service.ts`, `src/platform-user/user-lock.ts`, `src/platform-user/store.ts`, `tests/platform-user-isolation.test.ts`.
- TDD: RED reproduced Platform User get/list reads completing while the user lock was held; GREEN added per-user lock/reload boundaries and verified the latest durable display name after release.
- Verification: focused Platform User/auth/identity regression `21/21`; Iseol user-product `428/428`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A parallel root/browser attempt exposed one environment race; isolated root/browser reruns passed `726/726` and browser E2E completely.
- Implementation commit: `cde49f0 fix: synchronize platform user reads`; merged by PR #82 with merge commit `6b52cde`.
- Boundary: same-host/shared-root Platform User profile read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Study Space read synchronization

- Status: **B — Study Space list and detail reads now keep the canonical Team membership → Study space lock ordering and reload the current accessible space after waiting; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent Study Space archive or membership change cannot leave reads with an unlocked stale active projection.
- Evidence: `src/study/service.ts`, `src/study/space-lock.ts`, `src/study/store.ts`, `src/teams/membership-lock.ts`, `tests/study-space.test.ts`.
- TDD: RED reproduced Study Space get/list reads completing while the Study space lock was held; GREEN added the ordered read boundary and verified that an archived space is excluded after release.
- Verification: focused Study/Team/Recruitment/Collaboration regression `26/26`; Iseol user-product `427/427`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A parallel root/browser attempt exposed two environment races; isolated reruns passed root `726/726` and browser E2E completely.
- Implementation commit: `b8b9cff fix: synchronize study space reads`; merged by PR #80 with merge commit `d95379e`.
- Boundary: same-host/shared-root Study Space read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning PlanVersion read synchronization

- Status: **B — Learning PlanVersion lists and direct reads now acquire the canonical owner/goal lock before reloading owner-scoped plans; preview/adjustment writes share that lock, isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent plan preview or adjustment cannot leave PlanVersion reads with an unlocked stale state.
- Evidence: `src/learning/service.ts`, `src/learning/goal-lock.ts`, `src/learning/store.ts`, `tests/learning-plan-preview.test.ts`.
- TDD: RED reproduced PlanVersion get/list reads completing while the Goal lock was held; GREEN added the Goal-lock read/reload boundary and verified the latest durable active PlanVersion after release.
- Verification: focused Learning goal/plan/progress/today regression `28/28`; Iseol user-product `426/426`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2607af4 fix: synchronize learning plan version reads`; merged by PR #78 with merge commit `09a492d`.
- Boundary: same-host/shared-root Learning PlanVersion read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable coding attempt list read synchronization

- Status: **B — Coding attempt lists now acquire each client-request attempt lock before reloading the receipt projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent coding attempt verifier/update can no longer leave the attempt list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/coding-attempt-lock.ts`, `src/learning/store.ts`, `tests/learning-coding-test.test.ts`.
- TDD: RED reproduced the coding attempt list completing while the attempt lock was held; GREEN added the per-attempt lock/reload boundary and verified the latest durable response after release. The submission path now uses a direct durable reload inside its existing lock to avoid self-reentrant locking.
- Verification: focused Learning coding suite `5/5`; Iseol user-product `417/417`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Learning coding attempt list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning project application read synchronization

- Status: **B — Learning project application lists now acquire each proposal acceptance lock before reloading the projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent application acceptance can no longer leave the application list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/project-application-acceptance-lock.ts`, `src/learning/store.ts`, `tests/learning-project-application.test.ts`.
- TDD: RED reproduced the application list completing while the acceptance lock was held; GREEN added the per-proposal lock/reload boundary and verified the latest durable actor assignment after release.
- Verification: focused Learning project application suite `5/5`; Iseol user-product `416/416`; serial root final rerun `726/726` after one initial unrelated intermittent root-suite failure; affected `chatgpt-web-stores` suite `12/12`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Learning project application list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning plan adjustment read synchronization

- Status: **B — Learning plan adjustment lists now acquire each adjustment acceptance lock before reloading the projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent plan adjustment acceptance can no longer leave the adjustment list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/plan-adjustment-acceptance-lock.ts`, `src/learning/store.ts`, `tests/learning-plan-preview.test.ts`.
- TDD: RED reproduced the adjustment list completing while the acceptance lock was held; GREEN added the per-adjustment lock/reload boundary and verified the latest durable note after release.
- Verification: focused Learning plan suite `10/10`; Iseol user-product `415/415`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Learning plan adjustment list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning answer list read synchronization

- Status: **B — Learning answer lists now acquire each answer lock before reloading the receipt projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent answer submission/feedback update can no longer leave the answer list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/answer-lock.ts`, `src/learning/store.ts`, `tests/learning-actions-answers.test.ts`.
- TDD: RED reproduced the answer list completing while the answer lock was held; GREEN added the per-answer lock/reload boundary and verified the latest durable response after release.
- Verification: focused Learning actions/answers suite `12/12`; Iseol user-product `414/414`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Learning answer list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Community like read snapshots

- Status: **B — Community post views now snapshot `likeCount` and `viewerLiked` under the same durable viewer-like lock used by mutations; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A like toggle cannot be observed as a mixed count/viewer state while the post projection is reading.
- Evidence: `src/community/service.ts`, `src/community/like-lock.ts`, `src/community/store.ts`, `tests/community-flow.test.ts`.
- TDD: RED reproduced a Community post read completing while the viewer-like lock was held and a like was persisted; GREEN added the like-lock boundary around the count/identity snapshot.
- Verification: focused Community flow `7/7`; Iseol user-product `404/404`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A prior root run had two transient desktop Job-lock failures; the affected transport suite passed `14/14`, and the full root rerun passed `726/726`.
- Implementation commit: `0c0847e fix: serialize community like reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Community like snapshot coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable incoming-requester profile read synchronization

- Status: **B — incoming friend-request entries now acquire the requester's canonical profile lock before projecting requester data; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent requester profile update can no longer produce an unlocked, stale requester projection.
- Evidence: `src/social/service.ts`, `src/social/friend-request-lock.ts`, `src/social/profile-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced an incoming friend-request read completing while the requester's profile lock was held; GREEN added the friend-request → requester profile lock boundary and verified the latest durable requester profile after release.
- Verification: focused Social safety/messaging/API/profile suites `27/27`; Iseol user-product `403/403`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `e807d1b fix: serialize incoming requester profile reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root incoming requester profile read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable friend-profile read synchronization

- Status: **B — friend-list entries now acquire the canonical profile lock before projecting a friend's profile; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent friend profile update can no longer produce an unlocked, stale profile entry in the friends surface.
- Evidence: `src/social/service.ts`, `src/social/friend-request-lock.ts`, `src/social/profile-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced a friend-list read completing while the friend's profile lock was held; GREEN added the friend-request → profile lock boundary and verified the latest durable profile after release.
- Verification: focused Social safety/messaging/API/profile suites `26/26`; Iseol user-product `402/402`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A prior single user-product run had one transient `study-space` concurrency failure; its standalone suite passed `8/8`, and the full rerun passed `402/402`.
- Implementation commit: `616b793 fix: serialize friend profile reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root friend-profile read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable own-profile list read synchronization

- Status: **B — own-profile entries returned by profile search/list now acquire the canonical profile lock before projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent profile update can no longer produce an unlocked, stale own-profile list entry.
- Evidence: `src/social/service.ts`, `src/social/profile-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced an own-profile list read completing while the profile lock was held; GREEN added the profile-lock boundary for the principal's list entry and verified the latest durable profile after release.
- Verification: focused Social safety/messaging/API/profile suites `25/25`; Iseol user-product `401/401`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `a272e0f fix: serialize own profile list reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root own-profile list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable profile-list visibility rechecks

- Status: **B — profile search/list reads for other users now acquire the social pair lock and canonical profile lock before projecting visibility; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A private conversion that wins the profile lock while the list read is waiting can no longer leave a stale public profile in discovery results.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/profile-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced a profile-list read completing while the target profile lock was held and private visibility persisted; GREEN added the pair → profile lock boundary before profile projection.
- Verification: focused Social safety/messaging/API/profile suites `24/24`; Iseol user-product `400/400`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `7524495 fix: serialize profile list reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root profile-list visibility/read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable public profile visibility rechecks

- Status: **B — public profile reads for other users now acquire the social pair lock and canonical profile lock before projecting visibility; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A private conversion that wins the profile lock while the read is waiting can no longer leave a stale public profile visible.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/profile-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced a public profile read completing while the target profile lock was held and private visibility persisted; GREEN added the pair → profile lock boundary before profile projection.
- Verification: focused Social safety/messaging/API/profile suites `23/23`; Iseol user-product `399/399`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `d44cb7c fix: serialize public profile reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root public profile visibility/read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable incoming friend-request state rechecks

- Status: **B — incoming friend-request reads now reacquire the canonical friend-request lock inside the social pair lock and reload request status before exposing a pending request; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A request accepted while the list is waiting can no longer remain visible as pending.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/friend-request-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced an incoming request read completing after a competing pending-to-accepted mutation and still returning the request; GREEN added the pair → friend-request lock boundary and latest request identity/status recheck.
- Verification: focused Social safety/messaging/API/profile suites `22/22`; Iseol user-product `398/398`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `1f49d7c fix: recheck incoming friend requests`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root incoming friend-request read authorization coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable friend-list relationship rechecks

- Status: **B — friend-list reads now reacquire the canonical friend-request lock inside the social pair lock and reload the relationship before projecting a friend; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A relationship that changes from accepted to rejected while the list is waiting can no longer remain visible as a friend.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/friend-request-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced a friend-list read completing after a competing accepted-to-rejected request mutation and still returning the other profile; GREEN added the pair → friend-request lock boundary and latest request identity/status recheck.
- Verification: focused Social safety/messaging/API/profile suites `21/21`; Iseol user-product `397/397`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `65d653b fix: recheck friendship state in friend lists`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root friend-list relationship authorization coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable owner portfolio snapshot synchronization

- Status: **B — owner portfolio snapshots now acquire each canonical per-entry lock and reload the latest record before returning entries; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Owner list/export reads can no longer project a stale entry while an update is waiting on the same durable lock.
- Evidence: `src/portfolio/service.ts`, `src/portfolio/entry-lock.ts`, `src/portfolio/store.ts`, `tests/portfolio-provenance.test.ts`.
- TDD: RED reproduced an owner snapshot completing while a portfolio entry lock was held and a competing title update was persisted; GREEN added the lock-aware snapshot entry reader, then removed a discovered reentrant lock path from public single-entry evidence projection.
- Verification: focused Portfolio suites `9/9`; user-product `396/396`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `01116d3 fix: serialize portfolio snapshots`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root owner portfolio snapshot and entry visibility coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable public portfolio list authorization rechecks

- Status: **B — public portfolio lists now acquire each canonical per-entry lock and reload visibility before returning entries; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A private conversion that wins an entry lock while the public list is waiting can no longer leave a stale public entry in the list.
- Evidence: `src/portfolio/service.ts`, `src/portfolio/entry-lock.ts`, `src/portfolio/store.ts`, `tests/portfolio-public-api.test.ts`.
- TDD: RED reproduced the public list completing while the portfolio entry lock was held and private visibility persisted; GREEN added per-entry lock acquisition and latest-record visibility rechecks before list projection.
- Verification: focused Portfolio suites `8/8`; user-product `395/395`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2272813 fix: serialize public portfolio lists`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root public portfolio list and visibility coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable public portfolio read authorization rechecks

- Status: **B — public portfolio reads now acquire the canonical per-entry lock and reload visibility before projecting evidence; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A private conversion that wins the entry lock while the public read is waiting can no longer leave a stale public entry visible.
- Evidence: `src/portfolio/service.ts`, `src/portfolio/entry-lock.ts`, `src/portfolio/store.ts`, `tests/portfolio-public-api.test.ts`.
- TDD: RED reproduced public get completing while the portfolio entry lock was held and private visibility persisted; GREEN wrapped public read projection in the per-entry lock and reloaded the latest record before returning evidence.
- Verification: focused Portfolio suites `7/7`; user-product `394/394`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `267ac26 fix: serialize public portfolio reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root public portfolio entry read and visibility coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable own-profile read synchronization

- Status: **B — own-profile reads now share the durable per-user profile lock with profile mutations; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A profile update that wins the lock while a self-read is waiting can no longer be followed by a stale pre-update projection.
- Evidence: `src/social/service.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced a self-profile read completing while the profile lock was held and a newer profile record was persisted; GREEN routed self-profile reads through the existing profile lock while preserving the bilateral block lock for other-user reads.
- Verification: focused Social safety/messaging/API suites `16/16`; user-product `393/393`; backend `tsc` build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `12ff7b0 fix: serialize own profile reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root own-profile read and profile mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable block-list read authorization rechecks

- Status: **B — block-list reads now acquire the canonical social pair lock per active block and recheck the latest durable block before returning it; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. An unblock that wins the pair lock while the list is waiting can no longer leave a stale active block visible.
- Evidence: `src/social/service.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced the block list completing while the shared social pair lock was held and an unblock state was persisted; GREEN reloaded each candidate block inside the pair lock and retained only the still-active records.
- Verification: focused Social safety/messaging/API suites `15/15`; user-product `392/392`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `41838ac fix: serialize block list reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root block-list read and social block authorization coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable profile-list read authorization rechecks

- Status: **B — searchable public-profile list reads now acquire the canonical social pair lock per non-self profile and recheck block state before projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block that wins the pair lock while the list is waiting can no longer leave a stale profile in discovery results.
- Evidence: `src/social/service.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced the profile list completing while the shared social pair lock was held and a block was persisted; GREEN wrapped each non-self profile visibility check and projection in the pair lock while preserving self-profile reads and public/private visibility rules.
- Verification: focused Social safety/messaging/API suites `14/14`; user-product `390/390`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2fe8ed1 fix: serialize profile list reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root profile-list read and social block authorization coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable direct-message read authorization rechecks

- Status: **B — direct-message reads now acquire the canonical social pair lock and recheck bilateral block state plus friendship/collaboration authorization before returning messages; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block or collaboration change that wins the pair lock while the read is waiting can no longer leave a stale private conversation visible.
- Evidence: `src/social/service.ts`, `tests/social-messaging.test.ts`.
- TDD: RED reproduced the DM read completing while the shared social pair lock was held and a block was persisted; GREEN wrapped the full authorization and message projection in the pair lock, preserving the existing fail-closed errors for blocked or unauthorized conversations.
- Verification: focused Social safety/messaging/API suites `13/13`; user-product `390/390`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b2e4cdb fix: serialize direct message reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root direct-message read and social block/collaboration authorization coordination only; profile-list read coordination, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable identity user and session mutation synchronization

- Status: **B — identity user creation and session creation/revocation now serialize across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. User mutations use a user-scoped durable lock, session mutations use a session-scoped durable lock, and bulk session revocation locks each session before re-reading and replacing it.
- Evidence: `src/identity/identity-lock.ts`, `src/identity/store.ts`, `tests/identity-scope.test.ts`.
- TDD: RED showed session revocation completing while a competing identity lock was held; GREEN added bounded wait, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, token-owned cleanup, and identity-scoped wrappers. Eight independent user/session creators now converge to one winner with seven immutable identity conflicts, and bulk revocation waits for the per-session lock.
- Verification: focused identity scope `8/8`; user-product `370/370`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2a3c555 fix: serialize identity user and session mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root identity user/session mutation coordination only; it does not claim distributed locking, external provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable integration delivery synchronization

- Status: **B — integration enqueue and dispatch now serialize across same-host/shared-root service instances; isolated product behavior remains verified, while live provider delivery remains unverified**. Each owner-bound delivery identity uses a durable lock in addition to the existing in-process queue, so provider invocation and terminal state persistence share one mutation boundary.
- Evidence: `src/integrations/delivery-lock.ts`, `src/integrations/service.ts`, `tests/integrations-delivery.test.ts`.
- TDD: RED showed dispatch completing while a competing durable delivery lock was held; GREEN added bounded wait, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, token-owned cleanup, cross-service adapter single-call convergence, and enqueue identity conflict protection.
- Verification: focused integration delivery `10/10`; user-product `370/370`; serial root `726/726` on the clean rerun after one non-reproducible first run failure; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b002e5f fix: serialize integration delivery mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root integration delivery enqueue/dispatch coordination only; no external provider or connector was called, and this does not claim distributed locking, provider-side exactly-once semantics, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team Chat membership mutation synchronization

- Status: **B — Team Chat send now shares the Team membership durable lock with join/leave/removal mutations; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Member authorization is re-read inside the lock, and message persistence plus local activity/notification side effects remain inside the same bounded mutation boundary.
- Evidence: `src/team-chat/service.ts`, `src/teams/membership-lock.ts`, `tests/team-chat.test.ts`, `tests/team-chat-api.test.ts`.
- TDD: RED showed a Team Chat send completing while a competing Team membership lock was held; GREEN moved the member check, message write, activity projection, and notification fan-out behind the existing Team-scoped durable lock. The API and leave-access behavior remain unchanged.
- Verification: focused Team Chat + API `4/4`; user-product `371/371`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `6a9c3be fix: serialize team chat membership mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Team Chat and Team membership mutation coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable social interaction synchronization

- Status: **B — direct-message checks, persistence, and notification side effects now share the canonical two-user social interaction lock with block/unblock mutations; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Reversed block directions resolve to the same pair lock, preventing a block-vs-DM check-then-send race across shared-root service instances.
- Evidence: `src/social/block-lock.ts`, `src/social/service.ts`, `tests/social-messaging.test.ts`, `tests/social-safety.test.ts`, `tests/social-safety-api.test.ts`.
- TDD: RED showed a direct message completing while the competing social interaction lock was held; GREEN canonicalized the existing block lock and moved blocked/friendship rechecks, message persistence, activity projection, and notification fan-out behind that boundary.
- Verification: focused Social messaging/safety/API `7/7`; user-product `372/372`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `7dbd8f0 fix: serialize social interaction mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root social block, unblock, and direct-message coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable social friend-request synchronization

- Status: **B — friend-request blocked checks and persistence now share the canonical two-user social interaction lock with block/unblock and direct-message mutations; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block cannot race a friend-request precheck into an unauthorized durable request across shared-root service instances.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/friend-request-lock.ts`, `tests/social-messaging.test.ts`.
- TDD: RED showed friend-request creation completing while a competing social interaction lock was held; GREEN moved the blocked recheck and the existing friend-request idempotency lock/write boundary under the canonical pair lock, preserving one request identity and activity projection.
- Verification: focused Social messaging/safety/API `8/8`; user-product `373/373`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize social friend-request mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root social friend-request and block interaction coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable social friend-request response safety

- Status: **B — accepting or rejecting a pending friend request now shares the canonical two-user social interaction lock with block/unblock, direct messaging, and request creation; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A blocked pending request cannot be accepted through a check-then-save race.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/friend-request-lock.ts`, `tests/social-safety.test.ts`.
- TDD: RED showed a pending request being accepted after the target had blocked the requester; GREEN re-read the request under the pair lock, rejects blocked interactions before the status transition, and retains the pending request for a later explicit unblock.
- Verification: focused Social messaging/safety/API `9/9`; user-product `374/374`; serial root `726/726`; backend `tsc` build and user UI build passed. The first post-change browser E2E attempt hit a non-reproducible 30-second UI click timeout; the immediate complete rerun passed with two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. `git diff --check` was clean apart from standard Windows LF/CRLF warnings.
- Implementation commit: follows as `fix: serialize social friend-request responses`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root social friend-request response and block interaction coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team membership authorization rechecks

- Status: **B — manager-gated Team membership mutations now recheck manager authority after acquiring the durable Team membership lock; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A manager removal or status change that wins the lock while another mutation is waiting can no longer be bypassed by a stale pre-lock authorization result.
- Evidence: `src/teams/service.ts`, `src/teams/membership-lock.ts`, `src/teams/store.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED held the Team membership lock, changed the owner membership to `removed`, and showed `addAiMember` proceeding from its stale pre-lock manager check; GREEN added inside-lock authority rechecks to `addAiMember`, `removeMember`, and `removeAiMember` while retaining the fast outside-lock rejection.
- Verification: focused Team membership ACL `4/4`; user-product `375/375`; serial root `726/726`; backend `tsc` build, user UI build, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. `git diff --check` was clean apart from standard Windows LF/CRLF warnings.
- Implementation commit: follows as `fix: recheck team manager authority after membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Study membership authorization rechecks

- Status: **B — Study mutations now coordinate with the canonical Team membership lock and recheck manager or active-human membership authority after waiting; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A Team membership removal that wins the lock while a Study write is waiting can no longer be bypassed by a stale authorization result.
- Evidence: `src/study/contracts.ts`, `src/study/service.ts`, `src/study/space-lock.ts`, `src/study/submission-lock.ts`, `src/teams/membership-lock.ts`, `tests/study-space.test.ts`.
- TDD: RED held the shared Team membership lock, changed the manager or member status to `removed`, and showed Study space creation or submission completing after the stale pre-lock check; GREEN added a shared Team-lock mutation boundary, inside-lock manager/member rechecks, and retained the existing Study-space/submission locks for their domain invariants.
- Verification: focused Study/AI dispatch/API `20/20`; user-product `377/377`; serial root `726/726`; backend `tsc` build, user UI build, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. `git diff --check` was clean apart from standard Windows LF/CRLF warnings.
- Implementation commit: follows as `fix: recheck study membership authority under team lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Study and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable recruitment application authorization rechecks

- Status: **B — recruitment application creation now shares the canonical Team membership lock and rechecks the open post plus applicant membership after waiting; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership added while an application request is waiting can no longer be bypassed by the stale pre-lock non-member check.
- Evidence: `src/recruitment/service.ts`, `src/recruitment/application-lock.ts`, `src/teams/membership-lock.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED held the Team membership lock, added the applicant as an active member, and showed `apply` creating an application after its stale pre-lock check; GREEN moved the application boundary behind the Team lock and re-read the post and team membership immediately before idempotent application persistence.
- Verification: focused recruitment flow `4/4`; user-product `378/378`; serial root `726/726`; backend `tsc` build, user UI build, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. `git diff --check` was clean apart from standard Windows LF/CRLF warnings.
- Implementation commit: follows as `fix: recheck recruitment application authority under team lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root recruitment application and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Social friend-list read authorization rechecks

- Status: **B — friend-list reads now acquire the canonical two-user social interaction lock per accepted friend and recheck block state before returning profiles; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block that wins the pair lock while a friend-list read is waiting can no longer be followed by stale friend visibility.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/store.ts`, `tests/social-safety.test.ts`, `tests/social-messaging.test.ts`, and the existing Social/browser coverage.
- TDD: RED held the canonical pair lock, started a friend-list read, created the durable block while it waited, and showed the old unlocked path returning the friend; GREEN moved each accepted-friend block check and profile read inside the bounded pair lock.
- Verification: focused Social/profile/API `15/15`; user-product `388/388`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize social friend-list reads under block lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Social friend-list and block authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Social profile read authorization rechecks

- Status: **B — public profile reads for another user now acquire the canonical two-user social interaction lock and recheck block state before returning the profile; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block that wins the pair lock while a profile read is waiting can no longer be followed by stale profile disclosure.
- Evidence: `src/social/service.ts`, `src/social/block-lock.ts`, `src/social/profile-lock.ts`, `tests/social-safety.test.ts`, `tests/social-public-profile-privacy.test.ts`, `tests/social-public-profile-portfolio.test.ts`, and the existing browser coverage.
- TDD: RED held the canonical pair lock, started a public profile read, created the durable block while it waited, and showed the old unlocked path returning the profile; GREEN moved the block check and profile projection inside the bounded pair lock while preserving self-profile reads.
- Verification: focused Social/profile/API `14/14`; user-product `387/387`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize social profile reads under block lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Social profile and block authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team list read authorization rechecks

- Status: **B — Team list reads now acquire the canonical Team membership lock per team and recheck team status plus viewer membership before returning private-team visibility; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership removal or status change that wins the lock while a team list is waiting can no longer leave a stale private team visible.
- Evidence: `src/teams/service.ts`, `src/teams/membership-lock.ts`, `src/teams/store.ts`, `tests/team-membership-acl.test.ts`, `tests/collaboration-api.test.ts`, and the existing Team Chat/browser coverage.
- TDD: RED held a Team membership lock, started the viewer's team list, removed the viewer while it waited, and showed the old unlocked list returning the private team; GREEN moved each team's status/membership read into its own bounded Team-scoped durable lock.
- Verification: focused Team/Chat/Collaboration `11/11`; user-product `386/386`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize team list reads under membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Team list read and membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Recruitment read authorization rechecks

- Status: **B — Recruitment post detail reads now acquire the canonical Team membership lock and recheck manager authority before returning private applications; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A manager removal or status change that wins the lock while a recruitment read is waiting can no longer be followed by stale application disclosure.
- Evidence: `src/recruitment/service.ts`, `src/recruitment/application-lock.ts`, `src/recruitment/review-lock.ts`, `src/teams/membership-lock.ts`, `tests/recruitment-flow.test.ts`, `tests/recruitment-flow-api.test.ts`, and the existing notification/browser coverage.
- TDD: RED held the Team membership lock, started a manager post read, removed the manager while it waited, and showed the old unlocked path returning applications; GREEN moved manager authorization and application listing inside the Team-scoped durable lock while preserving public open-post visibility without applications.
- Verification: focused Recruitment/notification/API `15/15`; user-product `385/385`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize recruitment post reads under membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Recruitment read and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Study read authorization rechecks

- Status: **B — Study space lists and detail reads now acquire the canonical Team membership lock and recheck active human membership before returning shared curriculum/task data and private-to-viewer submissions; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership removal or status change that wins the lock while a Study read is waiting can no longer be followed by stale shared data.
- Evidence: `src/study/service.ts`, `src/study/space-lock.ts`, `src/teams/membership-lock.ts`, `tests/study-space.test.ts`, `tests/study-space-api.test.ts`, and the existing AI context/browser coverage.
- TDD: RED held the Team membership lock, started a Study detail read, removed the reader while it waited, and showed the old unlocked read returning the space; GREEN added a shared read helper that locks the space's Team before rechecking access and reading detail/list data.
- Verification: focused Study/AI/API `21/21`; user-product `384/384`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize study reads under team membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Study read and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team Chat read authorization rechecks

- Status: **B — Team Chat message reads now acquire the canonical Team membership lock and recheck active human membership before returning the message list; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership removal or status change that wins the lock while a chat read is waiting can no longer be followed by a stale message response.
- Evidence: `src/team-chat/service.ts`, `src/team-chat/store.ts`, `src/teams/membership-lock.ts`, `tests/team-chat.test.ts`, `tests/team-chat-api.test.ts`, and the existing notification/browser coverage.
- TDD: RED held the shared Team membership lock, started a Team Chat read, removed the reader while it waited, and showed the old unlocked read returning messages; GREEN placed membership validation and message listing inside the existing Team-scoped durable lock while preserving send-side notification behavior.
- Verification: focused Team Chat/notification/API `15/15`; user-product `383/383`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize team chat reads under membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Team Chat read and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Personal Memory sharing read authorization rechecks

- Status: **B — Personal Memory sharing reads and writes now acquire the canonical Team membership lock and recheck active human membership immediately before returning data or persisting a grant; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership removal or status change that wins the lock while sharing is waiting can no longer leave a stale team grant or stale read result.
- Evidence: `src/memory/service.ts`, `src/memory/memory-lock.ts`, `src/teams/membership-lock.ts`, `tests/personal-memory-sharing.test.ts`, and the existing Personal AI context/privacy coverage.
- TDD: RED held the Team membership lock, started a memory-sharing mutation or shared-memory read, removed the relevant member while it waited, and showed the old memory-only or unlocked read path persisting/returning data; GREEN added sorted Team-lock acquisition for multi-team sharing and moved membership rechecks plus both persistence and reads inside that boundary.
- Verification: focused Memory/Personal AI `25/25`; user-product `382/382`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize shared memory reads under team lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Personal Memory sharing and Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Team transition authorization rechecks

- Status: **B — user Project Team transitions now share the canonical Team membership lock and recheck target-team access after waiting; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A membership removal or status change that wins the lock while a project is waiting can no longer be bypassed by a stale pre-lock access result.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/workspace-lock.ts`, `src/teams/membership-lock.ts`, `tests/user-project-team-transition.test.ts`, and the existing user-project API/execution/browser coverage.
- TDD: RED held the Team membership lock, started a solo-to-team transition, removed the owner while the transition was waiting, and showed the old Workspace-only path completing; GREEN added a shared Team-lock boundary for team project creation and transitions, with the access check and persistence inside the lock.
- Verification: focused user-project/API/team-transition `43/43`; user-product `382/382`; serial root `726/726` on the clean rerun after one non-reproducible ChatGPT Web ordering failure; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: serialize project team transitions under membership lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Project Team transition and creation authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Team membership authorization rechecks

- Status: **B — AI Team proposal/discussion requests and proposal manager decisions now share the canonical Team membership lock and recheck active membership or manager authority after waiting; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A Team membership removal or status change that wins the lock while an AI Team mutation is waiting can no longer be bypassed by stale pre-lock authorization.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `src/ai-team/proposal-lock.ts`, `src/ai-team/proposal-decision-lock.ts`, `src/ai-team/discussion-lock.ts`, `src/teams/membership-lock.ts`, `tests/ai-team-proposals.test.ts`, and `tests/ai-team-discussion.test.ts`.
- TDD: RED held the Team membership lock, removed the owner while proposal request or acceptance waited, and showed the stale pre-lock path proceeding; GREEN added Team-lock wrappers and inside-lock project/member/manager rechecks. Discussion requests use the same boundary.
- Verification: focused AI Team proposal/discussion/API `13/13`; user-product `381/381`; serial root `726/726`; backend `tsc` build, user UI build, isolated browser E2E, and `git diff --check` all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: follows as `fix: recheck ai team authority under team lock`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root AI Team membership authorization coordination only; no external provider/connector delivery, distributed locking, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Harness Run pause and resume synchronization

- Status: **B — user-owned Harness Run pause/resume transitions now hold the Run mutation lock across read, compare-save, event, and checkpoint projection; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-store.ts`, `src/harness/run-service.ts`, `tests/harness-run-service.test.ts`.
- TDD: RED coverage holds the Run mutation lock while pause/resume is requested and requires both transitions to wait; GREEN split the compare-save unlocked primitive from its public lock wrapper and wrapped the full user transition boundary without introducing nested Run locks.
- Verification: focused Harness Run service `5/5`; user-product `366/366`; serial root `722/722`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `71eaa86 fix: serialize harness run pause and resume`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Harness Run user pause/resume coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Harness side-effect ledger synchronization

- Status: **B — Harness side-effect reservation and completion now share the Run-scoped durable event boundary, preventing concurrent completion read/replace races; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/harness/event-lock.ts`, `src/harness/side-effect-ledger.ts`, `tests/harness-side-effect-ledger.test.ts`.
- TDD: RED showed side-effect completion succeeding while the Run event lock was held; GREEN wrapped reservation and completion with bounded Run-scoped coordination while preserving idempotent reservation, redacted durable receipt, and transient rename retry behavior.
- Verification: focused Harness side-effect ledger `6/6`; user-product `366/366`; serial root rerun `721/721` after one transient non-reproducible first-run failure; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `fbacb0c fix: serialize harness side effect completion`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Harness side-effect receipt coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Harness checkpoint synchronization

- Status: **B — Harness checkpoint writes now share the Run-scoped durable event boundary with event append and append-once operations; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/harness/event-lock.ts`, `src/harness/event-store.ts`, `tests/harness-event-store.test.ts`.
- TDD: RED showed checkpoint persistence completing while the Run event lock was held; GREEN added the bounded Run-scoped lock wrapper without changing checkpoint filename or latest-record selection semantics.
- Verification: focused Harness event store `5/5`; user-product `366/366`; serial root rerun `720/720` after one transient non-reproducible first-run failure; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `4cd70bc fix: serialize harness checkpoint persistence`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Harness checkpoint coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Agent presence synchronization

- Status: **B — Desktop Agent registration and heartbeat writes now coordinate across independent processes with Agent-scoped durable locks, and stale heartbeat timestamps cannot overwrite newer presence; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/agent-lock.ts`, `src/desktop-agent/agent-registry.ts`, `tests/desktop-agent-registry.test.ts`.
- TDD: RED exposed the missing cross-instance heartbeat wait and a race where completion order could regress the heartbeat timestamp; GREEN added bounded Agent lock ownership/reclaim/cleanup and monotonic heartbeat protection while retaining the in-process queue.
- Verification: focused Desktop Agent registry `7/7`; user-product `366/366`; serial root `719/719`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `6134bfb fix: serialize desktop agent presence writes`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Agent registration and heartbeat coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Agent result persistence synchronization

- Status: **B — durable Desktop Agent result replay writes now serialize per Job before retention cleanup; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/result-store.ts`, `tests/desktop-agent-transport.test.ts`.
- TDD: RED showed result persistence completing while the Job lock was held; GREEN added the bounded Job-scoped lock around durable result write and retention cleanup without changing redaction or replay semantics.
- Verification: focused Desktop transport `14/14`; user-product `366/366`; serial root rerun `718/718` after one transient non-reproducible first-run failure; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `839fdc2 fix: serialize desktop result persistence`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Agent result persistence and retention coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Job operator containment synchronization

- Status: **B — operator containment now serializes against all other Desktop Job mutations and accepts only one competing containment decision; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED reproduced two different containment decisions succeeding for one pending Job across independent instances; GREEN added the Job-scoped durable lock, preserving idempotent repeat handling for the same decision and fail-closed handling for conflicts.
- Verification: focused Desktop Job store `15/15`; user-product `366/366`; serial root `717/717`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `293b593 fix: serialize desktop job containment`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job operator containment coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Job creation idempotency synchronization

- Status: **B — concurrent Desktop Job creation now converges on one durable idempotent record per root; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED reproduced eight durable Job records for one shared idempotency key across independent Job store instances; GREEN added a bounded root-scoped creation lock, preserving semantic conflict checks and existing record reuse.
- Verification: focused Desktop Job store `14/14`; user-product `366/366`; serial root `716/716`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `a885fc0 fix: serialize desktop job creation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job creation idempotency coordination only; distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Job lease renewal synchronization

- Status: **B — Desktop Job lease renewal now shares the Job-scoped durable mutation boundary with acquisition, completion, requeue, and indeterminate marking; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED showed `renewDesktopJobLease` completing while a competing Job mutation lock was held; GREEN added the bounded Job lock wrapper without changing owner or expiry validation semantics.
- Verification: focused Desktop Job store `13/13`; user-product `366/366`; serial root `715/715`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `73bdd47 fix: serialize desktop job lease renewal`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job lease renewal coordination only; create coordination, distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Desktop Job indeterminate marking synchronization

- Status: **B — Desktop Job execution-uncertain marking now shares the Job-scoped durable mutation boundary with lease, completion, and requeue changes; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED showed `markDesktopJobIndeterminate` completing while a competing Job mutation lock was held; GREEN added the bounded Job lock wrapper without changing lease-owner or terminal-state semantics.
- Verification: focused Desktop Job store `12/12`; user-product `366/366`; serial root `714/714`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `bf06a86 fix: serialize desktop job indeterminate marking`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job indeterminate transition coordination only; create/renew coordination, distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable ChatGPT Web worker-session ownership synchronization

- Status: **B — Web-worker-session/run-stage-scoped, durable, same-host cross-service serialized, and isolated regression/browser verified; live ChatGPT/Agent execution remains unverified**. Session create/replace/repair/update now share one durable `(runId, stage)` lock, preserving the invariant that only one ready Web worker session can be active for a Harness stage.
- Evidence: `src/chatgpt-web/session-lock.ts`, `src/chatgpt-web/session-store.ts`, `tests/chatgpt-web-stores.test.ts`, and the existing Web reasoning/recovery, Idea Lab, Project Runtime, and browser coverage.
- TDD: RED reproduced six independent service instances producing three successful active-session creations for one run/stage; GREEN wrapped the session mutation and repair boundaries with bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, Windows-open-file probing, and token-owned cleanup. Read-only lookup remains outside the lock to avoid re-entrant lock deadlocks.
- Verification: focused Web stores/reasoning/recovery suites `46/46`; user-product `366/366`; serial root `702/702`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained private AI, Project Workspace, Idea Lab, Runtime approval/recovery, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `1049b11 fix: serialize Web worker sessions`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Web worker-session ownership coordination only; no distributed coordinator, live ChatGPT/provider or Desktop Agent quality, operational Runtime throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable ChatGPT Web request-budget synchronization

- Status: **B — request-budget-root-scoped, durable, same-host cross-service serialized, and isolated regression/browser verified; live ChatGPT provider execution remains unverified**. ChatGPT Web request budget reserve/complete/release mutations now share a durable root lock, preserving the global request limit and preventing concurrent atomic JSON rename conflicts across worker service instances.
- Evidence: `src/chatgpt-web/request-budget-lock.ts`, `src/chatgpt-web/request-budget.ts`, `tests/idea-lab-request-budget.test.ts`, and the existing Web/Idea Lab recovery and browser coverage.
- TDD: RED reproduced separate budget-store module instances racing on a limit-one budget and hitting Windows `EPERM` rename failure; GREEN added bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, Windows-open-file probing, and token-owned cleanup around every read-modify-write mutation.
- Verification: focused request-budget/Web store suites `15/15`; user-product `366/366`; serial root `701/701`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E had already passed for the same implementation state. Browser coverage retained two-account isolation, Runtime/approval/recovery journeys, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `3ca74a0 fix: serialize ChatGPT Web request budget`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root request-budget mutation coordination only; no provider-side exactly-once semantics, live ChatGPT/provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable ChatGPT Web Desktop intent identity synchronization

- Status: **B — Desktop-intent-scoped, durable, same-host cross-service serialized, and isolated regression/browser verified; live Desktop/Runtime execution remains unverified**. `recordDesktopIntent` now protects the first-write and identity-conflict decision with a durable `(runId, intentId)` lock, so concurrent workers cannot both accept conflicting records or silently overwrite the canonical intent.
- Evidence: `src/chatgpt-web/intent-lock.ts`, `src/chatgpt-web/intent-store.ts`, `tests/chatgpt-web-stores.test.ts`, and the existing Desktop/Idea Lab/Project Runtime coverage.
- TDD: RED reproduced eight independent service instances producing six successful writes for one intent identity with conflicting statuses; GREEN added bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, Windows-open-file probing, and token-owned cleanup around the atomic JSON write.
- Verification: focused Web stores/reasoning/Idea Lab driver suites `72/72`; user-product `366/366`; serial root `701/701`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Project Workspace/Idea Lab approval and Runtime journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `65d7c67 fix: serialize Desktop intent identity`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop intent identity coordination only; no distributed coordinator, live Desktop Agent/Runtime throughput or provider quality, external connector delivery, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable ChatGPT Web reasoning-turn append-once synchronization

- Status: **B — reasoning-turn/run-scoped, durable, same-host cross-service serialized, and isolated regression/browser verified; live ChatGPT provider execution remains unverified**. `appendReasoningTurn` now protects its semantic identity read and JSONL append with a durable run lock, so separate Web worker service instances cannot append the same reasoning turn more than once.
- Evidence: `src/chatgpt-web/turn-lock.ts`, `src/chatgpt-web/turn-store.ts`, `tests/chatgpt-web-stores.test.ts`, and the existing Web reasoning/recovery/browser coverage.
- TDD: RED used 12 independent module instances against one temporary durable root and reproduced 12 successful writes for one `turnId`; GREEN added bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, Windows-open-file probing, and token-owned cleanup. The existing process-local queue remains only an optimization; the durable lock is the correctness boundary.
- Verification: focused ChatGPT Web stores/reasoning/recovery suites `44/44`; user-product `366/366`; serial root `700/700`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained private AI, Runtime waiting/response, approval, recovery, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `84c6653 fix: serialize ChatGPT Web reasoning turns`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root reasoning-turn append-once coordination only; no distributed coordinator, live ChatGPT/provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: user-domain durable lock cleanup ownership hardening

- Status: **B — user settings, private memory, and notification durable locks hardened and isolated-product verified; live Runtime/provider execution remains unverified**. Lock finalizers now verify their owner token before cleanup, preventing a releasing service from deleting a newer waiter-owned lock record on Windows.
- Evidence: `src/settings/settings-lock.ts`, `src/memory/memory-lock.ts`, `src/notifications/notification-lock.ts`, and the existing user settings/memory/notification/AI persistence/browser coverage.
- Root cause: the same cross-service cleanup race previously found in production/project locks also existed in user-domain lock finalizers; only the owner token may remove a lock record after its handle is closed.
- Verification: focused settings/memory suite `8/8`; notifications/AI persistence suite `12/12`; user-product `364/364`; serial root `698/698`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained settings, private memory, notifications, AI chat, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b4f63a2 fix: protect user lock cleanup ownership`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root user-domain lock cleanup ownership only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Prototype archive guard

- Status: **B — Prototype-candidate-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Prototype archive now uses the locked candidate update path for both promoted-state rejection and archived idempotence, preventing a stale pre-lock read from overwriting a concurrent promotion.
- Evidence: `src/idea-lab/prototype-actions.ts`, `src/project-model/prototype-store.ts`, `src/project-model/prototype-lock.ts`, `tests/project-model-promotion.test.ts`, and the existing archive/promotion/browser coverage.
- TDD: RED lock-holder coverage confirmed the archive path must wait on the candidate lock; GREEN made archive use the same atomic update guard as browser acceptance, with a lock-internal promoted rejection and return-current archived path.
- Verification: focused Idea Lab/promotion/stores suites `20/20`; user-product `364/364`; serial root `698/698`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Prototype archive/promotion and Project Workspace journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `f855be9 feat: serialize prototype archive guard`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Prototype archive/promotion coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Prototype browser-acceptance guard

- Status: **B — Prototype-candidate-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Browser acceptance now validates the candidate's promoted status inside the existing prototype lock, so promotion and acceptance cannot interleave around a stale pre-lock read.
- Evidence: `src/project-model/prototype-store.ts`, `src/project-model/prototype-lock.ts`, `tests/project-model-promotion.test.ts`, and the existing promotion/API/browser coverage.
- TDD: RED reproduced browser acceptance completing while an independent candidate lock holder was still active; GREEN moved the promoted-state guard into the locked candidate update path while preserving the existing immutable error and acceptance validation behavior.
- Verification: focused promotion+stores suites `15/15`; user-product `364/364`; serial root `697/697`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained promotion, Portfolio, Project Workspace, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `85c39e1 feat: serialize prototype acceptance guard`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Prototype acceptance/promotion coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: project-model durable lock cleanup ownership hardening

- Status: **B — project-model durable lock infrastructure hardened and isolated-product verified; live Runtime/provider execution remains unverified**. Project history, promotion, schedule, work-request, and Workspace locks now verify their owner token before cleanup, preventing a releasing owner from unlinking a newer lock record on Windows.
- Evidence: `src/project-model/history-lock.ts`, `src/project-model/promotion-lock.ts`, `src/project-model/schedule-lock.ts`, `src/project-model/work-request-lock.ts`, `src/project-model/workspace-lock.ts`, and the existing project-model/runtime/browser coverage.
- Root cause: production-driver lock-holder coverage exposed an ownership cleanup race in which an old holder could close its handle after a waiter acquired the path, then unconditionally remove the waiter's lock. The project-model lock family now uses the same token-owned cleanup boundary already applied to Idea Lab and Portfolio locks.
- Verification: project-model stores `9/9`; user-project execution/team/promotion focused coverage `32/32`; user-product `364/364`; serial root `696/696`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained project Workspace/runtime/Idea Lab/Portfolio journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `0edc49b fix: protect project lock cleanup ownership`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root lock cleanup ownership only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Portfolio document creation synchronization

- Status: **B — project-Portfolio-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Portfolio document ensure/create now holds the same project-specific durable lock used by document patches across existence check and first save, preventing concurrent initializers from racing.
- Evidence: `src/project-model/portfolio-store.ts`, `src/project-model/portfolio-lock.ts`, `tests/project-model-stores.test.ts`, and the existing Portfolio/API/browser coverage.
- TDD: RED reproduced Portfolio document creation completing while an independent Portfolio lock holder was still active; GREEN moved the ensure read/create/save boundary under bounded waiting and hardened cleanup to remove only the owner token's lock.
- Verification: focused project-model stores suite `9/9`; user-product `364/364`; serial root `696/696`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Portfolio provenance/public views, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `bd50f42 feat: serialize portfolio document creation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root project Portfolio creation coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab campaign creation synchronization

- Status: **B — Idea Lab campaign-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Authenticated campaign creation now shares the durable campaign lock across duplicate-id detection, campaign persistence, and the creation event append, preventing concurrent service instances from racing on the same campaign id.
- Evidence: `src/web-control-plane/idea-lab-actions.ts`, `src/idea-lab/campaign-lock.ts`, `tests/idea-lab-web-control-plane.test.ts`, and the existing Idea Lab web/browser coverage.
- TDD: RED reproduced campaign creation completing while an independent campaign lock holder was still active; GREEN made the complete persistence/event boundary wait on the bounded shared campaign lock while preserving input validation and duplicate-id errors.
- Verification: focused Idea Lab web-control-plane suite `11/11`; user-product `364/364`; serial root `695/695`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab campaign/runtime journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `c5d6017 feat: serialize Idea Lab campaign creation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root campaign creation coordination only; router-level runtime enqueue remains capability-bound and live worker throughput is not claimed. No distributed coordinator, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab candidate materialization synchronization

- Status: **B — Prototype-candidate-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Candidate materialization now holds the existing prototype lock across validation, identity re-read, and first save, preventing concurrent production-service instances from racing on candidate creation.
- Evidence: `src/idea-lab/production-service.ts`, `src/project-model/prototype-lock.ts`, `tests/idea-lab-production-service.test.ts`, and the existing Idea Lab promotion/browser coverage.
- TDD: RED reproduced candidate materialization completing while an independent prototype lock holder was still active; GREEN moved the full load/identity-check/save boundary under the bounded prototype lock. The lock cleanup also verifies owner tokens before unlinking, preventing a releasing owner from deleting a newer lock owner on Windows.
- Verification: focused Idea Lab production-service suite `5/5`; project-model stores `8/8`; user-product `364/364`; serial root `694/694`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab/promotion/portfolio journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `55f0c62 feat: serialize Idea Lab candidate materialization`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Prototype candidate materialization coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab production-driver synchronization

- Status: **B — Idea Lab production-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Production creation and advancement now share an exact durable production lock, so parallel driver instances cannot interleave Run recovery, provider progress, deployment, verification, or candidate materialization writes for one production.
- Evidence: `src/idea-lab/production-lock.ts`, `src/idea-lab/production-runtime-driver.ts`, `src/idea-lab/campaign-lock.ts`, `src/idea-lab/event-lock.ts`, `tests/idea-lab-production-runtime-driver.test.ts`, and the existing Idea Lab runtime/browser coverage.
- TDD: RED reproduced `advanceProduction` completing its missing-dependency failure while an independent production lock holder was still active; GREEN serialized both create/advance entry points. Focused create coverage then exposed a Windows cleanup race where an old owner could unlink a new owner's lock; owner-token cleanup now removes only the lock record it owns.
- Verification: focused production-runtime-driver suite `32/32`; user-product `364/364`; serial root `693/693`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab/runtime/project journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `bcf628e feat: serialize Idea Lab production driver`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root production-driver coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab campaign cancellation synchronization

- Status: **B — Idea Lab campaign-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Web campaign cancellation now holds the same durable campaign lock across re-read, terminal status transition, campaign persistence, and cancellation event append, so cancellation cannot interleave with campaign supervision.
- Evidence: `src/web-control-plane/idea-lab-actions.ts`, `src/idea-lab/campaign-lock.ts`, `tests/idea-lab-web-control-plane.test.ts`, and the existing Idea Lab web/browser coverage.
- TDD: RED reproduced cancellation completing while an independent campaign lock holder was still active; GREEN made the authenticated cancellation action wait on the bounded shared campaign lock and preserve its existing idempotent/terminal semantics.
- Verification: focused Idea Lab web-control-plane suite `10/10`; user-product `364/364`; serial root `691/691`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab campaign/runtime journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `1f2b8b8 feat: serialize Idea Lab campaign cancellation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root campaign cancellation coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab campaign supervision synchronization

- Status: **B — Idea Lab campaign-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. The public campaign supervisor now holds a durable campaign lock across its full read/propose/produce/advance loop, preventing concurrent supervisor instances from interleaving campaign state transitions.
- Evidence: `src/idea-lab/campaign-lock.ts`, `src/idea-lab/campaign-supervisor.ts`, `tests/idea-lab-campaign-supervisor.test.ts`, and the existing Idea Lab campaign/runtime/browser coverage.
- Focused coverage: the lock-holder test confirms the public supervisor waits for a competing durable campaign lock; the wrapper preserves the existing supervisor behavior under the lock. This unit was verified as a focused lock-holder regression rather than a separate RED-first reproduction.
- Verification: focused campaign-supervisor suite `10/10`; user-product `364/364`; serial root `690/690`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab campaign/runtime journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b47350a feat: serialize Idea Lab campaign supervision`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root campaign supervision coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service recruitment application reviews

- Status: **B — application-scoped, durable, same-host cross-service terminal review serialization, and isolated-product verified; external invitation delivery remains provider-bound/unverified**. Recruitment accept/reject now shares a durable application review lock and re-reads the application inside it, so concurrent manager decisions produce one terminal review and one explicit not-found/pending conflict.
- Evidence: `src/recruitment/review-lock.ts`, `src/recruitment/service.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED reproduced concurrent acceptance and rejection both succeeding for one pending application; GREEN persisted exactly one terminal status and rejected the losing review after re-read.
- Verification: focused recruitment suite `3/3`; user-product `361/361`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and sequential isolated browser E2E passed. Browser coverage retained recruitment application review, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `fe7c434 feat: serialize recruitment application reviews`.
- Boundary: same-host/shared-root coordination only; no distributed review coordinator, external invitation exactly-once delivery, live provider quality, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service AI Team proposal decisions

- Status: **B — project/proposal-scoped, durable, same-host cross-service terminal decision serialization, and isolated-product verified; live AI Team Runtime execution remains unverified**. AI Team proposal acceptance and rejection now share a durable decision lock and re-read the proposal inside it, so concurrent accept/reject calls produce one terminal decision and one explicit status conflict.
- Evidence: `src/ai-team/proposal-decision-lock.ts`, `src/ai-team/service.ts`, `tests/ai-team-proposals.test.ts`.
- TDD: RED reproduced concurrent acceptance and rejection both succeeding for one proposed record; GREEN persisted exactly one terminal status and rejected the losing decision after re-read.
- Verification: focused AI Team proposals suite `4/4`; user-product `360/360`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and sequential isolated browser E2E passed. Browser coverage retained AI Team proposal approval, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. The first browser run was invalidated by running `user-ui:build` concurrently with the browser server; a clean browser-only rerun passed. Commit: `90a8037 feat: serialize AI team proposal decisions`.
- Boundary: same-host/shared-root coordination only; no distributed proposal decision coordinator, live AI Team/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning feedback completions

- Status: **B — owner/feedback-scoped, durable, same-host cross-service compare-and-set evaluation completion, and isolated-product verified; live evaluator/provider execution remains unverified**. Learning feedback completion now re-reads feedback inside a durable lock, so competing evaluations preserve the first persisted evaluation and later calls return the durable completed feedback instead of overwriting it.
- Evidence: `src/learning/feedback-completion-lock.ts`, `src/learning/service.ts`, `tests/learning-feedback-evaluator.test.ts`, and `tests/learning-feedback-reevaluation.test.ts`.
- TDD: RED reproduced two concurrent evaluations persisting different evaluator versions; GREEN preserved one durable evaluator version and returned it to both callers.
- Verification: focused Learning evaluator/re-evaluation suite `5/5`; user-product `359/359`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning feedback evaluation/dispute/re-evaluation, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `5b67ddc feat: serialize learning feedback completions`.
- Boundary: same-host/shared-root coordination only; no distributed evaluator coordinator, live evaluator/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning action completions

- Status: **B — owner/action-scoped, durable, same-host cross-service compare-and-set completion, and isolated-product verified; live Runtime action execution remains unverified**. Learning session action completion now re-reads the action inside a durable lock, so competing responses converge on the first persisted response and later different responses fail with an explicit completion conflict.
- Evidence: `src/learning/action-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`.
- TDD: RED reproduced two concurrent completions both resolving and overwriting the same action; GREEN persisted one response and rejected the other with `Learning session action completion conflict`.
- Verification: focused Learning actions/answers suite `9/9`; user-product `358/358`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning action waiting/completion, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `b74ec6f feat: serialize learning action completions`.
- Boundary: same-host/shared-root coordination only; no distributed action coordinator, live Runtime/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning session actions

- Status: **B — owner/session/action-scoped, durable, same-host cross-service idempotent action creation, and isolated-product verified; live Runtime action execution remains unverified**. Learning session action creation now serializes session re-read, action idempotency check, durable action save, and the optional explicitly injected Runtime boundary, so concurrent submissions with one `actionId` return one durable action identity.
- Evidence: `src/learning/action-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`.
- TDD: RED reproduced two concurrent self-report submissions with one `actionId` creating two action identities; GREEN converged to one action identity and one stored action.
- Verification: focused Learning actions/answers suite `8/8`; user-product `357/357`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning action waiting, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `c24fe29 feat: serialize learning session actions`.
- Boundary: same-host/shared-root coordination only; no distributed action coordinator, live Runtime/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning feedback disputes

- Status: **B — owner/feedback-scoped, durable, same-host cross-service idempotent dispute creation, and isolated-product verified; live evaluator/provider execution remains unverified**. Feedback dispute creation now serializes feedback/answer re-read, existing-dispute check, dispute save, feedback/answer status changes, and optional explicitly injected re-evaluation boundary, so concurrent same-reason disputes return one durable dispute identity.
- Evidence: `src/learning/feedback-dispute-lock.ts`, `src/learning/service.ts`, `tests/learning-feedback-dispute.test.ts`.
- TDD: RED reproduced two concurrent disputes creating two dispute identities; GREEN converged to one dispute identity and retained the answer/feedback `disputed` state.
- Verification: focused Learning feedback dispute suite `2/2`; user-product `356/356`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning feedback dispute, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `94d6ec3 feat: serialize learning feedback disputes`.
- Boundary: same-host/shared-root coordination only; no distributed dispute coordinator, live evaluator/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: Windows-open-file project Run lock contention

- Status: **B — bounded same-host project Run lifecycle lock behavior is stabilized and isolated-product verified**. `src/project-model/work-request-lock.ts` now treats Windows `EPERM` from an already-open exact lock file as bounded contention, while preserving fail-closed behavior for unrelated permission errors and exact dead-owner cleanup.
- Evidence: `src/project-model/work-request-lock.ts`, `tests/user-project-execution.test.ts`.
- Root cause: Windows can report `EPERM` rather than `EEXIST` while another process/test still holds the lifecycle lock file open. The retry-wait test reproduced the behavior during the full serialized product suite even though its focused run could pass.
- Verification: focused Project Run retry lock test `1/1`; user-product `348/348`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Commit: `d351ce9 fix: tolerate Windows project run lock contention`.
- Boundary: this is a local filesystem contention-handling fix only; no distributed coordinator, live Runtime/Agent throughput, external provider/connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning plan adjustment acceptance

- Status: **B — owner/goal/adjustment-scoped, durable, same-host cross-service idempotent CAS acceptance, and isolated-product verified; live model/provider execution remains unverified**. Learning plan adjustment acceptance now serializes the proposed-adjustment re-read, base PlanVersion supersession, adjusted PlanVersion save, goal revision update, accepted adjustment save, and linked acceptance boundary, so concurrent accepts return one plan.
- Evidence: `src/learning/plan-adjustment-acceptance-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- TDD: RED reproduced two concurrent service instances creating two adjusted PlanVersion identities for one proposed adjustment; GREEN returned one plan identity and retained one non-base adjusted PlanVersion.
- Verification: focused Learning plan preview/adjustment suite `9/9`; user-product `348/348`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning plan preview/adjustment, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `39e8877 feat: serialize learning plan adjustment acceptance`.
- Boundary: same-host/shared-root coordination only; no distributed Learning acceptance coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning project application acceptance

- Status: **B — owner/goal/proposal-scoped, durable, same-host cross-service idempotent acceptance, and isolated-product verified; live Runtime/provider execution remains unverified**. Learning project application acceptance now serializes proposal re-read, linked Work Request creation, accepted proposal save, learning link creation, and acceptance activity recording. Re-entry on an already accepted proposal returns the existing durable result without repeating side effects.
- Evidence: `src/learning/project-application-acceptance-lock.ts`, `src/learning/service.ts`, `tests/learning-project-application.test.ts`, and `tests/learning-project-application-api.test.ts`.
- TDD: RED reproduced two service instances calling acceptance with two Work Request calls and two activity calls; GREEN reduced both to one and returned one linked request/link identity.
- Verification: focused Learning project application/API suite `5/5`; user-product `349/349`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning application UI, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `64f308f feat: serialize learning project application acceptance`.
- Boundary: same-host/shared-root coordination only; no distributed acceptance coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning report creation

- Status: **B — owner/goal/period-scoped, durable, same-host cross-service idempotent report creation, and isolated-product verified; live model/provider execution remains unverified**. Learning report generation now serializes source-revision read, evidence aggregation, report save, and same-input re-read so concurrent requests produce one durable report identity.
- Evidence: `src/learning/report-lock.ts`, `src/learning/service.ts`, `tests/learning-report.test.ts`, and `tests/learning-report-api.test.ts`.
- TDD: RED reproduced two concurrent report requests returning `created: true` with two report identities; GREEN converged to one `created: true`, one `created: false`, and one stored report.
- Verification: focused Learning report suite `3/3`; user-product `350/350`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning report UI, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `72478a5 feat: serialize learning report creation`.
- Boundary: same-host/shared-root coordination only; no distributed report coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning goal session starts

- Status: **B — owner/goal/plan/day-scoped, durable, same-host cross-service idempotent session start, and isolated-product verified; live model/provider execution remains unverified**. Goal day session start now serializes active-session re-read, plan activation, goal activation/revision, and session save. Concurrent identical starts return the one active session; stale revision conflicts remain enforced when no matching active session exists.
- Evidence: `src/learning/goal-session-lock.ts`, `src/learning/service.ts`, `tests/learning-goal-start.test.ts`, and `tests/learning-goal-start-api.test.ts`.
- TDD: RED reproduced two concurrent starts creating two active session identities; GREEN converged to one session and preserved stale-revision rejection.
- Verification: focused Learning goal-start/API suite `4/4`; user-product `351/351`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning goal/day session, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `f07938f feat: serialize learning goal session starts`.
- Boundary: same-host/shared-root coordination only; no distributed session coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service legacy Learning session starts

- Status: **B — owner/plan-scoped, durable, same-host cross-service idempotent legacy session start, and isolated-product verified; live model/provider execution remains unverified**. The general Learning plan session start now serializes active-session re-read and session save, preventing two active sessions for one legacy plan.
- Evidence: `src/learning/session-start-lock.ts`, `src/learning/service.ts`, `tests/learning-persistence.test.ts`.
- TDD: RED reproduced two concurrent legacy starts creating two active session identities; GREEN converged to one session identity and one active stored session.
- Verification: focused Learning persistence suite `4/4`; user-product `352/352`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning session persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `77496e3 feat: serialize legacy learning session starts`.
- Boundary: same-host/shared-root coordination only; no distributed session coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning review completions

- Status: **B — owner/review-item-scoped, durable, same-host cross-service serialized review transitions, and isolated-product verified; live model/provider execution remains unverified**. Review completion now serializes item re-read, interval/review-count calculation, durable save, and verified activity recording so concurrent review actions preserve both transitions instead of losing an increment.
- Evidence: `src/learning/review-lock.ts`, `src/learning/service.ts`, `tests/learning-review-flow.test.ts`.
- TDD: RED reproduced two concurrent reviews both persisting `reviewCount: 1`; GREEN preserved sequential counts `[1, 2]` and two verified review events.
- Verification: focused Learning review/code-analysis suite `5/5`; user-product `353/353`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning review scheduling, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `111ca56 feat: serialize learning review completions`.
- Boundary: same-host/shared-root coordination only; no distributed review coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning coding attempt submissions

- Status: **B — owner/exercise/client-request-scoped, durable, same-host cross-service idempotent coding submission, and isolated-product verified; live verifier/provider execution remains unverified**. Coding attempt submission now serializes idempotency re-read, durable attempt save, optional explicitly injected verifier boundary, and activity receipt, so one client request ID creates one attempt.
- Evidence: `src/learning/coding-attempt-lock.ts`, `src/learning/service.ts`, `tests/learning-coding-test.test.ts`.
- TDD: RED reproduced two concurrent submissions with the same client request ID creating two attempt identities; GREEN returned one `created: true`, one `created: false`, and one stored attempt.
- Verification: focused Learning coding suite `4/4`; user-product `354/354`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained coding exercise persistence/local verifier boundaries, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `6740986 feat: serialize learning coding attempt submissions`.
- Boundary: same-host/shared-root coordination only; no distributed coding submission coordinator, live external execution/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning answer submissions

- Status: **B — owner/session/attempt-scoped, durable, same-host cross-service idempotent answer receipt creation, and isolated-product verified; live evaluator/provider execution remains unverified**. Learning answer submission now serializes source re-read, artifact merge, answer receipt save, pending feedback save, and optional explicitly injected evaluator boundary, so one session/attempt produces one answer receipt.
- Evidence: `src/learning/answer-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`, and `tests/learning-actions-answers-api.test.ts`.
- TDD: RED reproduced two concurrent answer submissions creating two receipt identities; GREEN converged to one receipt and one pending feedback record.
- Verification: focused Learning actions/answers suite `7/7`; user-product `355/355`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained answer evaluation-pending/artifact boundaries, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `aa0fad0 feat: serialize learning answer submissions`.
- Boundary: same-host/shared-root coordination only; no distributed answer coordinator, live evaluator/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning plan adjustments

- Status: **B — owner/goal/input-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Learning plan adjustment drafts now serialize the idempotency lookup and draft persistence by exact user/goal/input identity, so concurrent retries return one proposed adjustment.
- Evidence: `src/learning/plan-adjustment-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- TDD: RED reproduced two concurrent service instances creating two identical adjustment drafts; GREEN returned the same adjustment identity and retained one draft.
- Verification: focused Learning plan preview/adjustment suite `8/8`; user-product `347/347`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning plan preview/adjustment, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed Learning adjustment coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning plan previews

- Status: **B — owner/goal-scoped, durable, same-host cross-service idempotent with CAS preservation, and isolated-product verified; live model/provider execution remains unverified**. Learning plan preview creation now serializes interpretation/PlanVersion/goal revision writes per user/goal while retaining the initial expected-revision check, so concurrent retries return one preview and stale sequential calls still fail closed.
- Evidence: `src/learning/plan-preview-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- TDD: RED reproduced two concurrent service instances creating two plan versions; GREEN returned `[false,true]`, retained one PlanVersion, and preserved revision conflict behavior for stale sequential requests.
- Verification: focused Learning plan preview/API suite `8/8`; user-product `346/346`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning plan preview/adjustment and responsive `[390,768,1024,1440]` coverage across `13` routes with two-account isolation.
- Boundary: same-host/shared-root coordination only; no distributed Learning plan coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service Learning project applications

- Status: **B — owner/goal/project-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Learning project application creation now serializes the idempotency lookup and proposal save by exact user/goal/project identity, so concurrent retries return one proposed application.
- Evidence: `src/learning/project-application-lock.ts`, `src/learning/service.ts`, `tests/learning-project-application.test.ts`.
- TDD: RED reproduced two concurrent Learning service instances creating two application identities for the same goal/project; GREEN returned `[false,true]` and retained one proposal.
- Verification: focused Learning project application/API suite `4/4`; user-product `345/345`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Learning project application/approval, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed Learning application coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service AI Team discussion requests

- Status: **B — project/request-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. AI Team technical discussion requests now serialize the existing-request check, injected local Runtime dispatch, discussion persistence, and provenance receipt by exact project/request identity, so concurrent retries do not dispatch twice or create duplicate discussions.
- Evidence: `src/ai-team/discussion-lock.ts`, `src/ai-team/discussion-service.ts`, `tests/ai-team-discussion.test.ts`.
- TDD: RED reproduced the same discussion request dispatching twice and creating two discussion identities across service instances; GREEN dispatched once and returned one durable discussion to both callers.
- Verification: focused AI Team discussion suite `4/4`; user-product `344/344`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained AI discussion/approval surfaces, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed AI Team discussion coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service AI Team proposal requests

- Status: **B — project/request-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. AI Team proposal requests now serialize the existing-request check, injected local Runtime dispatch, and proposal persistence by exact project/request identity, so concurrent retries do not dispatch twice or create duplicate proposals.
- Evidence: `src/ai-team/proposal-lock.ts`, `src/ai-team/service.ts`, `tests/ai-team-proposals.test.ts`.
- TDD: RED reproduced the same request ID dispatching twice and creating two proposal identities across service instances; GREEN dispatched once and returned one durable proposal to both callers.
- Verification: focused AI Team proposal suite `3/3`; user-product `343/343`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained AI proposal execution approval, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed AI Team proposal coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service settings mutations

- Status: **B — owner-scoped, durable, same-host cross-service settings serialization, and isolated-product verified; live model/provider execution remains unverified**. User settings initialization and patch writes now share an exact hashed per-user filesystem lock, preserving independent permission and notification changes across service instances.
- Evidence: `src/settings/settings-lock.ts`, `src/settings/service.ts`, `tests/settings-isolation.test.ts`.
- TDD: RED reproduced cross-service settings updates losing the `memory` and `teamDocs` changes; GREEN preserved every independent AI access patch after the durable lock re-read.
- Verification: focused settings/API suite `4/4`; user-product `342/342`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained settings permission persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed settings coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service personal world mutations

- Status: **B — owner-scoped, durable, same-host cross-service personal-world serialization, and isolated-product verified; live model/provider execution remains unverified**. Personal world and character updates now share an exact hashed per-user filesystem lock, preserving disjoint world patches and keeping character synchronization inside the same user mutation boundary.
- Evidence: `src/personal-world/world-lock.ts`, `src/personal-world/service.ts`, `tests/personal-world-persistence.test.ts`.
- TDD: RED reproduced concurrent service instances losing the `displayName` patch while applying the `interests` patch; GREEN preserved both fields after the lock re-read.
- Verification: focused personal-world/API suite `4/4`; user-product `342/342`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained personal-world environment/customization, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed personal-world coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service recruitment application creation

- Status: **B — post/applicant-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Recruitment application creation now serializes the existing-application check, application record write, and activity receipt by exact post/applicant identity, so concurrent retries return one pending application.
- Evidence: `src/recruitment/application-lock.ts`, `src/recruitment/service.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED reproduced same-applicant concurrent support with both requests returning `created:true`; GREEN returned `[false,true]` and retained one application record.
- Verification: focused recruitment suite `2/2`; user-product `341/341`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained recruitment review, team invite, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed recruitment coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service platform user creation

- Status: **B — owner-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Platform user creation now serializes identity/profile/credential writes by explicit user ID and returns the existing record for concurrent retries.
- Evidence: `src/platform-user/user-lock.ts`, `src/platform-user/service.ts`, `tests/platform-user-isolation.test.ts`.
- TDD: RED reproduced same-ID concurrent creation with only `47/96` successful calls because the bounded file-lock wait was exhausted; GREEN completed all `96/96` calls and retained one user record after adding a process-local per-root/user queue in front of the durable cross-process lock.
- Verification: focused platform auth/isolation suite `11/11`; user-product `338/338`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed identity coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service community like toggles

- Status: **B — viewer/post-scoped, durable, same-host cross-service toggle serialization, and isolated-product verified; live model/provider execution remains unverified**. Community like toggles now re-read and mutate the exact viewer/post like record under a local queue plus durable filesystem lock, preventing lost toggles and Windows same-file rename collisions.
- Evidence: `src/community/like-lock.ts`, `src/community/service.ts`, `tests/community-flow.test.ts`.
- TDD: RED reproduced concurrent same-viewer toggles with a Windows `EPERM` rename race; GREEN serialized the two transitions as `[true,false]` and converged to `viewerLiked=false` with `likeCount=0`.
- Verification: focused community suite `6/6`; user-product `340/340`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained public community persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed reaction coordinator, provider-side delivery, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service password change compare-and-set

- Status: **B — owner-scoped, durable, same-host cross-service compare-and-set serialization, and isolated-product verified; live model/provider execution remains unverified**. Password verification, credential replacement, and old-session revocation now execute inside the explicit platform-user lock, so concurrent changes from the same prior password produce one winner and one bounded rejection.
- Evidence: `src/platform-user/user-lock.ts`, `src/platform-user/service.ts`, `tests/platform-user-auth.test.ts`.
- TDD: RED reproduced two concurrent password changes both succeeding against the same old credential; GREEN produced exactly one successful change, one current-password rejection, and one valid final credential.
- Verification: focused platform auth/isolation suite `12/12`; user-product `339/339`; serial root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed auth coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service study submission mutations

- Status: **B — study-space/task/user-scoped, durable, same-host cross-service serialized, and isolated-product verified; live model/provider execution remains unverified**. Personal study submissions now re-read and save under an exact hashed identity lock, while shared task access remains membership-bound.
- Evidence: `src/study/submission-lock.ts`, `src/study/service.ts`, `tests/study-space.test.ts`.
- TDD: RED reproduced 24 concurrent submission batches with only `8/24` completing; GREEN completed all `24/24` batches and retained one durable submission record with a valid final answer.
- Verification: focused study suite `4/4`; user-product `336/336`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained private study submissions, membership isolation, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service study space creation

- Status: **B — team-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Study space creation now serializes the one-active-space-per-study-team invariant before checking existing spaces and writing the creation activity event.
- Evidence: `src/study/space-lock.ts`, `src/study/service.ts`, `tests/study-space.test.ts`.
- TDD: RED reproduced two concurrent study space calls returning different space IDs; GREEN returned one shared space identity and retained one active space.
- Verification: focused study suite `5/5`; user-product `337/337`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed on retry after one unrelated Runtime journey flake. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service growth projection mutations

- Status: **B — owner/event-scoped, durable, same-host cross-service idempotent, notification-safe, and isolated-product verified; live model/provider execution remains unverified**. Verified activity growth projections and retractions now serialize on the exact event identity before reading the ledger and computing achievement deltas.
- Evidence: `src/growth/projection-lock.ts`, `src/growth/read-model.ts`, `tests/growth-achievements.test.ts`.
- TDD: RED reproduced 24 concurrent projection batches with only `7/24` complete; GREEN completed all `24/24` batches and retained exactly `100 XP` for the event.
- Verification: focused activity/growth suite `8/8`; user-product `335/335`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained growth achievements, activity timeline/export, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed growth coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service activity event mutations

- Status: **B — owner/event-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Activity event record and retract mutations now share an exact hashed lock for deterministic event identity.
- Evidence: `src/activity/event-lock.ts`, `src/activity/service.ts`, `tests/activity-growth-ledger.test.ts`.
- TDD: RED reproduced concurrent identical event writes with `45/48` successful calls; GREEN completed all `48/48` calls and retained exactly `24` deterministic event records.
- Verification: focused activity/growth/API/export suite `6/6`; user-product `334/334`; serial root `682/682` after one unrelated Windows-test flake was cleanly re-run; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation, reload persistence, activity timeline/export, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, external evidence provider delivery, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service portfolio entry mutations

- Status: **B — owner/entry-scoped, durable, same-host cross-service serialized, patch-preserving, and isolated-product verified; live model/provider execution remains unverified**. Portfolio entry updates now re-read and save under an exact hashed owner/entry lock, preserving disjoint title/visibility edits across service instances.
- Evidence: `src/portfolio/entry-lock.ts`, `src/portfolio/service.ts`, `tests/portfolio-provenance.test.ts`.
- TDD: RED reproduced a concurrent title/visibility update losing the title patch and leaving the initial entry; GREEN preserved both patches after the second service re-read under lock.
- Verification: focused portfolio/provenance/API suite `5/5`; user-product `333/333`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service team membership mutations

- Status: **B — team-scoped, durable, same-host cross-service membership serialization, capacity-safe, and isolated-product verified; live model/provider execution remains unverified**. Human and AI team membership add/remove/leave mutations now re-read and write under an exact hashed team lock below the teams root.
- Evidence: `src/teams/membership-lock.ts`, `src/teams/service.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED reproduced two service instances both accepting members into a capacity-two team, producing three active members; GREEN allowed exactly one add and returned `Team is full` for the other, preserving two active members.
- Verification: focused team membership/chat/API/collaboration suite `7/7`; user-product `330/330`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service community report idempotency

- Status: **B — reporter/target-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Community report creation now re-checks the exact open report identity under a durable lock before allocating a random report ID.
- Evidence: `src/community/report-lock.ts`, `src/community/service.ts`, `tests/community-flow.test.ts`.
- TDD: RED reproduced two concurrent identical reports returning different random IDs; GREEN converged both calls on one durable report identity.
- Verification: focused community/API/UI suite `10/10`; user-product `332/332`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, moderation workflow completion, provider-side delivery guarantee, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: Windows notification lock contention hardening

- Status: **B — existing user-notification idempotency boundary hardened for transient Windows file-handle timing and repeatedly verified**. When an `EPERM` open collision is immediately followed by `ENOENT` while the competing lock is disappearing, the notification lock now retries within its existing bounded wait instead of surfacing a false conflict.
- Evidence: `src/notifications/notification-lock.ts`, `tests/user-notifications.test.ts`.
- TDD/verification: the existing notification lock test intermittently reproduced the Windows `EPERM`/removed-record edge during full regression; after the bounded retry, five sequential focused runs passed `9/9` each, followed by product `330/330`, root `682/682`, both builds, both TypeScript checks, `git diff --check`, and isolated browser E2E.
- Boundary: no change to notification ownership, idempotency, event, or external delivery semantics; same-host/shared-root coordination remains the boundary, and provider-side exactly-once delivery is not claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred.

## 2026-09-28 continuation: durable cross-service social block mutations

- Status: **B — blocker/target-scoped, durable, same-host cross-service serialized, idempotent, and isolated-product verified; live model/provider execution remains unverified**. Block and unblock mutations now use an exact hashed lock for the blocker/target pair, re-read inside the lock, and return an existing active block without emitting a duplicate activity event.
- Evidence: `src/social/block-lock.ts`, `src/social/service.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced concurrent writes across 24 block records with `45/48` calls succeeding because of Windows file replacement contention; GREEN completed all `48/48` calls and retained exactly `24` active blocks.
- Verification: focused social safety/messaging/profile/API/UI suite `7/7`; user-product `331/331`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, provider-side delivery guarantee, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service friend request mutations

- Status: **B — friendship-record-scoped, durable, same-host cross-service idempotent, and isolated-product verified; live model/provider execution remains unverified**. Friend request creation now re-reads the deterministic friendship record under an exact hashed lock, so concurrent callers produce one pending request and one creation activity event. Accept/reject mutations use the same lock.
- Evidence: `src/social/friend-request-lock.ts`, `src/social/service.ts`, `tests/social-messaging.test.ts`, and the existing collaboration/social API/UI coverage.
- TDD: RED reproduced a Windows `EPERM` collision while two service instances replaced the same friendship file; GREEN returned one `created: true`, one `created: false`, one durable request, and one creation activity event.
- Verification: focused social/friend/API/UI suite `13/13`; user-product `329/329`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, external provider delivery, live model/provider quality, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Implementation and documentation commits follow this unit.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service social profile mutations

- Status: **B — owner-scoped, durable, same-host cross-service social profile serialization, and isolated-product verified; live model/provider execution remains unverified**. Social profile updates now re-read and save under an exact hashed per-user filesystem lock below the platform root, preserving disjoint bio/skills edits from competing service instances.
- Evidence: `src/social/profile-lock.ts`, `src/social/service.ts`, `tests/social-public-profile-privacy.test.ts`, and the social/profile UI contract tests.
- TDD: RED reproduced a concurrent bio/skills update ending with the default bio; GREEN preserved both patches across two service instances. The lock records bounded version/PID/token/timestamp metadata, protects active owners, reclaims only an exact dead-owner lock, fails closed on malformed records, and cleans the exact record in `finally`.
- Verification: focused social/profile/API/UI suite `11/11`; user-product `328/328`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Implementation and documentation commits follow this unit.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service private memory mutations

- Status: **B — owner/memory-scoped, durable, same-host cross-service mutation serialization, and isolated-product verified; live model/provider execution remains unverified**. Private memory update, sharing, and delete operations now re-read and mutate one memory under an exact hashed filesystem lock below the platform root. This prevents both last-writer field loss and Windows same-file rename collisions across service instances.
- Evidence: `src/memory/memory-lock.ts`, `src/memory/service.ts`, `tests/personal-memory-isolation.test.ts`, `tests/personal-memory-sharing.test.ts`, and `tests/user-ui-memory-contract.test.ts`.
- TDD: RED reproduced concurrent kind/source updates with a Windows `EPERM` rename race and lost patch; GREEN preserved both patches across two service instances. The lock records bounded version/PID/token/timestamp metadata, protects active owners, reclaims only an exact dead-owner lock, fails closed on malformed records, and cleans the exact record in `finally`.
- Verification: focused memory/sharing/UI suite `8/8`; user-product `327/327`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Implementation and documentation commits follow this unit.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service AI agent profile mutations

- Status: **B — owner-scoped, durable, same-host cross-service profile serialization, and isolated-product verified; live model/provider execution remains unverified**. AI agent profile updates now use an exact hashed per-user filesystem lock below the platform root and re-read the profile while holding it, preserving disjoint patches from competing service instances instead of allowing last-writer loss.
- Evidence: `src/ai-agent/profile-lock.ts`, `src/ai-agent/service.ts`, `tests/ai-agent-profile.test.ts`, and `tests/ai-agent-profile-api.test.ts`.
- TDD: RED reproduced a concurrent name/tone update ending with the default name; GREEN preserved both patches across two service instances. The lock records bounded version/PID/token/timestamp metadata, protects active owners, reclaims only an exact dead-owner lock, treats malformed records as a conflict, and cleans the exact record in `finally`.
- Verification: focused AI agent profile/API `6/6`; user-product `326/326`; serial root `682/682`; backend/user UI TypeScript checks, backend/user UI builds, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: implementation and documentation commits follow this unit.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable cross-service AI Chat conversation mutations

- Status: **B — owner-scoped, durable, same-host cross-service AI Chat mutation serialization, and isolated-product verified; live model/provider execution remains unverified**. AI Chat now protects each `<userId, conversationId>` read-modify-save mutation with an exact hashed filesystem lock below the AI Chat root. Concurrent service instances preserve both user messages instead of allowing a last-writer save to erase one.
- The lock covers user-message append/private-memory persistence, assistant completion, execution-plan approval/rejection, and approved-plan Work Request handoff. It records bounded version/PID/token/timestamp metadata, preserves active owners, reclaims only an exact dead-owner lock, fails closed on malformed records, handles Windows-open-file `EPERM` as bounded contention when the record exists, and cleans the exact record in `finally`.
- Evidence: `src/ai-chat/conversation-lock.ts`, `src/ai-chat/service.ts`, `tests/ai-chat-persistence.test.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-context-selection.test.ts`, `tests/ai-chat-attachments.test.ts`, `tests/ai-chat-execution-plan.test.ts`, `tests/ai-chat-local-runtime.test.ts`, `tests/ai-chat-project-context.test.ts`, `tests/ai-chat-api.test.ts`.
- Verification: AI Chat focused persistence/runtime/context/attachment/plan/API suite `35/35`; user-product regression `326/326`; final serial root regression `682/682`; backend and user UI TypeScript checks, backend and user UI builds, `git diff --check`, and isolated browser E2E passed. Browser coverage included private AI persistence/isolation, attachments, context selection, execution-plan approval, injected Runtime response, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `4f316ca feat: serialize AI chat conversation mutations`. Documentation commit follows this implementation commit.
- Remaining boundary: this is same-host/shared-root coordination only; the existing per-user Runtime dispatch gate remains process-local, no live Ollama/model quality or operational Runtime throughput is claimed, and no external provider/connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project Work Request cancellation lifecycle

- Status: **B — project Work Request lifecycle-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Queued Work Request cancellation now shares the exact durable lifecycle lock used by Run start, resume, pause, and retry, then re-reads the Work Request while holding that lock before allowing the terminal cancellation transition.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/work-request-lock.ts`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, and the Project Workspace cancellation/browser coverage.
- TDD: RED reproduced Run start and cancellation both succeeding when Run start was held inside enqueue; GREEN made cancellation wait for the shared lock, re-read the current state, and reject with the existing non-queued status boundary without changing the started Work Request back to cancelled.
- Verification: focused user-project execution suite `24/24`; user-product `362/362`; serial root `682/682`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, Project Workspace cancellation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `9d0ab4b feat: serialize project work request cancellation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root lifecycle coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project Work Request patch serialization

- Status: **B — Work Request-record-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. The common `updateProjectWorkRequest` read-modify-save path now re-reads the latest record under an exact durable update lock, preserving disjoint fields from competing project lifecycle, scheduler, reconciliation, and operator mutations.
- Evidence: `src/project-model/work-request.ts`, `src/project-model/work-request-lock.ts`, `tests/project-work-request.test.ts`, and the existing Project Workspace/API/runtime integration coverage.
- TDD: RED reproduced two concurrent patches losing `nodeId` when one caller updated execution fields and another updated status/run identity; GREEN serialized the per-Work Request patch and preserved `status`, `runId`, `nodeId`, and `executionRequestId` together.
- Verification: focused Work Request suite `15/15`; user-product `362/362`; serial root `683/683`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, Project Workspace cancellation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `e3b4236 feat: serialize project work request patches`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root record coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project Work Request reconciliation ordering

- Status: **B — Work Request-reconciliation-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Run reconciliation now serializes the full observe/decide/project boundary under a reconciliation-specific lock, so a stale WAITING or FAILED observation cannot overwrite a later terminal DONE projection.
- Evidence: `src/project-model/work-request.ts`, `src/project-model/work-request-lock.ts`, `tests/project-work-request.test.ts`, and the user-project execution/reconciliation coverage.
- TDD: RED reproduced a held WAITING observation overwriting a completed terminal projection; GREEN made reconciliation re-read after the competing projection and preserve `completed`. The first implementation attempt exposed a re-entrant Run-lock deadlock through `getProject()`; systematic debugging isolated that cycle, and the final design uses a distinct reconciliation lock so existing Run lifecycle paths remain non-blocking.
- Verification: focused Work Request suite `16/16` and combined Work Request/user-project execution suite `40/40`; user-product `362/362`; serial root `684/684`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, Project Workspace cancellation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `38bd3cb feat: serialize project work request reconciliation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root reconciliation ordering only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project Workspace mutations

- Status: **B — project-Workspace-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Workspace task-tree creation and Run attachment now share an exact project workspace lock, preventing concurrent Work Request creation or Run attachment from losing unrelated tree nodes.
- Evidence: `src/project-model/workspace-lock.ts`, `src/project-model/user-project-service.ts`, `src/project-model/workspace-run-preparation.ts`, `tests/user-project-execution.test.ts`, and the existing project API/runtime/browser coverage.
- TDD: RED reproduced two service instances creating distinct Work Requests while one Workspace task node disappeared from the final tree; GREEN serialized the Workspace read-modify-save boundary and retained both task nodes. Run attachment uses the same lock boundary.
- Verification: focused user-project execution suite `25/25`; user-product `363/363`; serial root `684/684`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, reload persistence, Project Workspace task/cancellation/runtime journeys, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `4f415b0 feat: serialize project workspace mutations`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Workspace coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project team transition synchronization

- Status: **B — project Workspace-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Project team-mode/team-id transitions now share the durable project Workspace mutation lock while updating the project record and its Workspace identity, so a competing Workspace mutation cannot interleave with the two-record transition.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/workspace-lock.ts`, `tests/user-project-team-transition.test.ts`, and the existing project team-transition/browser coverage.
- TDD: RED reproduced a team transition completing while an independent Workspace lock holder was still active; GREEN made the transition wait for the exact project Workspace lock and then persist the updated team identity in both records.
- Verification: focused team-transition suite `2/2`; user-product `364/364`; serial root `684/684`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage included `projectTeamTransitionUi`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2d9ceda feat: serialize project team transitions`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Workspace transition coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project purpose selection synchronization

- Status: **B — project Workspace-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Project purpose selection now holds the durable project Workspace mutation lock across purpose profile persistence and its history event, so concurrent Workspace writers cannot interleave with that read-modify-save boundary.
- Evidence: `src/project-model/workspace-store.ts`, `src/project-model/workspace-lock.ts`, `tests/project-purpose-profile.test.ts`, and the existing Project Workspace purpose/profile and browser coverage.
- TDD: RED reproduced purpose selection completing while an independent Workspace lock holder was still active; GREEN made selection wait with a bounded `2_000ms` lock wait and preserve the purpose selection after release.
- Verification: focused purpose/profile suite `10/10`; user-product `364/364`; serial root `684/684`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation, purpose-bound Project Workspace journeys, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `f1b93c3 feat: serialize project purpose selection`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Workspace purpose-selection coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable project history append-once synchronization

- Status: **B — project-history-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. `appendProjectHistoryEventOnce` now serializes its read/identity-check/append sequence under a project history lock, so concurrent identical event writers produce one durable history event and one winning result.
- Evidence: `src/project-model/history-lock.ts`, `src/project-model/history-store.ts`, `tests/project-model-stores.test.ts`, and the existing Project Workspace history/runtime/browser coverage.
- TDD: RED reproduced two concurrent identical append-once calls both returning `true` and writing duplicate history lines; GREEN added a distinct project-history lock with bounded waiting, active-owner protection, exact dead-owner reclaim, fail-closed malformed records, and `finally` cleanup.
- Verification: focused project-model stores suite `6/6`; user-product `364/364`; serial root `685/685`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Project Workspace history, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b94ead7 feat: serialize project history append-once`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root project history append-once coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable prototype candidate patch synchronization

- Status: **B — Prototype-candidate-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Prototype candidate read-modify-save patches now share an exact candidate lock, preserving disjoint status, promotion, acceptance, and metadata fields across competing service instances.
- Evidence: `src/project-model/prototype-lock.ts`, `src/project-model/prototype-store.ts`, `tests/project-model-stores.test.ts`, and the existing Idea Lab/Promotion/runtime/browser coverage.
- TDD: RED reproduced concurrent candidate patches losing the `status` field; GREEN made `updatePrototypeCandidate` re-read and save under a bounded, fail-closed Prototype lock with active-owner protection, dead-owner reclaim, malformed-record rejection, and `finally` cleanup.
- Verification: focused project-model stores suite `7/7`; user-product `364/364`; serial root `686/686`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Idea Lab/project history/runtime journeys, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `a87b29a feat: serialize prototype candidate patches`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Prototype candidate patch coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Prototype-to-Project promotion synchronization

- Status: **B — Prototype-promotion-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Prototype promotion now holds a durable promotion lock across candidate validation, Project Workspace creation/reconciliation, Genesis history import, and candidate promotion marking; process-local in-flight dedupe remains an optimization rather than the correctness boundary.
- Evidence: `src/project-model/promotion-lock.ts`, `src/project-model/promotion.ts`, `tests/project-model-promotion.test.ts`, and the existing Idea Lab/Project Workspace/browser promotion coverage.
- Verification: focused promotion suite `5/5`; user-product `364/364`; serial root `687/687`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed after a clean rerun. Browser coverage retained project history/runtime and AI approval journeys, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `d907b74 feat: serialize project promotion`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Prototype-to-Project promotion coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Idea Lab campaign event append-once synchronization

- Status: **B — Idea Lab campaign-event-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Campaign event append-once now serializes the semantic identity check and JSONL append, preventing duplicate event lines when Campaign supervisor/action instances race.
- Evidence: `src/idea-lab/event-lock.ts`, `src/idea-lab/event-store.ts`, `tests/idea-lab-stores.test.ts`, and the existing Idea Lab campaign/runtime/browser coverage.
- TDD: RED reproduced two concurrent identical campaign event appends both returning `true` and writing duplicates; GREEN added a campaign-event lock with bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, and `finally` cleanup.
- Verification: focused Idea Lab stores suite `5/5`; user-product `364/364`; serial root `688/688`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained Idea Lab Runtime status and Project Workspace journeys, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `82d476f feat: serialize Idea Lab campaign events`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Idea Lab campaign event coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Portfolio document patch synchronization

- Status: **B — project-Portfolio-scoped, durable, same-host cross-service serialized, and isolated-product verified; live Runtime/provider execution remains unverified**. Portfolio document section/readme read-modify-save updates now use a project-specific durable lock, preserving disjoint user edits across competing service instances.
- Evidence: `src/project-model/portfolio-lock.ts`, `src/project-model/portfolio-store.ts`, `tests/project-model-stores.test.ts`, and the existing Portfolio/API/browser coverage.
- TDD: RED reproduced concurrent Portfolio section patches losing one edited section; GREEN serialized the full validated read-modify-save path with bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, and `finally` cleanup.
- Verification: focused project-model stores suite `8/8`; user-product `364/364`; serial root `689/689`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained Portfolio provenance/public views, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `fe9fbce feat: serialize portfolio document patches`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root project Portfolio patch coordination only; no distributed coordinator, operational Runtime/Agent throughput or live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Learning lock cleanup ownership

- Status: **B — learning-domain durable locks now protect cleanup ownership across same-host service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. All 15 learning lock implementations now retain their generated owner token and remove a lock only when the on-disk record still carries that exact token, preventing an older holder's `finally` cleanup from deleting a replacement owner's lock on Windows/shared-root races.
- Evidence: `src/learning/lock-utils.ts`, the learning `*-lock.ts` modules, `tests/learning-session-completion.test.ts`, and the existing learning API/UI/browser coverage.
- Root cause: stale cleanup used unconditional `unlink(path)` after releasing the file handle. A waiter could acquire and rewrite the same path between handle close and cleanup, leaving the newer owner unprotected.
- Verification: focused learning session/action/content slice `19/19` before the direct ownership test and `6/6` for the session lock suite afterward; user-product `365/365`; serial root `698/698`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commits: `090c1e0 fix: protect learning lock cleanup ownership` and `05be081 test: cover learning lock cleanup ownership`. Documentation commit follows this implementation/test pair.
- Boundary: this hardens same-host/shared-root learning lock lifecycle cleanup only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable shared-domain lock cleanup ownership

- Status: **B — activity, growth, Personal World, platform user, portfolio, community, recruitment, social, study, teams, Personal AI, and AI Team locks now protect cleanup ownership across same-host service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. The shared `removeOwnedLock` boundary now checks the exact on-disk owner token before unlinking a lock, and 20 remaining lock implementations retain their token through `finally` cleanup.
- Evidence: `src/lock-utils.ts`, the updated activity/AI/community/growth/personal-world/platform-user/portfolio/recruitment/social/study/teams `*-lock.ts` modules, `tests/activity-growth-ledger.test.ts`, and the existing collaboration, notification, AI, project, and browser coverage.
- Root cause: these locks still used unconditional cleanup after releasing the file handle. A waiter could acquire and rewrite the path before the previous holder's cleanup ran, allowing the old holder to delete the replacement owner's lock.
- Verification: focused activity/growth slice `5/5`; user-product `366/366`; serial root `698/698`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `7c37b81 fix: protect shared lock cleanup ownership`. Documentation commit follows this implementation commit.
- Boundary: this hardens same-host/shared-root lock lifecycle cleanup only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable claim mutex cleanup ownership

- Status: **B — Discord progress dispatch and Project Work Request claim mutexes now retain cleanup ownership across same-host service instances; isolated product behavior remains verified, while live external delivery and Runtime/provider execution remain unverified**. Both anonymous `open("wx")` claim files now persist an owner token and remove the file only when that token still owns the path.
- Evidence: `src/discord-project/progress-notifications.ts`, `src/project-model/work-request.ts`, `src/lock-utils.ts`, `tests/discord-project-progress-notifications.test.ts`, `tests/project-work-request.test.ts`, and the existing notification/project/browser coverage.
- Root cause: claim-file `finally` blocks unconditionally unlinked the path after close, allowing a waiting worker or process to acquire a replacement claim before the old cleanup ran.
- Verification: focused Discord progress plus Work Request suites `20/20`; user-product `366/366`; serial root `698/698`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained project cancellation/runtime journeys, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `3ba2ad4 fix: protect claim lock cleanup ownership`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root claim lifecycle cleanup only; Discord delivery remains injected/local test behavior, and this does not claim live external connector delivery, distributed locking, operational Runtime/Agent throughput, weekly digest scheduling, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Evaluation observation append-once synchronization

- Status: **B — evaluation-observation-scoped, durable, same-host cross-service serialized, and isolated regression/browser verified; live evaluation provider and operational Runtime execution remain unverified**. Observation identity check and JSONL append now run under an evaluation-id lock, preventing duplicate observation records when separate evaluation workers report the same observation concurrently.
- Evidence: `src/evaluation/observation-lock.ts`, `src/evaluation/observation-store.ts`, `tests/evaluation-stores.test.ts`, and the existing evaluation/run/browser coverage.
- TDD: RED reproduced two concurrent append-once calls both returning `true` and writing two records; GREEN added bounded waiting, active-owner protection, exact dead-owner reclaim, malformed-record fail-closed behavior, token-owned cleanup, and the focused `4/4` regression.
- Verification: focused evaluation stores `4/4`; user-product `366/366`; serial root `699/699`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `bf630ef fix: serialize evaluation observation append-once`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root evaluation observation coordination only; no distributed evaluation coordinator, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable operator approval issuance synchronization

- Status: **B — Harness operator approval issuance is now serialized across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Requests sharing one `requestId` now use a request-scoped durable lock before the approval record and request index are created.
- Evidence: `src/harness/operator-approval-lock.ts`, `src/harness/operator-approval-store.ts`, `tests/harness-operator-reconciliation.test.ts`.
- TDD: RED reproduced multiple successful approval issuances for one request across eight independent module instances; GREEN added bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup.
- Verification: focused Harness operator reconciliation `7/7`; user-product `366/366`; serial root `703/703`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `6c1de6b fix: serialize operator approval issuance`. Documentation commit follows this implementation commit.
- Boundary: this closes the approval issuance race only; approval consumption remains a separate mutation boundary to harden next. It does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable operator approval consumption synchronization

- Status: **B — Harness operator approval consumption is now single-use across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Consumption now holds an approval-scoped durable lock across target validation and both approval/request-index state writes.
- Evidence: `src/harness/operator-approval-lock.ts`, `src/harness/operator-approval-store.ts`, `tests/harness-operator-reconciliation.test.ts`.
- TDD: RED reproduced file-write failures and multiple incomplete outcomes when eight independent service instances consumed one approval concurrently; GREEN added an approval-scoped lock using the existing bounded wait, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup policy.
- Verification: focused Harness operator reconciliation `8/8`; user-product `366/366`; serial root `704/704`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `3b9f996 fix: serialize operator approval consumption`. Documentation commit follows this implementation commit.
- Boundary: this closes same-host/shared-root approval consumption coordination only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop operator approval issuance synchronization

- Status: **B — Desktop Agent containment approval issuance is now serialized across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. Requests sharing one containment `requestId` now use a Desktop-state-root durable lock before the approval record and request index are created.
- Evidence: `src/desktop-agent/operator-reconciliation-lock.ts`, `src/desktop-agent/operator-reconciliation.ts`, `tests/desktop-agent-operator-reconciliation.test.ts`.
- TDD: RED reproduced five successful containment approval issuances for one request across eight independent service instances; GREEN added bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup.
- Verification: focused Desktop operator reconciliation `5/5`; user-product `366/366`; serial root `704/704`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `ee42694 fix: serialize desktop approval issuance`. Documentation commit follows this implementation commit.
- Boundary: this closes Desktop containment approval issuance only; approval consumption and job containment remain separate mutation boundaries to harden next. It does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop operator approval consumption synchronization

- Status: **B — Desktop Agent containment approval consumption is now single-use across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. Consumption now holds an approval-scoped durable lock across target validation and both approval/request-index state writes.
- Evidence: `src/desktop-agent/operator-reconciliation-lock.ts`, `src/desktop-agent/operator-reconciliation.ts`, `tests/desktop-agent-operator-reconciliation.test.ts`.
- TDD: RED reproduced incomplete outcomes and file-write failures when eight independent service instances consumed one containment approval concurrently; GREEN added the approval-scoped lock using bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup.
- Verification: focused Desktop operator reconciliation `6/6`; user-product `366/366`; serial root `704/704`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `84346d8 fix: serialize desktop approval consumption`. Documentation commit follows this implementation commit.
- Boundary: this closes Desktop containment approval consumption coordination only; job containment remains a separate mutation boundary to harden next. It does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop containment mutation synchronization

- Status: **B — Desktop Agent job containment now converges on one canonical record across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. A Job-scoped durable lock now covers inspection, approval consumption, and containment record creation.
- Evidence: `src/desktop-agent/operator-reconciliation-lock.ts`, `src/desktop-agent/operator-reconciliation.ts`, `tests/desktop-agent-operator-reconciliation.test.ts`.
- TDD: RED reproduced incomplete outcomes and competing containment writes when eight service instances used distinct valid approvals for one Job/operation; GREEN added bounded Job-scoped waiting with active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup.
- Verification: focused Desktop operator reconciliation `7/7`; user-product `366/366`; serial root `704/704`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `8fc618b fix: serialize desktop containment mutation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job containment coordination only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop verified-result reconciliation synchronization

- Status: **B — Desktop verified-result reconciliation is now single-winner across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. A Job-scoped durable lock now covers the load, exact-result identity check, lease acquisition, and completion transition.
- Evidence: `src/desktop-agent/operator-reconciliation-lock.ts`, `src/desktop-agent/operator-reconciliation.ts`, `tests/desktop-agent-operator-reconciliation.test.ts`.
- TDD: RED reproduced one successful reconciliation plus lease/complete failures when eight independent service instances replayed the same verified result; GREEN made the boundary converge to one `reconciled` result and seven `already-reconciled` results.
- Verification: focused Desktop operator reconciliation `8/8`; user-product `366/366`; serial root `704/704`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `c98eeb7 fix: serialize desktop result reconciliation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop verified-result reconciliation only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness Run compare-and-save synchronization

- Status: **B — Harness Run compare-and-save is now single-winner across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A Run-scoped durable lock now covers the persisted read, exact expected-envelope comparison, and normalized write.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-store.ts`, `tests/harness-run-store.test.ts`.
- TDD: RED reproduced eight successful compare-and-save writes for one expected Run across eight independent Run store instances; GREEN added bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup.
- Verification: focused Harness Run store `7/7`; user-product `366/366`; serial root `705/705`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `8472cee fix: serialize harness run compare-and-save`. Documentation commit follows this implementation commit.
- Boundary: this closes the `saveHarnessRunIfUnchanged` compare-and-save race only; ordinary Run saves, retry mutation/event append coordination, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness Run retry synchronization

- Status: **B — Harness Run retry requests are now single-acceptance across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. The Run-scoped durable lock now covers the FAILED_FINAL read, retry state transition, normalized Run write, and `retry-requested` event append.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-store.ts`, `src/harness/event-store.ts`, `tests/harness-run-store.test.ts`.
- TDD: RED reproduced eight accepted retry requests for one FAILED_FINAL Run across eight independent Run store instances; GREEN converges to one `accepted`, seven `already-active`, one active retry cycle, and one retry event.
- Verification: focused Harness Run store `8/8`; user-product `366/366`; serial root `706/706`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `b14ea3b fix: serialize harness run retries`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root retry mutation and event append coordination only; ordinary Run save coordination, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness event append-once synchronization

- Status: **B — Harness event identities now support single-winner append-once behavior across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Event append now uses a Run-scoped durable lock, and deterministic retry events use the append-once boundary.
- Evidence: `src/harness/event-lock.ts`, `src/harness/event-store.ts`, `src/harness/run-store.ts`, `tests/harness-event-store.test.ts`, `tests/harness-run-store.test.ts`.
- TDD: RED reproduced eight concurrent attempts for one event identity without an append-once API; GREEN added bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, token-owned cleanup, and one `true`/seven `false` result convergence.
- Verification: focused Harness Run + event stores `12/12`; user-product `366/366`; serial root `707/707`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `93f396b fix: serialize harness event append-once`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Harness event append coordination only; arbitrary event semantic ordering, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness Run supervisor ownership synchronization

- Status: **B — one Harness Run now has one active supervisor across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A separate supervisor-scoped durable lock prevents duplicate executor ownership while keeping user/operator mutation locks independent for pause and checkpoint control.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-supervisor.ts`, `tests/harness-run-supervisor.test.ts`.
- TDD: RED reproduced two executor calls for one Run from two independent supervisor instances; GREEN added a supervisor-scoped bounded lock, preserving the existing mutation lock for Run state writes and the in-flight pause/re-read boundary.
- Verification: focused Harness supervisor `9/9`; user-product `366/366`; serial root `708/708`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `470916a fix: serialize harness run supervisors`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root supervisor ownership coordination only; it does not claim distributed leadership, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness preflight refresh synchronization

- Status: **B — Harness preflight refresh now waits on the Run mutation lock across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. The full refresh read, target validation, policy preparation, and normalized Run write now share one bounded durable mutation boundary.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-service.ts`, `tests/harness-run-service.test.ts`.
- TDD: RED showed preflight refresh completing while a competing Run mutation lock was held; GREEN added the Run-scoped lock wrapper and retained the existing fail-closed validation for missing/non-ready Runs.
- Verification: focused Harness Run service `3/3`; user-product `366/366`; serial root `709/709`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `1a4afda fix: serialize harness preflight refresh`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root preflight refresh coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Harness Run creation synchronization

- Status: **B — initial Harness Run creation now waits on the Run mutation lock across same-host/shared-root service instances; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. Preflight preparation and the initial normalized envelope persistence now share one bounded Run-scoped durable mutation boundary.
- Evidence: `src/harness/run-lock.ts`, `src/harness/run-service.ts`, `tests/harness-run-service.test.ts`.
- TDD: RED showed initial Run creation completing while a competing Run mutation lock was held; GREEN added the Run-scoped lock wrapper without changing preflight validation or Run identity semantics.
- Verification: focused Harness Run service `4/4`; user-product `366/366`; serial root `710/710`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `fa8fd83 fix: serialize harness run creation`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root initial Run creation coordination only; it does not claim distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, or AI Broadcast Room implementation.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop Job lease acquisition synchronization

- Status: **B — Desktop Job lease acquisition is now exclusive across same-host/shared-root Agent instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. Job-scoped durable coordination now covers lease inspection, containment check, attempt increment, and lease persistence.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED reproduced six successful lease acquisitions for one pending Job across eight independent Job store instances; GREEN added bounded waiting, active-owner protection, dead-owner reclaim, malformed-record fail-closed behavior, EPERM probing, and token-owned cleanup, converging to one lease and seven active-lease rejections.
- Verification: focused Desktop Job store `9/9`; user-product `366/366`; serial root `711/711`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `ba2e149 fix: serialize desktop job lease acquisition`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job lease acquisition only; renew/complete/requeue mutation coordination, distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop Job completion synchronization

- Status: **B — Desktop Job terminal completion now accepts one immutable result across same-host/shared-root Agent instances; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. Job-scoped durable coordination now covers result identity validation, terminal-state inspection, lease-owner validation, and result persistence.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED reproduced seven successful conflicting completions for one leased Job across eight independent Job store instances; GREEN added the Job-scoped lock boundary so one result wins and later conflicting results fail closed as immutable.
- Verification: focused Desktop Job store `10/10`; user-product `366/366`; serial root `712/712`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `ba34d89 fix: serialize desktop job completion`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job terminal completion only; renew/indeterminate/requeue coordination, distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-28 continuation: durable Desktop Job requeue transition synchronization

- Status: **B — Desktop Job completion and requeue transitions now serialize on one Job-scoped durable boundary; isolated product behavior remains verified, while live Runtime/Agent execution remains unverified**. A concurrent completion can no longer be overwritten by a requeue, and whichever transition wins leaves the second operation to validate the new durable state.
- Evidence: `src/desktop-agent/job-lock.ts`, `src/desktop-agent/job-store.ts`, `tests/desktop-agent-job-store.test.ts`.
- TDD: RED reproduced both completion and requeue succeeding for one leased Job across independent instances; GREEN added the same Job lock to requeue, yielding exactly one successful transition and one state-based rejection.
- Verification: focused Desktop Job store `11/11`; user-product `366/366`; serial root `713/713`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `8241916 fix: serialize desktop job requeue transitions`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Desktop Job completion/requeue transition coordination only; renew/indeterminate coordination, distributed locking, live Runtime/Agent throughput, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable incoming friend-request read authorization rechecks

- Status: **B — incoming friend-request reads now acquire the canonical social pair lock and recheck block state before exposing the pending request or requester profile; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A block that wins the pair lock while the read is waiting can no longer leave a stale pending request visible.
- Evidence: `src/social/service.ts`, `tests/social-safety.test.ts`.
- TDD: RED reproduced the incoming request read completing while the shared social pair lock was held and a block was persisted; GREEN wrapped each pending incoming request projection in the pair lock and rechecked the bilateral block before profile projection.
- Verification: focused Social safety/messaging/API suites `11/11`; user-product `389/389`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `0d62fae fix: serialize incoming friend request reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root incoming friend-request read and social block authorization coordination only; direct-message read coordination, list-profile read coordination, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Chat read synchronization

- Status: **B — AI Chat conversation reads now acquire the canonical conversation lock before projecting per-user state; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent message or execution-plan mutation can no longer leave `getConversation` or `listConversations` with an unlocked stale projection.
- Evidence: `src/ai-chat/service.ts`, `src/ai-chat/conversation-lock.ts`, `src/ai-chat/store.ts`, `tests/ai-chat-persistence.test.ts`.
- TDD: RED reproduced conversation reads completing while the conversation lock was held; GREEN added lock boundaries for direct and list reads and verified the latest durable conversation after release.
- Verification: focused AI Chat persistence `4/4`; Iseol user-product `406/406`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A first browser attempt had one unrelated portfolio timeout; the immediate rerun passed all checks.
- Implementation commit: `6ff5533 fix: serialize ai chat reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root AI Chat conversation read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Agent profile read synchronization

- Status: **B — AI Agent profile reads now acquire the canonical profile lock before projecting the authenticated user's profile; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent profile update can no longer leave `getProfile` with an unlocked stale read.
- Evidence: `src/ai-agent/service.ts`, `src/ai-agent/profile-lock.ts`, `src/ai-agent/store.ts`, `tests/ai-agent-profile.test.ts`.
- TDD: RED reproduced the profile read completing while the profile lock was held; GREEN added the shared lock boundary and verified the latest durable profile after release.
- Verification: focused AI Agent profile suite `5/5`; Iseol user-product `406/406`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes. A first root run had two unrelated integration test connection races; their standalone suite passed `10/10`, and the full root rerun passed `726/726`.
- Implementation commit: `d460390 fix: serialize ai agent profile reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root AI Agent profile read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Team read synchronization

- Status: **B — AI Team proposal and discussion lists now acquire each canonical item lock before projecting shared project state; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent proposal decision or discussion update can no longer leave list reads with an unlocked stale projection.
- Evidence: `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `src/ai-team/proposal-lock.ts`, `src/ai-team/discussion-lock.ts`, `src/ai-team/store.ts`, `src/ai-team/discussion-store.ts`, `tests/ai-team-proposals.test.ts`, `tests/ai-team-discussion.test.ts`.
- TDD: RED reproduced both proposal and discussion list reads completing while their item locks were held; GREEN added per-item lock/reload boundaries and verified the latest durable projection after release.
- Verification: focused AI Team proposal/discussion suites `13/13`; Iseol user-product `408/408`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `66eb56f fix: serialize ai team reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root AI Team proposal/discussion list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Workspace read synchronization

- Status: **B — Project Workspace `getProject` now acquires the canonical project workspace lock before projecting workspace, work request, Runtime, evidence, lifecycle, and history state; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent workspace mutation can no longer leave the full project view with an unlocked stale projection.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/workspace-lock.ts`, `src/project-model/workspace-store.ts`, `tests/user-project-execution.test.ts`.
- TDD: RED reproduced the project read completing while the workspace lock was held; GREEN added the project-scoped read boundary and verified the latest durable workspace projection after release.
- Verification: focused user-project execution `26/26`; Iseol user-product `409/409`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `ca8fa13 fix: serialize project reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Project Workspace read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning session read synchronization

- Status: **B — Learning session lists now acquire each canonical session lock before projecting the authenticated user's sessions; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent session resume/completion can no longer leave the session list with an unlocked stale projection.
- Evidence: `src/learning/service.ts`, `src/learning/session-lock.ts`, `src/learning/store.ts`, `tests/learning-goal-start.test.ts`.
- TDD: RED reproduced the session list completing while the session lock was held; GREEN added per-session lock/reload boundaries and verified the latest durable session after release.
- Verification: focused Learning goal/session start `4/4`; Iseol user-product `410/410`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `0cb33b4 fix: serialize learning session reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Learning session list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning action read synchronization

- Status: **B — Learning session action lists now acquire the canonical action request and persisted-record locks before projecting the authenticated user's actions; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent action recording or completion can no longer leave the action list with an unlocked stale projection.
- Evidence: `src/learning/service.ts`, `src/learning/action-lock.ts`, `src/learning/store.ts`, `tests/learning-actions-answers.test.ts`.
- TDD: RED reproduced the action list completing while the action lock was held; GREEN added deterministic nested read locks for the request key and persisted action identity. A transient same-lock Runtime callback deadlock was caught by the existing callback test and removed by preserving the completion lock identity while keeping the read-side two-key boundary.
- Verification: focused Learning action/answer suite `10/10`; Iseol user-product `411/411`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `cfaf65a fix: serialize learning action reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Learning session action list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning feedback read synchronization

- Status: **B — Learning answer feedback reads now acquire the canonical feedback completion lock and reload the answer/feedback projection before returning; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent feedback evaluation or dispute transition can no longer leave the feedback read with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/feedback-completion-lock.ts`, `src/learning/store.ts`, `tests/learning-actions-answers.test.ts`.
- TDD: RED reproduced the feedback read completing while the feedback completion lock was held; GREEN added the lock boundary and verified the latest durable blocker/projection after release.
- Verification: focused Learning action/answer suite `11/11`; Iseol user-product `412/412`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `94a1c74 fix: serialize learning feedback reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Learning answer feedback read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning report read synchronization

- Status: **B — Learning report lists now acquire each report-period lock before reloading the report projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent report generation/update can no longer leave the report list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/report-lock.ts`, `src/learning/store.ts`, `tests/learning-report.test.ts`.
- TDD: RED reproduced the report list completing while the report-period lock was held; GREEN added the per-report lock/reload boundary and verified the latest durable summary after release.
- Verification: focused Learning report suite `4/4`; Iseol user-product `413/413`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. A root run had one unrelated ChatGPT Web store race; the affected file passed `12/12`, and the subsequent full root rerun passed `726/726`. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `cd3393e fix: serialize learning report reads`. Documentation commit follows this implementation commit.
- Boundary: same-host/shared-root Learning report list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable User Project list read synchronization

- Status: **B — User Project lists now acquire each project workspace lock before reloading the visible project projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent project/team update can no longer leave the project list with an unlocked stale result.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/workspace-lock.ts`, `tests/user-project-execution.test.ts`.
- TDD: RED reproduced the project list completing while the workspace lock was held; GREEN added the per-project lock/reload boundary and verified the visible project after release.
- Verification: focused User Project suite `27/27`; Iseol user-product `418/418`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `72d2f15 fix: synchronize user project list reads`; merged by PR #61 with merge commit `5960b3a`.
- Boundary: same-host/shared-root User Project list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning due-review read synchronization

- Status: **B — Due Learning review lists now acquire each durable review lock before reloading the due item projection; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent review completion can no longer leave the due-review list with an unlocked stale result.
- Evidence: `src/learning/service.ts`, `src/learning/review-lock.ts`, `src/learning/store.ts`, `tests/learning-review-flow.test.ts`.
- TDD: RED reproduced the due-review list completing while the review lock was held; GREEN added the per-item lock/reload boundary and verified the current due item after release.
- Verification: focused Learning review suite `6/6`; Iseol user-product `419/419`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `a0ad4ec fix: synchronize due review reads`; merged by PR #62 with merge commit `adb0e63`.
- Boundary: same-host/shared-root Learning due-review list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Activity event read synchronization

- Status: **B — Activity event lists and direct reads now acquire the canonical event lock before reloading owner-scoped projections; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent activity retraction or creation cannot leave activity reads with an unlocked stale result.
- Evidence: `src/activity/service.ts`, `src/activity/event-lock.ts`, `src/activity/store.ts`, `tests/activity-growth-ledger.test.ts`.
- TDD: RED reproduced activity event list/direct reads completing while the event lock was held; GREEN added per-event lock/reload boundaries and verified the durable projections after release.
- Verification: focused Activity growth ledger suite `6/6`; Iseol user-product `420/420`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `8984c37 fix: synchronize activity event reads`; merged by PR #64 with merge commit `94884c0`.
- Boundary: same-host/shared-root Activity event read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Recruitment post read synchronization

- Status: **B — Recruitment post lists and direct reads now acquire the canonical Team membership lock before reloading post projections; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent post closure or membership change cannot leave recruitment reads with an unlocked stale result.
- Evidence: `src/recruitment/service.ts`, `src/recruitment/store.ts`, `src/teams/membership-lock.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED reproduced the recruitment post list completing while the Team membership lock was held; GREEN added per-team lock/reload boundaries for list and direct reads and verified that a closed post is excluded after release.
- Verification: focused Recruitment suite `6/6`; collaboration/notification regression `17/17`; Iseol user-product `421/421`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `0f501ae fix: synchronize recruitment post reads`; merged by PR #66 with merge commit `dbbd5ce`.
- Boundary: same-host/shared-root Recruitment post read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable private Memory read synchronization

- Status: **B — private Memory lists now acquire the canonical owner/memory lock before reloading records; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent memory edit or deletion cannot leave a private memory list with an unlocked stale result.
- Evidence: `src/memory/service.ts`, `src/memory/memory-lock.ts`, `src/memory/store.ts`, `tests/personal-memory-isolation.test.ts`.
- TDD: RED reproduced the private memory list completing while the memory lock was held; GREEN added per-memory lock/reload boundaries, skipped malformed identities fail-closed, and verified the latest durable content after release.
- Verification: focused Memory isolation/sharing suite `10/10`; Iseol user-product `422/422`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `ec634f5 fix: synchronize private memory reads`; merged by PR #68 with merge commit `d806ee2`.
- Boundary: same-host/shared-root private Memory list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Integration delivery read synchronization

- Status: **B — Integration delivery lists now acquire each canonical owner/delivery lock before reloading delivery projections; isolated product behavior remains verified, while live provider execution remains unverified**. A concurrent dispatch state transition cannot leave a delivery list with an unlocked stale result.
- Evidence: `src/integrations/service.ts`, `src/integrations/delivery-lock.ts`, `src/integrations/store.ts`, `tests/integrations-delivery.test.ts`.
- TDD: RED reproduced the delivery list completing while the delivery lock was held; GREEN added per-delivery lock/reload boundaries, skipped malformed identities fail-closed, and verified the latest durable blocked state after release.
- Verification: focused Integration delivery suite `11/11`; settings/integrations regression `16/16`; Iseol user-product `422/422`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `8339d61 fix: synchronize integration delivery reads`; merged by PR #70 with merge commit `27831fd`.
- Boundary: same-host/shared-root Integration delivery read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery itself, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Personal World read synchronization

- Status: **B — Personal World and Character reads now acquire the canonical owner/world lock before creating or reloading projections; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent world or character update cannot leave personal-world reads with an unlocked stale result.
- Evidence: `src/personal-world/service.ts`, `src/personal-world/world-lock.ts`, `src/personal-world/store.ts`, `tests/personal-world-persistence.test.ts`.
- TDD: RED reproduced the Personal World and Character reads completing while the world lock was held; GREEN added the lock/reload boundary and verified the latest durable world and character after release.
- Verification: focused Personal World persistence suite `4/4`; Iseol user-product `423/423`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `6dcf301 fix: synchronize personal world reads`; merged by PR #72 with merge commit `3fc73c4`.
- Boundary: same-host/shared-root Personal World/Character read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Growth snapshot read synchronization

- Status: **B — Growth snapshots now acquire each canonical event projection lock before reloading owner-scoped ledger entries; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent growth projection or retraction cannot leave a snapshot with an unlocked stale ledger entry.
- Evidence: `src/growth/read-model.ts`, `src/growth/projection-lock.ts`, `src/growth/ledger.ts`, `tests/activity-growth-ledger.test.ts`.
- TDD: RED reproduced the Growth snapshot completing while the event projection lock was held; GREEN added event-grouped lock/reload boundaries, skipped malformed or foreign rows fail-closed, and verified the latest durable XP after release.
- Verification: focused Growth/Activity suites `11/11`; Iseol user-product `424/424`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `f6a9345 fix: synchronize growth snapshot reads`; merged by PR #74 with merge commit `5dbd3bc`.
- Boundary: same-host/shared-root Growth snapshot read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Learning Goal read synchronization

- Status: **B — Learning Goal reads now acquire the canonical owner/goal lock before reloading projections, and plan preview/adjustment acceptance share that lock before Goal updates; isolated product behavior remains verified, while live Runtime/provider execution remains unverified**. A concurrent plan transition cannot leave Goal reads with an unlocked stale state.
- Evidence: `src/learning/goal-lock.ts`, `src/learning/service.ts`, `src/learning/store.ts`, `tests/learning-goals.test.ts`.
- TDD: RED reproduced Goal get/list reads completing while the Goal lock was held; GREEN added the durable lock/reload boundary, dead-owner cleanup, and verified the latest paused Goal after release.
- Verification: focused Learning goal/plan/progress/today regression `27/27`; Iseol user-product `425/425`; serial root `726/726`; backend `tsc` build, user UI build, `git diff --check`, and isolated browser E2E passed. Browser coverage retained two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `2ff5117 fix: synchronize learning goal reads`; merged by PR #76 with merge commit `d58a6af`.
- Boundary: same-host/shared-root Learning Goal read and Goal-update coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team collaboration access read synchronization

- Status: **B — Team collaboration authorization now re-checks both human memberships under each team’s durable membership lock; live Runtime/provider execution remains unverified**. A concurrent team member removal can no longer leave the shared-team collaboration check with an unlocked stale allow result.
- Evidence: `src/teams/service.ts`, `src/teams/membership-lock.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED reproduced `canCollaborate` returning while the Team membership lock was held; GREEN added the per-team lock and current Team/membership reload, then verified the removed member was denied after release.
- Verification: focused Team ACL suite `6/6`; collaboration regression `53/53`; user-product `433/433`; pre-merge serial root `727/727`; post-merge root re-run encountered the existing/nondeterministic ChatGPT Web E2E assertion `tests/chatgpt-web-e2e.test.ts:134` (`expected PR, actual COMMIT`); backend `tsc` build and `git diff --check` passed.
- Implementation commit: `2111578 fix: synchronize team collaboration access reads`; merged by PR #96 with merge commit `3f93941`.
- Boundary: same-host/shared-root Team collaboration authorization reads only; `canAccess` remains separate because project creation/team transition already call it while holding the Team membership lock and a naive nested lock would deadlock. Distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team access read synchronization

- Status: **B — Team access authorization now acquires the canonical Team membership lock and reloads current Team/viewer membership state; project mutation paths use an explicit lock-held 판정 경계 to avoid nested-lock deadlock, while live Runtime/provider execution remains unverified**. A concurrent membership removal can no longer leave `canAccess` with an unlocked stale allow result.
- Evidence: `src/teams/contracts.ts`, `src/teams/service.ts`, `src/project-model/user-project-service.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/team-membership-acl.test.ts`, `tests/user-project-team-transition.test.ts`.
- TDD: RED reproduced `canAccess` returning while the Team membership lock was held; GREEN added the durable lock/reload boundary, the lock-held internal access predicate, Runtime wiring, and verified the removed viewer was denied after release without deadlocking project creation or team transition.
- Verification: focused Team ACL/project/AI team regression `23/23`; collaboration regression `54/54`; Iseol user-product `434/434`; serial root `727/727`; backend `tsc` build and `git diff --check` passed. A parallel-only Windows temporary rename `EPERM` was not reproduced by the serial rerun.
- Implementation commit: `247d46c fix: synchronize team access reads`; merged by PR #98 with merge commit `7734f90`.
- Boundary: same-host/shared-root Team access authorization reads and the project mutation integration boundary only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team manager read synchronization

- Status: **B — Team manager authorization now acquires the canonical Team membership lock and reloads current Team/membership role state; lock-held AI Team, Recruitment, and Study paths use an explicit internal predicate to avoid nested-lock deadlock, while live Runtime/provider execution remains unverified**. A concurrent manager-role downgrade can no longer leave `isManager` with an unlocked stale allow result.
- Evidence: `src/teams/contracts.ts`, `src/teams/service.ts`, `src/ai-team/service.ts`, `src/recruitment/service.ts`, `src/study/service.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED reproduced `isManager` returning while the Team membership lock was held; GREEN added the durable lock/reload boundary, the lock-held manager predicate, and updated lock-held service paths, then verified the downgraded owner was denied after release without deadlocking dependent flows.
- Verification: focused Team/Study/Recruitment/AI team regression `38/38`; collaboration regression `55/55`; Iseol user-product `435/435`; serial root `727/727`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `9fd202b fix: synchronize team manager reads`; merged by PR #100 with merge commit `4c4a5eb`.
- Boundary: same-host/shared-root Team manager authorization reads and dependent lock-order integration only; recruitment application review remains a separate mutation-lock boundary, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Recruitment review membership synchronization

- Status: **B — Recruitment application review now serializes the review lock before the canonical Team membership lock, re-checks current manager authority and application state, and adds accepted members through the lock-held Team boundary; live Runtime/provider execution remains unverified**. A manager change cannot leave review authorization and accepted membership insertion on separate unlocked reads.
- Evidence: `src/recruitment/service.ts`, `src/teams/contracts.ts`, `src/teams/service.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED showed recruitment review using public manager/member methods instead of the Team lock-held boundaries; GREEN added `addMemberWithinMembershipLock`, unified review lock ordering with application read paths, and verified the guarded review uses only lock-held manager/member calls.
- Verification: focused Team/Study/Recruitment/AI team regression `39/39`; collaboration regression `56/56`; Iseol user-product `436/436`; serial root `727/727`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `898216a fix: synchronize recruitment review membership`; merged by PR #102 with merge commit `2947894`.
- Boundary: same-host/shared-root Recruitment application review and Team membership lock-order integration only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team detail read synchronization

- Status: **B — Team detail authorization now acquires the canonical Team membership lock and reloads current Team/membership state; Study, Recruitment, and Team Chat lock-held paths use an explicit internal predicate to avoid nested-lock deadlock, while live Runtime/provider execution remains unverified**. A concurrent private-team membership removal can no longer leave `getTeam` with an unlocked stale allow result.
- Evidence: `src/teams/contracts.ts`, `src/teams/service.ts`, `src/study/service.ts`, `src/recruitment/service.ts`, `src/team-chat/service.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED reproduced `getTeam` returning while the Team membership lock was held; GREEN added the durable lock/reload boundary, the lock-held Team detail predicate, updated dependent lock-held paths, and verified the removed private viewer was denied after release without deadlocking dependent flows.
- Verification: focused Team/Study/Recruitment/AI team/Team Chat regression `57/57`; collaboration regression `57/57`; Iseol user-product `437/437`; serial root `727/727`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ad840ef fix: synchronize team reads`; merged by PR #104 with merge commit `ea98a14`.
- Boundary: same-host/shared-root Team detail authorization reads and dependent lock-order integration only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team membership list read synchronization

- Status: **B — Team membership list reads now acquire the canonical Team membership lock and reload current active memberships; AI Team and Memory lock-held paths use an explicit internal predicate to avoid nested-lock deadlock, while live Runtime/provider execution remains unverified**. A membership removal during a waiting list read can no longer leave the caller with an unlocked stale membership result.
- Evidence: `src/teams/contracts.ts`, `src/teams/service.ts`, `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `src/memory/service.ts`, `tests/team-membership-acl.test.ts`.
- TDD: RED reproduced `listMemberships` returning while the Team membership lock was held; GREEN added the durable list-read lock, the lock-held membership predicate, updated AI Team and Memory lock-held paths, and verified the removed member was absent after release without deadlocking dependent flows.
- Verification: focused Team/AI Team/Memory regression `23/23`; collaboration regression `58/58`; Iseol user-product `438/438`; serial root `727/727`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `a60efce fix: synchronize team membership reads`; merged by PR #106 with merge commit `7326a67`.
- Boundary: same-host/shared-root Team membership list authorization reads and dependent lock-order integration only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, push, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project binding read synchronization

- Status: **B — Discord Project binding reads now wait for the same durable lock used by binding creation/deletion, preserving fail-closed context and progress resolution while live Runtime/provider execution remains unverified**. A read waiting behind a binding mutation cannot return an unlocked stale value.
- Evidence: `src/discord-project/binding-store.ts`, `src/discord-project/binding-lock.ts`, `src/discord-project/context-resolver.ts`, `src/discord-project/progress-discord-adapter.ts`, `tests/discord-project-binding.test.ts`.
- TDD: RED reproduced `loadDiscordProjectBinding` completing while the binding lock was held; GREEN made the public read path wait for the shared lock and verified the binding after release.
- Verification: Discord Project related regression `42/42`; full test suite `729/729`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `eb75546 fix: synchronize Discord project binding reads`; merged by PR #110 with merge commit `616c3f6`.
- Boundary: same-host/shared-root Discord Project binding read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord progress delivery synchronization

- Status: **B — direct Discord progress notification delivery now serializes by project/event identity with stale-owner cleanup, while adapter dispatch semantics and live Runtime/provider execution remain unverified**. Concurrent direct delivery cannot append the same event without rechecking the durable log.
- Evidence: `src/discord-project/progress-notification-lock.ts`, `src/discord-project/progress-notifications.ts`, `tests/discord-project-progress-notifications.test.ts`.
- TDD: RED reproduced the missing progress delivery lock module; GREEN added the durable event lock, bounded wait, stale-owner cleanup, and verified direct delivery waits behind a held lock.
- Verification: Discord Project related regression `43/43`; full test suite `730/730`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `75abde1 fix: synchronize Discord progress delivery`; merged by PR #112 with merge commit `64fdd35`.
- Boundary: same-host/shared-root Discord progress notification durable-log coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project status read synchronization

- Status: **B — bound Discord Project status snapshots now wait for the canonical Project Workspace lock before reading Workspace and attached Run state, while legacy/stale reads and live Runtime/provider execution remain unverified**. A status request cannot complete inside a concurrent Workspace mutation window.
- Evidence: `src/discord-project/status-card.ts`, `src/commands/project.ts`, `src/project-model/workspace-lock.ts`, `tests/discord-project-status.test.ts`.
- TDD: RED reproduced bound status completing while the Project Workspace lock was held; GREEN added the optional workspace-root lock boundary, wired the real command root, and verified the status snapshot after release.
- Verification: Discord Project related regression `44/44`; serial full test suite `731/731`; backend `tsc` build and `git diff --check` passed. Parallel root execution still exposes pre-existing nondeterministic E2E/heartbeat/desktop timing failures and is not treated as clean evidence.
- Implementation commit: `15bc1f3 fix: synchronize Discord project status reads`; merged by PR #114 with merge commit `f02d20e`.
- Boundary: same-host/shared-root Discord Project status read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project bind validation synchronization

- Status: **B — Discord Project bind now keeps active Workspace/root validation and binding creation inside the canonical Workspace lock, while live Runtime/provider execution remains unverified**. A Workspace transition cannot race the bind command between validation and binding write.
- Evidence: `src/discord-project/project-command-actions.ts`, `src/commands/project.ts`, `src/project-model/workspace-lock.ts`, `tests/discord-project-command-actions.test.ts`.
- TDD: RED reproduced bind completion while the Project Workspace lock was held; GREEN added the optional workspace-root lock boundary, wired the real command root, and verified binding only proceeds after release.
- Verification: Discord Project related regression `45/45`; serial full test suite `732/732`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `06823c3 fix: synchronize Discord project binding validation`; merged by PR #116 with merge commit `a494bcd`.
- Boundary: same-host/shared-root Discord Project bind validation and binding-write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project context read synchronization

- Status: **B — bound Discord Project context resolution now waits for the canonical Project Workspace lock while reading Workspace and node/Run relations; live Runtime/provider execution remains unverified**. History action, status, calendar, GitHub polling, and webhook callers pass the shared model root into this boundary.
- Evidence: `src/discord-project/context-resolver.ts`, `src/discord-project/action-context.ts`, `src/discord-project/history-recorder.ts`, `src/commands/project.ts`, `src/services/calendar/calendar-discord.ts`, `src/services/github-automation-polling.ts`, `src/services/webhook-server.ts`, `tests/discord-project-context.test.ts`.
- TDD: RED reproduced bound context resolution completing while the Project Workspace lock was held; GREEN added the optional workspace-root lock boundary, wired action/history callers, and verified the bound context after release.
- Verification: Discord Project related regression `46/46`; serial full test suite `733/733`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `e159b46 fix: synchronize Discord project context reads`; merged by PR #118 with merge commit `aad71d0`.
- Boundary: same-host/shared-root Discord Project context and dependent action-history read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: shared Discord progress event lock synchronization

- Status: **B — direct progress-log delivery and adapter-backed Discord dispatch now share one project/event durable lock, while external delivery quality and live Runtime/provider execution remain unverified**. The two delivery paths converge on one durable event result instead of racing through separate lock files.
- Evidence: `src/discord-project/progress-notifications.ts`, `src/discord-project/progress-notification-lock.ts`, `tests/discord-project-progress-notifications.test.ts`.
- TDD: RED reproduced direct delivery appending while adapter dispatch was blocked in an external send; GREEN unified both paths on the shared lock and preserved `unknown` on lock contention.
- Verification: Discord Project related regression `47/47`; serial full test suite `734/734`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `e76e343 fix: unify Discord progress event locks`; merged by PR #120 with merge commit `e8ba8f3`.
- Boundary: same-host/shared-root Discord progress event delivery coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Discord Project status Run read synchronization

- Status: **B — bound Discord Project status snapshots now wait for the canonical Project Workspace lock and each attached Harness Run lock before reading state, while live Runtime/provider execution remains unverified**. Workspace and Run reads are coordinated at their respective same-host durable-lock boundaries.
- Evidence: `src/discord-project/status-card.ts`, `src/commands/project.ts`, `src/harness/run-lock.ts`, `tests/discord-project-status.test.ts`.
- TDD: RED reproduced bound status completing while the attached Harness Run lock was held; GREEN added the optional Run-root lock boundary, wired the real command root, and verified the status snapshot after release while preserving legacy/stale injected-dependency compatibility.
- Verification: Discord Project related regression `48/48`; serial full test suite `735/735`; backend `tsc` build and `git diff --check` passed. Parallel root execution remains subject to pre-existing nondeterministic E2E/heartbeat/desktop timing failures and is not treated as clean evidence.
- Implementation commit: `99cb101 fix: synchronize Discord status run reads`; merged by PR #122 with merge commit `45a6cb7`.
- Boundary: same-host/shared-root Discord Project Workspace and attached Harness Run read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Workspace list read synchronization

- Status: **B — Project Workspace list reads now wait on each discovered Workspace's canonical durable lock before loading its record, while live Runtime/provider execution remains unverified**. Read-only listings no longer bypass the same per-Workspace boundary used by mutations.
- Evidence: `src/project-model/workspace-store.ts`, `src/project-model/workspace-lock.ts`, `tests/project-model-stores.test.ts`.
- TDD: RED reproduced `listProjectWorkspaces` completing while a Workspace lock was held; GREEN wrapped each Workspace load in the durable lock and verified the listing after release while preserving deterministic sorting and safe-id filtering.
- Verification: Project model store regression `10/10`; serial full test suite `736/736`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `73cfb76 fix: synchronize project workspace list reads`; merged by PR #124 with merge commit `3654e08`.
- Boundary: same-host/shared-root Project Workspace list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Prototype list read synchronization

- Status: **B — Prototype candidate list reads now wait on each candidate's canonical durable lock before loading its record, while live Runtime/provider execution remains unverified**. Read-only listings use the same per-Prototype boundary as candidate mutations.
- Evidence: `src/project-model/prototype-store.ts`, `src/project-model/prototype-lock.ts`, `tests/project-model-stores.test.ts`.
- TDD: RED reproduced `listPrototypeCandidates` completing while a Prototype lock was held; GREEN validated filename-derived safe ids, loaded candidates through the durable lock, and verified the listing after release while preserving deterministic sorting and non-json filtering.
- Verification: Project model store regression `11/11`; serial full test suite `737/737`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `0ee9c03 fix: synchronize prototype list reads`; merged by PR #126 with merge commit `fa2369e`.
- Boundary: same-host/shared-root Prototype candidate list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Production list read synchronization

- Status: **B — Idea Lab Production list reads now wait on each Production's canonical durable lock before loading its record, while live Runtime/provider execution remains unverified**. Windows transient lock-handle contention is retried only within the existing bounded wait budget.
- Evidence: `src/idea-lab/production-store.ts`, `src/idea-lab/production-lock.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced `listPrototypeProductions` completing while a Production lock was held; GREEN added the per-Production lock boundary, safe id validation, bounded EPERM retry, and verified repeated list reads after release.
- Verification: Idea Lab store regression `6/6`; repeated focused runs `8/8`; serial full test suite `738/738`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `742598e fix: synchronize Idea Lab production list reads`; merged by PR #128 with merge commit `e8b9b3d`.
- Boundary: same-host/shared-root Idea Lab Production list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Campaign list read synchronization

- Status: **B — Idea Lab Campaign list reads now wait on each Campaign's canonical durable lock before loading its record, while live Runtime/provider execution remains unverified**. Windows transient lock-handle contention is retried only within the existing bounded wait budget.
- Evidence: `src/idea-lab/campaign-store.ts`, `src/idea-lab/campaign-lock.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced `listIdeaLabCampaigns` completing while a Campaign lock was held; GREEN added the per-Campaign lock boundary, safe id validation, bounded EPERM retry, and verified the listing after release.
- Verification: Idea Lab store regression `7/7`; serial full test suite `739/739`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `f276e51 fix: synchronize Idea Lab campaign list reads`; merged by PR #130 with merge commit `4f7e397`.
- Boundary: same-host/shared-root Idea Lab Campaign list read coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Campaign event read synchronization

- Status: **B — Idea Lab Campaign event log reads now wait on the canonical durable event lock, while live Runtime/provider execution remains unverified**. Append-once writes reuse an unlocked helper inside the already-held lock to avoid reentrant deadlock.
- Evidence: `src/idea-lab/event-store.ts`, `src/idea-lab/event-lock.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced event listing completing while the event lock was held; GREEN added the public locked read boundary, preserved append-once idempotency through an internal unlocked read, and added bounded EPERM retry.
- Verification: Idea Lab store regression `8/8`; serial full test suite `740/740`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `3463c63 fix: synchronize Idea Lab campaign event reads`; merged by PR #132 with merge commit `2d68f3c`.
- Boundary: same-host/shared-root Idea Lab Campaign event log read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Work Request record read synchronization

- Status: **B — Project Work Request saves and list reads now share a canonical per-record durable lock, while live Runtime/provider execution remains unverified**. Idempotency, update, and reconciliation locks remain separate outer coordination boundaries.
- Evidence: `src/project-model/work-request.ts`, `src/project-model/work-request-lock.ts`, `tests/project-work-request.test.ts`.
- TDD: RED reproduced `listProjectWorkRequests` completing while a `record:<id>` lock was held; GREEN made atomic saves and per-record list loads share that lock while preserving existing idempotency/update/reconciliation behavior.
- Verification: Work Request regression `17/17`; serial full test suite `741/741`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `97c6522 fix: synchronize work request record reads`; merged by PR #134 with merge commit `a518806`.
- Boundary: same-host/shared-root Project Work Request record read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Portfolio document read synchronization

- Status: **B — Project Portfolio document reads now wait on the canonical durable Portfolio lock, while live Runtime/provider execution remains unverified**. ensure/update mutation paths use an internal unlocked read because they already own the same lock.
- Evidence: `src/project-model/portfolio-store.ts`, `src/project-model/portfolio-lock.ts`, `tests/project-model-stores.test.ts`.
- TDD: RED reproduced `loadPortfolioDocument` completing while the Portfolio lock was held; GREEN added the public locked read boundary, preserved ensure/update reentrancy through an internal unlocked helper, and added bounded EPERM retry.
- Verification: Project model store regression `12/12`; serial full test suite `742/742`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `1e879b0 fix: synchronize portfolio document reads`; merged by PR #136 with merge commit `17a618b`.
- Boundary: same-host/shared-root Project Portfolio document read/mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project History read/write synchronization

- Status: **B — Project History public reads and appends now share the canonical durable History lock, while live Runtime/provider execution remains unverified**. append-once uses internal unlocked helpers while it owns the lock.
- Evidence: `src/project-model/history-store.ts`, `src/project-model/history-lock.ts`, `tests/project-model-stores.test.ts`.
- TDD: RED reproduced `loadProjectHistory` completing while the History lock was held; GREEN added locked public read/write boundaries, preserved append-once idempotency without reentrant deadlock, and added bounded EPERM retry.
- Verification: Project model store regression `13/13`; serial full test suite `743/743`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `750e979 fix: synchronize project history reads`; merged by PR #138 with merge commit `e09480d`.
- Boundary: same-host/shared-root Project History read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Campaign document read synchronization

- Status: **B — Idea Lab Campaign public reads now wait on the canonical durable Campaign lock, while live Runtime/provider execution remains unverified**. Supervisor and Web action mutation paths use an internal unlocked helper after acquiring that lock.
- Evidence: `src/idea-lab/campaign-store.ts`, `src/idea-lab/campaign-supervisor.ts`, `src/web-control-plane/idea-lab-actions.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced Campaign reads completing while the Campaign lock was held; GREEN added the locked public read, fixed lock reentrancy in supervisor/create/cancel paths, and verified the Web Control Plane 500-to-201 regression.
- Verification: Idea Lab and Web Control Plane focused regression `20/20`; serial full test suite `744/744`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `130ddb0 fix: synchronize Idea Lab campaign reads`; merged by PR #140 with merge commit `2c2ee4d`.
- Boundary: same-host/shared-root Idea Lab Campaign document read/mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Prototype candidate document read synchronization

- Status: **B — Prototype candidate public reads now wait on the canonical durable Prototype lock, while live Runtime/provider execution remains unverified**. update/list/materialization paths use an internal unlocked read after acquiring the same lock.
- Evidence: `src/project-model/prototype-store.ts`, `src/project-model/prototype-lock.ts`, `src/idea-lab/production-service.ts`, `tests/project-model-stores.test.ts`.
- TDD: RED reproduced Prototype reads completing while the Prototype lock was held; GREEN added the locked public read, fixed Production materialization/update/list reentrancy, and added bounded EPERM retry.
- Verification: Prototype/Production/Promotion/Project model focused regression `26/26`; serial full test suite `745/745`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `51e3ed0 fix: synchronize prototype candidate reads`; merged by PR #142 with merge commit `223fcd0`.
- Boundary: same-host/shared-root Prototype candidate document read/mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Production document read synchronization

- Status: **B — Idea Lab Production public reads now wait on the canonical durable Production lock, while live Runtime/provider execution remains unverified**. list/runtime driver paths use an internal unlocked read after acquiring the same lock.
- Evidence: `src/idea-lab/production-store.ts`, `src/idea-lab/production-lock.ts`, `src/idea-lab/production-runtime-driver.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced Production reads completing while the Production lock was held; GREEN added the locked public read, fixed runtime driver/list reentrancy, and preserved bounded EPERM retry.
- Verification: Idea Lab store + Production runtime driver focused regression `42/42`; serial full test suite `746/746`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `0ba5b14 fix: synchronize Idea Lab production reads`; merged by PR #144 with merge commit `db5cd327`.
- Boundary: same-host/shared-root Idea Lab Production document read/mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Work Request document read synchronization

- Status: **B — Project Work Request public reads now wait on the canonical per-record durable lock, while live Runtime/provider execution remains unverified**. list reads use an internal unlocked helper after acquiring each record lock.
- Evidence: `src/project-model/work-request.ts`, `src/project-model/work-request-lock.ts`, `tests/project-work-request.test.ts`.
- TDD: RED reproduced `loadProjectWorkRequest` completing while its `record:<id>` lock was held; GREEN added the locked public read, preserved list/save/idempotency/claim/update/reconciliation boundaries, and added the record-read regression.
- Verification: Work Request + Web Control Plane focused regression `33/33`; serial full test suite `747/747`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `5a9aa10 fix: synchronize work request reads`; merged by PR #146 with merge commit `b569e4e`.
- Boundary: same-host/shared-root Project Work Request document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Project Workspace document read synchronization

- Status: **B — Project Workspace public reads now wait on the canonical durable Workspace lock, while live Runtime/provider execution remains unverified**. service, list, purpose, Run reconciliation, and Discord context paths use unlocked helpers after acquiring the same lock.
- Evidence: `src/project-model/workspace-store.ts`, `src/project-model/workspace-lock.ts`, `src/project-model/work-context.ts`, `src/project-model/workspace-run-preparation.ts`, `src/project-model/user-project-service.ts`, `src/discord-project/context-resolver.ts`, `tests/project-model-stores.test.ts`, `tests/user-project-execution.test.ts`.
- TDD: RED reproduced Workspace reads completing while the Workspace lock was held; GREEN added the locked public read, fixed service/Run/Discord context reentrancy including the nested Work Context read, and preserved bounded lock waiting.
- Verification: Workspace/Work Context/User Project/Web Control Plane focused regression `66/66`; serial full test suite `748/748`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `c07c0ad fix: synchronize project workspace reads`; merged by PR #147 with merge commit `54194b1`.
- Boundary: same-host/shared-root Project Workspace document and context read/mutation coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Proposal document read/write synchronization

- Status: **B — Idea Lab Proposal public reads and writes now share a canonical per-proposal durable lock, while live Runtime/provider execution remains unverified**. Proposal access remains separate from Campaign and Production locks.
- Evidence: `src/idea-lab/proposal-lock.ts`, `src/idea-lab/proposal-store.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced Proposal reads completing while the Proposal lock was held; GREEN added the proposal lock, locked public read/write boundaries, internal unlocked helpers, and bounded EPERM retry.
- Verification: Idea Lab store/supervisor/runtime/e2e/Web focused regression `68/68`; serial full test suite `749/749`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `cbd0138 fix: synchronize Idea Lab proposal reads`; merged by PR #150 with merge commit `a9eced6`.
- Boundary: same-host/shared-root Idea Lab Proposal document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Idea Lab Production document write synchronization

- Status: **B — Idea Lab Production public writes now wait on the canonical durable Production lock, while live Runtime/provider execution remains unverified**. runtime driver writes use an internal unlocked helper after acquiring the same lock; Campaign supervisor result saves use the public boundary.
- Evidence: `src/idea-lab/production-store.ts`, `src/idea-lab/production-lock.ts`, `src/idea-lab/production-runtime-driver.ts`, `tests/idea-lab-stores.test.ts`.
- TDD: RED reproduced Production writes completing while the Production lock was held; GREEN added the locked public write, fixed runtime driver reentrancy through an unlocked helper, and preserved bounded EPERM retry.
- Verification: Idea Lab store/supervisor/runtime/e2e/Web focused regression `69/69`; serial full test suite `750/750`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `901b39a fix: synchronize Idea Lab production writes`; merged by PR #152 with merge commit `1ad9238`.
- Boundary: same-host/shared-root Idea Lab Production document write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable User Notification document read/write synchronization

- Status: **B — User Notification public reads, writes, lists, and stream-event persistence now coordinate through canonical notification identity and stream-event locks, while live Runtime/provider execution remains unverified**. Notification service lock-held paths use internal unlocked helpers to avoid reentrant deadlock.
- Evidence: `src/notifications/store.ts`, `src/notifications/service.ts`, `src/notifications/notification-lock.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-stream.test.ts`.
- TDD: RED reproduced public notification and stream-event store calls completing while their durable locks were held; GREEN added locked public store boundaries, preserved service idempotency/read reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: Notification/API/community/growth/Discord focused regression `33/33`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `a9db34d fix: synchronize notification document store`; merged by PR #162 with merge commit `8190c88`.
- Boundary: same-host/shared-root User Notification and notification stream document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable CodeAnalysisResult document read/write synchronization

- Status: **B — CodeAnalysisResult public reads and writes now coordinate through the owning user/analysis durable lock, and live Runtime/provider execution remains unverified**.
- Evidence: `src/learning/store.ts`, `src/learning/analysis-lock.ts`, `tests/learning-analysis-store-lock.test.ts`, `tests/learning-api.test.ts`, `tests/learning-review-flow.test.ts`, and the existing local analysis/review regression suite.
- TDD: RED reproduced public CodeAnalysisResult save/load calls completing while the owning analysis lock was held; GREEN added locked public store boundaries, malformed analysis identity filtering, and latest-document reload after lock acquisition.
- Verification: CodeAnalysis/API/review focused regression `9/9`; Learning focused regression `118/118`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `29a6c1a fix: synchronize learning analysis store`; merged by PR #230 with merge commit `acec9f3`.
- Boundary: same-host/shared-root CodeAnalysisResult document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable CodingExercise document read/write synchronization

- Status: **B — CodingExercise public reads and writes now coordinate through the owning user/exercise durable lock, and live Runtime/provider execution remains unverified**. Both session-linked and standalone exercises use the same owner-scoped boundary.
- Evidence: `src/learning/store.ts`, `src/learning/coding-exercise-lock.ts`, `tests/learning-coding-exercise-store-lock.test.ts`, `tests/learning-coding-test.test.ts`, `tests/learning-api.test.ts`, and the existing Learning coding regression suite.
- TDD: RED reproduced public CodingExercise save/load/list calls completing while the owning exercise lock was held; GREEN added locked public store boundaries, per-exercise list reloads, and malformed exercise identity filtering.
- Verification: CodingExercise/API/coding focused regression `8/8`; Learning focused regression `117/117`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `a34667b fix: synchronize learning coding exercise store`; merged by PR #228 with merge commit `c222518`.
- Boundary: same-host/shared-root CodingExercise document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningPlan document read/write synchronization

- Status: **B — legacy LearningPlan public reads and writes now coordinate through the owning user/plan durable lock, and live Runtime/provider execution remains unverified**.
- Evidence: `src/learning/store.ts`, `src/learning/plan-lock.ts`, `tests/learning-plan-store-lock.test.ts`, `tests/learning-persistence.test.ts`, `tests/learning-api.test.ts`, and the existing Learning plan/session regression suite.
- TDD: RED reproduced public LearningPlan save/load/list calls completing while the owning plan lock was held; GREEN added locked public store boundaries, per-plan list reloads, and malformed plan identity filtering.
- Verification: Learning plan/API/persistence focused regression `7/7`; Learning focused regression `116/116`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `dba46dc fix: synchronize learning plan store`; merged by PR #226 with merge commit `7b86444`.
- Boundary: same-host/shared-root legacy LearningPlan document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable StudyAttempt document read/write synchronization

- Status: **B — StudyAttempt public reads and writes now coordinate through the owning session durable lock, and live Runtime/provider execution remains unverified**. Recording an attempt now keeps session resume revision and attempt persistence in the same session lock boundary.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/session-lock.ts`, `tests/learning-study-attempt-store-lock.test.ts`, `tests/learning-persistence.test.ts`, and the existing Learning progress/report regression suite.
- TDD: RED reproduced public StudyAttempt save/load/list calls completing while the owning session lock was held; GREEN added locked public store boundaries, per-attempt list reloads, malformed session filtering, and moved session resume plus attempt persistence into one lock-held service transaction.
- Verification: StudyAttempt focused regression `12/12`; Learning focused regression `115/115`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `93ffc4c fix: synchronize learning study attempt store`; merged by PR #224 with merge commit `271b690`.
- Boundary: same-host/shared-root StudyAttempt document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable CodingAttempt document read/write synchronization

- Status: **B — CodingAttempt public reads and writes now coordinate through the owning user/exercise/client-request durable lock, and live Runtime/provider execution remains unverified**. Submission and verifier callbacks use unlocked helpers while the coding-attempt lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/coding-attempt-lock.ts`, `tests/learning-coding-attempt-store-lock.test.ts`, `tests/learning-coding-test.test.ts`, and the existing Learning coding regression suite.
- TDD: RED reproduced public CodingAttempt save/load/list calls completing while the owning attempt lock was held; GREEN added locked public store boundaries, per-attempt list reloads, malformed exercise/request filtering, and fixed submission/verifier/list reentrancy. The existing lock-held test injection now explicitly uses the unlocked helper.
- Verification: CodingAttempt focused regression `6/6`; Learning focused regression `114/114`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `187a1ce fix: synchronize learning coding attempt store`; merged by PR #222 with merge commit `76ca267`.
- Boundary: same-host/shared-root CodingAttempt document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningLink document read/write synchronization

- Status: **B — LearningLink public reads and writes now coordinate through the owning user/goal/project/proposal durable lock, and live Runtime/provider execution remains unverified**. Project application acceptance keeps its existing separate acceptance lock.
- Evidence: `src/learning/store.ts`, `src/learning/link-lock.ts`, `tests/learning-link-store-lock.test.ts`, `tests/learning-project-application.test.ts`, and the existing Learning project application regression suite.
- TDD: RED reproduced the missing public LearningLink store lock boundary; GREEN added the canonical durable link lock, locked public save/load/list boundaries, per-link list reloads, malformed identity filtering, and fail-closed single-link reads.
- Verification: LearningLink/project application focused regression `6/6`; Learning focused regression `113/113`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `f707889 fix: synchronize learning link store`; merged by PR #220 with merge commit `d8164b1`.
- Boundary: same-host/shared-root LearningLink document read/write coordination only; remaining raw Learning stores, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningPlanAdjustment document read/write synchronization

- Status: **B — LearningPlanAdjustment public reads and writes now coordinate through the owning user/goal/input-hash durable lock, and live Runtime/provider execution remains unverified**. Adjustment creation uses unlocked helpers while the adjustment lock is held; acceptance keeps its existing separate acceptance/goal locks.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/plan-adjustment-lock.ts`, `src/learning/plan-adjustment-acceptance-lock.ts`, `tests/learning-plan-adjustment-store-lock.test.ts`, `tests/learning-plan-preview.test.ts`, and the existing Learning plan adjustment regression suite.
- TDD: RED reproduced public LearningPlanAdjustment save/load/list calls completing while the owning adjustment lock was held; GREEN added locked public store boundaries, per-adjustment list reloads, malformed goal/input-hash filtering, and fixed adjustment creation reentrancy.
- Verification: Plan adjustment focused regression `12/12`; Learning focused regression `112/112`; serial existing full test suite `753/754`; the single failure was the unrelated concurrent run-store retry timing test and its isolated rerun passed `8/8`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `7e4bf09 fix: synchronize learning plan adjustment store`; merged by PR #218 with merge commit `d71dc77`.
- Boundary: same-host/shared-root LearningPlanAdjustment document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Platform User document read/write synchronization

- Status: **B — Platform User profile and password credential public reads, writes, and lists now coordinate through the canonical per-user durable lock, while live Runtime/provider execution remains unverified**. user-lock-held service paths use internal unlocked helpers to avoid reentrant deadlock.
- Evidence: `src/platform-user/store.ts`, `src/platform-user/service.ts`, `src/platform-user/user-lock.ts`, `tests/platform-user-isolation.test.ts`, `tests/platform-user-auth.test.ts`.
- TDD: RED reproduced public profile store writes completing while the Platform User lock was held; GREEN added locked profile/credential/list boundaries, fixed create/change-password/list/email lookup reentrancy, and verified current state reload after release.
- Verification: Platform User/auth/API/settings/integration focused regression `19/19`; serial full test suite `754/754` on rerun after one non-reproduced flaky first run; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ad4f16b fix: synchronize platform user document store`; merged by PR #164 with merge commit `270bd1a`.
- Boundary: same-host/shared-root Platform User profile and credential document coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable User Settings document read/write synchronization

- Status: **B — User Settings public reads and writes now coordinate through the canonical per-user durable Settings lock, while live Runtime/provider execution remains unverified**. settings-lock-held service paths use internal unlocked helpers to avoid reentrant deadlock.
- Evidence: `src/settings/store.ts`, `src/settings/service.ts`, `src/settings/settings-lock.ts`, `tests/settings-isolation.test.ts`, `tests/settings-api.test.ts`.
- TDD: RED reproduced public settings store writes completing while the Settings lock was held; GREEN added locked public read/write boundaries, fixed default creation/normalization/update reentrancy, and preserved atomic rename dependency injection.
- Verification: Settings/API/integration/community/Personal AI focused regression `27/27`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `7174f8a fix: synchronize settings document store`; merged by PR #166 with merge commit `da1a8f0`.
- Boundary: same-host/shared-root User Settings document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Activity Event document read/write synchronization

- Status: **B — Activity Event public reads, writes, and lists now coordinate through the canonical per-event durable lock, while live Runtime/provider execution remains unverified**. activity-service lock-held paths use internal unlocked helpers to avoid reentrant deadlock.
- Evidence: `src/activity/store.ts`, `src/activity/service.ts`, `src/activity/event-lock.ts`, `tests/activity-growth-ledger.test.ts`.
- TDD: RED reproduced public Activity Event store save/load/list calls completing while the Activity Event lock was held; GREEN added locked public store boundaries, fixed service reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: Activity/product/learning/portfolio/project/AI/UI focused regression `163/163`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ce7e291 fix: synchronize activity event store`; merged by PR #168 with merge commit `f9744e8`.
- Boundary: same-host/shared-root Activity Event document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Integration Delivery document read/write synchronization

- Status: **B — Integration Delivery public reads, writes, and lists now coordinate through the canonical per-delivery durable lock, while live Runtime/provider execution remains unverified**. integration-service lock-held paths use internal unlocked helpers to avoid reentrant deadlock.
- Evidence: `src/integrations/store.ts`, `src/integrations/service.ts`, `src/integrations/delivery-lock.ts`, `tests/integrations-delivery.test.ts`.
- TDD: RED reproduced public Integration Delivery store save/load/list calls completing while the Integration Delivery lock was held; GREEN added locked public store boundaries, fixed service reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: Integration/API/project Runtime/UI focused regression `17/17`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `c7fac47 fix: synchronize integration delivery store`; merged by PR #170 with merge commit `e3977aa`.
- Boundary: same-host/shared-root Integration Delivery document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Agent profile document read/write synchronization

- Status: **B — AI Agent profile public reads and writes now coordinate through the canonical per-user durable profile lock, while live Runtime/provider execution remains unverified**. AI Agent profile-service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/ai-agent/store.ts`, `src/ai-agent/service.ts`, `src/ai-agent/profile-lock.ts`, `tests/ai-agent-profile.test.ts`, `tests/ai-agent-profile-api.test.ts`.
- TDD: RED reproduced public AI Agent profile store save/load calls completing while the profile lock was held; GREEN added locked public store boundaries, fixed profile-service reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: AI Agent/profile API/Personal AI Runtime/UI focused regression `22/22`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed. A fixed-date API session fixture was also made relative to the current clock so the regression remains valid after calendar advances.
- Implementation commit: `2fb664b fix: synchronize ai agent profile store`; merged by PR #172 with merge commit `5e39c70`.
- Boundary: same-host/shared-root AI Agent profile document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable AI Chat conversation document read/write synchronization

- Status: **B — AI Chat conversation public reads, writes, and lists now coordinate through the canonical per-conversation durable lock, while live Runtime/provider execution remains unverified**. AI Chat service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/ai-chat/store.ts`, `src/ai-chat/service.ts`, `src/ai-chat/conversation-lock.ts`, `tests/ai-chat-persistence.test.ts`.
- TDD: RED reproduced public AI Chat conversation store save/load/list calls completing while the conversation lock was held; GREEN added locked public store boundaries, fixed service reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: AI Chat/API/attachments/context/execution-plan/Runtime/UI focused regression `45/45`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `31166f9 fix: synchronize ai chat conversation store`; merged by PR #174 with merge commit `b30de5e`.
- Boundary: same-host/shared-root AI Chat conversation document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Personal World document read/write synchronization

- Status: **B — Personal World world/character public reads and writes now coordinate through the canonical per-user durable lock, while live Runtime/provider execution remains unverified**. Personal World service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/personal-world/store.ts`, `src/personal-world/service.ts`, `src/personal-world/world-lock.ts`, `tests/personal-world-persistence.test.ts`.
- TDD: RED reproduced public Personal World world/character store save/load calls completing while the user lock was held; GREEN added locked public store boundaries, fixed service reentrancy through unlocked helpers, and verified current state reload after lock release.
- Verification: Personal World/API/UI/mission focused regression `10/10`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `55d8c77 fix: synchronize personal world store`; merged by PR #176 with merge commit `b0f6012`.
- Boundary: same-host/shared-root Personal World world/character document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Portfolio Entry document read/write synchronization

- Status: **B — Portfolio Entry public reads, writes, lists, and identity searches now coordinate through the canonical per-entry durable lock, while live Runtime/provider execution remains unverified**. Portfolio owner/public service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/portfolio/store.ts`, `src/portfolio/service.ts`, `src/portfolio/entry-lock.ts`, `tests/portfolio-store-lock.test.ts`, `tests/portfolio-provenance.test.ts`, `tests/portfolio-public-api.test.ts`.
- TDD: RED reproduced public Portfolio Entry store save/load/list/find calls completing while the entry lock was held; GREEN added locked public store boundaries, fixed owner/public service reentrancy through unlocked helpers, and verified current state after lock release.
- Verification: Portfolio/provenance/public API/UI focused regression `19/19`; ChatGPT Web E2E single-file rerun `6/6`; Idea Lab E2E single-file rerun `4/4`; backend `tsc` build and `git diff --check` passed. The full serial suite recorded `751/754` because three Desktop Agent/phase timing failures appeared only in the full bundle; each affected E2E file passed independently.
- Implementation commit: `641f8e0 fix: synchronize portfolio entry store`; merged by PR #178 with merge commit `0a4e8f4`.
- Boundary: same-host/shared-root Portfolio Entry document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Team membership document read/write synchronization

- Status: **B — Team and Team membership public reads, writes, and lists now coordinate through the canonical per-team durable lock, while live Runtime/provider execution remains unverified**. Team and AI Team lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/teams/store.ts`, `src/teams/service.ts`, `src/teams/membership-lock.ts`, `src/study/service.ts`, `tests/team-store-lock.test.ts`, `tests/team-membership-acl.test.ts`, `tests/ai-team-proposals.test.ts`, `tests/ai-team-discussion.test.ts`.
- TDD: RED reproduced public Team/membership store save/load/list calls completing while the Team lock was held; GREEN added locked public store boundaries, fixed Team/AI/recruitment/study/chat/memory/project-transition service reentrancy through unlocked helpers, and verified current state reload after lock release. The high-contention study submission path was given a 10-second membership-lock wait budget so queued submissions complete without false conflicts.
- Verification: Team/AI/recruitment/study/chat/memory/project-transition focused regression `57/57`; serial full test suite `751/754`; ChatGPT Web E2E single-file rerun `6/6`; Idea Lab E2E single-file rerun `4/4`; backend `tsc` build and `git diff --check` passed. The three full-suite failures were external ChatGPT Web/Desktop Agent phase/timing boundaries and each affected E2E file passed independently.
- Implementation commit: `35fe472 fix: synchronize team membership store`; merged by PR #180 with merge commit `a763c3f`.
- Boundary: same-host/shared-root Team and Team membership document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-29 continuation: durable Recruitment document read/write synchronization

- Status: **B — Recruitment post public reads and writes coordinate through the canonical Team membership lock, application public reads and writes coordinate through the canonical review lock, and live Runtime/provider execution remains unverified**. Recruitment service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/recruitment/store.ts`, `src/recruitment/service.ts`, `src/recruitment/application-lock.ts`, `src/recruitment/review-lock.ts`, `tests/recruitment-store-lock.test.ts`, `tests/recruitment-flow.test.ts`.
- TDD: RED reproduced public Recruitment post/application writes colliding with held locks during atomic rename; GREEN added locked public store boundaries, made list/read APIs reload each current record under its lock, fixed post/application service reentrancy, and verified current state after lock release.
- Verification: Recruitment/Team/AI Team/study/chat/memory/project-transition focused regression `58/58`; serial full test suite `749/754`; ChatGPT Web E2E single-file rerun `6/6`; Idea Lab E2E single-file rerun `4/4`; Desktop Agent E2E single-file rerun `4/4`; Desktop Agent registry single-file rerun `7/7`; backend `tsc` build and `git diff --check` passed. The five full-suite failures were external ChatGPT Web/Desktop Agent/Idea Lab timing, connection, or Windows rename boundaries and each affected file passed independently.
- Implementation commit: `525412d fix: synchronize recruitment store`; merged by PR #182 with merge commit `9d93957`.
- Boundary: same-host/shared-root Recruitment post and application document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Community document read/write synchronization

- Status: **B — Community post/comment public reads and writes coordinate through a per-post durable content lock, report public reads and writes use the existing report lock, like public reads and writes use the existing per-user like lock, and live Runtime/provider execution remains unverified**. Community service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/community/content-lock.ts`, `src/community/store.ts`, `src/community/service.ts`, `src/community/like-lock.ts`, `src/community/report-lock.ts`, `tests/community-store-lock.test.ts`, `tests/community-flow.test.ts`.
- TDD: RED reproduced public Community store operations completing or colliding while content/report/like locks were held; GREEN added the post content lock, locked public store boundaries, per-record list reloads, like aggregation locking, and service unlocked-helper paths, then verified current state after lock release.
- Verification: Community store/flow/UI focused regression `15/15`; serial full test suite `747/754`; ChatGPT Web E2E single-file rerun `6/6`; Desktop Agent E2E single-file rerun `4/4`; Desktop Agent registry single-file rerun `7/7`; evaluation soak single-file rerun `4/4`; Idea Lab E2E single-file rerun `4/4`; backend `tsc` build and `git diff --check` passed. The seven full-suite failures were external ChatGPT Web/Desktop Agent/Idea Lab/evaluation timing, connection, or Windows rename boundaries and each affected file passed independently.
- Implementation commit: `f9169e5 fix: synchronize community store`; merged by PR #184 with merge commit `52eeadc`.
- Boundary: same-host/shared-root Community post, comment, report, and like document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Study submission document read/write synchronization

- Status: **B — StudyTaskSubmission public reads and writes now coordinate through the canonical per-submission durable lock, while Study space/curriculum/task document lock coverage and live Runtime/provider execution remain separate or unverified**. Study service submission lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/study/store.ts`, `src/study/service.ts`, `src/study/submission-lock.ts`, `tests/study-submission-store-lock.test.ts`, `tests/study-space.test.ts`, `tests/study-space-api.test.ts`.
- TDD: RED reproduced public StudyTaskSubmission save/load calls completing while the submission lock was held; GREEN added locked public store boundaries, fixed study read/write reentrancy through unlocked helpers, and verified the current submission after lock release.
- Verification: Study submission/space/API focused regression `11/11`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `bdf1a00 fix: synchronize study submission store`; merged by PR #186 with merge commit `bcb39e7`.
- Boundary: same-host/shared-root StudyTaskSubmission document read/write coordination only; Study space/curriculum/task store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Study space and shared document read/write synchronization

- Status: **B — StudySpace public reads and writes now coordinate through the canonical team-keyed durable lock, CurriculumLink and StudyTask public reads and writes share the StudySpace lock, and live Runtime/provider execution remains unverified**. Study service space-lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/study/store.ts`, `src/study/service.ts`, `src/study/space-lock.ts`, `tests/study-space-store-lock.test.ts`, `tests/study-space.test.ts`, `tests/study-space-api.test.ts`.
- TDD: RED reproduced public StudySpace, CurriculumLink, and StudyTask store operations completing while the StudySpace lock was held; GREEN added locked public store boundaries, made service creation/read paths use unlocked helpers while the lock is held, and verified current state after lock release.
- Verification: Study submission/space/API/store focused regression `11/11`; serial full test suite `753/754`; ChatGPT Web store single-file rerun `12/12`; backend `tsc` build and `git diff --check` passed. The single full-suite failure was the external ChatGPT Web worker-session timing boundary and passed in isolation.
- Implementation commit: `1fa189a fix: synchronize study space store`; merged by PR #188 with merge commit `5228a46`.
- Boundary: same-host/shared-root StudySpace, CurriculumLink, and StudyTask document read/write coordination only; StudyTaskSubmission coordination was handled separately in PR #186, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Social document read/write synchronization

- Status: **B — Social profile, friend request, block, direct message, and report public reads and writes now coordinate through canonical durable locks, and live Runtime/provider execution remains unverified**. Social service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/social/store.ts`, `src/social/service.ts`, `src/social/report-lock.ts`, `src/social/profile-lock.ts`, `src/social/friend-request-lock.ts`, `src/social/block-lock.ts`, `tests/social-store-lock.test.ts`, `tests/social-safety.test.ts`.
- TDD: RED first exposed the missing report-lock boundary; GREEN added report locking, locked public store save/load/list boundaries with per-record reloads, fixed Social service reentrancy, and verified current state after lock release.
- Verification: Social store/safety/API/profile/notification focused regression `35/35`; serial full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `2f6d9b8 fix: synchronize social store`; merged by PR #190 with merge commit `6e35975`.
- Boundary: same-host/shared-root Social profile, friend request, block, direct message, and report document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Team Chat document read/write synchronization

- Status: **B — TeamMessage public reads and writes now coordinate through the canonical Team membership durable lock, and live Runtime/provider execution remains unverified**. Team Chat service lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/team-chat/store.ts`, `src/team-chat/service.ts`, `src/teams/membership-lock.ts`, `tests/team-chat-store-lock.test.ts`, `tests/team-chat.test.ts`, `tests/team-chat-api.test.ts`.
- TDD: RED reproduced public TeamMessage save/list calls completing while the Team membership lock was held; GREEN added locked public save/load/list boundaries, fixed Team Chat service reentrancy, and verified the latest message after lock release.
- Verification: Team Chat/notification/API focused regression `19/19`; serial full test suite `753/754`; Idea Lab E2E single-file rerun `4/4`; backend `tsc` build and `git diff --check` passed. The single full-suite failure was the external Idea Lab Desktop Agent connection timing boundary and passed in isolation.
- Implementation commit: `2d3efb1 fix: synchronize team chat store`; merged by PR #192 with merge commit `7a12eac`.
- Boundary: same-host/shared-root TeamMessage document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningGoal document read/write synchronization

- Status: **B — LearningGoal public reads and writes now coordinate through the canonical user/goal durable lock, and live Runtime/provider execution remains unverified**. Learning service goal-lock-held paths use internal unlocked helpers to avoid reentrant lock conflicts.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/goal-lock.ts`, `tests/learning-goal-store-lock.test.ts`, `tests/learning-goals.test.ts`, and the existing Learning plan/session/report/project regression suite.
- TDD: RED reproduced public LearningGoal save/load/list calls completing while the goal lock was held; GREEN added locked public store boundaries, per-goal list reloads, fixed goal service reentrancy, and verified the latest goal state after lock release.
- Verification: Learning focused regression `100/100`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `3789abf fix: synchronize learning goal store`; merged by PR #194 with merge commit `7d6a25c`.
- Boundary: same-host/shared-root LearningGoal document read/write coordination only; Learning plan/interpretation/session/content/feedback/report/project-application store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningPlanVersion document read/write synchronization

- Status: **B — LearningPlanVersion public reads and writes now coordinate through the owning user/goal durable lock, and live Runtime/provider execution remains unverified**. Learning preview, plan adjustment acceptance, list, and detail paths use internal unlocked helpers while the goal lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/goal-lock.ts`, `tests/learning-plan-version-store-lock.test.ts`, `tests/learning-plan-preview.test.ts`, and the existing Learning plan/adjustment/session/progress regression suite.
- TDD: RED reproduced public LearningPlanVersion save/load/list calls completing while the owning goal lock was held; GREEN added locked public store boundaries, per-record list reloads, fixed plan service reentrancy, and verified the latest PlanVersion state after lock release.
- Verification: Learning focused regression `101/101`; backend `tsc` build and `git diff --check` passed. Serial existing full test suite `752/754`; the two failures were the external `chatgpt-web-e2e` Web/Desktop recovery boundary and the unconnected `idea-lab-e2e` Desktop Agent boundary.
- Implementation commit: `bafb79f fix: synchronize learning plan version store`; merged by PR #196 with merge commit `d0138ee`.
- Boundary: same-host/shared-root LearningPlanVersion document read/write coordination only; Learning interpretation/session/content/feedback/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable GoalInterpretation document read/write synchronization

- Status: **B — GoalInterpretation public reads and writes now coordinate through the owning user/goal durable lock, and live Runtime/provider execution remains unverified**. Learning preview paths use internal unlocked helpers while the goal lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/goal-lock.ts`, `tests/learning-goal-interpretation-store-lock.test.ts`, `tests/learning-plan-preview.test.ts`, and the existing Learning goal/plan regression suite.
- TDD: RED reproduced public GoalInterpretation save/load/list calls completing while the owning goal lock was held; GREEN added locked public store boundaries, per-record list reloads, fixed preview service reentrancy, and verified the latest interpretation after lock release.
- Verification: Learning focused regression `102/102`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `10e7164 fix: synchronize learning goal interpretation store`; merged by PR #198 with merge commit `b393303`.
- Boundary: same-host/shared-root GoalInterpretation document read/write coordination only; Learning session/content/feedback/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningSession document read/write synchronization

- Status: **B — LearningSession public reads and writes now coordinate through the owning user/session durable lock, and live Runtime/provider execution remains unverified**. Learning content reservation/completion, session projection, resume, and completion paths use internal unlocked helpers while the session lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/session-lock.ts`, `tests/learning-session-store-lock.test.ts`, `tests/learning-goal-start.test.ts`, `tests/learning-content-request.test.ts`, and the existing Learning session/content/action/answer regression suite.
- TDD: RED reproduced public LearningSession save/load/list calls completing while the owning session lock was held; GREEN added locked public store boundaries, per-record list reloads, fixed session service reentrancy, adjusted lock-held test fixtures, and verified the latest session revision after lock release.
- Verification: Learning focused regression `103/103`; serial existing full test suite `753/754`; the single failure was the external `desktop-agent-registry` concurrent heartbeat timing boundary and its isolated rerun passed `7/7`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `f37c81f fix: synchronize learning session store`; merged by PR #200 with merge commit `1d185ef`.
- Boundary: same-host/shared-root LearningSession document read/write coordination only; Learning content/action/answer/feedback/review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningContentRequest document read/write synchronization

- Status: **B — LearningContentRequest public reads and writes now coordinate through the owning user/session durable lock, and live Runtime/provider execution remains unverified**. Content reservation and completion paths use internal unlocked helpers while the session lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/session-lock.ts`, `tests/learning-content-request-store-lock.test.ts`, `tests/learning-content-request.test.ts`, and the existing Learning session/content regression suite.
- TDD: RED reproduced public LearningContentRequest save/load/list calls completing while the owning session lock was held; GREEN added locked public store boundaries, per-record list reloads, fixed content service reentrancy, and verified the latest request state after lock release.
- Verification: Learning focused regression `104/104`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `60bfc92 fix: synchronize learning content request store`; merged by PR #202 with merge commit `830cd6a`.
- Boundary: same-host/shared-root LearningContentRequest document read/write coordination only; Learning action/answer/feedback/review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningSessionAction document read/write synchronization

- Status: **B — LearningSessionAction public reads and writes now coordinate through the owning user/session/action durable lock, and live Runtime/provider execution remains unverified**. Action recording, Runtime completion, and action list projection use internal unlocked helpers while the action lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/action-lock.ts`, `tests/learning-session-action-store-lock.test.ts`, `tests/learning-actions-answers.test.ts`, and the existing Learning action/answer/progress regression suite.
- TDD: RED reproduced public LearningSessionAction save/list calls completing while the owning action lock was held; GREEN added locked public store boundaries, per-action list reloads, fixed Runtime callback and completion reentrancy, skipped malformed action ids, and verified the latest action after lock release.
- Verification: Learning focused regression `105/105`; action/answer focused regression `13/13`; serial existing full test suite `753/754`; the single failure was the external `idea-lab-e2e` Desktop Agent connection boundary and its isolated rerun passed `4/4`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `8415f39 fix: synchronize learning session action store`; merged by PR #204 with merge commit `6b098b6`.
- Boundary: same-host/shared-root LearningSessionAction document read/write coordination only; Learning answer/feedback/review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningAnswerReceipt document read/write synchronization

- Status: **B — LearningAnswerReceipt public reads and writes now coordinate through the owning user/session/attempt durable lock, and live Runtime/provider execution remains unverified**. Answer submission, answer list projection, and evaluator callback paths use internal unlocked helpers while the answer lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/answer-lock.ts`, `tests/learning-answer-receipt-store-lock.test.ts`, `tests/learning-actions-answers.test.ts`, `tests/learning-feedback-evaluator.test.ts`, and the existing Learning regression suite.
- TDD: RED reproduced public LearningAnswerReceipt save/load/list calls completing while the owning answer lock was held; GREEN added locked public store boundaries, per-answer list reloads, fixed answer submission/list projection reentrancy, and fixed evaluator callback completion reentrancy while the answer lock is held.
- Verification: Learning focused regression `106/106`; action/answer/evaluator focused regression `17/17`; serial existing full test suite `753/754`; the single failure was the external `desktop-agent-registry` concurrent heartbeat timing boundary and its isolated rerun passed `7/7`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `688bf22 fix: synchronize learning answer receipt store`; merged by PR #206 with merge commit `90503e8`.
- Boundary: same-host/shared-root LearningAnswerReceipt document read/write coordination only; Learning feedback/dispute/review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningFeedback document read/write synchronization

- Status: **B — LearningFeedback public reads and writes now coordinate through a canonical user/feedback durable lock, and live Runtime/provider execution remains unverified**. Existing completion/dispute operation locks remain separate service boundaries.
- Evidence: `src/learning/feedback-lock.ts`, `src/learning/store.ts`, `tests/learning-feedback-store-lock.test.ts`, and the existing Learning feedback evaluator/dispute regression suite.
- TDD: RED reproduced public LearningFeedback save/load/list calls completing while the canonical feedback lock was held; GREEN added the feedback document lock, public locked store boundaries, per-feedback list reloads, and malformed private-row filtering.
- Verification: Learning focused regression `107/107`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `cbe8d21 fix: synchronize learning feedback store`; merged by PR #208 with merge commit `48a831d`.
- Boundary: same-host/shared-root LearningFeedback document read/write coordination only; LearningFeedbackDispute store lock coverage, review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningFeedbackDispute document read/write synchronization

- Status: **B — LearningFeedbackDispute public reads and writes now coordinate through the existing user/feedback dispute durable lock, and live Runtime/provider execution remains unverified**. Dispute service mutation paths use internal unlocked helpers while the dispute lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/feedback-dispute-lock.ts`, `tests/learning-feedback-dispute-store-lock.test.ts`, `tests/learning-feedback-dispute.test.ts`, and `tests/learning-feedback-reevaluation.test.ts`.
- TDD: RED reproduced the missing public LearningFeedbackDispute store lock boundary; GREEN added locked public save/load/list APIs, per-dispute list reloads, malformed-row filtering, and fixed dispute idempotency/re-evaluation reentrancy.
- Verification: Learning focused regression `108/108`; serial existing full test suite `753/754`; the single failure was the external `user-notifications` stream-event lock timing boundary and its isolated rerun passed `12/12`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `aef241b fix: synchronize learning feedback dispute store`; merged by PR #210 with merge commit `2a152e3`.
- Boundary: same-host/shared-root LearningFeedbackDispute document read/write coordination only; Learning review/report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Learning ReviewItem document read/write synchronization

- Status: **B — Learning ReviewItem public reads and writes now coordinate through the owning user/review durable lock, and live Runtime/provider execution remains unverified**. Due-review projection and review completion use internal unlocked helpers while the review lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/review-lock.ts`, `tests/learning-review-store-lock.test.ts`, `tests/learning-review-flow.test.ts`, and the existing Learning progress regression suite.
- TDD: RED reproduced public ReviewItem save/load/list calls completing while the owning review lock was held; GREEN added locked public store boundaries, per-review list reloads, fixed due-list/review completion reentrancy, and verified the latest review state after lock release.
- Verification: Review focused regression `10/10`; Learning focused regression `109/109`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `9e09e0a fix: synchronize learning review store`; merged by PR #212 with merge commit `fae68bf`.
- Boundary: same-host/shared-root Learning ReviewItem document read/write coordination only; Learning report/project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningReport document read/write synchronization

- Status: **B — LearningReport public reads and writes now coordinate through the owning user/goal/period durable lock, and live Runtime/provider execution remains unverified**. Report generation and list projection use internal unlocked helpers while the report lock is held.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/report-lock.ts`, `tests/learning-report-store-lock.test.ts`, `tests/learning-report.test.ts`, and the existing Learning progress/report regression suite.
- TDD: RED reproduced public LearningReport save/load/list calls completing while the owning goal/period report lock was held; GREEN added locked public store boundaries, per-report list reloads, malformed goal/period filtering, and fixed report generation/list projection reentrancy.
- Verification: Report focused regression `5/5`; Learning focused regression `110/110`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `d47514e fix: synchronize learning report store`; merged by PR #214 with merge commit `a81b50c`.
- Boundary: same-host/shared-root LearningReport document read/write coordination only; Learning project-application/adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable LearningProjectApplication document read/write synchronization

- Status: **B — LearningProjectApplication public reads and writes now coordinate through the owning user/goal/project durable lock, and live Runtime/provider execution remains unverified**. Proposal creation uses an internal unlocked helper while the application lock is held; acceptance keeps its existing separate acceptance lock.
- Evidence: `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/project-application-lock.ts`, `src/learning/project-application-acceptance-lock.ts`, `tests/learning-project-application-store-lock.test.ts`, `tests/learning-project-application.test.ts`, and the existing Learning project application regression suite.
- TDD: RED reproduced public LearningProjectApplication save/load/list calls completing while the owning application lock was held; GREEN added locked public store boundaries, per-application list reloads, malformed goal/project filtering, and fixed proposal creation reentrancy.
- Verification: Project application focused regression `6/6`; Learning focused regression `111/111`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `abc6d43 fix: synchronize learning project application store`; merged by PR #216 with merge commit `9971d80`.
- Boundary: same-host/shared-root LearningProjectApplication document read/write coordination only; Learning plan-adjustment store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable EvaluationRun document read/write synchronization

- Status: **B — EvaluationRun public reads and writes now coordinate through the evaluationId durable lock, and live Runtime/provider execution remains unverified**.
- Evidence: `src/evaluation/evaluation-store.ts`, `src/evaluation/run-lock.ts`, `tests/evaluation-run-store-lock.test.ts`, `tests/evaluation-stores.test.ts`, and the existing evaluation recovery/quick/soak/control-plane regression suite.
- TDD: RED reproduced public EvaluationRun save/load/list calls completing while the owning evaluation run lock was held; GREEN added the durable run lock, public/unlocked store boundaries, stale-owner cleanup, bounded waits, and per-record list reloads after lock acquisition.
- Verification: evaluation focused regression `26/26`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `3ce156b fix: synchronize evaluation run store`; merged by PR #232 with merge commit `d0cc793`.
- Boundary: same-host/shared-root EvaluationRun document read/write coordination only; EvaluationSuite/report store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable EvaluationSuite document read/write synchronization

- Status: **B — EvaluationSuite public reads and writes now coordinate through the suiteId durable lock, and live Runtime/provider execution remains unverified**.
- Evidence: `src/evaluation/suite-store.ts`, `src/evaluation/suite-lock.ts`, `tests/evaluation-suite-store-lock.test.ts`, `tests/evaluation-stores.test.ts`, and the existing evaluation recovery/quick/soak/control-plane regression suite.
- TDD: RED reproduced public EvaluationSuite save/load/list calls completing while the owning suite lock was held; GREEN added the durable suite lock, public/unlocked store boundaries, stale-owner cleanup, bounded waits, and per-record list reloads after lock acquisition.
- Verification: evaluation focused regression `27/27`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `6d6b21b fix: synchronize evaluation suite store`; merged by PR #234 with merge commit `d2a2715`.
- Boundary: same-host/shared-root EvaluationSuite document read/write coordination only; EvaluationReport store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable EvaluationReport document read/write synchronization

- Status: **B — EvaluationReport public reads and immutable writes now coordinate through the evaluationId durable lock, and live Runtime/provider execution remains unverified**.
- Evidence: `src/evaluation/report-store.ts`, `src/evaluation/report-lock.ts`, `tests/evaluation-report-store-lock.test.ts`, `tests/evaluation-stores.test.ts`, and the existing evaluation quick/soak/recovery/control-plane regression suite.
- TDD: RED reproduced public EvaluationReport load/save calls completing while the owning report lock was held; GREEN added the durable report lock, public/unlocked store boundaries, lock-held immutable comparison, stale-owner cleanup, bounded waits, and a concurrent single-writer regression.
- Verification: evaluation focused regression `29/29`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `728d96a fix: synchronize evaluation report store`; merged by PR #236 with merge commit `6df2cd0`.
- Boundary: same-host/shared-root EvaluationReport document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable GrowthLedger document read/write synchronization

- Status: **B — GrowthLedger public reads and writes now coordinate through the owning user/event Growth projection lock, and live Runtime/provider execution remains unverified**. Growth projection mutation and snapshot refresh use internal unlocked helpers while the event lock is held.
- Evidence: `src/growth/ledger.ts`, `src/growth/read-model.ts`, `src/growth/projection-lock.ts`, `tests/growth-ledger-store-lock.test.ts`, `tests/activity-growth-ledger.test.ts`, and `tests/growth-achievements.test.ts`.
- TDD: RED reproduced public GrowthLedger save/load/list calls completing while the shared event lock was held; GREEN added locked public store boundaries, per-event list reloads, fixed projection/snapshot reentrancy, and corrected a Social lock-held test fixture to use its unlocked helper.
- Verification: Growth focused regression `12/12`; user product regression `445/445`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `446521d fix: synchronize growth ledger store access`; merged by PR #238 with merge commit `ce7b830`.
- Boundary: same-host/shared-root GrowthLedger document read/write coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, weekly digest scheduling, external connector delivery, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT Web Desktop intent read synchronization

- Status: **B — Desktop intent public reads now coordinate through the owning run/intent durable lock, and live browser/provider execution remains unverified**. Intent recording uses an internal unlocked read while the intent lock is held.
- Evidence: `src/chatgpt-web/intent-store.ts`, `src/chatgpt-web/intent-lock.ts`, `tests/chatgpt-web-intent-store-lock.test.ts`, `tests/chatgpt-web-stores.test.ts`, `tests/chatgpt-web-reasoning-executor.test.ts`, and the ChatGPT Web regression suite.
- TDD: RED reproduced public Desktop intent load/list calls completing while the shared intent lock was held; GREEN added locked public read boundaries, per-intent list reloads, run/intent identity filtering, and fixed record lock reentrancy with an unlocked helper.
- Verification: Desktop intent lock regression `1/1`; ChatGPT Web focused regression `182/182`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `0a9cf04 fix: synchronize ChatGPT Web intent reads`; merged by PR #240 with merge commit `fb1cad9`.
- Boundary: same-host/shared-root ChatGPT Web Desktop intent document read coordination only; Web worker session/turn store lock coverage, distributed locking, live browser/provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT Web ReasoningTurn read synchronization

- Status: **B — ReasoningTurn public lists now coordinate through the owning run durable lock, and live browser/provider execution remains unverified**. Turn append uses an internal unlocked list while the run lock is held.
- Evidence: `src/chatgpt-web/turn-store.ts`, `src/chatgpt-web/turn-lock.ts`, `tests/chatgpt-web-turn-store-lock.test.ts`, `tests/chatgpt-web-stores.test.ts`, `tests/chatgpt-web-reasoning-executor.test.ts`, and the ChatGPT Web regression suite.
- TDD: RED reproduced public ReasoningTurn list calls completing while the shared run lock was held; GREEN added the locked public list boundary and fixed append lock reentrancy with an unlocked JSONL helper.
- Verification: ReasoningTurn lock regression `1/1`; ChatGPT Web focused regression `183/183`; initial serial existing full test suite `752/754` with unrelated timing failures in ChatGPT Web E2E and Desktop Agent registry, whose isolated reruns passed `6/6` and `7/7`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `cb5eece fix: synchronize ChatGPT Web turn reads`; merged by PR #242 with merge commit `fdc022e`.
- Boundary: same-host/shared-root ChatGPT Web ReasoningTurn document read coordination only; Web worker session store lock coverage, distributed locking, live browser/provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT Web WebWorkerSession read synchronization

- Status: **B — WebWorkerSession file, active pointer, and active-session reads now coordinate through the shared run/stage durable lock, and live browser/provider execution remains unverified**. Session create/replace/repair/update paths use internal unlocked helpers while the session lock is held.
- Evidence: `src/chatgpt-web/session-store.ts`, `src/chatgpt-web/session-lock.ts`, `tests/chatgpt-web-session-store-lock.test.ts`, `tests/chatgpt-web-recovery.test.ts`, `tests/chatgpt-web-stores.test.ts`, and the ChatGPT Web regression suite.
- TDD: RED reproduced public WebWorkerSession load/pointer/active reads completing while the shared run/stage lock was held; GREEN added locked public read boundaries, pointer/session unlocked helpers, and fixed create/replace/repair/update reentrancy.
- Verification: WebWorkerSession lock regression `1/1`; ChatGPT Web focused regression `184/184`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `a50148b fix: synchronize ChatGPT Web session reads`; merged by PR #244 with merge commit `93d1faa`.
- Boundary: same-host/shared-root ChatGPT Web WebWorkerSession document and active-pointer read coordination only; distributed locking, live browser/provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable identity principal read synchronization

- Status: **B — `resolvePrincipal` now coordinates through the session identity durable lock before reading the current session/user snapshot, and live Runtime/provider execution remains unverified**. Invalid, expired, or revoked sessions continue to fail closed.
- Evidence: `src/identity/store.ts`, `src/identity/identity-lock.ts`, `tests/identity-session-read-lock.test.ts`, `tests/identity-scope.test.ts`, `tests/platform-user-auth.test.ts`, and `tests/iseol-user-journeys.test.ts`.
- TDD: RED reproduced principal resolution completing while the session identity lock was held; GREEN added `resolvePrincipalUnlocked`, locked public resolution, and preserved fail-closed validation for malformed session reads.
- Verification: identity/auth/user journey focused regression `25/25`; user product regression `445/445`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `8c6d26e fix: synchronize identity principal reads`; merged by PR #246 with merge commit `cee8b27`.
- Boundary: same-host/shared-root session principal read coordination only; user-record mutation locking, distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Desktop Job document read synchronization

- Status: **B — Desktop Job public reads now coordinate through the owning Job durable lock, and live Runtime/Agent execution remains unverified**. Lock-held Job mutations use internal unlocked helpers to avoid reentrant lock acquisition.
- Evidence: `src/desktop-agent/job-store.ts`, `src/desktop-agent/job-lock.ts`, `tests/desktop-agent-job-store-lock.test.ts`, `tests/desktop-agent-job-store.test.ts`, and the existing Desktop Agent regression suite.
- TDD: RED reproduced public Desktop Job load, list, containment, and containment-status reads completing while the same Job lock was held; GREEN added locked public read boundaries, per-Job list reloads, idempotency lookup helpers, and lock-safe mutation reads.
- Verification: Desktop Agent focused regression `109/109`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `6c16f1e fix: synchronize desktop job reads`; merged by PR #248 with merge commit `dfa1875`.
- Boundary: same-host/shared-root Desktop Job document and containment read coordination only; Desktop Job result-store lock coverage, distributed locking, live Agent/browser/transport quality, operational Runtime throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Desktop Agent completed-result read synchronization

- Status: **B — completed Desktop Agent result reads now coordinate through each result's Job durable lock, and live Runtime/Agent execution remains unverified**. Persistence retention scans use an internal unlocked helper while the result Job lock is held.
- Evidence: `src/desktop-agent/result-store.ts`, `src/desktop-agent/job-lock.ts`, `tests/desktop-agent-result-store-lock.test.ts`, `tests/desktop-agent-transport.test.ts`, `tests/desktop-agent-operator-reconciliation.test.ts`, and the existing Desktop Agent regression suite.
- TDD: RED reproduced public completed-result loading completing while the result Job lock was held; GREEN added an unlocked candidate scan, per-result Job lock reloads, safe result identity validation, and fixed persistence retention reentrancy.
- Verification: Desktop Agent focused regression `110/110`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `8ce07f4 fix: synchronize desktop result reads`; merged by PR #250 with merge commit `b46c612`.
- Boundary: same-host/shared-root completed-result read and retention coordination only; Desktop Agent registry/presence, transport delivery semantics, distributed locking, live Agent/browser quality, operational Runtime throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Desktop Agent presence read synchronization

- Status: **B — Desktop Agent presence reads now coordinate through the owning Agent durable lock, and live Runtime/Agent execution remains unverified**. Registration and heartbeat use an internal unlocked raw read while the Agent lock is held.
- Evidence: `src/desktop-agent/agent-registry.ts`, `src/desktop-agent/agent-lock.ts`, `tests/desktop-agent-registry-lock.test.ts`, `tests/desktop-agent-registry.test.ts`, and the existing Desktop Agent executor/transport regression suite.
- TDD: RED reproduced public Agent presence and online-list reads completing while the same Agent lock was held; GREEN added a lock-aware public presence read and preserved unlocked registration/heartbeat reentrancy.
- Verification: Desktop Agent focused regression `111/111`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `8876965 fix: synchronize desktop agent reads`; merged by PR #252 with merge commit `b9f5d58`.
- Boundary: same-host/shared-root Desktop Agent presence document read coordination only; Agent registry mutation semantics, transport delivery, distributed locking, live Agent/browser quality, operational Runtime throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Harness Run event read synchronization

- Status: **B — Harness Run event and checkpoint reads now coordinate through the owning Run event durable lock, and live Runtime/provider execution remains unverified**. Append-once event writes use an internal unlocked event read while the event lock is held.
- Evidence: `src/harness/event-store.ts`, `src/harness/event-lock.ts`, `tests/harness-event-store-lock.test.ts`, `tests/harness-event-store.test.ts`, `tests/harness-run-store.test.ts`, and the Harness recovery/supervisor/operator regression suite.
- TDD: RED reproduced public Harness event and latest-checkpoint reads completing while the same Run event lock was held; GREEN added locked public read boundaries and fixed append-once event read reentrancy with unlocked helpers.
- Verification: Harness focused regression `72/72`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `123e119 fix: synchronize harness event reads`; merged by PR #254 with merge commit `60bdac9`.
- Boundary: same-host/shared-root Harness Run event/checkpoint document read coordination only; Harness Run envelope store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Harness Run document read/write synchronization

- Status: **B — Harness Run public load/save now coordinate through the owning Run mutation durable lock, and live Runtime/provider execution remains unverified**. Lock-held Run service and status callbacks use internal unlocked helpers.
- Evidence: `src/harness/run-store.ts`, `src/harness/run-lock.ts`, `src/harness/run-service.ts`, `src/commands/project.ts`, `tests/harness-run-store-lock.test.ts`, `tests/harness-run-store.test.ts`, and the Harness service/status regression suite.
- TDD: RED reproduced public Harness Run load/save completing while the same Run mutation lock was held; GREEN added locked public load/save boundaries, unlocked service/status helpers, and preserved compare-and-save/retry lock ordering.
- Verification: Harness focused regression `73/73` across five repeated runs; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed. One initial concurrent Harness run showed a transient timing failure; the same suite then passed `73/73` in five consecutive reruns and the final full suite passed `754/754`.
- Implementation commit: `c00c1c8 fix: synchronize harness run store reads`; merged by PR #256 with merge commit `ee3707e`.
- Boundary: same-host/shared-root Harness Run envelope document read/write coordination only; Harness event/checkpoint store coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed the explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Harness side-effect receipt read synchronization

- Status: **B — Harness side-effect receipt public reads now coordinate through the owning Run event durable lock, and live Runtime/provider execution remains unverified**. Reservation and completion continue to use unlocked receipt reads while the event lock is held.
- Evidence: `src/harness/side-effect-ledger.ts`, `src/harness/event-lock.ts`, `tests/harness-side-effect-ledger-lock.test.ts`, `tests/harness-side-effect-ledger.test.ts`, `tests/harness-recovery.test.ts`, and the Harness/evaluation recovery regression suite.
- TDD: RED reproduced public side-effect receipt reads completing while the same Run event lock was held; GREEN added the locked public read boundary and retained lock-safe internal receipt reads.
- Verification: Harness focused regression `74/74`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `855cd8c fix: synchronize harness side-effect reads`; merged by PR #258 with merge commit `9eb3136`.
- Boundary: same-host/shared-root Harness side-effect receipt read coordination only; Run event/checkpoint/run store lock coverage, distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Harness operator approval read synchronization

- Status: **B — Harness operator approval public reads now coordinate through the approval durable lock, and live Runtime/provider execution remains unverified**. Issue and consume paths continue to use unlocked approval reads while their respective request/approval locks are held.
- Evidence: `src/harness/operator-approval-store.ts`, `src/harness/operator-approval-lock.ts`, `tests/harness-operator-approval-lock.test.ts`, `tests/harness-operator-reconciliation.test.ts`, `tests/harness-recovery.test.ts`, and the Runtime host/operator regression suite.
- TDD: RED reproduced public operator approval reads completing while the same approval lock was held; GREEN added the approval-scope locked public read boundary and retained lock-safe internal reads.
- Verification: operator approval focused regression `49/49`; Harness focused regression `75/75`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `7905b90 fix: synchronize operator approval reads`; merged by PR #260 with merge commit `00b4094`.
- Boundary: same-host/shared-root Harness operator approval document read coordination only; approval mutation semantics, distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable evaluation observation read synchronization

- Status: **B — evaluation observation public lists now coordinate through the evaluation observation durable lock, and live evaluation provider/Runtime execution remains unverified**. Append-once observation writes use the unlocked list helper while the observation lock is held.
- Evidence: `src/evaluation/observation-store.ts`, `src/evaluation/observation-lock.ts`, `tests/evaluation-observation-store-lock.test.ts`, `tests/evaluation-stores.test.ts`, `tests/evaluation-recovery.test.ts`, and the evaluation regression suite.
- TDD: RED reproduced public observation list reads completing while the same evaluation observation lock was held; GREEN added the locked public list boundary and fixed append-once read reentrancy with an unlocked helper.
- Verification: evaluation focused regression `50/50`; observation/recovery focused regression `11/11`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `4dba6ee fix: synchronize evaluation observation reads`; merged by PR #262 with merge commit `fb645c7`.
- Boundary: same-host/shared-root evaluation observation document read and append coordination only; distributed evaluation coordination, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable operator credential access synchronization

- Status: **B — protected operator credential bootstrap, rotation, verification, and reads now coordinate through a path-scoped durable lock, and live Runtime/provider execution remains unverified**. Lock records use verified pid/token ownership and bounded stale-owner cleanup.
- Evidence: `src/runtime/operator-credentials.ts`, `src/runtime/operator-credential-lock.ts`, `tests/operator-credentials-lock.test.ts`, `tests/operator-credentials.test.ts`, and the Runtime host/service regression suite.
- TDD: RED reproduced concurrent credential bootstrap calls both succeeding; GREEN added the credential lock, one-winner bootstrap behavior, lock-aware public reads, and unlocked internal credential helpers.
- Verification: operator credential/runtime focused regression `89/89`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed. Protected token material was not emitted in logs or test output.
- Implementation commit: `3c20de7 fix: serialize operator credential access`; merged by PR #264 with merge commit `4938c4d`.
- Boundary: same-host/shared-path protected operator credential access serialization only; distributed credential locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Project Portfolio document save synchronization

- Status: **B — Project Portfolio public saves now coordinate through the canonical Portfolio durable lock, while live Runtime/provider execution remains unverified**. ensure/update mutation paths use an internal unlocked write because they already own the same lock.
- Evidence: `src/project-model/portfolio-store.ts`, `src/project-model/portfolio-lock.ts`, `tests/project-model-portfolio-store-lock.test.ts`, `tests/project-model-stores.test.ts`, and the Project Model regression suite.
- TDD: RED reproduced public Portfolio document saves completing while the same Portfolio lock was held; GREEN added the locked public save boundary and fixed ensure/update write reentrancy with an unlocked helper.
- Verification: Project Model focused regression `34/34`; Portfolio focused regression `17/17`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `16a82a8 fix: synchronize portfolio document saves`; merged by PR #266 with merge commit `7de9404`.
- Boundary: same-host/shared-root Project Portfolio document read/save coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Project Prototype candidate save synchronization

- Status: **B — Project Prototype public candidate saves now coordinate through the canonical Prototype durable lock, while live Runtime/provider execution remains unverified**. update and Idea Lab materialization paths use an internal unlocked write because they already own the same lock.
- Evidence: `src/project-model/prototype-store.ts`, `src/project-model/prototype-lock.ts`, `src/idea-lab/production-service.ts`, `tests/project-model-prototype-store-lock.test.ts`, `tests/project-model-stores.test.ts`, and the Prototype/Idea Lab regression suite.
- TDD: RED reproduced public Prototype candidate saves completing while the same Prototype lock was held; GREEN added the locked public save boundary and fixed update/materialization write reentrancy with an unlocked helper.
- Verification: Prototype/Idea Lab focused regression `37/37`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ce6d4df fix: synchronize prototype candidate saves`; merged by PR #268 with merge commit `5df6a71`.
- Boundary: same-host/shared-root Project Prototype candidate document read/save coordination only; distributed locking, live provider quality, operational Runtime/Agent throughput, external connector delivery, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Calendar state file synchronization

- Status: **B — Calendar state reads and read-modify-write updates now coordinate through a path-scoped durable file lock, while live external calendar/GitHub delivery remains unverified**. Independent store instances no longer lose concurrent mappings.
- Evidence: `src/services/file-state-lock.ts`, `src/services/calendar/calendar-state.ts`, `tests/calendar-state-lock.test.ts`, `tests/calendar-state.test.ts`, `tests/calendar-discord.test.ts`, `tests/github-schedule-sync.test.ts`, and `tests/github-webhook.test.ts`.
- TDD: RED reproduced concurrent CalendarStateStore upserts dropping one mapping; GREEN added stale-owner-aware file locking around find/upsert/remove operations and verified lock-held reads wait for release.
- Verification: Calendar/GitHub schedule/webhook focused regression `14/14`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `cf026a0 fix: serialize calendar state updates`; merged by PR #270 with merge commit `e7bb1e4`.
- Boundary: same-host/shared-file Calendar state coordination only; distributed locking, live external calendar/GitHub quality, operational Runtime/Agent throughput, external delivery success, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Review state file synchronization

- Status: **B — Review state reads and read-modify-write marks now coordinate through the shared path-scoped durable file lock, while live GitHub provider execution remains unverified**. Independent ReviewStateStore instances preserve concurrent review identities.
- Evidence: `src/services/file-state-lock.ts`, `src/services/review/review-state.ts`, `tests/review-state-lock.test.ts`, and `tests/review-domain.test.ts`.
- TDD: RED reproduced concurrent ReviewStateStore marks dropping one review identity; GREEN reused the stale-owner-aware file lock around has/mark operations.
- Verification: Review focused regression `7/7`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `21826a6 fix: serialize review state updates`; merged by PR #272 with merge commit `830e78a`.
- Boundary: same-host/shared-file Review state coordination only; distributed locking, live GitHub review quality, operational Runtime/Agent throughput, external delivery success, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable GitHub automation poll state synchronization

- Status: **B — GitHub automation polling state reads and milestone read-modify-write updates now coordinate through a path-scoped durable file lock, while live GitHub provider execution remains unverified**. Independent poller instances preserve repository milestone cursors.
- Evidence: `src/services/file-state-lock.ts`, `src/services/github-automation-poll-state.ts`, `tests/github-automation-poll-state-lock.test.ts`, and `tests/github-automation-polling.test.ts`.
- TDD: RED reproduced concurrent GitHub automation milestone updates dropping one repository state; GREEN added stale-owner-aware file locking around get/set/retain operations.
- Verification: GitHub automation polling focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `43f1065 fix: serialize GitHub automation poll state`; merged by PR #274 with merge commit `c877030`.
- Boundary: same-host/shared-file GitHub automation poll cursor coordination only; distributed locking, live GitHub provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Contest vote state synchronization

- Status: **B — Contest vote state reads and read-modify-write saves/updates now coordinate through a path-scoped durable file lock, while live Discord provider execution remains unverified**. Independent ContestVoteStore instances preserve concurrent vote records.
- Evidence: `src/services/file-state-lock.ts`, `src/services/contest-votes.ts`, `tests/contest-votes-lock.test.ts`, and `tests/interaction-router.test.ts`.
- TDD: RED reproduced the missing file-injected ContestVoteStore boundary before implementation; GREEN added the file-scoped store and stale-owner-aware locking around reads, saves, and updates while preserving the existing global function API.
- Verification: Contest vote state focused regression `2/2`; existing interaction routing regression `7/7`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `ad8d8ec fix: synchronize contest vote state`; merged by PR #276 with merge commit `aae07b9`.
- Boundary: same-host/shared-file Contest vote state coordination only; distributed locking, live Discord provider quality, operational Runtime/Agent throughput, external delivery success, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable GitHub account link state synchronization

- Status: **B — GitHub account link state reads and read-modify-write link/unlink operations now coordinate through a path-scoped durable file lock, while live GitHub provider execution remains unverified**. Independent GitHubAccountLinkStore instances preserve account links.
- Evidence: `src/services/file-state-lock.ts`, `src/services/github-user.ts`, and `tests/github-account-links-lock.test.ts`.
- TDD: RED reproduced the missing file-injected GitHubAccountLinkStore boundary before implementation; GREEN added the file-scoped store and stale-owner-aware locking around reads, link, and unlink operations while preserving the existing global function API.
- Verification: GitHub account link focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `bea8367 fix: synchronize GitHub account links`; merged by PR #278 with merge commit `1697f09`.
- Boundary: same-host/shared-file GitHub account link coordination only; distributed locking, live GitHub provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable service Project state synchronization

- Status: **B — Service Project state reads and read-modify-write save/update/delete operations now coordinate through a path-scoped durable file lock, while live Discord/GitHub provider execution remains unverified**. Independent ProjectStore instances preserve project records.
- Evidence: `src/services/file-state-lock.ts`, `src/services/projects.ts`, and `tests/service-projects-lock.test.ts`.
- TDD: RED reproduced the missing file-injected ProjectStore boundary before implementation; GREEN added the file-scoped store and stale-owner-aware locking around reads, saves, updates, and deletes while preserving the existing global function API.
- Verification: Service ProjectStore focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `d88e51f fix: synchronize service project state`; merged by PR #280 with merge commit `031c53a`.
- Boundary: same-host/shared-file service Project state coordination only; distributed locking, live Discord/GitHub provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Daily Scrum state synchronization

- Status: **B — Daily Scrum state reads and read-modify-write record/clear/reminder operations now coordinate through a path-scoped durable file lock, while live Discord provider execution remains unverified**. Independent DailyScrumStore instances preserve records and project clears.
- Evidence: `src/services/file-state-lock.ts`, `src/services/daily-scrum.ts`, and `tests/daily-scrum-lock.test.ts`.
- TDD: RED reproduced the missing file-injected DailyScrumStore boundary before implementation; GREEN replaced the process-local update queue with stale-owner-aware durable locking while preserving the existing global function API and reminder scheduler flow.
- Verification: Daily Scrum focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `8574aaf fix: synchronize daily scrum state`; merged by PR #282 with merge commit `d98ec48`.
- Boundary: same-host/shared-file Daily Scrum state coordination only; distributed locking, live Discord provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Voice study state synchronization

- Status: **B — Voice study state reads and read-modify-write session/heartbeat/recovery operations now coordinate through a path-scoped durable file lock, while live Discord voice provider execution remains unverified**. Independent VoiceStudyStore instances preserve concurrent sessions.
- Evidence: `src/services/file-state-lock.ts`, `src/services/voice-time.ts`, and `tests/voice-study-time-lock.test.ts`.
- TDD: RED reproduced the missing file-injected VoiceStudyStore boundary before implementation; GREEN replaced the process-local update queue with stale-owner-aware durable locking while preserving the existing global function API and heartbeat scheduler flow.
- Verification: Voice study focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `dd2170a fix: synchronize voice study state`; merged by PR #284 with merge commit `8974dfe`.
- Boundary: same-host/shared-file Voice study state coordination only; distributed locking, live Discord voice provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Music playlist state synchronization

- Status: **B — Music playlist state reads and read-modify-write create/add/remove operations now coordinate through a path-scoped durable file lock, while live Discord voice/audio provider execution remains unverified**. Independent MusicStore instances preserve playlist records and tracks.
- Evidence: `src/services/file-state-lock.ts`, `src/services/music.ts`, and `tests/music-playlists-lock.test.ts`.
- TDD: RED reproduced the missing file-injected MusicStore boundary before implementation; GREEN replaced the process-local write queue with stale-owner-aware durable locking while preserving the existing global function API and keeping external track resolution/runtime playback separate.
- Verification: Music playlist focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `9b83281 fix: synchronize music playlist state`; merged by PR #286 with merge commit `ccea645`.
- Boundary: same-host/shared-file Music playlist state coordination only; distributed locking, live Discord/audio provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Contest feed state synchronization

- Status: **B — Contest feed state reads and read-modify-write save/update operations now coordinate through a path-scoped durable file lock, while live Discord channel/provider execution remains unverified**. Independent ContestFeedStore instances preserve guild feed records and updates.
- Evidence: `src/services/file-state-lock.ts`, `src/services/contest-feed.ts`, and `tests/contest-feed-lock.test.ts`.
- TDD: RED reproduced the missing file-injected ContestFeedStore boundary before implementation; GREEN added stale-owner-aware durable locking around list/find/save/update, made audience filter changes atomic, and preserved the existing public feed/command API.
- Verification: Contest feed focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `4bfffac fix: synchronize contest feed state`; merged by PR #288 with merge commit `09756c5`.
- Boundary: same-host/shared-file Contest feed state coordination only; distributed locking, live Discord channel creation/posting, external contest provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Contest audience feed state synchronization

- Status: **B — Contest audience feed state reads and read-modify-write filter-scoped save/update operations now coordinate through a path-scoped durable file lock, while live Discord channel/provider execution remains unverified**. Independent ContestAudienceFeedStore instances preserve filter-specific guild feed records and updates.
- Evidence: `src/services/file-state-lock.ts`, `src/services/contest-audience-feed.ts`, and `tests/contest-audience-feed-lock.test.ts`.
- TDD: RED reproduced the missing file-injected ContestAudienceFeedStore boundary before implementation; GREEN added stale-owner-aware durable locking around list/find/save/update while preserving the existing public audience feed API and Discord posting flow.
- Verification: Contest audience feed focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `3b86bd4 fix: synchronize contest audience feed state`; merged by PR #290 with merge commit `062fa44`.
- Boundary: same-host/shared-file Contest audience feed state coordination only; distributed locking, live Discord channel creation/posting, external contest provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable GitHub commit feed state synchronization

- Status: **B — GitHub commit feed state reads and read-modify-write repository-side save/update/replace operations now coordinate through a path-scoped durable file lock, while live GitHub API and Discord delivery execution remains unverified**. Independent GitHubCommitFeedStore instances preserve repository-side feed records and seen commit state.
- Evidence: `src/services/file-state-lock.ts`, `src/services/github-commit-feed.ts`, and `tests/github-commit-feed-lock.test.ts`.
- TDD: RED reproduced the missing file-injected GitHubCommitFeedStore boundary before implementation; GREEN added stale-owner-aware durable locking around list/save/update/replace while preserving the existing GitHub polling and Discord commit-posting flow.
- Verification: GitHub commit feed focused regression `2/2`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `73e5982 fix: synchronize GitHub commit feed state`; merged by PR #292 with merge commit `880e5c5`.
- Boundary: same-host/shared-file GitHub commit feed state coordination only; distributed locking, live GitHub API/provider quality, live Discord channel/delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Contest repost target state reads

- Status: **B — Contest repost target discovery now reads contest feed and audience feed state through path-scoped durable stores, while live Discord repost/channel/provider execution remains unverified**. Injected store-backed target discovery preserves guild-scoped channels and audience filters.
- Evidence: `src/services/file-state-lock.ts`, `src/services/contest-feed.ts`, `src/services/contest-audience-feed.ts`, `src/services/contest-repost-all.ts`, and `tests/contest-repost-state-read.test.ts`.
- TDD: RED reproduced the missing exported/injected repost target discovery boundary before implementation; GREEN removed raw JSON reads and routed target discovery through the existing durable feed stores while preserving the public repost command and external posting flow.
- Verification: Contest repost state-read focused regression `1/1`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `cc0a357 fix: use durable contest feed stores for repost targets`; merged by PR #294 with merge commit `6ad82e7`.
- Boundary: same-host/shared-file contest repost target state reads only; distributed locking, live Discord channel fetch/send, external contest provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable Guild reset state cleanup

- Status: **B — Guild reset now reads its eight state files under durable locks and removes only the target guild from the latest lock-scoped state, while live Discord channel deletion and GitHub webhook cleanup remain unverified**. Other guild records are preserved across concurrent state changes.
- Evidence: `src/services/file-state-lock.ts`, `src/services/guild-reset.ts`, and `tests/guild-reset-state-lock.test.ts`.
- TDD: RED reproduced the missing lock-scoped guild record removal boundary before implementation; GREEN added durable latest-state read-modify-write cleanup for project, contest, audience, vote, job, music, voice study, and Daily Scrum state while preserving the reset command's external cleanup flow.
- Verification: Guild reset state lock focused regression `1/1`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `4db474a fix: synchronize guild reset state cleanup`; merged by PR #296 with merge commit `9a87b54`.
- Boundary: same-host/shared-file Guild reset state cleanup only; live Discord channel/category deletion, GitHub webhook deletion, distributed locking, external provider quality, external delivery success, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT request diagnostics state

- Status: **B — ChatGPT request and response-read diagnostic JSONL append/read operations now coordinate through path-scoped durable locks in addition to the existing process-local queue, while live browser/provider execution remains unverified**. Independent workers sharing a diagnostics root wait on the same file boundary.
- Evidence: `src/services/file-state-lock.ts`, `src/chatgpt-web/request-diagnostics.ts`, and `tests/request-diagnostics-lock.test.ts`.
- TDD: RED reproduced request append, response-read append, and request read proceeding while the durable diagnostic file lock was held; GREEN preserved local serialization and added the shared durable lock around append/read operations.
- Verification: Request/response diagnostic lock focused regression `3/3`; existing request diagnostics focused regression included `8/8`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `3068da6 fix: synchronize ChatGPT request diagnostics`; merged by PR #298 with merge commit `a60182c`.
- Boundary: same-host/shared-root diagnostic JSONL synchronization only; live ChatGPT browser interaction, external provider quality, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT browser diagnostics state

- Status: **B — ChatGPT browser parser and operation diagnostic JSONL appends now share a path-scoped durable append lock with request/response diagnostics, while live browser/provider execution remains unverified**. Diagnostic payload boundaries and the existing process-local queue remain intact.
- Evidence: `src/services/file-state-lock.ts`, `src/chatgpt-web/request-diagnostics.ts`, `src/chatgpt-web/playwright-browser-driver.ts`, and `tests/chatgpt-browser-diagnostics-lock.test.ts`.
- TDD: RED reproduced parser and operation diagnostic appends proceeding while their durable file locks were held; GREEN added the common lock-scoped append helper and routed browser diagnostics plus existing request diagnostics through it.
- Verification: Browser diagnostics lock focused regression `2/2`; Playwright browser driver focused regression `50/50`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `5d22bc3 fix: synchronize ChatGPT browser diagnostics`; merged by PR #300 with merge commit `8a8f7cc`.
- Boundary: same-host/shared-root ChatGPT diagnostic JSONL synchronization only; browser lifecycle journal, live ChatGPT interaction, external provider quality, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.

## 2026-09-30 continuation: durable ChatGPT browser lifecycle journal

- Status: **B — ChatGPT browser lifecycle journal read-trim-write updates now coordinate through a path-scoped durable lock in addition to the existing process-local queue, while live browser/provider execution remains unverified**. The journal still retains only the latest bounded records.
- Evidence: `src/services/file-state-lock.ts`, `src/chatgpt-web/playwright-browser-backend.ts`, and `tests/chatgpt-browser-lifecycle-lock.test.ts`.
- TDD: RED reproduced lifecycle journal creation while the durable file lock was held; GREEN placed the latest-journal read, bounded trim, and write inside the shared durable lock.
- Verification: Browser lifecycle lock focused regression `1/1`; Playwright backend focused regression `22/22`; serial existing full test suite `754/754`; backend `tsc` build and `git diff --check` passed.
- Implementation commit: `9104a16 fix: synchronize ChatGPT browser lifecycle journal`; merged by PR #302 with merge commit `26938bc`.
- Boundary: same-host/shared-root ChatGPT browser lifecycle journal synchronization only; live ChatGPT interaction, external provider quality, operational Runtime/Agent throughput, deployment, final approved design-source completeness, and AI Broadcast Room implementation remain unclaimed or separate boundaries.
- Safety: no operational Runtime/Agent/browser restart or mutation, stale-lock repair outside isolated test roots, UNKNOWN replay, external AI/provider request, live connector delivery, deployment, data deletion, or approved/deferred design artifact change occurred. GitHub PR merge and branch cleanup followed explicitly requested workflow. Operational state remains **UNKNOWN** where not freshly verified.
