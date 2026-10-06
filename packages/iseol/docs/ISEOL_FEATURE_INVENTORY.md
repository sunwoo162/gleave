# ISEOL feature inventory

> **2026-09-27 NPC naming update:** 사용자-facing 제품명은 `NPC (Nexus Personal Console)`로 정리했다. `이설`은 NPC 안에서 동작하는 개인 AI 봇의 통칭이며, 사용자별 AI 프로필(이름·프로필 이미지 URL·성격·말투·역할)을 인증된 개인 영역에 저장한다. 기존 파일명과 역사적 ISEOL 기록은 보존한다.

> 2026-09-21 update: the original table below is retained as historical evidence.
> The dated review appended below supersedes its current-status claims (including
> browser unavailability, pending production recovery, and Discord bootstrap wiring).
> 2026-10-02 scope decision: the NPC user product is the active completion scope.
> AI 방송실/Broadcast Room is explicitly excluded from this work and remains
> deferred; its implementation files and historical records are preserved.
> Start at [docs index](README.md); operational observations are in
> [system review](audits/2026-09-21-system-review.md).

This inventory separates durable implementation, isolated verification, live
verification, and production rollout. A passing fixture test is not treated as
evidence that a ChatGPT Web live run or a deployment succeeded.

| ID | Area | User capability and evidence | Code / API | Tests | Current status | Remaining work |
|---|---|---|---|---|---|---|
| PLAT-01 | Runtime | Single Runtime and maintenance ownership, identity-bound stale-lock inspection/recovery, fail-closed status, authenticated graceful stop over a local control endpoint | `scripts/iseol-runtime-host.ts`, runtime host tests | `tests/iseol-runtime-host.test.ts` plus isolated Windows host run | Implemented and isolated-tested; current production Runtime is older code | Production recovery requires separate operator approval for the exact lock fingerprint; legacy locks without owner identity remain owner-unconfirmed; PID 9108 still requires a separately approved replacement |
| PLAT-02 | Durable runs | Staged Harness runs, checkpoints, events, recovery and bounded evidence | `src/harness` | harness contract/state/recovery/supervisor suites | Implemented and isolated-tested | Live ChatGPT Web evidence still required |
| PLAT-03 | Web agents | Structured ChatGPT Web extraction, schema validation, correction budget and recovery | `src/chatgpt-web`, `src/harness` | chatgpt-web contract/recovery/e2e suites | Implemented and isolated-tested | Real browser/session verification remains environment-dependent |
| PLAT-04 | Desktop | Capability-gated jobs, leases, revisions, idempotency, path/process policy and results | `src/desktop-agent` | desktop lifecycle, transport, recovery and e2e suites | Implemented and isolated-tested | Production pending jobs remain untouched by this work |
| PLAT-05 | Operator recovery | DPAPI-bound first-operator bootstrap/rotation, single-use revision-bound approval, containment and multi-job maintenance batch | `src/runtime/operator-credentials.ts`, `src/desktop-agent/operator-reconciliation.ts`, `scripts/iseol-runtime-host.ts` | `tests/operator-credentials.test.ts`, containment/runtime-host suites | Implemented and isolated-tested | Windows operator bootstrap is required before production recovery; separate human approval remains required per action |
| IDEA-01 | Idea Lab dashboard | Global campaigns, productions and prototype projection | `GET /api/idea-lab`, `src/web-control-plane/view-model.ts` | web control-plane and Idea Lab suites | Implemented and tested | Static client remains the current UI shell |
| IDEA-02 | Campaign detail | Campaign-specific productions and prototypes projection and selectable detail panel | `GET /api/idea-lab/campaigns/:campaignId`, `web/app.js` | router/view-model/server/static suites | Implemented and isolated-tested | Real browser acceptance remains |
| IDEA-03 | Prototype detail | Candidate metadata, origin, genesis Run summaries and preview/promotion actions | `GET /api/prototypes/:prototypeId`, `web/app.js` | router/view-model/server/static suites | Implemented and isolated-tested | Real preview/deployment acceptance remains |
| IDEA-04 | Idea generation/production | Distinct proposals, bounded concurrent productions, deployment evidence and promotion | `src/idea-lab` | Idea Lab stores, supervisor, production, E2E suites | Implemented and isolated-tested | Real external provider/live prototype verification required |
| IDEA-05 | Recovery barrier | WAITING_EXTERNAL production suppresses automatic campaign recovery while preserving budget/state | `src/idea-lab/runtime-service.ts` | runtime-service and recovery suites | Implemented and isolated-tested | Historical production request remains UNKNOWN in old Runtime |
| PROJ-01 | Project Workspace | Prototype promotion preserves origin, workspace tree/history and Run projections | `src/project-model`, `GET /api/projects/:id` | project model/promotion/tree/router suites | Implemented and isolated-tested | Long-running work-request UI/API is partial |
| PROJ-02 | Purpose profiles | User-facing purpose selection maps to bounded execution profile and durable portfolio evidence | `src/project-model/execution-profile.ts`, portfolio stores | purpose-profile and portfolio suites | Implemented and isolated-tested | Live user acceptance still required |
| PROJ-03 | Project execution | Prepare/start project Run through existing control-plane actions | `POST /api/projects/:id/execution-start` | purpose-profile/router suites and isolated user-product browser journey | Implemented and isolated-tested | Live operational Runtime throughput and external Agent execution remain unverified |
| PROJ-05 | Work queue | Durable project work request creation, dependency gating, explicit execution, cancellation, single-worker claim, bounded user scheduling and read-only reconciliation | `src/project-model/work-request.ts`, `src/project-model/user-project-router.ts`, `/api/user/projects/:id/schedule` | `tests/project-work-request.test.ts`, `tests/user-project-api.test.ts`, browser scheduler journey | Implemented and isolated-tested | Live operational Runtime throughput remains unverified; automatic startup execution is intentionally disabled |
| PROJ-06 | Queue scheduler | Explicit owner-triggered dependency-ready scheduling with bounded active concurrency, approval checkpoint, and same-project request serialization | `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `user-ui/src/pages/Projects.tsx` | user-project API/UI contracts and isolated browser scheduler journey | Implemented and isolated-tested | Live operational Runtime throughput remains unverified; startup/recovery auto scheduling is intentionally disabled |
| PROJ-04 | Project history | Durable tree/history records connect Runs and evidence | `src/project-model/history-store.ts`, `workspace-store.ts` | project model/history suites | Implemented and isolated-tested | Commit/PR/deploy evidence needs live provider verification |
| UI-01 | Browser UI | Static Idea Lab and Project Workspace controls, status and portfolio views | `web/index.html`, `web/app.js`, `web/styles.css` | static/server and router suites | Implemented as current shell; integration partial | Browser interaction tests remain unavailable in this environment |
| UI-02 | Live updates | Authenticated bounded SSE refresh channel and fetch-based UI re-sync | `src/web-control-plane/event-bus.ts`, `server.ts`, `GET /api/events`, `web/app.js` | `tests/web-control-plane-server.test.ts` | Implemented and isolated-tested | Durable replay cursor is not implemented; reconnect re-fetches snapshots; real browser acceptance remains |
| DISC-01 | Discord calendar/code review | Existing calendar and code-review commands/providers | `src/services`, `src/discord-*` | calendar/review suites | Implemented and tested | External credential/live Discord verification required |
| DISC-02 | Project status/agent notifications | Web Product event bridge, bounded facts, durable delivery states, binding-aware Discord.js adapter | `src/discord-project/progress-event-bridge.ts`, `progress-notifications.ts`, `progress-discord-adapter.ts` | progress notification, adapter and bridge suites | Implemented and isolated-tested | Runtime must inject the existing Discord client/adapter; real Discord account remains unverified |
| EXT-01 | GitHub | Webhooks, commit feed, PR/review and CI integrations | `src/services/github*`, webhook server | GitHub/review suites | Implemented in bounded adapters | Real repository authorization and webhook verification required |
| EXT-02 | Deployment | Idea Lab deployment adapters record URL/provider/result | `src/idea-lab/vercel-deploy-adapter.ts` | deployment adapter/live-smoke suites | Implemented as adapter | Real deployment is not performed in this task |
| OPS-01 | Production recovery | Old Runtime state, prod-8 UNKNOWN, WAITING_AGENT and pending mutation preservation, authenticated graceful stop, PID-bound controlled external stop, explicit stale Runtime lock recovery and lock-only recovery for already-contained jobs | runtime/maintenance stores, `scripts/iseol-runtime-host.ts`, `docs/ISEOL_RUNTIME_RECOVERY.md` | isolated maintenance, lock-recovery and Windows shutdown-channel suites (`tests/iseol-runtime-host.test.ts`) | Code path ready; production rollout blocked | `stop` now waits for Runtime-owned disposal and lock release through its local control endpoint; `operator-stop` remains a separately approved external fallback for legacy Runtimes without that endpoint. Exact PID/creation-time/fingerprint and no active lease remain required for external termination; separate D startup approval remains required |

## Evidence boundaries

- `npm test`, focused suites, and `npm run build` establish repository-level
  implementation health only.
- No production Runtime was stopped, no operator token was used, no pending
  Desktop job was contained or redispatched, and no Live Run was created in
  this work.
- The Idea Lab production Run `prod-8` remains `IMPLEMENT / WAITING_EXTERNAL`
  with an UNKNOWN historical external-request outcome. The recovery barrier
  prevents future automatic duplicate scheduling; it does not manufacture a
  completion event for the old Runtime.
- PROJECT-DOGFOOD-01 Run 2 remains `CONTEXT / WAITING_AGENT`; its automatic
  recovery predicate remains false.

## Completion rule

An item is complete only when its durable contract, user/API path, and
appropriate tests exist. Live ChatGPT Web, production Desktop, external
credentials, and deployment claims require separate evidence and are therefore
listed as live or rollout work until actually performed.

## 2026-10-02 현재 완료 범위 및 검증 기준

이번 문서 갱신의 기준은 NPC 사용자 제품의 실제 코드·API·UI와 격리 브라우저 검증이다.
아래 범위는 구현 및 로컬/격리 검증이 완료되었으며, 외부 서비스의 운영 성공을 의미하지 않는다.

| 범위 | 현재 상태 | 검증 증거 | 남은 경계 |
|---|---|---|---|
| 개인 세계·캐릭터·성장·활동 | 구현 및 격리 브라우저 검증 완료 | `npm run test:iseol-user-product` 470/470, isolated browser E2E | 실제 외부 활동 provider 연결 |
| 학습·세션·복습·코드 분석 | 구현 및 격리 브라우저 검증 완료 | learning journey, session completion, review scheduling, local syntax/evaluation journeys | 외부 Runtime 기반 AI 설명 |
| 프로젝트 작업실·큐·승인·실행 상태 | 구현 및 격리 브라우저 검증 완료 | project workspace, cancellation, dependency, approval, runtime/local-agent journeys | 운영 Runtime throughput 및 실제 Agent 실행 |
| 친구·채팅·팀·커뮤니티·알림 | 구현 및 격리 브라우저 검증 완료 | private messaging, team ACL/chat, community, notification, safety journeys | 실제 외부 Discord/운영 소셜 연동 |
| 포트폴리오·공개/비공개·공유·JSON export | 구현 및 격리 브라우저 검증 완료 | portfolio, public route, share control, export/download journeys | 실제 배포/외부 provider evidence |
| 인증·설정·권한·세션 격리 | 구현 및 격리 브라우저 검증 완료 | two-account isolation, settings persistence, logout/re-login journeys | 운영 환경의 외부 credential 검증 |
| AI 방송실/Broadcast Room | 이번 범위에서 제외·보류 | 관련 파일과 역사적 기록 보존 | 별도 명세 승인 전 개발/검증하지 않음 |

### 2026-10-02 검증 실행 기록

- `npm test`: bounded 6-batch runner 기준 820/820 통과.
- `npm run test:iseol-user-product`: 470/470 통과.
- `npm run test:iseol-browser-e2e`: 2개 격리 계정, 390/768/1024/1440 반응형 뷰포트와 주요 NPC 사용자 여정 통과.
- TypeScript 검사와 user UI build 통과. 기존 chunk-size 경고만 남음.
- 외부 ChatGPT Web 세션, 운영 Runtime/Agent, Discord/GitHub/Vercel 실계정 및 실제 배포는 이 검증에 포함하지 않음.

이 절은 아래의 과거 조사 및 당시 상태표보다 우선한다. 과거 기록은 당시 판단과 증거 경계를 보존하기 위해 수정하지 않는다.

## 2026-09-21 전 영역 재검토

상태: **1** 구현+실제 사용자 흐름 검증, **2** 구현+사용자 흐름 미검증,
**3** 부분 구현, **4** 설계만, **5** 미구현, **6** 확인 불충분.
아래 상태는 기능군 기준이다. 하위 fixture PASS가 기능군 전체 acceptance를 뜻하지 않는다.
모든 테스트 경로는 `tests/`, 모든 코드 경로는 저장소 기준이다.
브라우저 `사용자 관찰`은 사용자가 인증 후 보고한 관찰이며 이번 세션의 자동 브라우저 검증이 아니다.
외부 `미검증`은 과거 실행 흔적이 전혀 없다는 뜻이 아니라 성공을 재확인하지 않았다는 뜻이다.

| ID/상태 | 기능/사용자 경험 | 코드, UI/API 또는 명령 | durable/권한/재개 | 테스트 증거 | 브라우저 / 외부 / 남은 작업 |
|---|---|---|---|---|---|
| PLAT-01/2 | owner/status/version/중복 기동 차단 | `scripts/iseol-runtime-host.ts`; status/maintenance-status/start/stop | Runtime/maintenance/recovery lock; operator | `iseol-runtime-host.test.ts`, `iseol-runtime-disposal.test.ts` | 운영 running/verified 직접 확인; Windows 종료와 legacy 경계 유지 |
| PLAT-05/2 | 보호 operator bootstrap/rotate/통제 종료/lock-only recovery | `src/runtime/operator-credentials.ts`, CLI operator-* | DPAPI+Windows SID, exact fingerprint/creation time | `operator-credentials.test.ts`, runtime-host | 과거 사용자 bootstrap/recovery 성공 보고; 이번 실행 안 함; env 설명 일부 낡음 |
| PLAT-02/2 | stage/checkpoint/승인/실행 기록/재개 | `src/harness` | Run/event/approval/side-effect ledger; unknown 보존 | `harness-*.test.ts` | 외부 미검증; completion gate를 제안만으로 통과 금지 |
| PLAT-03/2 | 실제 웹 AI reasoning/추출/교정 | `src/chatgpt-web` | session/turn/intent; schema/correction/recovery budget | `chatgpt-web-*.test.ts` | prod-8 실행 흔적은 있음; 성공 앱 미검증; 임의 API/Codex 대체 금지 |
| PLAT-06/2 | IMPLEMENT patch transport/진단 | `patch-frame-contract.ts`, `patch-diagnostics.ts`, prompt/intent compiler | PATCH_FRAME_V1, bounded diagnostics | reasoning/intent/patch 관련 suite | live extraction 원문 훼손 여부는 새 evidence 필요 |
| PLAT-04/2 | Desktop capability/경로/process/lease/result | `src/desktop-agent`, WebSocket 8791 | registry/job/result/containment; workspace allowlist | `desktop-agent-*.test.ts` | TCP agent 연결 확인; 새 파일 작업 미실행 |
| PLAT-07/2 | read-only retry와 mutation reconciliation | desktop executor/recovery/reality-inspector | exact Run/job/attempt; contained 우선 차단 | desktop recovery/e2e/operator reconciliation | 과거 GIT_INIT 불확실성 유지; 파일 존재로 성공 추정 금지 |
| IDEA-01/3 | 캠페인/production 목록 | view-model, GET `/api/idea-lab` | modelRoot/idea-lab; bearer server | web view/router, idea-lab-web-control-plane | 인증된 빈 화면 사용자 관찰; ROOT-01 결함 |
| IDEA-02/2 | campaign 상세/실패·대기 표시 | GET `/api/idea-lab/campaigns/:id`, web/app.js | campaign→production→Run | router/view-model tests | 운영 root 결함으로 실제 acceptance 미완료 |
| IDEA-03/2 | 후보 상세/origin/genesis/preview | GET `/api/prototypes/:id`, web/app.js | prototypes JSON와 deployment evidence | web/idea-lab production suites | READY candidate 현재 0; preview 외부 미검증 |
| IDEA-04/2 | 다양한 후보/병렬 production/추가 생성 | `src/idea-lab/campaign-supervisor.ts`, distinctness/provider/driver; POST campaigns | proposals/productions/events; budget | idea-lab stores/supervisor/e2e | mock AI/provider 포함; 실제 앱 생성 완료 아님 |
| IDEA-05/2 | WAITING_EXTERNAL recovery barrier | runtime-service, shouldRecoverIdeaLabCampaign | Run external unknown 보존 | idea-lab-runtime-service, runtime-services | root 수정 후 발견되는 prod-8으로 barrier 재검증 필수 |
| IDEA-06/3 | 승격/보관/취소/명시 retry | promotion/prototype-actions/router | deterministic project ID, genesis/history | promotion/idea-lab/web suites | 분리 root 승격 후 조회 위험 PROMO-01; retry는 새 승인 필요 |
| PROJ-01/3 | 기존 workspace 선택/상세 | workspace-store, GET `/api/projects/:id` | projectModelRoot/projects | model stores, purpose-profile | list API 없음; dropdown은 promoted prototype만 사용 |
| PROJ-02/2 | 목적/역할/실행 계획 | execution-profile, workspace-run-preparation; purpose/execution-preparation | purposeSelection과 실제 executable/planned roles | project-purpose-profile | UI 있음, 실제 역할 다중 동시 협업 증명 아님 |
| PROJ-03/3 | 기존 코드 기반 Run 시작 | router execution-start, runtime project executor/compiler | preflight→superviseHarnessRun, approved Desktop | purpose-profile/runtime-services | unavailable enqueue waiting 보존; live Execute 미실행 |
| PROJ-05/3 | queue 생성/claim/dependency/execute/cancel/inspect | work-request.ts; work-requests API, UI | JSON/idempotency/claim lock/execution identity | project-work-request, router, user-project API | claim은 일시 running; user scheduler가 명시 승인과 active concurrency를 보존하며 live Runtime throughput은 미검증 |
| PROJ-06/3 | scheduler | scheduleProjectWorkRequests와 authenticated `/api/user/projects/:id/schedule`; ProjectQueueScheduler | dependency-ready 선택, `1..8` active concurrency, Build Run 승인, same-project concurrent request serialization, startup 자동 호출 없음 | user-project API/UI contracts, isolated browser scheduler | production Runtime ownership/throughput은 미검증; 함수·격리 브라우저를 운영 worker 완료로 표시하지 않음 |
| PROJ-04/2 | tree/history/Run evidence 조회 | project-tree/history-store/view-model | immutable Run identity와 history | project tree/history/context | 날짜·커밋·실제 변경 evidence 연결 live 미검증 |
| PROJ-07/3 | evidence 기반 포트폴리오/편집 | portfolio.ts, portfolio-store.ts; portfolio GET/PUT | claim grounding, user edits | purpose-profile 일부; 독립 portfolio suite 없음 | 사용자 귀속/공개 권한/학습 기여 신규 구현 필요 |
| UI-01/3 | Idea Lab/Workspace/Evaluation shell | web/index.html/app.js/styles.css | tab-scoped sessionStorage web/operator tokens; legacy localStorage key cleanup | static/router/server | 실제 Chrome 기본 로드+사용자 빈 목록 관찰; 전체 acceptance 안 됨 |
| UI-02/2 | fetch SSE/refresh/reconnect | GET `/api/events`, event-bus/server | process-local signal, snapshot 재조회 | web-control-plane-server | durable replay 아님; 실브라우저 재연결 미검증 |
| UI-03/3 | 인증/에러/승인 action 경계 | server/router/operator auth | 단일 Web bearer와 운영자 credential은 별개; UI 토큰은 탭 범위 sessionStorage | auth/router/server/operator suites | 401 정상; 다중 사용자 인가는 미구현; legacy 영구 토큰 키는 로드 시 삭제 |
| EVAL-01/2 | fault/recovery/security/provider metrics | src/evaluation; eval:quick/soak, GET `/api/evaluation` | reports/scenario evidence | evaluation-* | 테스트의 runner 호출만 검증; 운영 soak 실행 안 함 |
| DISC-01/2 | 일정 panel/Google Calendar/Issue/milestone | services/calendar, github-schedule-sync | calendar mapping/external key; configured OAuth | calendar-state/calendar-discord/github-schedule-sync | 실제 Calendar/Discord 미검증; 기존 일정 유지 |
| DISC-03/2 | 코드리뷰/CI/collector | services/review, scripts/iseol-review-collector.mjs | review state/artifact/finding dedup | review-*, ci-review-aggregate, collector | 유료 API 없는 기본 CI 경로, optional Gemini fallback 유지 |
| DISC-02/3 | 진행 fact→Discord 전달 | progress-event-bridge/notifications/adapter; src/index.ts opt-in wiring | accepted/failed/unknown/duplicate durable; binding | 3 progress suites | standalone CLI에는 adapter 주입 없음; 이벤트 손실 replay 없음 |
| DISC-04/2 | Discord project 생성/삭제/bind/status/조직 초대 | commands/project, interactions/project-join, services/projects | guild/project binding, 권한 | discord-project-*, interaction-router | 기존 bot project와 Workspace 동일 모델 아님; binding 필요 |
| DISC-05/2 | scrum TODO/DID/일일 알림 | commands/scrum, services/daily-scrum | guild/project/user/date | interaction-router 간접, 전용 suite 확인 안 됨 | 실제 알림 미검증; 강제 기존 메시지 변경 금지 |
| DISC-06/2 | 음성 공부 시간/잔디/자동퇴장 | commands/voice, voice-time/grass/connection/auto-leave | guild/user session/heartbeat | 전용 suite 확인 안 됨 | 시간=활동량, 학습 숙달과 구분 |
| DISC-07/2 | 음악 playlist/play/skip/stop | commands/music, services/music | guild scoped | 전용 suite 확인 안 됨 | 외부 스트림 미검증; 기능 보존 |
| DISC-08/2 | 공모전 필터/투표/재게시/준비 채널 | contest-v2와 contest-* 서비스 | guild feed/vote state | 전용 suite 확인 안 됨 | 신규 학습/모집과 무관하게 유지 |
| DISC-09/6 | 관리 초기화/도움말 | services/guild-reset/command-help, src/index.ts | 관리자 destructive action | 전용 회귀 확인 안 됨 | 코드 존재; 이번 조사 실행 금지, 삭제 의미 유지 |
| EXT-01/2 | GitHub webhook/polling/commit/PR/CI | services/github*, review; `/github connect/profile/disconnect` | signed webhook/poll state/user mapping | github-* suites | username 매핑은 OAuth 로그인 아님; 외부 계정 미검증 |
| EXT-02/2 | 배포 adapter/결과 | idea-lab/vercel-deploy-adapter, completion-profile | provider URL/receipt; gate | vercel-deploy-adapter/live-smoke tests | mock provider는 실제 배포 아님; 일반 Project 배포 UX 별도 확인 필요 |
| EXT-03/3 | Notion/Figma 링크/맥락 참조 | services/notion/figma/project-context | 링크/스냅샷/versions | discord-project-provider-context | 자동 Notion 문서/Figma 디자인 생성 완료 아님 |
| EXT-04/4 | 채용 공고 | commands/job, services/job-feed | 현행 feed no-op, register 목록 제외 | 전용 없음 | 의도적 비활성 상태 보존; 새 팀 모집과 구별 |

### 신규 확정 방향의 현재 수준

| 기능 | 현재 상태 | 기존 기반 / 새 구현 경계 |
|---|---|---|
| 사용자 계정/세션/개인·팀 인가 | 4 설계 | guild 분리·operator token은 tenant 인증 대체 불가 |
| 개인 세계·캐릭터 | 4 설계 | UI/store/domain 신규 |
| 개인 AI 장기 기억 | 4 설계 | Run context는 존재; user memory/consent/retrieval 신규 |
| 경험치·스탯·레벨·업적 | 4 설계 | voice time/Git activity는 입력 근거 일부; 검증 growth ledger 신규 |
| AI 학습 A–K | 4 설계 | 3입력 UX, plan/session/assessment/review 전부 신규 |
| 학습 기반 스터디 | 4 설계 | Discord 음성 공부와 별도 membership/curriculum/shared task 필요 |
| 사람/AI/혼합 팀 | 4 설계 | execution role profile은 있음; 실제 팀 권한·membership 신규 |
| 친구/채팅/커뮤니티/모집 | 4 설계 | Discord 채널·공모전·조직 초대와 별도 제품 도메인 |
| 검증 가능한 개인 포트폴리오 | 3 부분 | project evidence draft 재사용, user attribution/privacy/학습 링크 신규 |

## 2026-09-21 조회 복구 구현 결과

이번 후속 커밋에서 아래 세 결함을 운영과 분리된 fixture로 재현하고 수정했다. 이 표의 상태는 코드·격리 테스트 기준이며 현재 운영 Runtime 반영을 뜻하지 않는다.

| 기능 | 구현 결과 | 격리 증거 | 운영/Live 상태 |
|---|---|---|---|
| Idea Lab model root | legacy `dataRoot/idea-lab` 설정을 canonical store container로 정규화; canonical/nested 동시 존재는 fail-closed | `tests/read-model-roots.test.ts`, `tests/read-model-startup.test.ts` | 운영 Runtime 9108은 교체하지 않음; 적용 전 별도 승인 |
| Project Workspace 목록 | bearer-protected `GET /api/projects`, workspace store 직접 조회, empty/error 구분, 기존 promotion 선택 병합 | `tests/read-model-roots.test.ts`, `tests/read-model-browser.test.ts` | 실제 운영 목록 acceptance는 Runtime 교체 후 미검증 |
| 분리 root promotion | `projectModelRoot`에 workspace/history 저장, origin/genesis/evidence 유지, same-process duplicate 및 promoted candidate의 다른 root 재생성 차단 | `tests/read-model-roots.test.ts`, 기존 promotion suites | 실제 외부 promotion/Live prototype 미검증 |
| startup safety | canonical Idea discovery 후 WAITING_EXTERNAL/WAITING_AGENT/contained job dispatch 0회 유지 | `tests/read-model-startup.test.ts` | 기존 prod-8·contained jobs 변경 없음 |

검토 범위는 주요 제품 기능군, 모든 src 영역/등록 command, 현행 API, 관련 spec/plan와 테스트 목록이다.
모든 과거 커밋의 모든 줄·외부 계정·브라우저 동선을 실행한 감사는 아니다. 전용 테스트가 확인되지 않은 기능을 테스트 완료로 올리지 않았다.

## 2026-09-26 사용자 제품 통합 개발 현황

이 절은 위 역사적 조사보다 최신이며, `user-ui/`와 `/api/user/*` 사용자 제품 경계를 기준으로 한다.

| 영역 | 구현·연동 상태 | 근거 | 남은 검증/작업 |
|---|---|---|---|
| 계정·세션·개인 데이터 격리 | A — durable user/session/world/character/memory와 fail-closed scope | `src/platform-user`, `src/personal-world`, `src/memory`, auth/isolation tests | 브라우저 두 세션 동시 ACL 재확인 |
| 성장·활동 증거 | A — verified/actor-attributed/idempotent/retractable activity와 growth projection | `src/activity`, `src/growth`, `tests/activity-growth-*` | 실제 Runtime/외부 provider 활동 증거 연결 |
| 학습·복습·코드 분석 | A(로컬 기능) — plan/session/attempt/review/local-static analysis durable | `src/learning`, `user-ui/src/pages/Learning.tsx` | local AI 설명과 Runtime 연결 |
| 프로젝트 작업실 | B — user-owned project/work request/evidence API와 기존 Run boundary 연결; Runtime 미설정은 waiting으로 표시 | `src/project-model/user-project-*`, `tests/user-project-*` | 실제 승인된 Agent 실행·Artifact/Revision/Deployment live 검증 |
| 팀·모집·친구·메시지 | A(API/domain) — durable membership ACL, recruitment, friendship, private messaging | `src/teams`, `src/recruitment`, `src/social`, `tests/collaboration-*` | 두 사용자 브라우저 동선 |
| 커뮤니티 | A(API/domain/UI) — 공개 게시글·작성자·분류·durable per-user like·댓글 | `src/community`, `user-ui/src/pages/Community.tsx`, `tests/community-flow.test.ts`, `tests/iseol-user-journeys.test.ts` | moderation/notification과 운영 소셜 연동 |
| 개인 AI 대화 | B — user-scoped conversation/message/private-memory persistence와 `waiting_runtime`; 외부 AI 호출 없음 | `src/ai-chat`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-*` | 승인된 로컬 Runtime 답변 생성기 연결 |
| 설정·권한 | A(API/domain/UI) — AI 접근, 실행 승인, 알림, 개인정보 사용자별 저장 | `src/settings`, `user-ui/src/pages/Settings.tsx`, `tests/settings-*` | 브라우저 토글 재확인; 실제 실행기에 승인 정책 적용 |
| 포트폴리오 | B+ — verified evidence 작성/편집/export와 public/unlisted 공개 endpoint/page; private 차단 | `src/portfolio`, `user-ui/src/pages/Portfolio.tsx`, `PublicPortfolio.tsx`, `tests/portfolio-*` | visible share control, AI/project actor matrix, browser export/download |
| Idea Lab/통합 Runtime | B/보류 — 기존 Control Plane/Runtime 코드는 보존·격리 경계 유지 | `src/runtime`, `src/idea-lab`, existing runtime ledger | 운영 Runtime 소유권·UNKNOWN 승인 없이는 실행/복구하지 않음 |
| AI 방송실 | 보류 — 관련 자료/파일 보존, 이번 개발 범위 제외 | approved plan explicit defer | V1 학습 방송 명세 승인 후 별도 재개 |

### 최신 집중 검증

- TypeScript root check: exit 0.
- Approved user UI Vite build: exit 0; existing config/chunk-size warnings only.
- Expanded user-platform regression: 43/43 pass with `--test-concurrency=1`.
- Default parallel run: 42/43; one transient Windows local HTTP `fetch failed` in collaboration API. The same test passes alone and in serial execution, so it is tracked as test-runner resource contention rather than a product assertion failure.
- Legacy root suite remains separately tracked: 646 total, 623 pass, 23 failures in pre-existing live ChatGPT Web/Desktop Agent/Idea Lab and timeout paths.

### 2026-09-26 fresh regression and browser ACL evidence

- Fresh `npm.cmd test` completed `646/646` with `0` failures.
- The user-domain serial regression completed `45/45` with `0` failures, including the integrated HTTP journey.
- Isolated browser server `58962` verified account A signup/onboarding, Idea Lab approval and durable project save, logout, account B signup/onboarding, and B's project workspace showing an empty user-scoped list. Account A's saved project was not exposed to account B.
- This browser evidence is local and isolated. It does not certify live Runtime/Agent execution, external AI generation, deployment, or the required mobile viewport matrix.
- Portfolio actor attribution is now explicitly covered: verified user activity and verified `iseol-desktop-agent` project evidence are exported with distinct `user` and `ai` actor types (`tests/portfolio-actor-attribution.test.ts`).
- Responsive UI contract now covers mobile reflow for AI Chat/Friends/Settings while preserving the approved desktop shell (`user-ui/src/index.css`, `tests/user-ui-responsive-contract.test.ts`). The contract and build pass; a physical-device/browser viewport capture remains separate evidence.
- Public/unlisted portfolio entries now expose both link copy and an in-app `공개 보기` route link; private entries remain link-free (`user-ui/src/pages/PortfolioScreen.tsx`).
## 2026-09-26 autonomous continuation evidence

| Area | New verified state | Evidence |
|---|---|---|
| Project team transition | Existing user-owned project can switch solo/AI/human/mixed without leaving the workspace; human/mixed modes require team access; transition activities are persisted with unique identities. | `src/project-model/user-project-service.ts`, `tests/user-project-team-transition.test.ts`, isolated browser server `58960` |
| Portfolio sharing | Public/unlisted entries expose a visible link-copy control; private entries remain excluded by the public API; portfolio entry and share state survive reload. | `user-ui/src/pages/PortfolioScreen.tsx`, `src/portfolio/router.ts`, `tests/portfolio-public-api.test.ts`, isolated browser server `58960` |
| Community/settings/AI Chat | User-scoped post/like, AI access setting, and AI message are durable and restore after reload; AI remains explicitly waiting when Runtime is unavailable. | `src/community/*`, `src/settings/*`, `src/ai-chat/*`, isolated browser server `58959` |
| Idea Lab | Natural-language input and requirements are saved as a real user-owned project after explicit approval; no hard-coded candidates or fake build success remain in the user flow. | `user-ui/src/pages/IdeaLab.tsx`, `src/project-model/user-project-service.ts`, isolated browser server `58961` |

### 2026-09-26 integrated HTTP journey evidence

`tests/iseol-user-journeys.test.ts` now exercises one isolated HTTP server with two
platform sessions across the durable product boundary: signup/me, world update,
private memory isolation, learning plan/session/attempt/local-static analysis,
user-owned project/work request and truthful Runtime waiting, team transition,
community post/like, verified activity and growth, portfolio public read/export,
settings persistence, and AI-chat conversation isolation. The scenario passed
`1/1` without external requests. This is stronger than domain fixture coverage,
but it is not a live Runtime/Agent execution result and does not replace the
remaining browser viewport matrix or two-simultaneous-user browser evidence.

The above are local isolated-runtime results. They do not certify the ambiguous operational Runtime, external integrations, legacy live-execution suite, or production deployment.

### Latest regression confirmation

- `tests/user-ui-portfolio-contract.test.ts` now locks the public/unlisted-only UI link rule and tokenless public route.
- `npm.cmd run test:iseol-user-product`: `48/48` pass.
- A second fresh `npm.cmd test`: `646/646` pass; the earlier single timing failure was reproduced as `14/14` pass when `tests/idea-lab-live-smoke.test.ts` was focused and was not fixed by changing product code.

### Responsive and navigation hardening

- The approved user shell now has explicit 390px/768px/1024px/1440px layout tokens and reduced-motion behavior in `user-ui/src/index.css`.
- `팀 공간` is a real user navigation link to `/app/teams`; desktop and mobile navigation expose accessible labels (`user-ui/src/components/Navigation.tsx`).
- Responsive/navigation contract and product regression pass; isolated browser server `58962` visibly confirmed the narrow mobile menu route to the real Teams empty state.

### Character persistence and navigation hardening

- Character customization now persists appearance and room selections per user, renders the selected appearance, and uses basename-safe links for customization/cancel/activity navigation (`user-ui/src/pages/Character.tsx`, `user-ui/src/components/Character.tsx`).
- Locked and unlocked accessories/room items are keyboard-accessible controls with explicit pressed/disabled state.
- The mobile full-menu includes Character while preserving the approved bottom navigation items.
- Character contract, TypeScript, UI build, and product regression pass; browser evidence for this newest character edit remains source/build/API evidence rather than a newly captured browser save/reload flow.
- Fresh full regression after the character/navigation changes: `npm.cmd test` `646/646` pass; `git diff --check` has no diff errors.

### 2026-09-26 profile surface continuation

- Existing social profile persistence is now connected to `user-ui/src/pages/Profile.tsx` at `/app/profile`.
- The owner can edit handle, bio, skills, and visibility through `/api/user/social/profile`; a requested other-user profile is read-only and private/missing profiles render an explicit empty state.
- Settings links to the profile surface. `tests/user-ui-profile-contract.test.ts` protects the API client, route, edit/read-only behavior, and error/status states.
- Serial user-product regression: `50/50` pass. Root TypeScript check and user UI production build pass. The open browser tab retained a prior cached menu tree after refresh, so the newest profile/character browser flow is not claimed as browser evidence; isolated HTTP static serving confirmed the current build hash.

### 2026-09-26 SPA and boundary hardening

- User UI direct/reload routes now fall back to `/app/index.html` for extensionless non-asset paths, preserving 404 behavior for missing assets and the Control Plane root (`src/web-control-plane/server.ts`, `tests/user-ui-static-serving.test.ts`).
- User/operator separation is covered by an isolated HTTP test: platform user tokens work only on user routes, operator tokens do not resolve as users, anonymous user access is rejected, and user tokens cannot open operator SSE (`tests/user-ui-api-boundary.test.ts`).
- The approved shared sidebar now exposes the durable `/app/profile` surface alongside Settings, while keeping mobile bottom navigation unchanged.
- Latest evidence: serial user-product `51/51`, root `646/646`, root TypeScript build, approved UI build, and `git diff --check` pass. A fresh isolated browser tab now verifies the profile and SPA refresh path; the full viewport matrix and two-user simultaneous browser evidence remain outstanding.

### Fresh browser evidence update

- A new isolated server `58963` was used without touching the earlier server or operational processes. Browser evidence now covers local account creation/onboarding, direct `/app/profile` navigation, profile save, reload persistence, and the mobile full-menu `/app/profile` link.
- The current evidence still does not cover simultaneous two-user browser contexts or a physical viewport matrix at 390/768/1024/1440px; those remain explicitly unclaimed.

### My World durable data integration

- `user-ui/src/pages/MyWorld.tsx` now reads the authenticated user's projects, learning plans, and due review items through the existing user API. The recent-project card, today's-learning card, mission tab, and achievements empty/actor breakdown states no longer use placeholder project IDs or numeric demo progress.
- Contract coverage: `tests/user-ui-my-world-contract.test.ts`; serial user-product regression is now `52/52` pass.
- Fresh isolated browser server `58964` visibly verified local account onboarding, project and learning-plan creation, `/app/world` rendering of both durable records, derived missions, and reload persistence.
- This does not change the evidence boundary: live Runtime/Agent execution, external provider activity, two simultaneous browser sessions, and the physical 390/768/1024/1440px matrix remain unclaimed.

### Settings honesty hardening

- `user-ui/src/pages/Settings.tsx` renders account identity as read-only, exposes the authenticated password-change workflow, and keeps account deletion explicitly unsupported until its durable workflow exists. Existing user-scoped settings toggles remain connected to `/api/user/settings`; activity export remains available through its owner-scoped export boundary.
- Contract coverage: `tests/user-ui-settings-contract.test.ts`; serial user-product regression is `53/53` pass.

### Two-user browser ACL evidence boundary

- The isolated HTTP journey remains the verified two-session ACL evidence. A fresh browser attempt on server `58966` could not create independent browser storage: in-app and separately named Chrome tabs reused the first user's `localStorage`, so the second tab remained authenticated as user A. No cross-user leak was concluded and no operational browser state was changed.
- Keep Task 7 browser two-context verification open until the automation environment can provide genuinely independent storage contexts; do not downgrade the already-passing HTTP two-session coverage.

### AI Chat Runtime boundary update

- `src/ai-chat/contracts.ts` and `src/ai-chat/service.ts` now expose an explicit, user-attributed `AiChatRuntimeDispatcher` injection point. A completed dispatcher result persists the assistant response in the same owner-scoped conversation; an accepted dispatcher can complete later through a user-bound callback; missing, waiting, or failed dispatch remains `waiting_runtime` without fabricated output, and duplicate completion is idempotent.
- `src/runtime/iseol-runtime-services.ts` accepts `IseolRuntimeInput.aiChatRuntimeDispatcher` for a future approved local Runtime adapter. The default service construction does not enable it, and no current operational Runtime was touched.
- Status remains **B** for personal AI: durable user-scoped conversation/memory and an isolated asynchronous completion boundary are implemented, but live local Runtime answer generation and approved-context retrieval remain unverified. Evidence: `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-api.test.ts`, `tests/iseol-user-journeys.test.ts`.

### Local AI Runtime adapter update

- `src/ai-chat/local-runtime.ts` implements an opt-in, loopback-only Ollama adapter. `src/runtime/iseol-runtime-services.ts` wires it from `ISEOL_LOCAL_AI_RUNTIME_ENABLED` and `ISEOL_LOCAL_AI_RUNTIME_MODEL`; default construction does not call localhost or any external provider.
- The adapter is fail-closed for unavailable/malformed/empty responses and never converts a fixture or placeholder into an assistant answer. Current machine evidence: Ollama is installed but has no local models (`/api/tags` returned an empty model list), so live answer generation remains unverified.
- Latest verification: serial user-product suite `60/60`, root suite `646/646`, root/UI builds, TypeScript, and diff check passed. The operational Control Plane remained listening on PID 1708/port 18890; no Ollama process or port remained after the read-only inspection cleanup.

### Private memory vault update

- Personal AI memory is now **A/B boundary**: the durable API supports owner-bound list, append, edit, and delete, and the approved user UI exposes those actions at `/app/memory` with search, validation, loading/error/status feedback, and explicit private-only copy.
- Evidence: `src/memory/contracts.ts`, `src/memory/service.ts`, `src/personal-world/router.ts`, `user-ui/src/pages/MemoryVault.tsx`, `tests/personal-memory-isolation.test.ts`, `tests/personal-world-api.test.ts`, and `tests/user-ui-memory-contract.test.ts`.
- `npm.cmd run test:iseol-user-product` passes `62/62`; root regression passes `646/646`; root/UI builds and TypeScript pass. A live browser CRUD capture was not claimed in this unit, and live local AI retrieval/answer generation remains B/unverified because no Ollama model is installed.
- The product inventory still treats live Runtime execution, external integrations, independent two-user browser storage, and physical viewport captures as separate verification boundaries. AI broadcast room remains deferred and its files/specs are preserved.

### Learning session reconnect update

- Learning is now **A/API+UI** for durable session reconnect: the authenticated API lists only the current user's sessions, and `/app/learning` restores the newest active session and its study attempts after reload/reconnect.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-api.test.ts`, `tests/learning-persistence.test.ts`, and `tests/user-ui-learning-contract.test.ts`.
- Serial user-product suite passes `63/63`. This does not upgrade live AI tutoring or Runtime-backed explanation: local-static code analysis is verified, local model availability is not.
- Fresh isolated browser server `58968` also verified plan creation, session start, reload, and visible active-session restoration. The first browser reload caught and led to fixing the missing `resumeLearningSession` import; the rebuilt bundle passed the same flow afterward.

### Integration settings route update

- `/app/integrations` now selects the `연동 환경` settings section on direct navigation. The screen keeps all unverified external services in explicit `연동 API 미연결` or `준비 중` states and does not expose a fake connected/disconnect action.
- Evidence: `user-ui/src/pages/Settings.tsx`, `tests/user-ui-integrations-contract.test.ts`; serial user-product `64/64` pass. Live GitHub/Discord/Calendar/Notion/Vercel connectivity remains unverified and is not claimed.

### Growth timeline update

- The activity route is now **A/API+UI** for growth presentation: `ActivityTimeline` reads the authenticated growth snapshot and displays level, XP, four durable stats, and user/AI/system actor attribution next to verified activity/project evidence.
- Evidence: `user-ui/src/pages/PortfolioScreen.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-activity-contract.test.ts`, `src/growth/*`, and `tests/activity-growth-*`. Serial user-product suite passes `65/65`; no demo progress values are used.

### Project execution profile update

- Project Workspace now displays the server-persisted purpose execution profile, including selected roles, executable stage-adapter roles, planned specialist roles, verification stages, and documentation requirement.
- Status: **A/API+UI for profile visibility**, not a claim of full AI-team execution. `user-ui/src/pages/Projects.tsx` labels unavailable specialists as `계획 상태` and registered adapters as `실행 어댑터`; live Runtime-backed execution remains separately unverified.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-ui-project-profile-contract.test.ts`. Serial user-product suite passes `66/66`, full root suite passes `646/646`, and the isolated browser showed the persisted profile in Project Workspace; AI broadcast room remains deferred.

### Project execution approval checkpoint update

- Status: **A/UI checkpoint**, with an explicit boundary: the approved user UI reads the durable `aiApproval.buildRun` setting and requires confirmation before the existing project run request is sent. This does not upgrade the feature to server-enforced authorization or live Runtime/Agent success.
- Evidence: `user-ui/src/pages/Projects.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-project-approval-contract.test.ts`; focused contract `1/1`, serial product suite `67/67`, isolated browser server `59988` verified approval-toggle persistence, checkpoint display, and cancellation without a Runtime request.
- Remaining: verify the final approved request only against an explicitly isolated Runtime/Agent fixture or an approved local execution environment; do not submit it to the ambiguous operational Runtime. AI broadcast room remains deferred and existing broadcast files/specifications are preserved.

### Project execution approval enforcement update

- Status: **A/API+UI for approval enforcement**, but **B for live Runtime execution**. The authenticated project run route now requires the owner setting `aiApproval.buildRun` to be satisfied by an explicit `approved: true` request before Run preparation or enqueue. Approval-state lookup failure returns a bounded unavailable response; no execution is attempted.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`. Product suite `69/69` and full root suite `646/646` pass; temporary HTTP verification confirmed rejection without enqueue and approved request waiting honestly when no Runtime is configured.
- Remaining: an actual successful local Runtime/Agent run with Artifact/Revision/Deployment evidence still requires a separately approved, unambiguous isolated Runtime. Operational Runtime and external integrations remain untouched.

### User project Run reconciliation update

- Status: **A/API for durable Run projection and isolated Harness completion**, still **B for live Runtime/Agent execution**. User project reads now reconcile each stored work request against its requested Harness Run, so terminal status and evidence are reflected without fabricating success or losing UNKNOWN/mismatch blockers.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/work-request.ts`, `tests/user-project-execution.test.ts`. The isolated supervisor test persists a complete project-workspace Run and identity-bound evidence under a temporary root; focused execution tests pass `6/6`, product suite `71/71`, and full root suite `646/646` on the final rerun.
- Remaining: verify the same state transition through a genuinely connected local Runtime/Agent using an approved isolated environment. The current operational Runtime remains ambiguous and was not used.

### Composed Runtime integration update

- Status: **A for isolated Runtime composition and HTTP boundary**, still **B for the operational Runtime/Agent**. `startIseolRuntimeServices` now has a regression test that exercises the real Control Plane server, authenticated user-project routes, explicit approval, project Run enqueue, Harness stage persistence, identity-bound evidence, and terminal work-request reconciliation under temporary roots.
- Evidence: `tests/user-project-runtime-integration.test.ts`; product suite `72/72`, full root suite `647/647`, root/UI builds, TypeScript, and diff checks pass.
- The fixture deliberately uses a local deterministic stage executor and fake Desktop transport. It proves composition and durable state transitions, not a live local Agent, ChatGPT Web, external GitHub/Discord/Calendar provider, production deployment, or operational PID `1708` success. Those remain open and require the separately approved isolated/live environment boundary.

### Portfolio share fallback update

- Status remains **A/API+UI** for authenticated portfolio creation/editing, verified-evidence selection, JSON/Markdown export, and public/unlisted viewing. The share action now fails honestly to the visible public URL when the browser Clipboard API is unavailable.
- Evidence: `user-ui/src/pages/PortfolioScreen.tsx`, `tests/user-ui-portfolio-contract.test.ts`; focused UI contract `2/2`, approved UI build exit 0. This does not claim clipboard permission success in every browser, nor does it alter public/private authorization.

### Isolated browser E2E update

- Added the reusable local-only command `npm.cmd run test:iseol-browser-e2e` backed by `scripts/iseol-user-ui-e2e.ts`. It creates two fresh Playwright browser contexts against a temporary-root Control Plane, blocks non-loopback requests, and never touches the operational Chrome profile.
- Fresh result passed: account A/B signup and onboarding, private world isolation, cross-context public community persistence, and world-page responsive checks at 390/768/1024/1440px.
- This is fresh browser evidence for those journeys only. Team-private browser ACL, portfolio download/public-route browser assertions, all-page viewport captures, live Runtime/Agent execution, external integrations, and deployment remain separate open boundaries.
- The same work unit also passed the serial user-product suite `73/73`, full root suite `647/647`, root TypeScript check, approved UI build, and diff validation.

### Portfolio browser verification update

- The isolated browser runner now seeds a verified learning attempt through the authenticated API boundary, creates a public portfolio from that real durable evidence, verifies the JSON download event, opens the tokenless public route from both contexts, and checks the missing-entry error state.
- Fresh result: `publicPortfolioRouteAndJsonExport: passed`. This closes the local browser assertion for portfolio public viewing/export trigger; it does not claim external hosting, download persistence beyond the browser event, or production deployment.

### Private team ACL browser verification update

- The isolated browser runner now verifies a private team project is absent from account B before recruitment acceptance and visible to B after account A accepts B's durable application. The final Project Workspace list is checked in B's actual browser context.
- Fresh result includes `privateTeamAcl: passed`; HTTP ACL tests remain the broader domain evidence, while live Runtime/Agent and external integration boundaries remain open.

### Major-route responsive browser matrix update

- The isolated browser command now checks no horizontal overflow on 13 authenticated user routes at 390/768/1024/1440px. Fresh result: `responsiveRoutes: 13` with all four viewport widths passing.
- This is a geometry/containment check, not a claim that every screen is visually approved against the ZIP or that the operator Control Plane has the same responsive requirements.

### Project workspace and local Agent boundary update

- User Project creation now creates the owner-bound physical `workspaceRoot`; the durable project path and the directory consumed by Run preflight are no longer allowed to diverge. Evidence: `src/project-model/user-project-service.ts`, `tests/user-project-execution.test.ts`.
- The isolated composed Runtime journey now covers the real Desktop Core WebSocket server and authenticated local Agent transport for CONTEXT and TEST, including actual sandboxed `node --test` execution and project/Run-bound evidence. Evidence: `tests/user-project-runtime-integration.test.ts`.
- Status remains **A/isolated local integration** for workspace provisioning and the tested local Core/Agent path. Focused integration `2/2`, serial user-product `75/75`, full root regression `648/648`, root/UI builds, browser E2E, TypeScript, and diff validation pass. Operational Runtime PID `1708` remains **D/unknown** because its stale lock/registry state was inspected but not changed; live project execution, external providers, and production deployment remain unverified.

### Project completion-to-growth update

- Status: **A/isolated durable projection** for successful project completion activity. A `DONE` Run with matching project identity now creates one owner-bound verified `project.run.completed` ActivityEvent and one idempotent development GrowthLedger entry through the existing GrowthService. Evidence: `src/project-model/user-project-service.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/user-project-runtime-integration.test.ts`.
- The event is attributed to `system` because it represents a verified Run completion; Desktop Agent/AI evidence remains separately attributed and is not collapsed into user contribution. Unverified, waiting, failed, missing, or mismatched Runs do not create the completion event. Focused integration `2/2`, project execution `7/7`, serial product `75/75`, full regression `648/648`, root build, and diff validation pass. Operational Runtime remains unverified and untouched.

### Project lifecycle evidence read model update

- Status: **A/isolated API+UI projection** for lifecycle evidence that is explicitly recorded by a verified, project/Run-bound Harness execution. `src/project-model/lifecycle.ts` maps build/test/file-change to Artifact, commit/pull-request/ci to Revision, and deployment/production-verification to Deployment while preserving evidence and Run provenance.
- The projection fails closed for foreign project/Run evidence, unbound evidence, and absent lifecycle evidence. Empty groups do not imply pending or successful work. `UserProjectView.lifecycle` is consumed by the approved Project Workspace UI and displays provider/reference only when durable evidence contains them.
- Evidence: `tests/project-lifecycle.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `user-ui/src/pages/Projects.tsx`; lifecycle/UI contracts `4/4`, serial user-product suite `79/79`, root suite fresh exit 0, TypeScript, root build, approved UI build, and isolated browser E2E pass. Live operational Runtime execution and external lifecycle references remain unverified.

### Project Run resume update

- Status: **A/isolated API+UI behavior** for explicit owner-approved resume of a waiting user-project Run; operational Runtime resume remains **D/unverified**. The resume operation is bound to the existing durable project/work-request/Run identity, preserves the current stage, and refuses ownerless/team-viewer mutation or missing/mismatched Run records.
- Evidence: `src/harness/run-service.ts`, `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, and `tests/user-ui-project-resume-contract.test.ts`. Focused results are `8/8`, `3/3`, and `1/1`; serial user-product `82/82`; full root `648/648` on the final rerun; TypeScript/root/UI builds and isolated browser E2E pass.
- The first full regression attempt had a transient real local Core/Agent integration timeout; the same test passed three standalone runs and the next full suite passed with zero failures. No production Runtime was restarted or resumed, no UNKNOWN request was replayed, and AI broadcast-room files remain preserved/deferred.

### Learning session completion update

- Status: **A/API+UI** for owner-bound learning session completion and verified activity attribution. An active durable session can be explicitly completed, reconnects as completed, and repeated completion is idempotent; the service and UI both reject further attempts after completion.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-session-completion.test.ts`, `tests/learning-api.test.ts`, and `tests/user-ui-learning-contract.test.ts`. Focused learning completion/API/UI checks pass `1/1`, `1/1`, and `1/1`; serial user-product `83/83`; browser E2E reports `learningSessionCompletion: passed`; TypeScript, root/UI builds, and final root `648/648` pass.
- Completion produces a verified `learning.session.completed` event and the Runtime composition applies the existing +100 learning XP projection through the owner-scoped GrowthService. This does not claim live AI tutoring, external coding-test evaluation, local model availability, or AI broadcast-room behavior. AI broadcast remains preserved and deferred; operational Runtime/Agent and UNKNOWN state remain untouched.

### Coding exercise/attempt learning records

- Status: **A/API+UI for durable owner-scoped records; B for execution/evaluation**. A signed-in user can create a coding exercise tied to an active learning session, save a solution response, reconnect/restart and read it again, and list attempts without crossing another user's scope.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-coding-test.test.ts`, `tests/learning-coding-test-api.test.ts`, and `tests/user-ui-coding-test-contract.test.ts`. The same `clientRequestId`/same body is idempotent; a changed body is a conflict. The stored result is explicitly `environment-required` with executor `none`.
- The isolated browser runner also creates and submits a coding exercise and verifies the visible `환경 필요` state. This is not evidence of code execution, test feedback, verified mastery, growth projection, or external AI evaluation. A separately approved local executor with policy, artifact receipts, feedback provenance, and failure recovery is still required.

### Personal AI memory context delivery

- Status: **A for owner-scoped context assembly and injected local-dispatch boundary; B for live local model answer generation**. AI chat now assembles a bounded private-memory snapshot after persisting the user's message and passes it to an explicitly injected dispatcher. The snapshot is rebuilt through `MemoryService.listPrivateMemories(principal, ...)`, so another user's records cannot enter the request.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, and `tests/ai-chat-local-runtime.test.ts`. The loopback adapter remains opt-in, requires a configured model, and still fails closed when the local service is unavailable or malformed.
- This does not claim that the operational Runtime is healthy, that Ollama has a model installed, or that an assistant answer was generated. Settings-controlled learning/project/activity context expansion, consent revocation cache invalidation, and live local Runtime verification remain open.

### Personal AI learning-history permission boundary

- Status: **A for owner-scoped permission-aware dispatch context; B for live local model answer generation**. `AiChatService` includes the authenticated user's learning sessions/attempts only when `settings.aiAccess.learningHistory` is enabled; disabled access omits the learning section entirely. The context is bounded to 12 sessions/24 attempts with clipped answers and fails closed on settings/learning read errors.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, and `tests/ai-chat-local-runtime.test.ts`. Focused AI `12/12`, serial user-product `89/89`, full root `648/648`, and builds pass.
- This does not claim public learning visibility, external AI access, Ollama model availability, or operational Runtime health. Consent-revocation cache invalidation, project/activity context expansion, and live local generation remain open.

### Harness Run atomic persistence on Windows

- Status: **A for bounded isolated Run-store retry behavior**. `src/harness/run-store.ts` now retries transient Windows atomic rename failures through the existing `src/desktop-agent/atomic-file.ts` helper and removes a failed temporary file. A real suite failure was reproduced from a temporary `run.json.*.tmp` containing the advanced state while the canonical Run remained at `CONTEXT`; after the change the local Core/Agent integration and full suite pass.
- Evidence: `tests/harness-run-store.test.ts`, `tests/desktop-agent-atomic-file.test.ts`, `tests/user-project-runtime-integration.test.ts`; focused `10/10`, full root `648/648`. No claim is made about live operational PID `1708` or the stale lock/UNKNOWN records.

### Learning Goal minimum-input flow

- Status: **A/API+UI for owner-scoped draft capture; C for AI interpretation and validated plan generation**. The latest learning contract's required `subjectText`, `duration`, and `dailyMinutes` are durable in a `LearningGoal` draft; duration and daily-time bounds are validated, and future target dates are accepted without timezone or plan-generation claims.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, and the three `learning-goals`/UI contract tests. Serial user-product `93/93`, root `648/648`, builds, and browser `learningGoalDraftPersistence: passed` are fresh.
- This slice intentionally does not call external AI, create a `PlanVersion`, interpret skill level, or mark a goal active. Those require the separately governed local Runtime/AI work boundary and remain open; the existing legacy LearningPlan flow is preserved.

## 2026-09-26 continuation: Learning Goal local-template PlanVersion preview

- Status: **A/isolated API+UI for owner-scoped preview persistence; B for AI interpretation and active learning**. A draft goal can now produce a durable `GoalInterpretation` and immutable `LearningPlanVersion` preview from an explicit local template. The response carries assumptions, feasible outcomes, exclusions, daily activity time budgets, checkpoints, and `source.kind=local-template`; it does not claim AI output, mastery, or active-plan selection.
- `src/learning/service.ts` enforces owner scope, goal revision checks, same-input preview reuse, and target-date/day expansion. `src/learning/store.ts` keeps interpretations and versions separate from legacy plans; `src/learning/router.ts` exposes authenticated preview/list/detail routes. `user-ui/src/pages/Learning.tsx` exposes the action and provenance label.
- Evidence: focused preview/API/UI `4/4`, serial user-product `98/98`, root `648/648`, TypeScript/root build, approved UI build, and isolated two-account browser E2E with `learningPlanPreviewPersistence: passed`. Full timezone-aware date semantics, AI/local-model interpretation, PlanVersion activation, day/session/content linkage, and coding execution/evaluation remain open.

## 2026-09-26 continuation: Learning Goal activation and day session

- Status: **A/isolated API+UI for revision-bound activation and durable day-session creation; B/C for AI content and evaluation**. The selected PlanVersion/day is owner-checked and persisted into the existing LearningSession shape with explicit goal/version/day references. Goal and version status become active only after the selected plan/day is validated; repeat start returns the same active session.
- The session stores `contentStatus: not-requested`; the approved UI exposes `오늘의 학습 세션 시작` and labels the boundary as `AI 콘텐츠 요청 전`. This demonstrates plan/session persistence and reconnect behavior, not generated lesson content or mastery.
- Evidence: focused start/API/UI `4/4`, serial user-product `102/102`, root `648/648`, TypeScript/root/UI builds, and isolated two-account browser E2E with `learningPlanPreviewPersistence: passed` and `learningGoalDaySession: passed`. One initial full-root run had an unrelated existing live-smoke cleanup timing failure (`tests/idea-lab-live-smoke.test.ts`); that file passed `14/14` in isolation and the immediate full rerun passed `648/648`. AI content, feedback, timezone-complete scheduling, plan adjustment, and coding execution/evaluation remain open.

## 2026-09-26 continuation: Learning Goal today-content request boundary

- Status: **A for owner-scoped durable request/reconnect and injected-dispatch validation; B/C for live Runtime content generation**. An activated goal day can create one private `LearningContentRequest` with template/version/input hash/budget, moves the session to `pending`, and stays `waiting-runtime` when the local content Runtime is absent. GET after restart/reload returns the same request; foreign principals cannot read or create it.
- An injected local dispatcher may complete later through the owner-bound callback. Lesson blocks are validated against the selected day identity, unique ids, allowed kinds, text limits, and day time budget before the request becomes `validated` and the session becomes `ready`. The UI renders validated lesson blocks only from that durable result and never invents content while waiting.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-content-request.test.ts`, `tests/learning-content-request-api.test.ts`, and `tests/user-ui-learning-content-contract.test.ts`; focused `4/4`, serial user-product `106/106`, builds, and browser `learningGoalContentRequest: passed`.
- Open: actual local model/provider execution, content quality validation, learning actions/self-report, answer receipts/evaluation feedback, timezone-complete scheduling, and recovery of an in-flight live dispatcher. No operational Runtime or prior UNKNOWN request was touched.

## 2026-09-26 continuation: Learning actions and answer evaluation-pending boundary

- Status: **A for owner-scoped self-report/action records and durable answer receipts; B/C for Runtime action generation and evaluation**. Session actions distinguish recorded `self-report` from Runtime-dependent explanation/example/hint requests. Action idempotency and owner scope are enforced; self-report never projects directly to mastery.
- Coding answers require the same user-owned session, exercise, and durable attempt. The service stores bounded response/artifact refs as `evaluation-pending`, creates a separate `pending` feedback record and evaluation request id, and returns the same receipt on repeat. No correctness, score, verified feedback, or growth claim is made.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-actions-answers.test.ts`, `tests/learning-actions-answers-api.test.ts`, and `tests/user-ui-learning-actions-answers-contract.test.ts`; focused `4/4`, serial user-product `110/110`, root `648/648`, builds, and browser `learningAnswerEvaluationPending: passed`.
- Open: local Runtime action completion, safe evaluator execution, tentative/verified feedback transitions, feedback disputes, and evidence-backed mastery projection.

## 2026-09-26 continuation: Learning progress evidence read model

- Status: **A for owner-bound progress projection, reconnect persistence, and UI evidence display; B/C for server-timezone completeness and evaluator/runtime completion**. `GET /api/user/learning/goals/:goalId/progress` keeps planned schedule, actual session states, verified-correct/unverified/reported-incorrect attempts, self-reports, Runtime-waiting actions, pending answer evaluation, due reviews, and evidence ids separate.
- No percentage, mastery label, or inferred completion claim is returned. Foreign users receive 404. The UI exposes `진도 근거`, 예정/실제/평가 대기/복습 대기 counts, and an explicit boundary that self-reports and pending answers are not mastery evidence.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-progress.test.ts`, `tests/learning-progress-api.test.ts`, and `tests/user-ui-learning-progress-contract.test.ts`; focused `4/4`, serial user-product `114/114`, root `648/648`, TypeScript/root/UI builds, and browser `learningProgressEvidence: passed`. Operational Runtime/Agent/browser, stale lock/UNKNOWN records, external providers, and deferred broadcast-room files remain untouched.

## 2026-09-26 continuation: Learning today read model and account timezone

- Status: **A for owner-bound today scheduling, durable session-state readback, and account-timezone routing; B/C only for live evaluator/runtime completion**. `GET /api/user/learning/goals/:goalId/today` returns the current plan day and existing session without creating work. States are `available`, `active`, `content-pending`, `completed`, or `locked`.
- The authenticated learning router passes the persisted platform-user timezone as an ephemeral service context. Direct test principals without a timezone use a server-date fallback and expose a warning; no global `Principal` contract or existing identity record was rewritten.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-today.test.ts`, `tests/learning-today-api.test.ts`, and `tests/user-ui-learning-progress-contract.test.ts`; focused `7/7`, serial user-product `117/117`, root `648/648`, builds, and browser `learningTodayState: passed`. Operational Runtime/Agent/browser, stale lock/UNKNOWN records, external providers, and deferred broadcast-room files remain untouched.

## Learning feedback dispute

- Status: **A for owner-scoped durable dispute capture and truthful UI/API state; B/C for evaluator-backed re-evaluation**. A user can dispute an existing learning feedback record with a durable reason. The feedback and its answer become `disputed`, while the dispute remains `waiting-runtime` until a local evaluator is actually connected.
- Idempotency is explicit: the same reason returns the existing dispute; a changed reason conflicts. The route and service load the authenticated user's feedback/answer only, and a foreign principal cannot observe or mutate the record.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/learning-feedback-dispute.test.ts`, `tests/learning-feedback-dispute-api.test.ts`, and `tests/user-ui-learning-feedback-dispute-contract.test.ts`; focused `3/3`, user-product `120/120`, root `648/648`, root/UI builds, and browser `learningFeedbackDispute: passed`. Evaluator execution, re-evaluation provenance, and operational Runtime ownership remain open; AI broadcast-room files are preserved and deferred.

## Learning evaluator feedback

- Status: **A for injected local evaluator contract, structured validation, durable feedback projection, and UI truthfulness; B/C for live Runtime/provider and real verifier evidence**. The optional `LearningFeedbackDispatcher` is off unless explicitly injected. It can complete an owner-bound answer with rubric/evaluator versions, per-criterion outcomes, evidence refs, misconceptions, next action, and `tentative|verified|needs-review`.
- The service prevents an evaluator from changing another answer, rejects malformed criteria/evidence, and prevents `verified` when the practice attempt has no verifier evidence by downgrading it to `tentative`. A waiting or failed evaluator preserves `evaluation-pending` and the blocker. Disputed feedback is not overwritten by the initial completion callback.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-feedback-evaluator.test.ts`, and `tests/user-ui-learning-feedback-evaluator-contract.test.ts`; focused `3/3`, user-product `123/123`, root `648/648`, root/UI builds, and browser E2E pass. Live evaluator dispatch, actual verifier receipt, dispute re-evaluation, and operational Runtime ownership remain open.

## Learning dispute re-evaluation

- Status: **A for injected local re-evaluation and evaluation-version preservation; B/C for live evaluator/verifier operations**. When a dispute is present and an explicitly injected evaluator completes, the answer returns to `feedback-ready`, the dispute becomes `recorded`, and the previous evaluation is retained in `evaluationHistory`. Without that dispatcher, the dispute stays `waiting-runtime`.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `user-ui/src/api/userApi.ts`, and `tests/learning-feedback-reevaluation.test.ts`; focused `1/1`, user-product `124/124`, root `648/648`, builds, and isolated browser E2E pass. No operational Runtime, UNKNOWN replay, external AI, or broadcast-room change occurred.
## 2026-09-26 latest verification: private route boundary and truthful world state

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Authenticated user shell | **A — isolated browser verified** | `user-ui/src/components/Navigation.tsx`, `tests/user-ui-auth-boundary-contract.test.ts`, browser `unauthenticatedRouteGuard: passed` | Live production auth deployment is not claimed |
| My World mission state | **A — durable/API-backed and evidence-honest** | `user-ui/src/domain/worldState.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-world-state-contract.test.ts`, browser `truthfulWorldAndIntegrationStates: passed` | Per-user mission completion history is not yet a persisted domain; labels intentionally remain record/next-action |
| Integration surface | **D — truthful unavailable/unknown/deferred states verified** | `user-ui/src/pages/Settings.tsx`, `tests/user-ui-integrations-contract.test.ts` | GitHub, ChatGPT Web, Discord, Notion, Vercel live connectors remain unconfigured/unverified; no fake connect/disconnect action is exposed |
| Responsive/private user routes | **A — isolated browser matrix verified** | `scripts/iseol-user-ui-e2e.ts`, 13 routes at 390/768/1024/1440px | This is not visual approval of missing Figma/original design sources and does not verify the operator Control Plane UI |

Latest focused verification for this slice: UI contracts `4/4`, user-product `127/127`, root `648/648`, root TypeScript build, approved UI build, and loopback-only isolated browser E2E pass. Operational Runtime/Agent and durable UNKNOWN records were read-only preserved; AI Broadcast Room remains deferred and its files remain intact.

## 2026-09-26 latest verification: local learning Runtime boundary

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Local learning content/evaluator adapter | **B — isolated structured adapter verified; live local model unverified** | `src/learning/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/learning-local-runtime.test.ts` | Ollama model availability, actual generation/evaluation quality, verifier receipts, and production Runtime ownership still require explicit local enablement and separate verification |
| Learning privacy and durable completion boundary | **A — owner callback and validation path preserved** | Existing learning service/router contracts plus local-runtime tests; user-product `131/131` | No live evaluator result is claimed while the adapter is disabled or unavailable |
| Live-smoke disposal stability | **A — isolated timeout cleanup verified** | `scripts/idea-lab-live-smoke.ts`, `tests/idea-lab-live-smoke.test.ts`; focused `14/14`, root `648/648` | This does not authorize operational Runtime restart or disposal |

The local learning adapter is disabled by default and only accepts loopback Ollama endpoints. No operational Runtime/Agent, durable UNKNOWN request, external AI provider, data root, push, deployment, or deferred AI Broadcast Room file was changed.

## 2026-09-26 latest verification: learning action Runtime boundary

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Explanation/example/hint Runtime actions | **B — injected local path and durable callback verified; live model unverified** | `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/local-runtime.ts`, `tests/learning-local-runtime.test.ts`, `tests/learning-actions-answers.test.ts` | Actual Ollama response quality, UI rendering of returned action text, and live Runtime enablement remain to be verified |
| Self-report versus AI action attribution | **A — explicit distinction preserved** | `LearningSessionAction.status`, `source`, existing action/progress contracts; user-product `133/133` | Self-report is intentionally not mastery or verified growth evidence |

The action adapter shares the same default-disabled loopback boundary as local lesson/evaluator adapters. It does not authorize public model endpoints or operational Runtime calls.

## 2026-09-26 latest verification: Learning action UI

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Learning help request UI | **A — durable waiting state and reload display verified** | `user-ui/src/pages/Learning.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-learning-actions-answers-contract.test.ts`, browser `learningActionWaiting: passed` | Live local response rendering requires an explicitly enabled local model; UI does not fabricate one |
| Action-state attribution | **A — self-report and local Runtime response remain separate** | `LearningSessionAction.response/source/status`, action history UI, user-product `133/133` | No action response contributes mastery or verified growth without separate evidence rules |

The UI change uses the existing approved Learning surface and does not introduce a new dashboard style or modify the deferred AI Broadcast Room scope.

## 2026-09-26 latest verification: authenticated Runtime status surface

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| User Runtime status API | **A — authenticated safe capability projection verified** | `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `tests/user-runtime-status-api.test.ts` | The public user view intentionally omits operator diagnostics, roots, ports, locks, and live execution logs |
| Settings Runtime badge | **A — isolated browser verified** | `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/user-ui-integrations-contract.test.ts`, browser `runtimeStatusSurface: passed` | Current isolated server has no Runtime capability, so `Runtime 미연결` is the truthful result; live operational readiness remains unverified |
| External integration states | **D — truthful unavailable/deferred state retained** | Settings integration surface and existing contract/E2E checks | GitHub, ChatGPT Web, Discord, Notion, and Vercel account connections remain unconfigured/unverified |

Focused runtime-status/UI tests pass `3/3`, serial user-product regression passes `135/135`, root/UI builds pass, and the isolated browser matrix passes. The full root suite exposed a Windows worker-load race in the live-smoke test watchdog; the test watchdog was widened above the bounded cleanup budget, focused live-smoke verification passes `14/14`, and the fresh full-root regression passes `648/648`.

## 2026-09-26 latest verification: private AI chat browser path

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| AI Chat UI persistence | **A — isolated browser verified** | `user-ui/src/pages/AIChat.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-ai-chat-contract.test.ts`, browser `privateAiChatPersistenceIsolation: passed` | Live assistant generation still requires an explicitly enabled local Runtime/model |
| AI Chat user isolation | **A — two-context verified** | Temporary isolated server with account A/B, browser reload, existing `src/ai-chat` owner-scoped API/service tests | Production auth/storage and multi-device reconnect remain separate deployment checks |
| AI Chat Runtime answer | **B — waiting boundary only** | Existing `src/ai-chat/local-runtime.ts`, `src/ai-chat/service.ts`, local adapter tests | Ollama model availability, answer quality, approved context execution, and operational Runtime ownership remain unverified |

Product regression now passes `136/136`, the approved UI build passes, and the isolated browser journey remains loopback-only. No external AI call, operational Runtime request, UNKNOWN replay, data deletion, push, deployment, or broadcast-room change occurred.

## 2026-09-26 latest verification: owner-scoped activity export

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Activity export API | **A — authenticated owner-scoped JSON/Markdown export** | `src/growth/router.ts`, `tests/activity-export-api.test.ts` | Export is limited to durable activity events; account deletion/recovery is separate and disabled |
| Settings data management | **A — real JSON download for the supported export** | `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/user-ui-settings-contract.test.ts` | Markdown export is API-supported but not surfaced as a second Settings button |
| Browser download | **A — isolated browser download event verified** | `scripts/iseol-user-ui-e2e.ts`, browser `activityExportDownload: passed` | Local isolated browser evidence is not production deployment evidence |

Product regression now passes `137/137`, root regression `648/648`, both builds pass, and the browser matrix remains green. The export uses the authenticated user scope and does not expose Runtime internals or another user's activity. Operational Runtime/Agent/browser state, UNKNOWN requests, external services, and deferred AI Broadcast Room files remain untouched.

## 2026-09-26 latest verification: private friend messaging browser path

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Friend discovery/request | **A — two-account browser flow verified** | `user-ui/src/pages/Friends.tsx`, `src/social/*`, browser `privateFriendMessagingPersistence: passed` | Production account directory/search scale and moderation are not claimed |
| Friendship acceptance and ACL | **A — recipient acceptance is durable and required for direct message** | `src/social/service.ts`, `tests/social-messaging.test.ts`, `tests/user-ui-friends-contract.test.ts` | External notification delivery remains unverified |
| Direct message persistence | **A — sender/recipient reload path verified in isolated browser** | `user-ui/src/api/userApi.ts`, `scripts/iseol-user-ui-e2e.ts` | Production multi-device delivery/reconnect and message retention policy remain open |

Serial user-product regression now passes `138/138`; the isolated browser runner remains loopback-only with two accounts and the 390/768/1024/1440px route matrix. Operational Runtime/Agent/browser state, UNKNOWN requests, external services, and deferred AI Broadcast Room files remain untouched.

## 2026-09-26 latest verification: private memory vault browser path

| Area | Current status | Evidence | Remaining boundary |
|---|---|---|---|
| Private memory CRUD | **A — isolated browser save/edit/delete and reload verified** | `user-ui/src/pages/MemoryVault.tsx`, `tests/user-ui-memory-contract.test.ts`, browser `privateMemoryCrudIsolation: passed` | Live local AI retrieval and response generation remain unverified |
| Memory owner isolation | **A — account B cannot observe account A's memory** | `src/memory/service.ts`, `tests/personal-memory-isolation.test.ts`, two-context browser journey | Production auth/storage deployment and multi-device sync remain separate checks |
| AI context use | **B — bounded owner-bound dispatch context exists** | `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts` | No local model is installed/available; no answer is claimed |

The browser journey remains loopback-only and uses temporary data roots. Operational Runtime/Agent/browser state, UNKNOWN requests, external services, and deferred AI Broadcast Room files remain untouched.

## 2026-09-26 latest continuation: growth achievements

- `GrowthSnapshot.achievements` now exposes only earned, evidence-derived milestones: first verified evidence, learning session, project run, collaboration, and consistency.
- Each achievement carries `badgeKey`, `unlockedAt`, and owner-scoped `evidenceEventIds`. Net-zero retracted ledger events do not remain eligible; duplicate projections remain idempotent.
- `MyWorld` and `Character` render earned achievements with evidence counts. No locked/unearned achievement is rendered as earned, and no final artwork is assumed because the approved badge asset/catalog is absent from the repository.
- Verification: `tests/growth-achievements.test.ts`, serial user-product `139/139`, root build, approved UI build, and isolated browser `growthAchievementsPersistenceIsolation: passed`.

## 2026-09-26 latest continuation: project approval and waiting boundary

- Project Workspace approval confirmation was exercised in two isolated browser accounts. Canceling approval sends no request; approving against a no-enqueue Runtime stores the owner request as `waiting` with `Project Runtime is not configured`, without Run/evidence fabrication or cross-user visibility.
- No resume action is shown when no durable Run identity exists. Existing resume service/API tests cover the separate case where a waiting Run already has an identity; live Runtime execution remains unverified.
- Verification: browser `projectApprovalWaiting: passed`, existing `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, `tests/user-project-runtime-integration.test.ts`.

## 2026-09-26 latest continuation: verified evidence ownership

- User activity POST rejects client-submitted verified status with `403`; only trusted domain services produce verified growth evidence. Unverified/unknown submissions remain owner-scoped and exportable.
- The integrated learning journey now uses actual session completion to produce the verified activity event consumed by growth and portfolio projections; it no longer injects verified activity through the user API.
- Verification: focused security/journey tests `3/3`, product regression `139/139`, root regression `648/648`, root/UI builds, and isolated browser E2E remain green.

## 2026-09-26 latest continuation: permission-aware personal AI context

- Personal AI now receives bounded project summaries only when `settings.aiAccess.projectFiles` is enabled, using the existing owner/team-visible project service; workspace roots and raw files are not exposed in this context projection.
- Personal AI now receives only active, verified, owner-scoped activity timeline records when `settings.aiAccess.activityTimeline` is enabled. Unverified/self-reported and retracted events are excluded.
- Each permission is independent, and context-read failures fail closed. Verification: focused AI `11/11`, product `140/140`, root `648/648`, root/UI builds, and isolated browser E2E remain green. Live local model generation remains B/unverified due to unavailable Ollama model.

## 2026-09-26 latest verification: settings permission persistence

- Account A toggles project-file and activity-timeline AI permissions off and retains both values after reload; account B retains independent enabled defaults.
- Verification: isolated browser `settingsPermissionPersistenceIsolation: passed`, with two accounts, 13 routes, and 390/768/1024/1440px checks. Settings API/domain tests remain green; actual Runtime policy consumption remains tied to the permission-aware AI context slice above.

## 2026-09-26 latest verification: portfolio share control

- The approved Portfolio screen's visible share action is now exercised in the browser: public/unlisted entries expose copy/open controls, clipboard fallback displays the URL honestly, and private entries remain excluded.
- Verification: browser `publicPortfolioShareControl: passed` alongside `publicPortfolioRouteAndJsonExport: passed`, two-account isolation, and the responsive matrix.

## 2026-09-27 latest verification: learning review scheduling

- Learning UI review queue now has browser evidence for save → quality-5 completion → due-queue removal → durable future reschedule. The stored interval is `2` days after the first successful review.
- Verification: browser `learningReviewScheduling: passed`, existing `tests/learning-review-flow.test.ts`, and the full two-account/13-route/390/768/1024/1440px matrix. This does not claim AI evaluation or mastery.

## 2026-09-27 latest verification: optional local Runtime learning-plan boundary

- Learning goal preview remains **A — deterministic local-template persistence verified by default**. `src/learning/service.ts` preserves that path when no dispatcher is configured.
- Explicit local Runtime planning is **B — bounded proposal/validation/persistence path verified**. `LearningPlanDispatcher` is loopback-only through `src/learning/local-runtime.ts`; validated proposals become `learning-goal-runtime-v1` / `learning-plan-runtime-v1`, remain owner-bound, and are idempotent.
- Waiting, malformed, unknown-field, over-budget, incomplete, and unavailable proposals are **A — fail-closed boundary verified**: the draft goal and plan store remain unchanged. Live model quality and Ollama availability are **D — unverified** because no local model is installed.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/learning-plan-preview.test.ts`, `tests/learning-local-runtime.test.ts`. Focused `10/10`, serial user-product `143/143`, TypeScript build, and approved UI build pass; UI build retains only existing Vite warnings.

## 2026-09-27 latest verification: learning plan provenance UI

- The approved Learning screen is **A — provenance-aware UI verified**. It reads `preview.interpretation.source.kind` and accepts both template and explicitly validated local-runtime plan versions without changing the approved layout.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/user-ui-learning-plan-preview-contract.test.ts`, serial product `143/143`, TypeScript/UI builds, and browser `learningPlanPreviewPersistence: passed`.

## 2026-09-27 latest verification: evidence-preserving learning plan adjustment

- Learning plan adjustment is **A — owner/CAS/durable acceptance and browser path verified**. Proposals preserve completed day IDs and remain unaccepted until the user explicitly confirms; accepted proposals supersede the old version and create a new version without deleting historical sessions.
- The API rejects foreign goals/plans, stale goal revisions, superseded base versions, completed-day removal, invalid budgets, and no-op changes. Repeated acceptance is idempotent.
- Evidence: `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-plan-preview.test.ts`, `tests/learning-plan-preview-api.test.ts`, and browser `learningPlanAdjustment: passed`. Product regression `145/145`, TypeScript/UI builds, and the existing responsive matrix pass.

## 2026-09-27 latest verification: learning evidence projection

- Review completion is **A — durable owner-scoped activity evidence**. `reviewItem` records `learning.review.completed` with the review quality and resulting interval; repeated reviews use the durable review count as the activity version. This is evidence of the action, not a mastery or XP claim.
- Local code analysis is **A — provenance-aware activity evidence**. `analyzeCodeForLearning` records `learning.code.analyzed` with `system` actor attribution and `local-static` provider metadata after saving the durable analysis result. No external AI call is made.
- Portfolio projection is **A — browser-verified** for the new learning evidence: the existing owner-scoped Portfolio snapshot exposes the verified review activity as a selectable evidence candidate, while existing actor and visibility rules remain unchanged.
- Evidence: `src/learning/service.ts`, `tests/learning-review-flow.test.ts`, `src/portfolio/service.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `6/6`, user-product `145/145`, root `648/648`, TypeScript/UI builds, and browser `learningEvidenceProjection: passed` all pass.

## 2026-09-27 latest verification: recruitment application review UI

- Team/recruitment UI is **A — two-account browser verified for apply → manager review → membership access**. `Teams.tsx` loads manager-visible applications through `getRecruitmentPost` and exposes accept/reject controls wired to the durable `reviewRecruitmentApplication` API; non-managers receive no application list from the service and therefore do not see the review panel.
- The browser journey now performs the applicant action from account B's UI and the manager acceptance from account A's UI, then confirms account B can read the team project after membership changes.
- Evidence: `user-ui/src/pages/Teams.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-team-recruitment-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. User-product regression `146/146`, TypeScript/UI builds, and browser `recruitmentApplicationReviewUi: passed` are green.

## 2026-09-27 latest verification: project Runtime completion through the approved UI

- Project Workspace browser execution is now **A — isolated Runtime/Harness completion verified**, while the operational Runtime remains unverified. The isolated runner can opt into a temporary deterministic project Runtime that uses the existing Harness supervisor; it is not enabled for the default no-Runtime server.
- The browser journey creates a project and task through the approved UI, sends the user execution request, observes the authenticated durable Run/work-request transition to `completed`, reloads, and sees the `성공` state plus identity-bound Artifact/Revision/Deployment lifecycle evidence.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`. User-product regression `147/147`, root regression `648/648`, root/UI builds, and diff validation pass; browser `projectRuntimeExecutionUi: passed`; existing `projectApprovalWaiting: passed`, two-user ACL, recruitment review, persistence, and responsive route matrix remain green.
- Boundary: this verifies the local isolated Runtime composition through the actual user UI. It does not certify operational PID `1708`, the legacy Agent/lock state, external integrations, deployment, or live AI model output.

## 2026-09-27 latest verification: private AI Runtime response through the approved UI

- Personal AI is now **A — isolated dispatcher/UI response and reload verified**, while live local-model generation remains unverified. The default no-Runtime server still returns a durable `waiting_runtime` message without fabricated output.
- In the opt-in isolated server, a deterministic owner-bound dispatcher completes the current conversation message. Chrome verifies the response is rendered, survives reload, and changes the existing approved status surface to `Runtime 연결됨` based on persisted assistant evidence.
- Evidence: `src/ai-chat/service.ts`, `src/ai-chat/contracts.ts`, `user-ui/src/pages/AIChat.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, and the AI Chat UI contracts. Focused AI Chat UI/runtime contracts pass `1/1` each, user-product regression passes `148/148`, full root regression passes `648/648`, TypeScript/root UI builds and diff validation pass, and browser E2E reports `privateAiChatRuntimeResponse: passed`. This upgrades the browser boundary only; Ollama availability/quality, operational Runtime ownership, and external AI providers remain open.

## 2026-09-27 latest verification: Learning Runtime responses through the approved UI

- Learning Runtime integration is **A — isolated content/action/evaluator dispatcher and browser path verified**, while live local-model generation and operational Runtime ownership remain **D — unverified**. The default no-Runtime server still exposes the durable waiting boundary.
- The isolated browser path creates a goal and active day session through the approved Learning screen, stores validated lesson content, stores an owner-bound explanation response, and submits a coding answer through the UI. The evaluator's requested `verified` result is correctly downgraded to `tentative` because the coding attempt has no execution/artifact evidence; the UI shows the existing verification-waiting message.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-learning-runtime-browser-contract.test.ts`, `user-ui/src/pages/Learning.tsx`, and `src/learning/service.ts`. Contract `1/1`, user-product `149/149`, root `648/648`, TypeScript/UI builds, diff validation, and browser `learningRuntimeResponse: passed` are green.
- Boundary: this does not certify live Ollama output, real coding execution, external providers, operational PID `1708` behavior, or AI Broadcast Room work.

## 2026-09-27 latest verification: Learning evaluation feedback reconnect

- Learning answer/feedback restoration is **A — owner-scoped durable reconnect path verified**. The authenticated answer list returns only the session owner's persisted receipts, and the Learning screen selects the latest answer and restores its feedback after reload. Pending, tentative, and disputed states remain explicit.
- The default browser journey verifies the dispute/waiting state after reload; the isolated deterministic Learning Runtime journey verifies the tentative evaluator feedback after reload. This is a read/restore path and does not add mastery, verified evidence, or XP.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-feedback-evaluator.test.ts`, `tests/learning-feedback-dispute-api.test.ts`, `tests/user-ui-learning-feedback-evaluator-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `4/4`, user-product `149/149`, root `648/648`, TypeScript/UI builds, diff validation, and browser `learningFeedbackDispute: passed` plus `learningRuntimeResponse: passed` are green.
- Boundary: live Ollama output, operational Runtime ownership, external providers, and AI Broadcast Room remain unverified/deferred; no operational Runtime or UNKNOWN request was touched.

## 2026-09-27 latest verification: community reaction persistence

- Community post reactions are **A — two-account browser verified**. Account A creates a public post; account B likes it through the approved Community screen; B's `❤️ 1` state survives reload; account A sees the shared count as `🤍 1`, confirming viewer-specific like state and public count are separate.
- Evidence: `user-ui/src/pages/Community.tsx`, `user-ui/src/api/userApi.ts`, `scripts/iseol-user-ui-e2e.ts`, and the community UI contract in `tests/user-ui-team-recruitment-contract.test.ts`. Focused contract `2/2`, user-product `150/150`, root `648/648`, TypeScript/UI builds, diff validation, and browser `publicCommunityLikePersistence: passed` are green.
- Boundary: production notification delivery, moderation, and external social integrations remain unverified; no approved visual system or visibility rule was changed.

## 2026-09-27 latest operational reconnect recheck

## 2026-09-27 latest verification: owner-scoped AI team membership permissions

- AI team membership metadata is **A — durable service/API/UI behavior verified**. A manager can assign an AI member with an explicit agent ID, bounded role, capabilities, and approval scope; the assignment survives reload and can be removed. Legacy human records are normalized to the explicit human membership shape.
- The human collaboration ACL remains separate: AI memberships do not count as human collaborators, non-managers cannot mutate the assignment, and the approved Teams UI exposes the controls only for managed teams. `owner-approved-execution` is an approval boundary, not autonomous execution.
- Evidence: `src/teams/contracts.ts`, `src/teams/store.ts`, `src/teams/service.ts`, `src/collaboration-router.ts`, `user-ui/src/pages/Teams.tsx`, `tests/team-membership-acl.test.ts`, `tests/collaboration-api.test.ts`, `tests/user-ui-team-recruitment-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `6/6`, user-product `152/152`, root `648/648`, TypeScript/UI builds, diff validation, and browser `aiTeamMemberPermissions: passed` are green.
- Operational AI team execution remains **B/D — not live-verified**: each project Run still requires its existing approval and Runtime path, live local model quality is unverified, and the operational Runtime/Agent lock/codeVersion mismatch remains unresolved. AI Broadcast Room remains deferred.

- Runtime separation is **read-only confirmed**: PID `1708` runs the Runtime host and owns loopback listeners `18890` and `18891`; PID `22416` runs the Desktop Agent and maintains `52961 → 18891`. The configured `dataRoot` and lock path are `data/dogfood-01-20260919`.
- The lock's `pid=55000` is not the live owner, although its dataRoot matches the current Runtime configuration. The lock's recorded codeVersion `d8654f...` differs from `iseol-runtime.json`'s `d983937`; this remains **D — unresolved operational metadata**, and no automatic recovery or rewrite was performed.
- Evidence: `iseol-runtime.json`, `data/dogfood-01-20260919/runtime/iseol-runtime.lock`, read-only `Get-Process`, and `Get-NetTCPConnection`. Operational Runtime/Agent/browser state, durable UNKNOWN records, and external services were not mutated.

## 2026-09-27 latest verification: bounded AI team proposal approval boundary

- AI team proposal persistence/API/UI is **A — isolated durable behavior verified**. An AI or mixed project team can request a bounded proposal; the default no-dispatcher path remains `waiting-runtime`, while the isolated deterministic dispatcher produces a `proposed` item with owner/project/team/AI assignment provenance.
- Human approval is **A — manager-scoped and non-autonomous**. Only the team manager can accept or reject a proposal. Acceptance creates exactly one existing queued Work Request and no Run; repeated acceptance is idempotent. Outsiders cannot read or accept the proposal.
- The approved Projects UI is **A — truthful state/persistence path verified**. Waiting/proposed/accepted/rejected state is rendered without claiming AI execution, and the accepted Work Request survives reload.
- Live AI proposal generation and operational Runtime execution remain **B/D — not live-verified**. The deterministic dispatcher is limited to the temporary isolated browser server; the default runtime composition has no dispatcher. Existing per-Run approval, Runtime/Agent lock/codeVersion mismatch, UNKNOWN preservation, external integrations, and AI Broadcast Room deferral remain unchanged.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/store.ts`, `src/ai-team/service.ts`, `src/project-model/user-project-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/ai-team-proposals.test.ts`, `tests/ai-team-proposals-api.test.ts`, `tests/user-ui-ai-team-proposal-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `5/5`, product `156/156`, root `648/648`, TypeScript/UI builds, diff validation, and browser `aiTeamProposalRuntimeUi: passed` are green.

## 2026-09-27 latest verification: shared study space and private task submissions

- Study domain/API is **A — durable membership-scoped behavior verified**. A manager can create one study space for a study team, add shared curriculum resource metadata, and create a shared task. A member can read those shared records only while active in the team; removed/foreign users fail closed.
- Member submissions are **A — private and restart-durable**. `StudyTaskSubmission` is keyed by study space, task, and user; the view returns only `mySubmissions`, so an owner/manager does not see another member's answer by default. Submission activity is `unverified` and cannot directly award growth.
- The approved Teams UI is **A — browser-verified** for manager creation, member access, answer persistence after reload, and cross-user answer non-disclosure. Evidence: `src/study/contracts.ts`, `src/study/store.ts`, `src/study/service.ts`, `src/study/router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `tests/study-space.test.ts`, `tests/study-space-api.test.ts`, `tests/user-ui-study-space-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `4/4`, product `160/160`, root `648/648`, TypeScript/UI builds, diff validation, and browser `studyWorkspacePersistencePrivacy: passed` are green.
- Boundaries remain explicit: private Learning answers are not copied into study spaces, live AI/operational Runtime output is not claimed, external integration delivery remains unverified, stale lock metadata remains untouched, UNKNOWN records were not replayed, and AI Broadcast Room remains deferred.

## 2026-09-27 latest verification: social blocking and reporter-private safety controls

- Social blocks are **A — durable and bidirectional access-bound**. The authenticated user can block/unblock another existing user; active blocks suppress profile discovery, friend lists, new friend requests, and direct-message reads/writes from either side. Unblock changes only the block status and restores the prior friendship path.
- Reports are **A — durable but unverified user statements**. A report stores its reason under the reporter's scope; the target and other users receive no report record. The report is not treated as verified growth or moderation action.
- The approved Friends UI is **A — browser-verified** for report submission, block, reciprocal search suppression, reporter-only report visibility, unblock, and friendship restoration. Evidence: `src/social/contracts.ts`, `src/social/store.ts`, `src/social/service.ts`, `src/collaboration-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Friends.tsx`, `tests/social-safety.test.ts`, `tests/social-safety-api.test.ts`, `tests/user-ui-social-safety-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused safety `4/4`, collaboration `8/8`, product `164/164`, root `648/648`, TypeScript/UI builds, and browser `socialSafetyBlockReportUi: passed` are green.
- Boundaries remain explicit: no moderation console or automated enforcement was invented, no operational Runtime/Agent or stale lock was touched, no UNKNOWN was replayed, and AI Broadcast Room remains deferred.

## 2026-09-27 latest verification: learning-to-project application boundary

- Learning project application is **A — owner-scoped durable proposal and API verified**. A user can reference an existing accessible project from a learning goal, store a bounded evidence-linked proposal, list it after navigation, and reject execution/deployment/push claims before any project work is created.
- Acceptance is **A — explicit approval and idempotent Work Request verified**. The owner acceptance creates one existing queued project Work Request and one LearningLink; repeated acceptance returns the same request and never starts a Run or claims completion.
- The approved Learning UI is **A — browser-verified** for project selection, draft creation, acceptance, project-workspace visibility, and durable link state. Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-project-application.test.ts`, `tests/learning-project-application-api.test.ts`, `tests/user-ui-learning-project-application-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `4/4`, product `168/168`, root `648/648`, TypeScript/UI builds, and browser `learningProjectApplicationUi: passed` are green.
- Boundaries remain explicit: Work Request execution still requires the existing project approval and Runtime path; live local AI quality, operational Runtime ownership, stale lock reconciliation, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: evidence-separated learning reports

- Learning weekly/final report is **A — owner-scoped durable local-evidence behavior verified**. A report is scoped to one goal and an inclusive date period, deduplicated by period plus source revision/template, and restored after a service restart.
- Evidence handling is **A — explicit and fail-closed**. Verified outcomes contain evidence references; unverified attempts and self-reports are kept separate; remaining planned work and review suggestions are visible. Reports carry `local-evidence` provenance and never claim mastery or competence without evidence.
- The approved Learning UI is **A — browser-verified** for date selection, report generation, truthful provenance, no-evidence behavior, and reload persistence. Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-report.test.ts`, `tests/learning-report-api.test.ts`, `tests/user-ui-learning-report-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `3/3`, product `171/171`, root `648/648`, TypeScript/UI builds, and browser `learningReportUi: passed` are green.
- Boundaries remain explicit: this is a deterministic local summary rather than live AI report quality; local Runtime model availability, operational Runtime ownership, stale lock reconciliation, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: weekly/final report selection and browser race fix

- The approved Learning UI now exposes `보고 유형` with `주간 보고` and `최종 보고`; the selected kind is sent to the owner-scoped report API and persists in the report period.
- The browser journey verifies both kinds. Its second-read assertion waits for the expected durable final report record, eliminating the prior stale-success-notice race. Two consecutive complete isolated browser runs passed with `learningReportUi: passed`.
- Focused report/API/UI checks remain `3/3`; root/UI builds pass. Operational Runtime ownership, stale lock reconciliation, live local model quality, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: user-controlled private memory access

- Personal memory remains **A — durable owner-private CRUD**. The new `aiAccess.memory` setting controls only whether the user's personal AI Runtime context may read those records; it does not change memory visibility or delete stored records.
- Permission behavior is **A — owner-scoped and fail-closed**. With the switch off, prior memory and newly persisted `ai-chat-context` records are excluded from dispatch; account B retains its own default-on setting. Existing settings records receive a backward-compatible default-on field when read.
- The approved Settings UI and isolated two-account browser path are **A — browser-verified** for toggle, reload persistence, and cross-user isolation. Focused `10/10`, product `173/173`, root `648/648`, TypeScript/UI builds, diff validation, and browser E2E are green.
- Boundaries remain explicit: no memory is shared with teams or other users, live local model quality and operational Runtime ownership remain unverified, the stale lock remains untouched, UNKNOWN records were not replayed, external integrations remain unverified, and AI Broadcast Room remains deferred.
- Settings-read failure is also **A — fail-closed**: when an explicit settings service cannot load the user's permission, personal AI receives an empty private-memory context rather than falling back to memory access.

## 2026-09-27 latest verification: team departure and project access revocation

- Team departure is **A — owner-protected durable behavior verified**. The approved Teams UI exposes a member/admin `팀 탈퇴` action with inline confirmation and calls the existing authenticated leave route; an owner cannot remove themself through that action.
- Access revocation is **A — two-account browser verified**. After member B leaves a private team, B no longer receives the team's private project from the project API or Projects UI, while owner A retains access. The membership is transitioned through the existing durable service path rather than deleting team data.
- Evidence: `src/teams/service.ts`, `src/collaboration-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `tests/user-ui-team-recruitment-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI `4/4`, product `174/174`, root `648/648`, TypeScript/UI builds, diff validation, and browser `teamLeaveAccessRevocation: passed` are green.
- Boundaries remain explicit: live external notifications/integrations, operational Runtime ownership, stale lock reconciliation, live local-model quality, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: membership-scoped team chat

- Team chat is **A — durable API/service/UI and two-account browser verified**. Active human members can read and send messages in the selected team; messages survive service restart and browser reload, and each message retains its team and sender identity.
- The access boundary is **A — fail-closed**. Team public visibility does not expose chat, AI memberships are not human chat access, outsiders cannot read/send, and a member who leaves loses future chat access while active members retain the durable history.
- Evidence: `src/team-chat/contracts.ts`, `src/team-chat/store.ts`, `src/team-chat/service.ts`, `src/collaboration-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Teams.tsx`, `tests/team-chat.test.ts`, `tests/team-chat-api.test.ts`, `tests/user-ui-team-chat-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused collaboration `11/11`, product `178/178`, root `648/648`, TypeScript/UI builds, diff validation, and browser `teamChatMembership: passed` are green.
- Boundary: message notifications, live SSE delivery, moderation, external Discord/Calendar/GitHub delivery, operational Runtime ownership, stale lock reconciliation, UNKNOWN replay, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: bounded AI team technical discussion

- AI team discussion persistence/API is **A — durable isolated behavior verified**. A human member of an AI/mixed project team can request a discussion from an assigned AI member with `discussion.propose`; records retain assignment and project scope, survive a new service instance, and deduplicate by request ID.
- Runtime boundary is **A — truthful waiting/completed states verified**. The default no-dispatcher path stores `waiting-runtime`; only a supplied local dispatcher can produce a bounded answer with key points, alternatives, and risks. Discussion does not create a Work Request, Run, growth evidence, or execution result.
- The approved Projects UI is **A — browser-verified** for request, deterministic isolated Runtime answer, visible state, and reload persistence. Evidence: `src/ai-team/contracts.ts`, `src/ai-team/discussion-store.ts`, `src/ai-team/discussion-service.ts`, `src/project-model/user-project-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/ai-team-discussion.test.ts`, `tests/ai-team-discussion-api.test.ts`, `tests/user-ui-ai-team-discussion-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `4/4`, product `182/182`, TypeScript/UI builds, and browser `aiTeamDiscussionRuntimeUi: passed` are green.
- Live local-model discussion quality and operational Runtime ownership remain **B/D — not live-verified**. Stale lock/codeVersion metadata, external integrations/notifications, UNKNOWN preservation, and AI Broadcast Room deferral remain unchanged.

## 2026-09-27 latest verification: durable Project Task → Run binding

- Project Work Request to Task mapping is **A — durable and idempotently verified**. Each owner-bound Work Request now has a deterministic `nodeId` (`task-<workRequestId>`) and a corresponding `ProjectTreeNode(kind:"task")`; legacy requests without the field are repaired without duplicating the task node.
- Run attachment is **A — Task-scoped verified**. Starting a project Run passes the Work Request node id into Run preparation, so the Run and its history attach to the Task node. Callers without a node id retain the compatibility root fallback.
- The approved Project UI is **A — browser-verified** through the existing workspace tree. Evidence: `src/project-model/user-project-service.ts`, `src/project-model/work-request.ts`, `src/project-model/workspace-run-preparation.ts`, `tests/user-project-execution.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused `21/21`, product `182/182`, root `648/648`, TypeScript/UI builds, and browser `projectRuntimeExecutionUi: passed` with the Task→Run assertion are green.
- Boundaries remain explicit: this browser path uses only a temporary deterministic isolated Runtime fixture; operational Runtime ownership, stale lock reconciliation, live local-model quality, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: team-document permission in private AI context

- `aiAccess.teamDocs` is now **A — durable permission and context boundary verified**. When enabled, an active human member's private AI receives only shared StudySpace descriptions, curriculum-link labels, and study-task instructions through the existing membership-scoped StudyService.
- Privacy behavior is **A — fail-closed and two-account verified**. Personal task submissions/answers, private memories, and unrelated teams are not included; disabling the setting removes `teamDocs`, and a shared-study read failure omits the optional section.
- The loopback local AI adapter is **A — bounded prompt propagation verified**: the prompt labels the section as shared metadata and keeps the private-submission exclusion explicit. Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-local-runtime.test.ts`, and `tests/user-ui-settings-contract.test.ts`. Focused `14/14`, product `183/183`, root `648/648`, TypeScript/UI builds, and browser E2E are green.
- Boundaries remain explicit: this does not implement general team document storage or external connector delivery; live local-model quality, operational Runtime ownership, stale lock reconciliation, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: isolated local coding syntax receipt

- Coding attempts remain **A — durable owner-scoped submission and receipt boundary**. The default learning service still stores `environment-required`; an explicitly injected verifier can update only the same owner's attempt with a bounded `syntax-verified` or `syntax-invalid` receipt and stable `coding-syntax:<attemptId>` artifact reference.
- The local verifier is **A — isolated syntax check verified, not answer evaluation**. It writes the submitted JavaScript into a temporary root and invokes `node --check` with shell disabled, a bounded timeout, minimal environment, capped diagnostics, and cleanup. Unsupported languages and timeout/spawn failures remain waiting; no submitted program behavior is executed.
- The approved Learning UI is **A — browser-verified** for persisted status display and reload restoration. Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `src/learning/local-coding-verifier.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-coding-test.test.ts`, `tests/learning-coding-test-api.test.ts`, `tests/learning-local-coding-verifier.test.ts`, and `tests/user-ui-coding-test-contract.test.ts`. Focused checks `7/7`, product `185/185`, root `648/648`, TypeScript/UI builds, and browser `learningLocalSyntaxVerifierUi: passed` are green across two accounts and responsive routes `[390, 768, 1024, 1440]`.
- Boundaries remain explicit: syntax validity is not a test pass, correctness, mastery, XP, or verified portfolio evidence. The production/default server remains environment-required; live local-model quality, operational Runtime ownership, stale lock reconciliation, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: Runtime-composed local coding syntax receipt

- The normal `startIseolRuntimeServices` graph now composes the existing bounded local JavaScript syntax verifier into its default `LearningService`. This is **A — isolated Runtime-composition verified**: an owner-scoped JavaScript attempt submitted through the composed service persists `syntax-verified` with a `syntax-only` receipt.
- The composition still preserves the existing boundary: only JavaScript syntax is checked with `node --check`; submitted program behavior is not executed, correctness/test pass/mastery/XP/growth are not claimed, and custom injected learning services remain untouched.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/learning/local-coding-verifier.ts`, `tests/iseol-runtime-services.test.ts`, and the Task49 coding suites. Focused integration/coding checks pass `40/40`, TypeScript/UI builds pass, product regression passes `185/185`, root regression passes `649/649`, and the two-account responsive browser journey reports `learningLocalSyntaxVerifierUi: passed`.
- No operational Runtime/Agent restart or request, stale-lock repair, UNKNOWN replay, external provider call, data mutation outside isolated roots, push, deployment, design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: Project Run to growth and portfolio evidence

- The integrated project lifecycle is **A — isolated service and browser verified through the evidence boundary**. A completed owner Run is linked to its Task node and verified lifecycle evidence, then produces exactly one active `project.run.completed` ActivityEvent on repeated project reads.
- Growth projection is **A — owner-scoped and idempotent**. The completed project event contributes development XP and the `project-run` achievement with the event ID as evidence; a second browser account receives neither the event nor the achievement.
- Portfolio projection is **A — verified evidence only**. The owner Portfolio snapshot exposes both the service-owned ActivityEvent evidence and the Run's project evidence; the approved Portfolio UI creates and reloads an entry containing both. A second account cannot see either evidence record.
- Evidence: `src/project-model/user-project-service.ts`, `src/activity/service.ts`, `src/growth/read-model.ts`, `src/portfolio/service.ts`, `tests/user-project-runtime-integration.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `user-ui/src/pages/PortfolioScreen.tsx`. Focused Runtime/project checks `3/3`, product regression `185/185`, root regression `649/649`, TypeScript/UI builds, diff validation, and the isolated Chrome journey report `projectRuntimeGrowthPortfolioUi: passed` with responsive routes `[390, 768, 1024, 1440]`.
- Boundaries remain explicit: the browser Runtime is temporary deterministic test infrastructure; operational Runtime/Agent ownership, stale lock reconciliation, live local-model quality, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: Learning Project Application to Project Runtime

- The Learning-to-Project handoff is **A — approved UI and isolated Runtime browser verified**. A user-created learning goal selects an owner-visible project, creates an application draft, accepts it, and produces one queued Work Request without starting execution.
- Runtime continuation is **A — separate approval boundary preserved**. The Work Request is executed only from the Project UI, completes through the temporary deterministic Runtime, and projects verified `project.run.completed` activity, development growth/`project-run`, and portfolio activity evidence.
- The Learning UI notice boundary is **A — fixed and browser-verified**. Shared action feedback now renders in a global `role=status` region, so the application success state is visible even when the user has no active Learning session; the session card no longer duplicates that notice.
- Evidence: `user-ui/src/pages/Learning.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `src/project-model/user-project-service.ts`, and `src/portfolio/service.ts`. Product regression `185/185`, root regression `649/649`, TypeScript/UI builds, diff validation, and the isolated Chrome journey report `learningProjectRuntimeIntegrationUi: passed` plus the existing `projectRuntimeGrowthPortfolioUi: passed` across responsive routes `[390, 768, 1024, 1440]`.
- Boundaries remain explicit: this uses only temporary deterministic isolated Runtime infrastructure; operational Runtime/Agent ownership, stale lock reconciliation, live local-model quality, external integrations, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: operator Control Plane Project Run recovery

- Operator Control Plane retry is **A — isolated API, Runtime composition, and Chrome verified**. A configured operator can retry a failed project Work Request only with the current revision and its exact durable Run ID; the route rejects the normal Web token, preserves the Run identity, records `actor: operator`, and projects the Work Request back to `running`.
- The Control Plane UI is **A — isolated browser-verified**. It keeps the operator token separate from the regular Web token, asks for explicit confirmation, exposes `Retry Run` only for failed requests with a durable Run, and refreshes the project state after the operation. Evidence: `src/web-control-plane/router.ts`, `src/runtime/iseol-runtime-services.ts`, `web/index.html`, `web/app.js`, `web/styles.css`, `tests/web-control-plane-router.test.ts`, `tests/web-control-plane-static.test.ts`, and `tests/read-model-browser.test.ts`.
- Verification: focused checks `49/49`, isolated Control Plane Chrome checks `2/2`, TypeScript/UI builds, product `189/189`, root `651/651`, diff validation, and the complete two-account responsive user-product matrix are green. This does not claim operational Runtime ownership, live external integration delivery, UNKNOWN replay, or AI Broadcast Room implementation.

### 2026-09-27 latest verification: Project Run terminal failure recovery

- Status: A in isolated product flow; operational Runtime ownership remains D/unverified.
- Owner-scoped failed Project Runs now retain the Harness failure reason, expose an explicit retry action, require existing build approval when enabled, and reuse the same durable Run identity through `POST /api/user/projects/:id/runs/retry`.
- Verified path: fail-once isolated Runtime → durable `failed` Run/Work Request → no completion ActivityEvent or development growth → reload-visible blocker → owner retry → completed Run with same Run ID → one verified completion ActivityEvent and development growth.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `src/project-model/work-request.ts`, `user-ui/src/pages/Projects.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-project-execution.test.ts`, and `tests/user-ui-project-resume-contract.test.ts`.
- Verification: focused `13/13`, user-product `189/189`, root `650/650`, TypeScript/UI builds, `git diff --check`, and browser `projectRuntimeFailureRecoveryUi: passed` with the existing two-account/responsive matrix. The reconciliation regression also preserves late completed→failed protection while allowing an explicit failed-Run retry to project completion.
- Boundary: isolated deterministic Runtime only; no operational Runtime/Agent restart/request, stale-lock repair, UNKNOWN replay, external provider call, data deletion, push, deployment, design change, or AI Broadcast Room implementation.

## 2026-09-27 latest verification: user-scoped in-app notifications for team messages

- Team-message notifications are **A — durable service/API verified**. Each active human recipient receives an owner-scoped `new-message` record only when that user's persisted `settings.notifications.newMessage` is enabled; the sender, AI members, departed members, and outsiders receive no record. Duplicate source delivery is idempotent, list ordering is deterministic, and read transitions survive service restart.
- The approved user shell is **A — isolated Chrome verified**. The existing navigation language now exposes a real notification bell, unread count, notification panel, read action, and navigation back to Teams. No Control Plane SSE stream, placeholder record, or alternative dashboard was introduced.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/store.ts`, `src/notifications/service.ts`, `src/notifications/router.ts`, `src/team-chat/service.ts`, `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-api.test.ts`, and `tests/user-ui-notifications-contract.test.ts`.
- Verification: focused notification/runtime/UI checks `37/37`, collaboration suite `14/14`, user-product regression `193/193`, root regression `654/654`, TypeScript and user-UI builds, `git diff --check`, and the two-account responsive browser matrix with `teamMessageNotifications: passed` at `[390, 768, 1024, 1440]`.
- Boundaries remain explicit: this is in-app durable delivery for team messages only. Direct-message notifications, AI completion/achievement/weekly notification producers, live push/SSE synchronization, operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: direct-message notification producer

- Direct-message notifications are **A — Social boundary and browser verified**. After the existing Social service confirms an accepted friendship or shared team and no active block, the recipient receives one owner-scoped `new-message` record when their persisted `settings.notifications.newMessage` is enabled. The sender is excluded and disabling the recipient setting suppresses later records.
- The existing notification panel is **A — route-integrated** for both sources. A `team-message` notification returns to Teams and a `direct-message` notification returns to Friends; both use the same durable read transition and no live push claim is made.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/social/contracts.ts`, `src/social/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, and `tests/user-notifications.test.ts`.
- Verification: focused notification/social/runtime checks `38/38`, user-product regression `194/194`, root regression `655/655`, TypeScript and user-UI builds, and the two-account responsive browser matrix with `directMessageNotifications: passed` and `teamMessageNotifications: passed` at `[390, 768, 1024, 1440]`.
- Remaining notification boundary: AI completion, team invite, achievement, weekly digest producers, and live push/SSE synchronization are not implemented or verified. Operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: private AI completion notification producer

- Private AI completion notifications are **A — owner-bound service and browser verified**. The AI Chat service creates one `ai-completion` record only after the user message and assistant response are durably persisted as completed, including the existing user-bound Runtime completion path. Repeated completion is idempotent, and the owner's persisted `settings.notifications.aiDone` setting suppresses later records when disabled.
- The payload contains no prompt or response content. The existing notification panel routes this source back to AI Chat, marks it read through the authenticated owner-scoped transition, and preserves the conversation after reload.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, and `tests/user-notifications.test.ts`.
- Verification: focused AI/notification/API/runtime/UI checks `49/49`, user-product regression `195/195`, root regression `656/656`, TypeScript and user-UI builds, and the isolated two-account browser matrix with `privateAiChatRuntimeResponse: passed`, `aiDoneNotifications: passed`, `directMessageNotifications: passed`, `teamMessageNotifications: passed`, and responsive `[390, 768, 1024, 1440]`.
- Remaining notification boundary: team invite, achievement, weekly digest producers, and live push/SSE synchronization are not implemented or verified. Operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: accepted-team-membership notification producer

- Team-invite notifications are **A — recruitment acceptance and browser verified** at the existing product boundary. Manager approval of a pending recruitment application adds the applicant as an active human member, persists the accepted review, and then creates one `team-invite` record for that joining user only. Different accepted applications remain distinct and source-idempotent.
- The producer respects the joining user's persisted `settings.notifications.teamInvite`; the manager receives no self-notification, muted users receive none, and the existing notification panel routes the record to Teams while preserving other unread sources.
- Evidence: `src/recruitment/contracts.ts`, `src/recruitment/service.ts`, `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, and `tests/user-notifications.test.ts`.
- Verification: focused recruitment/notification/runtime/UI checks `40/40`, user-product regression `196/196`, root regression `657/657`, TypeScript and user-UI builds, and the isolated two-account browser matrix with `teamInviteNotifications: passed`, `directMessageNotifications: passed`, `aiDoneNotifications: passed`, and responsive `[390, 768, 1024, 1440]`.
- Remaining notification boundary: achievement and weekly digest producers plus live push/SSE synchronization are not implemented or verified. Operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: growth achievement notification producer

- Achievement notifications are **A — Growth transition, durable API, and browser verified**. When a verified activity entry unlocks a new evidence-based achievement, GrowthService persists the ledger entry first and creates one owner-scoped `achievement` notification per newly unlocked achievement. Reapplying the same evidence is idempotent, and later notifications are suppressed when the owner's persisted `settings.notifications.achieve` is disabled.
- The notification source carries only the achievement/evidence identifiers and bounded title/body; it does not expose private activity details. The existing notification panel marks the selected record read and routes the user back to My World. Other users receive no achievement notification.
- Evidence: `src/growth/contracts.ts`, `src/growth/read-model.ts`, `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/growth-achievements.test.ts`, `tests/user-notifications.test.ts`, `tests/user-ui-notifications-contract.test.ts`, and `tests/iseol-runtime-services.test.ts`.
- Verification: focused growth/notification/runtime/UI checks `41/41`, user-product regression `197/197`, root regression `657/657`, TypeScript and user-UI builds, and the isolated two-account browser matrix with `achievementNotifications: passed`, `teamInviteNotifications: passed`, `directMessageNotifications: passed`, `aiDoneNotifications: passed`, and responsive `[390, 768, 1024, 1440]`. The E2E read assertion polls until the durable asynchronous read transition is visible; no product behavior was weakened.
- Remaining notification boundary: weekly digest producers and live push/SSE synchronization are not implemented or verified. Operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: authenticated user notification SSE refresh

- User notification live refresh is **A — authenticated stream and isolated browser verified**. The separate `/api/user/notifications/stream` endpoint authenticates the platform user, caps active connections, filters every signal by the owner user ID, and emits only bounded `created`/`read` refresh metadata. It does not reuse the operator Control Plane stream or expose notification content.
- The existing approved notification bell now subscribes to that stream and re-fetches the durable owner-scoped REST snapshot after a signal. A disconnected stream retries with bounded backoff and triggers another REST snapshot refresh after reconnection. The REST list/read records remain canonical across disconnect, reload, and restart; no in-memory replay claim is made.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-notifications-stream.test.ts`, `tests/user-ui-notifications-contract.test.ts`, and `package.json`.
- Verification: focused stream/API/UI checks `9/9`, user-product regression `197/197`, root regression `657/657`, TypeScript and user-UI builds, `git diff --check`, and the isolated two-account responsive browser matrix with `liveUserNotificationStream: passed` plus achievement/team-invite/direct-message/AI-completion notification journeys at `[390, 768, 1024, 1440]`.
- Remaining notification boundary: weekly digest producers still lack an approved detailed aggregation/scheduling specification. Operational Runtime ownership, external connectors, UNKNOWN records, and AI Broadcast Room remain unverified/deferred or untouched.

## 2026-09-27 latest verification: user-scoped Project History in Workspace

- Project History is **A — durable user view and ACL verified**. `UserProjectService.getProject()` now reads the existing project `history.jsonl` through the same owner/team authorization boundary used by the rest of the Project Workspace; an outsider still receives no project view.
- The approved Project Workspace now includes `프로젝트 활동 기록`, rendering only actually stored project/work/integration/Runtime history fields with an explicit empty state. It does not claim external connector success, deployment success, or other status that is absent from durable records.
- Evidence: `src/project-model/history-store.ts`, `src/project-model/user-project-service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/UI checks `13/13`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and the isolated two-account responsive browser matrix with `projectHistoryUi: passed` and `responsiveViewports: [390, 768, 1024, 1440]`.
- Boundary: browser history verification uses the temporary isolated deterministic Runtime's actual `run-attached` record. Operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: recent authenticated activity in My World

- My World recent activity is **A — authenticated UI and browser verified**. It reads the existing owner-scoped `/api/user/activity` events, displays the five newest durable records, and preserves each event's source, actor, and verification state instead of converting it into a fake completion or XP claim.
- The feed is integrated into the approved My World surface with an empty state and a link to the existing full Activity timeline. After an isolated project Run, the owner sees `project.run.completed` after reload; a second account sees no event in the UI or API.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-my-world-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and the isolated two-account responsive browser matrix with `projectRuntimeExecutionUi: passed` and `responsiveViewports: [390, 768, 1024, 1440]`.
- Boundary: the feed only reads existing ActivityEvent records. Operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: complete authenticated Activity timeline ledger

- The full Activity timeline is **A — authenticated UI and browser verified** for the durable ledger surface. It now reads the same owner-scoped `/api/user/activity` records as My World and renders raw `eventType`, source identity, actor attribution, active/retracted state, and verified/unverified/unknown status.
- Existing Growth and verified Portfolio evidence sections remain separate and authoritative; the new ledger does not fabricate XP, mastery, completion, or portfolio evidence from unverified events. Loading and empty states are explicit.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/user-ui-activity-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and the isolated two-account responsive browser matrix with `activityTimelineUi: passed` and responsive `[390, 768, 1024, 1440]`.
- Boundary: the timeline only reads durable ActivityEvent records and keeps the existing verified-evidence projection separate. Operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: truthful current Runtime status in Personal AI

- Personal AI Runtime status is **A — capability-aware UI and browser verified**. `AIChat.tsx` now reads the authenticated `/api/user/runtime-status` snapshot and shows `Runtime 연결됨` only for current `state: ready`; a persisted historical assistant message no longer implies that the Runtime is currently connected.
- Durable conversation/message persistence, owner isolation, and the waiting/completed response boundary are unchanged. When the capability is disabled or unavailable, the UI keeps the honest waiting copy and does not fabricate an answer.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `src/web-control-plane/user-router.ts`, `tests/user-ui-ai-chat-contract.test.ts`, `tests/user-runtime-status-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused AI UI contract `1/1`, user-product `198/198`, root `657/657`, TypeScript/UI builds, `git diff --check`, and the isolated browser matrix with `runtimeStatusSurface: passed`, `privateAiChatRuntimeResponse: passed`, and responsive `[390, 768, 1024, 1440]`.
- Boundary: no local model was installed or externally called; operational Runtime/Agent ownership, stale-lock reconciliation, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: separate AI Chat Runtime capability from project execution

- Personal AI now uses the explicit authenticated `aiChat` capability in `/api/user/runtime-status`, while the existing `state` field continues to describe the broader project-execution capability. A project Runtime being ready no longer makes Personal AI claim that a local AI dispatcher/model is connected.
- The composed Runtime service and the isolated browser server set `aiChat` from the actual owner-bound AI dispatcher; `AIChat.tsx` renders the connected state only for `aiChat: ready`. This preserves honest waiting behavior when project execution is available but no AI Chat dispatcher is configured.
- Evidence: `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/user-runtime-status-api.test.ts`, and `tests/user-ui-ai-chat-contract.test.ts`.
- Verification: focused Runtime/UI checks `3/3`, user-product regression `198/198`, root regression `657/657`, TypeScript and user-UI builds, `git diff --check`, and isolated browser `runtimeStatusSurface: passed` plus `privateAiChatRuntimeResponse: passed` with responsive `[390, 768, 1024, 1440]`.
- Boundary: no local model was installed or externally called; operational Runtime/Agent ownership, the stale PID `55000` lock, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: truthful Idea Lab Runtime capability states

- Idea Lab is **A — capability-aware UI and browser verified**. It now reads the authenticated Runtime status and separates project execution (`프로젝트 Runtime 준비됨` / `프로젝트 Runtime 연결 대기` / `프로젝트 Runtime 상태 확인 중`) from Personal AI candidate generation (`개인 AI 후보 생성 준비됨` / `개인 AI 후보 생성 대기` / `개인 AI 후보 생성 상태 확인 중`); it no longer permanently claims Runtime waiting.
- The existing explicit approval gate and honest no-build/no-fake-result boundary are unchanged. The screen does not claim that a project was executed or that an AI-generated result exists before the user approves and a real execution path produces durable evidence.
- Evidence: `user-ui/src/domain/ideaLabState.ts`, `user-ui/src/pages/IdeaLab.tsx`, `tests/user-ui-idea-lab-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Idea Lab focused checks `3/3` (combined World/activity checks `6/6`), user-product `202/202`, root `657/657`, TypeScript/UI builds, `git diff --check`, and browser E2E with `ideaLabRuntimeStatus: passed`, all existing journeys, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: operational Runtime/Agent ownership, stale lock PID `55000`, UNKNOWN records, external connectors, external AI/model availability, and AI Broadcast Room remain untouched, unverified, or deferred.

## 2026-09-27 latest verification: truthful Personal AI state in My World

- My World is **A — capability-aware UI and browser verified** for the AI companion status. The existing character area reads authenticated `runtime-status.aiChat` and shows `개인 AI 준비됨`, `개인 AI 연결 대기`, or `개인 AI 상태 확인 중`; it no longer presents a static companion message as if a live AI interaction were available.
- The approved world layout, character rendering, growth cards, mission evidence, and activity feed remain unchanged. This is a capability indicator, not an AI-generated answer or a claim that a task was completed.
- Evidence: `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-my-world-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused My World contract `1/1`, user-product `202/202`, UI build, root build/regression evidence, `git diff --check`, and browser E2E with `truthfulWorldAndIntegrationStates: passed`, `worldIsolation: passed`, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: operational Runtime/Agent ownership, stale lock PID `55000`, UNKNOWN records, external connectors, external AI/model availability, and AI Broadcast Room remain untouched, unverified, or deferred.

## 2026-09-27 latest verification: evidence-backed My World mission details

- My World missions now derive bounded evidence details from the existing owner-scoped ActivityEvent list. Only verified `project.run.completed`, `learning.session.completed`, and `learning.review.completed` events contribute; unverified and UNKNOWN records are excluded.
- The approved mission surface shows verified evidence count and the latest recorded date while retaining the existing `저장된 기록` / `다음 행동` states. No completion flag, XP reward, percentage, or second activity store was introduced.
- Evidence: `user-ui/src/domain/worldState.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-world-state-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused world/activity checks `5/5`, user-product `199/199`, root `657/657`, TypeScript/UI builds, `git diff --check`, and isolated browser E2E with `truthfulWorldAndIntegrationStates` plus responsive `[390, 768, 1024, 1440]` all passed.
- Boundary: no operational Runtime/Agent change, stale-lock repair, UNKNOWN replay, external AI/provider call, external connector change, deployment, push, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: common navigation reflects Personal AI capability

- The common user sidebar now reads the authenticated runtime status and labels the AI navigation indicator `AI Runtime 준비`, `AI Runtime 연결 대기`, or `AI Runtime 상태 확인 중`; it no longer permanently claims that Personal AI is waiting.
- Evidence: `user-ui/src/components/Navigation.tsx`, `tests/user-ui-ai-chat-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI checks `3/3`, user-product `198/198`, root `657/657`, TypeScript/UI builds, and isolated browser E2E with `runtimeStatusSurface`, `truthfulWorldAndIntegrationStates`, and the responsive matrix `[390, 768, 1024, 1440]` all passed.
- Boundary: no model was installed and no external AI call was made; operational Runtime/Agent, stale lock `55000`, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: Settings separates project Runtime and Personal AI capability

- The approved Settings · `연동 환경` surface now renders the broad `Runtime 실행 환경` status and the authenticated `개인 AI Runtime` status separately. `Runtime 준비됨` means project execution capability only; `개인 AI 준비됨` is shown only when `/api/user/runtime-status.aiChat` is `ready`.
- Unavailable/unknown states remain explicit (`Runtime 미연결`, `개인 AI 미연결`, or status-check copy). GitHub, ChatGPT Web, Discord, Notion, and Vercel remain truthful unavailable/coming-soon states without fake connection or disconnect actions.
- Evidence: `user-ui/src/pages/Settings.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-integrations-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI/responsive checks `2/2`, user-product `198/198`, root `657/657`, TypeScript/UI builds, and isolated browser E2E all pass; the browser result includes `truthfulWorldAndIntegrationStates: passed`, `runtimeStatusSurface: passed`, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- The E2E notification assertion now waits for the owner navigation after marking an achievement notification read, preventing a pre-existing async click race from being mistaken for a product failure. No notification semantics were weakened.
- Boundary: no local model was installed or externally called; operational Runtime/Agent ownership, the stale PID `55000` lock, UNKNOWN records, external connectors, and AI Broadcast Room remain untouched/unverified/deferred.

## 2026-09-27 latest verification: visible Task to Run traceability in Project Workspace

- Project Workspace is **A — durable Task → Run traceability visible and browser verified**. Existing owner-scoped Work Request records now show their request ID, attempt count, creation date, and assigned Run ID when present. No new state or success claim is created by the UI.
- Approval checkpoints, waiting/retry behavior, lifecycle evidence, history, ActivityEvent projection, growth, portfolio, and two-user ACL behavior remain unchanged and authoritative.
- Evidence: `user-ui/src/pages/Projects.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `tests/user-project-execution.test.ts`, `tests/user-project-runtime-integration.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused integration checks `16/16`, user-product `202/202`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and browser E2E with `projectRuntimeExecutionUi: passed`, `projectHistoryUi: passed`, `projectRuntimeFailureRecoveryUi: passed`, two-account isolation, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: operational Runtime/Agent ownership, stale lock PID `55000`, UNKNOWN records, external connectors, external AI/model availability, and AI Broadcast Room remain untouched, unverified, or deferred.

## 2026-09-27 latest verification: truthful Run status in the Project list and reconnect path

- Project list Run status is **A — durable status projection and browser reconnect verified**. `ProjectList` hydrates each visible project through the existing authenticated `getUserProject()` view and maps its durable `runtime.status` to the existing status badge; it no longer treats every active project as merely pending.
- Cards now distinguish `실행된 Run 없음`, `Run 실행 중`, waiting/failure blockers, `Run 완료`, and unknown state. A detail-read failure is rendered as `확인 불가` with bounded copy, never as success. The create path starts honestly at `not-started`.
- Evidence: `user-ui/src/pages/Projects.tsx`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/UI checks `17/17`, user-product `203/203`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and the isolated two-account responsive browser matrix all passed; the deterministic journey re-entered `/app/projects`, observed the completed Run badge and Run summary, then reloaded and observed them again.
- Boundary: operational Runtime/Agent ownership, stale lock PID `55000`, UNKNOWN records, external connectors, external AI/model availability, and AI Broadcast Room remain untouched, unverified, or deferred. The browser locator was scoped to the existing `status-success` badge after confirming the generic 안내문 also contains the word `성공`; no production success semantics were weakened.

## 2026-09-27 latest verification: My World recent project reflects durable Run state

- My World’s recent project card is **A — owner-scoped Runtime projection and browser reconnect verified**. It now reads the first visible project through the existing authenticated `getUserProject()` view and shows the actual Runtime status and bounded Run summary instead of the project’s generic `active` flag.
- Completed, running, waiting, failed, not-started, and unknown states use the existing status vocabulary. If the detail read fails, the card explicitly shows `프로젝트 실행 상태 확인 불가`; it never falls back to a success or active claim. The approved character/world layout and project links remain unchanged.
- Evidence: `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-my-world-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/world checks `17/17`, user-product `203/203`, root `657/657`, TypeScript/UI/root builds, `git diff --check`, and the isolated two-account responsive browser matrix passed; the deterministic project journey verified the completed Run on My World and after reload.
- Boundary: operational Runtime/Agent ownership, stale lock PID `55000`, UNKNOWN records, external connectors, external AI/model availability, and AI Broadcast Room remain untouched, unverified, or deferred.

## 2026-09-27 read-only recheck: local AI Runtime capability boundary

- The local AI boundary remains **B/D — adapter and privacy path verified, live model unavailable**. The loopback-only Ollama adapter, owner-scoped context assembly, independent AI-access permissions, waiting/accepted/completed states, and safe Runtime status projection pass the focused `17/17` AI checks.
- Current host inspection found the Ollama executable at `C:\Users\user\AppData\Local\Programs\Ollama\ollama.exe`, but no Ollama process and no listener on port `11434`. No model-generation request, installation, pull, service start, or external AI call was attempted.
- This is an environment boundary, not a fabricated success: Personal AI and learning AI-dependent actions continue to show truthful waiting/unavailable states until an explicitly enabled local model Runtime exists.

## 2026-09-27 latest verification: owner-scoped evidence provenance navigation

- Portfolio/Activity provenance is **A — owner-scoped source navigation and browser verified**. Project evidence now carries its source project ID only in the authenticated portfolio snapshot; activity evidence links to the authenticated Activity ledger with a focused event query, and project evidence links to the owner-authorized Project Workspace.
- Activity links are rendered as `활동 원장 보기`; project links as `원 프로젝트 보기`. The Activity ledger adds stable event anchors and highlights/scrolls to the requested event. Public portfolio responses deliberately strip `projectId`, so the public page does not disclose private project identifiers or source navigation that is not available to the viewer.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/portfolio-provenance.test.ts`, `tests/user-ui-portfolio-contract.test.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The focused contracts and provenance tests passed; the UI build passed; the isolated browser E2E passed `projectRuntimeExecutionUi`, `activityTimelineUi`, `projectRuntimeGrowthPortfolioUi`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: existing verification/actor attribution remains authoritative. No operational Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider call, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: My World recent activity deep link

- My World recent activity is **A — owner-scoped ActivityEvent deep link and browser verified**. Each displayed event now links to `/activity?event=:id`, while the existing full activity link, source identity, actor attribution, and verification state remain unchanged.
- The Activity ledger consumes the query parameter through the existing event anchor/highlight path, so a user can leave the character-centered home surface and return to the exact durable event without creating a second activity store or claiming completion/XP.
- Evidence: `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-my-world-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The focused My World contract, UI build, and isolated browser E2E passed; the browser result includes the owner Run/activity path, `activityTimelineUi: passed`, two-account isolation, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: no operational Runtime/Agent/browser restart, stale-lock repair, UNKNOWN replay, external AI/provider call, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: social discovery to public profile navigation

- Friends/profile navigation is **A — owner-scoped browser verified**. Search results and the selected direct-message header now link to the existing `/app/profile?userId=:id` read-only public profile route with encoded user IDs; no private profile fields or new social store are introduced.
- Friend request, direct-message, block, and report behavior remains unchanged. The isolated two-account browser path now verifies search → profile → friend request before continuing through messaging and social-safety checks.
- Evidence: `user-ui/src/pages/Friends.tsx`, `user-ui/src/pages/Profile.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-friends-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused Friends contract `2/2`, user-product regression `206/206`, root regression `657/657`, user-UI build, `git diff --check`, and the full isolated browser matrix passed with `isolatedAccounts: 2` and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: no operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider call, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: public-profile privacy projections

- Public profile privacy is **A — owner-controlled bounded projection and browser verified**. The persisted `growthInfo`, `projectList`, and `learningHistory` settings now gate optional public profile summaries sourced from the real Growth, User Project, and Learning services.
- The public projection contains only level/XP/stats/achievement labels, project name/objective/purpose/team mode/status/timestamps, and learning subject/status/timestamps. It excludes internal project and learning IDs, workspace paths, raw answers, and growth evidence IDs; unavailable settings/source reads fail closed.
- Evidence: `src/social/contracts.ts`, `src/social/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Profile.tsx`, `tests/social-public-profile-privacy.test.ts`, `tests/user-ui-profile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused checks `2/2`, user-product `208/208`, root/build checks, and isolated browser E2E passed with `publicProfilePrivacy: passed`, two-account isolation, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: public profile/private visibility, block ACL, friend/community navigation, owner-scoped source records, operational Runtime/Agent, stale lock PID `55000`, UNKNOWN requests, external AI/model availability, external connectors, and AI Broadcast Room remain preserved or deferred as previously recorded.

## 2026-09-27 latest verification: community author to public profile navigation

- Community author navigation is **A — public post integration and browser verified**. Each visible post author links to the existing read-only `/app/profile?userId=:id` route with an encoded user ID; public post content and per-user like state remain unchanged.
- The isolated two-account browser path verifies account B opening account A's public post author profile and returning to the community before the existing like/reload checks. Private profile visibility remains enforced by the existing profile API.
- Evidence: `user-ui/src/pages/Community.tsx`, `user-ui/src/pages/Profile.tsx`, `tests/user-ui-community-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused Community/Friends contracts `3/3`, user-product regression `207/207`, root regression `657/657`, root/UI builds, `git diff --check`, and the full isolated browser matrix passed with `isolatedAccounts: 2` and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: no operational Runtime/Agent/browser restart or request, stale-lock repair, UNKNOWN replay, external AI/provider call, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: public profile to public portfolio navigation

- Public profile portfolio integration is **A — ACL-bounded projection and two-account browser verified**. The Social service reuses `PortfolioService.listPublicEntries()` and exposes only `id`, `title`, `summary`, and `updatedAt` for entries whose visibility is `public`; `unlisted` and `private` entries remain absent from profile listings.
- `user-ui/src/pages/Profile.tsx` links each projected item to the existing `/app/portfolio/public/:id` route. Internal `userId`, `projectId`, and `evidenceIds` are omitted, while the existing public portfolio route remains the authority for the shareable entry view. The projection remains available even if optional Settings service access is unavailable; growth/project/learning privacy summaries still fail closed independently.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `src/social/contracts.ts`, `src/social/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Profile.tsx`, `tests/social-public-profile-portfolio.test.ts`, `tests/user-ui-profile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused checks `3/3`, user-product `210/210`, root regression `657/657`, TypeScript/UI builds, and isolated browser E2E passed with `publicProfilePortfolio: passed`, `isolatedAccounts: "2"`, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: public/unlisted/private portfolio ACL, owner-scoped provenance, operational Runtime/Agent, stale lock PID `55000`, UNKNOWN requests, external AI/model availability, external connectors, and AI Broadcast Room remain preserved or deferred. The first browser attempt exposed only an exact accessible-name locator defect; the corrected verification passed without changing production semantics.

## 2026-09-27 latest verification: isolated local Desktop Agent project execution

- Project Workspace execution is **A — local browser → isolated Core → isolated Desktop Agent verified** for the bounded local path. The user UI creates a project and Task, submits an approved Run, and the isolated Agent performs CONTEXT, TEST, BUILD, and COMMIT in a temporary owned workspace. The browser then observes durable Task → Run → lifecycle → ActivityEvent → Growth → Portfolio projections after reload.
- Empty/unborn Git repositories now support a first COMMIT with a command-scoped fallback identity only when the workspace has no local Git identity; configured local identity remains authoritative. A build-gated Desktop task now emits separate TEST and BUILD operations and records both evidence kinds instead of treating one combined job as duplicate TEST evidence.
- Web/provider-owned stages in this journey use an explicitly labelled `isolated-local-provider` executor. The path makes no external AI/provider request and does not claim live ChatGPT Web, Ollama, deployment, or production verification.
- Evidence: `scripts/iseol-user-ui-isolated-server.ts`, `scripts/iseol-user-ui-e2e.ts`, `src/runtime/project-workspace-desktop-compiler.ts`, `src/runtime/project-workspace-executor.ts`, `src/desktop-agent/runtime.ts`, `src/desktop-agent/desktop-executor.ts`, `tests/user-project-runtime-integration.test.ts`, `tests/harness-build-evidence.test.ts`, `tests/desktop-agent-runtime.test.ts`, and `tests/user-ui-project-runtime-browser-contract.test.ts`. User-product regression `211/211`, root regression `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and the full isolated browser matrix all passed; browser output included `projectRuntimeLocalAgentUi: passed`, `projectRuntimeExecutionUi: passed`, `projectRuntimeGrowthPortfolioUi: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Operational boundary: Runtime PID `1708` and Desktop Agent PID `22416` remained alive with the configured dataRoot `C:\Users\user\Documents\discord-project-automation-bot-v3\data\dogfood-01-20260919`; the stale lock entry for PID `55000` was not repaired or replayed. No UNKNOWN request was resent, no external AI/model call or Ollama start was made, no operational Runtime/Agent/browser restart, data deletion, push, deployment, approved design change, or AI Broadcast Room implementation occurred.

## 2026-09-27 latest verification: configured Runtime execution approval checkpoint

- The Project Workspace approval boundary is **A — configured Runtime browser verified**. With the owner setting `aiApproval.buildRun=true`, the user UI shows an explicit approval checkpoint; before approval the Work Request remains `queued`, no Run ID is created, and the Runtime remains `not-started`. Cancelling the checkpoint leaves that durable state unchanged.
- Only after the owner selects `승인하고 실행` does the existing deterministic isolated Runtime accept the request and persist the completed Run. This verification does not grant AI autonomy: the approval remains user-scoped, the existing Runtime/Agent path remains authoritative, and no production or external provider request is involved.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-approval-contract.test.ts`, `user-ui/src/pages/Projects.tsx`, `src/project-model/user-project-service.ts`, and the existing approval API tests. The new browser journey reported `projectRuntimeApprovalUi: passed`; user-product regression `212/212`, root regression `661/661`, and the full responsive two-account browser matrix passed.
- Boundary: this is isolated deterministic Runtime evidence only. Operational Runtime ownership, stale lock metadata, live local model quality, external connectors, UNKNOWN requests, deployment, push, approved design changes, and AI Broadcast Room remain preserved or unverified/deferred.

## 2026-09-27 latest verification: AI team proposal to approved Runtime execution

- AI team execution control is **A — proposal → Work Request → explicit owner approval → isolated Runtime Run verified**. A deterministic local AI Team Runtime produces a bounded proposal; human acceptance creates the durable Work Request, but it remains `queued` with no Run while the approval dialog is open or cancelled. Only `승인하고 실행` dispatches the existing owner-scoped Project Runtime.
- The browser journey verifies the accepted proposal's `workRequestId`, the pre-dispatch `queued/not-started` state, approval cancellation, completed Work Request → Run identity, task node attachment, verified `project.run.completed` ActivityEvent, and reload persistence. AI proposal generation and execution remain separate capabilities; no autonomous execution is implied.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-project-approval-contract.test.ts`, `src/ai-team/service.ts`, `user-ui/src/pages/Projects.tsx`, and `src/project-model/user-project-service.ts`. The new contract passed `3/3`; user-product `213/213`; root `661/661`; TypeScript/UI builds and `git diff --check` passed; full isolated browser E2E passed with `aiTeamProposalExecutionApprovalUi: passed`, `aiTeamProposalRuntimeUi: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- The E2E runner also supports focused local-only diagnostics for this AI execution path and the existing learning-project path; both passed independently. These modes use temporary isolated servers and never reuse the operational Runtime/Agent or browser profile.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, stale lock PID `55000`, UNKNOWN records, Ollama/model availability, external providers/connectors, deployment, push, approved design, and AI Broadcast Room remain untouched or deferred.

## 2026-09-27 latest verification: in-progress project team transition

- Project team transition is **A — browser UI, ACL, durable workspace, and activity evidence verified**. The existing owner-controlled Project Workspace UI now has a browser journey covering `solo → human → mixed → ai → solo` without creating a replacement team/project store.
- The journey creates a private team and queued Work Request, adds a second browser account through the durable recruitment/membership path, then verifies that human/mixed modes grant the member project access while AI/solo modes remove it from the project list and return an owner-scoped 404 on the detail API and UI. The Work Request, workspace task node, owner access, and four unique verified `project.team.changed` ActivityEvents survive every transition and reload.
- Evidence: `user-ui/src/pages/Projects.tsx`, `user-ui/src/api/userApi.ts`, `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `tests/user-project-team-transition.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused browser journey and contract passed; user-product `214/214`, root `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, `git diff --check`, and the full isolated browser matrix passed with `projectTeamTransitionUi: passed`, two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- The browser runner now also asserts the actual team PATCH and Runtime execution POST responses and gives the isolated local Agent journey a bounded 30-second completion window. These are verification-boundary improvements; production authorization and Runtime semantics were not loosened.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model availability, external providers/connectors, deployment, push, approved design, and AI Broadcast Room remain untouched or deferred.

## 2026-09-27 latest verification: project-bound character and AI companion assets

- Character presentation assets are **B — real project-bound PNG assets integrated and browser verified, while final approved art source remains unavailable**. The supplied redesign ZIP contains the UI implementation brief and code/configuration but no reusable character/background image files. Two original transparent-alpha PNG assets were therefore generated for the current implementation: the user character and the distinct non-human AI companion.
- The assets live at `user-ui/public/assets/characters/iseol-user-character-v1.png` and `user-ui/public/assets/characters/iseol-ai-companion-v1.png`, are exposed through `user-ui/src/components/CharacterAssets.tsx`, and use the UI server's `/app` mount path. User/world, onboarding, auth, navigation, AI chat, and AI message avatars now use the real files; load failure renders an accessible bounded fallback instead of an invented image.
- Evidence: `user-ui/src/components/CharacterAssets.tsx`, the two PNG files, `user-ui/src/pages/MyWorld.tsx`, `user-ui/src/pages/AIChat.tsx`, `user-ui/src/pages/Onboarding.tsx`, `user-ui/src/pages/Auth.tsx`, `user-ui/src/pages/Landing.tsx`, `user-ui/src/components/Navigation.tsx`, `tests/user-ui-character-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The focused character contract and browser asset journey passed; user-product passed `214/214`, root regression passed `661/661`, TypeScript/UI builds passed, `git diff --check` passed before documentation, and the full isolated browser matrix passed with `characterAssetsUi: passed`, two accounts, reload/persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Remaining design boundary: the ZIP does not provide final approved character variants, world/workshop/project/learning/team/community backgrounds, or icon/art direction source files. Existing inline SVG backgrounds, emoji navigation labels, and the customization preview remain preserved and are not being declared as final approved image assets. Replace the v1 project-bound files only when an approved source package is available.
- Safety boundary: operational Runtime/Agent PID `1708`/`22416`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors, deployment, push, and AI Broadcast Room were not changed; no external AI/provider request was made.

## 2026-09-27 latest verification: explicit My World mission completion records

- My World mission completion is **A — owner-scoped durable user-action record and browser verified**, with an explicit non-evidence boundary. The three existing mission cards now let the authenticated owner record that they completed the action; this is persisted as `world.mission.completed` in the existing ActivityEvent store with `actorType: user` and `verificationStatus: unverified`.
- The mission read model keeps this action state separate from durable project/learning/review evidence. Reload restores the action label, while the UI explicitly says `검증/XP 제외`; the existing Growth ledger therefore does not treat this self-report as verified activity or award XP. Retracted or other-user events do not count, and account B cannot read or mutate account A's mission record.
- Evidence: `src/activity/contracts.ts`, `src/activity/service.ts`, `user-ui/src/domain/worldState.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-world-state-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused world-state contracts passed `4/4`; focused `worldMissionCompletionUi` passed; user-product passed `215/215`; root regression passed `661/661`; TypeScript/UI builds passed; the full isolated browser matrix passed with `worldMissionCompletionUi: passed`, two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- The first full browser attempt exposed an intermittent existing learning plan-preview `400`; the response-body diagnostic was retained in the isolated runner, and the immediate rerun passed all journeys without changing production semantics. `git diff --check` passed after the final documentation update.
- Boundary: this does not mark a learning/project/review mission as verified evidence and does not change Growth/XP rules. Operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors, deployment, push, approved design source uncertainty, and deferred AI Broadcast Room remain untouched.

## 2026-09-27 latest verification: semantic data-state icons

- Shared data-state UI is **A — semantic icon contract and browser verified**. `user-ui/src/components/Icon.tsx` now covers status, mission, stat, member-count, locked-achievement, and AI-avatar expressions used by the shared UI; `UI.tsx`, `domain/worldState.ts`, and `MyWorld.tsx` no longer use the old Unicode symbols for those state expressions. Labels, routes, accessibility text, permissions, evidence boundaries, and mission semantics are unchanged.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/components/UI.tsx`, `user-ui/src/domain/worldState.ts`, `user-ui/src/pages/MyWorld.tsx`, and `tests/user-ui-state-icon-contract.test.ts`. The RED contract first failed because the semantic names were missing; after implementation the focused icon/navigation/responsive checks passed `3/3`, user-product passed `217/217`, root passed `661/661`, both builds passed, and the full isolated browser E2E passed with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- This unit intentionally covers shared data-state expressions only. Remaining page-level emoji labels and missing final approved character/background/art source assets remain a separate design-audit task; the current implementation does not declare the attached ZIP's missing approval originals complete.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and AI Broadcast Room deferral remain untouched. No external AI/provider request or process restart occurred.

## 2026-09-27 latest verification: collaboration Teams and Community semantic icons

- Teams and Community presentation controls are **A — semantic icon contract and full browser verified**. `user-ui/src/pages/Teams.tsx` and `user-ui/src/pages/Community.tsx` now use the shared inline SVG `Icon` for collaboration headers, write/create controls, empty-state guidance, project/study badges, curriculum markers, and Community reactions. The existing routes, copy, durable data, membership ACLs, recruitment/chat/study behavior, and per-user like semantics are unchanged.
- The Community reaction button now exposes `좋아요 N` when the viewer has not liked a post and `좋아요 취소 N` after the viewer likes it. This keeps the control accessible after replacing the Unicode heart with an SVG and prevents the browser journey from depending on presentation glyphs.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/Teams.tsx`, `user-ui/src/pages/Community.tsx`, `tests/user-ui-collaboration-icon-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The RED→GREEN collaboration contract passed `1/1`; combined icon/navigation/operational/state/responsive focus passed `5/5`; user-product passed `217/217`; root passed `661/661`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and full isolated browser E2E passed with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, `responsiveRoutes: 13`, `publicCommunityLikePersistence: passed`, and `teamChatMembership: passed`.
- The first browser attempt failed only because the E2E locator still expected the old `❤️ 1` accessible name. Systematic debugging traced the failure to the product control lacking an explicit semantic label; the minimal label-and-selector fix passed on rerun without restoring emoji or changing collaboration semantics.
- Boundary: this is an icon/accessibility unit, not final approval of missing character/background/art source files. Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request or process restart occurred.

## 2026-09-27 latest verification: operational Settings and Personal AI icons

- Settings and Personal AI status expressions are **A — semantic icon contract and browser verified**. The Settings integration list now uses typed semantic icons for local Runtime, Personal AI, GitHub, ChatGPT Web, Discord, Notion, and Vercel; the Personal AI screen uses semantic icons for the companion, private-memory scope, user-only conversation scope, and truthful Runtime readiness state.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/Settings.tsx`, `user-ui/src/pages/AIChat.tsx`, and `tests/user-ui-operational-icon-contract.test.ts`. The RED contract first failed on missing `IconName` entries; after implementation the focused contract passed `1/1`, user-product passed `217/217`, root passed `661/661`, both builds passed, and the full isolated browser E2E passed with `privateAiChatPersistenceIsolation: passed`, `settingsPermissionPersistenceIsolation: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- This unit changes presentation only. It does not claim that GitHub, ChatGPT Web, Discord, Notion, or Vercel are connected; existing unavailable/coming labels and Runtime capability truthfulness remain unchanged. Character accessory emojis and other page-level symbols remain tracked for later bounded units.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and AI Broadcast Room deferral remain untouched. No external AI/provider request or process restart occurred.

## 2026-09-27 latest verification: achievement notification destination

- Achievement notification navigation is **A — owner-scoped browser verified**. The existing durable achievement notification now routes to `/app/character`, where the character growth and evidence-backed achievement view is available, instead of falling through to the generic My World route. Team, direct-message, AI-completion, and unknown notification fallbacks remain unchanged.
- The notification is still marked read through the existing authenticated read endpoint before navigation. Account B receives neither account A's achievement nor its growth record; deleting the source verified ActivityEvent still removes the achievement after the existing growth projection is recalculated.
- Evidence: `user-ui/src/components/Navigation.tsx`, `tests/user-ui-notifications-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The focused notification contract passed; focused `growthNotifications: passed`; user-product passed `215/215`; root regression passed `661/661`; `npm.cmd run build`, `npm.cmd run user-ui:build`, and `git diff --check` passed; full isolated browser E2E passed `achievementNotifications: passed` with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: this only fixes destination wiring and does not create or infer achievements. Operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors, deployment, push, approved design uncertainty, and deferred AI Broadcast Room remain untouched.

## 2026-09-27 latest verification: idempotent My World mission re-recording

- My World mission re-recording is **A — date-scoped owner action is retry-safe and browser verified**. Repeating the same mission action on the same occurrence date now reuses the ActivityEvent semantic identity instead of creating a conflicting duplicate. The record remains `actorType: user`, `verificationStatus: unverified`, and outside Growth/XP and verified portfolio evidence.
- `recordWorldMissionCompletion()` sends a stable midnight UTC `occurredAt` derived from the occurrence date. This preserves the existing ActivityEvent identity boundary and makes repeated clicks/retries after reload safe; it does not change the separate verified-evidence rules or cross-user isolation.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `user-ui/src/domain/worldState.ts`, `tests/user-ui-world-state-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The RED check reproduced the prior second-click identity conflict; after the fix, the focused world-state contract passed `4/4`, focused `worldMissionCompletionUi: passed`, user-product passed `215/215`, root regression passed `661/661`, both builds passed, and the full isolated browser matrix passed with `worldMissionCompletionUi: passed`, two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: no operational Runtime/Agent or browser profile was restarted, no stale lock or UNKNOWN request was changed/replayed, no external AI/provider call or Ollama start was made, and no external connector, deployment, push, approved design source, or deferred AI Broadcast Room state was changed.

## 2026-09-27 latest verification: shared semantic navigation icons and durable mutation contention hardening

- Common user navigation is **A — semantic icon component and browser verified**. `user-ui/src/components/Icon.tsx` now provides the shared inline SVG `Icon`/`IconName` boundary, and `user-ui/src/components/Navigation.tsx` uses it for primary navigation, notification, integration navigation, mobile menu, and close controls. Existing accessible names, routes, responsive behavior, and notification semantics are unchanged. This is a shared UI icon implementation, not approval of missing final character/background artwork.
- Learning durable writes are **A — bounded Windows rename retry and browser verified**. `src/learning/store.ts` now uses the existing `renameWithTransientRetry()` boundary, preserving temporary-file atomic replacement, owner-scoped paths, JSON format, and restart behavior. The earlier parallel browser run exposed a real `EPERM` plan-preview rename failure; the focused retry test and later isolated browser run passed without replaying any external request.
- Settings permission persistence is **A — user-scoped concurrent update serialization and browser verified**. `src/settings/service.ts` serializes read-modify-write patches per user, so rapid independent AI-access toggles cannot overwrite one another. The RED regression reproduced the lost-update/rename contention, and the GREEN test preserves all four changes and account B defaults.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/components/Navigation.tsx`, `tests/user-ui-navigation-icon-contract.test.ts`, `tests/user-ui-responsive-contract.test.ts`, `src/learning/store.ts`, `src/desktop-agent/atomic-file.ts`, `tests/learning-persistence.test.ts`, `tests/desktop-agent-atomic-file.test.ts`, `src/settings/service.ts`, `tests/settings-isolation.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused icon/persistence/settings checks `9/9`, user-product regression `217/217`, root regression `661/661`, `npm.cmd run build`, `npm.cmd run user-ui:build`, and the full isolated browser E2E passed. Browser output included `settingsPermissionPersistenceIsolation: passed`, `worldMissionCompletionUi: passed`, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, approved-design source uncertainty, deployment/push state, and AI Broadcast Room deferral remain untouched. No external AI/provider request or Runtime/Agent/browser restart occurred.

## 2026-09-27 latest verification: semantic icons for core user content surfaces

- Core user content surfaces are **A — semantic icon contract and full browser verified**. `MyWorld.tsx` now types its zone metadata with `IconName` and renders semantic icons for zone navigation, Runtime speech state, quick actions, today’s learning, and achievement markers. `Friends.tsx`, `IdeaLab.tsx`, `PortfolioScreen.tsx`, and `MemoryVault.tsx` now use the shared `Icon` for their generic conversation, idea, activity/portfolio, action, and private-scope symbols.
- This unit is presentation-only. Existing user-scoped API calls, private memory boundary, social block/report and messaging ACLs, project creation approval boundary, portfolio export/share behavior, Runtime waiting copy, and character asset/accessory behavior are unchanged. Missing final approved character/background art remains unclaimed.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/MyWorld.tsx`, `user-ui/src/pages/Friends.tsx`, `user-ui/src/pages/IdeaLab.tsx`, `user-ui/src/pages/PortfolioScreen.tsx`, `user-ui/src/pages/MemoryVault.tsx`, and `tests/user-ui-content-icon-contract.test.ts`. The new RED→GREEN content contract passed `1/1`; combined icon/navigation/operational/state/responsive focus passed `6/6`; user-product passed `217/217`; root passed `661/661`; both builds passed; and full isolated browser E2E passed every journey with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, approved-design source uncertainty, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 latest verification: provisional personal-world environment asset

- The My World environment is **B — original provisional raster asset integrated and full browser verified; final approved art remains unavailable**. `user-ui/public/assets/environments/iseol-personal-workshop-v1-provisional.png` is rendered by `user-ui/src/components/EnvironmentAssets.tsx` in the existing `MyWorld` header, above the preserved SVG fallback. It is a real project-local image, not a CSS/emoji substitute, but it is explicitly not the final approved ZIP art source.
- The environment layer is visual-only: the image and its accessible failure fallback use `pointer-events-none`, and a failed image exposes `개인 작업실 환경 — 개인 작업실 환경 자산 대기` without blocking the character, activity, or navigation interactions beneath it. User character/AI companion assets, world data, routes, owner scope, and Runtime truthfulness are unchanged.
- Evidence: `user-ui/public/assets/environments/iseol-personal-workshop-v1-provisional.png`, `user-ui/src/components/EnvironmentAssets.tsx`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-ui-world-environment-asset-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Final focused environment/character contracts passed `3/3`; the character-assets browser focus passed `personalWorldEnvironmentAssetUi: passed` for load and fallback; user-product passed `224/224`; root passed `662/662`; both builds passed; and the final full isolated browser matrix passed with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Debug evidence: the first full browser attempt found the image intercepted the existing `활동 상세 보기` link; the contract then pinned `pointer-events-none`, and the post-fix full matrix passed. No production Runtime or durable operational data was involved.
- Boundary: final approved character/background/environment art source files are still unavailable in the supplied ZIP. Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 latest verification: semantic entry-state confirmation icons

- Active Auth, Landing, and Onboarding confirmation states are **A — semantic icon contract and full browser verified**. The shared `Icon name="check"` now replaces generic checkmark glyphs in account creation, candidate approval, onboarding progress, character selection, and activity selection states. Local auth, copy, accessible semantics, routes, onboarding persistence, and actual character/AI visual assets are unchanged.
- This unit deliberately preserves character accessories and room-item cosmetics as visual assets. It does not claim final approval for the missing character/background/environment art source and does not change the deferred AI Broadcast Room boundary.
- Evidence: `user-ui/src/pages/Auth.tsx`, `user-ui/src/pages/Landing.tsx`, `user-ui/src/pages/Onboarding.tsx`, `tests/user-ui-entry-state-icon-contract.test.ts`, `tests/user-ui-entry-icon-contract.test.ts`, `package.json`, and `scripts/iseol-user-ui-e2e.ts`. Focused entry-state/entry-icon contracts passed `2/2`; user-product passed `223/223`; root passed `662/662`; both builds passed; `git diff --check` passed; and full isolated browser E2E passed with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 latest verification: public Profile growth semantic icons

- The public Profile growth presentation is **A — semantic icon contract and full browser verified**. `user-ui/src/pages/Profile.tsx` now reuses the shared `Icon` for development, learning, collaboration, consistency, and achievement expressions. The display-name initial, authored profile fields, public/read-only distinction, and accessible labels remain unchanged.
- This is presentation-only: owner-scoped profile editing, privacy-gated growth/projects/learning/portfolio projections, evidence-backed achievement data, routes, persistence, and cross-account isolation were not changed. No new growth, XP, achievement, or portfolio record is created by the icon update.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/Profile.tsx`, `tests/user-ui-profile-icon-contract.test.ts`, `tests/user-ui-profile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. The RED→GREEN Profile contract first failed because the page lacked the shared icon import; focused Profile/Character/state/navigation/responsive checks passed `6/6`; user-product passed `219/219`; root passed `662/662`; both builds passed; and full isolated browser E2E passed with two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: final approved character/background/art source files are still unavailable in the supplied ZIP, operational Runtime/Agent PID `1708`/`22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN requests, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request or process restart occurred.

## 2026-09-27 latest verification: truthful weekly digest availability

- Weekly activity digest is **D — intentionally unavailable in the UI**. The existing owner-scoped `notifications.weekly` setting and authenticated API remain durable and backward-compatible, but `user-ui/src/pages/Settings.tsx` now marks the row `준비 중` and disables its switch because no approved producer, aggregation, or scheduling specification exists.
- Other notification controls and producers remain unchanged: AI completion, team invite, direct message, and achievement notifications retain their existing switch behavior, storage, routing, and user isolation. This unit does not fabricate a weekly digest or silently discard an existing preference.
- Evidence: `user-ui/src/pages/Settings.tsx`, `tests/user-ui-notification-availability-contract.test.ts`, `package.json`, and `scripts/iseol-user-ui-e2e.ts`. The focused contract/settings checks passed `3/3`; user-product passed `220/220`; root passed `662/662`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; and focused/full isolated browser E2E passed with two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: no operational Runtime/Agent/browser restart, dataRoot or stale lock change, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, approved-design source assumption, or AI Broadcast Room change occurred.

## 2026-09-27 latest verification: semantic portfolio verification icons and resilient learning-runtime browser wait

- Active portfolio verification markers are **A — semantic icon contract and full browser verified**. `user-ui/src/pages/PortfolioScreen.tsx` and `user-ui/src/pages/PublicPortfolio.tsx` now use the shared `Icon name="check"` for verified evidence instead of generic checkmark glyphs. Portfolio evidence text, actor attribution, owner-scoped provenance links, visibility controls, public route behavior, and export/share semantics are unchanged.
- The isolated learning-to-project Runtime browser journey is **A — full browser verified with a resilient harness wait**. `scripts/iseol-user-ui-e2e.ts` now uses the named `LEARNING_PROJECT_RUNTIME_TIMEOUT_MS = 30_000` condition window for completion polling. This only accommodates cumulative local test load; it does not change production Work Request/Run or Runtime behavior.
- Evidence: `user-ui/src/pages/PortfolioScreen.tsx`, `user-ui/src/pages/PublicPortfolio.tsx`, `tests/user-ui-portfolio-icon-contract.test.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused portfolio contracts passed `4/4`; the runtime-browser contract passed `1/1`; user-product passed `221/221`; root passed `662/662`; both builds and diff validation passed; focused browser verification passed; and the full isolated browser matrix passed with two accounts, reload persistence, `learningProjectRuntimeIntegrationUi: passed`, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Debug evidence: one pre-fix full browser run reproduced a false negative with the Work Request still `queued`/Runtime `not-started` at the old 12-second boundary; the focused journey passed, and the post-fix full browser run passed. No production Runtime or durable operational data was involved.
- Boundary: no operational Runtime/Agent/browser restart, dataRoot or stale lock change, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, approved-design source assumption, or AI Broadcast Room change occurred.

## 2026-09-27 latest verification: Character growth semantic icons

- The Character growth surface is **A — semantic icon contract and full browser verified**. `user-ui/src/pages/Character.tsx` now uses the shared `Icon` for development, learning, collaboration, consistency, customize, achievement, and locked-cosmetic expressions; `user-ui/src/components/Icon.tsx` adds the bounded `trophy` shape. Growth values, XP, evidence-backed achievements, routes, persistence, and owner scope are unchanged.
- Character/accessory fidelity is preserved deliberately: the existing project-bound user asset and the accessory/room-item emoji tokens remain the visual representation of cosmetics. Only generic controls and state marks were changed.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/Character.tsx`, `tests/user-ui-character-icon-contract.test.ts`, `tests/user-ui-character-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused Character/state/navigation/responsive checks passed `5/5`; user-product passed `218/218`; root passed `662/662`; both builds passed; and full isolated browser E2E passed all journeys with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, approved-design source uncertainty, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 latest verification: entry surfaces and durable Work Request persistence

- Auth, Landing, Onboarding, and NotFound entry surfaces are **A — semantic icon contract and full browser verified**. `user-ui/src/components/Icon.tsx` now provides the bounded `eye`, `eyeOff`, and `mail` shapes required by the auth flow; the four entry pages use semantic icons for local account, provider status, verification, onboarding progress, feature/action, and return-home expressions. Character assets, local auth/API behavior, disabled external-provider truthfulness, onboarding persistence, and routes are unchanged.
- The isolated world-mission journey now locates the durable mission action by `data-mission-id` rather than dynamic copy. This preserves mission identity across the read/refresh boundary and keeps the existing unverified self-report/no-XP semantics.
- Project Work Request persistence is **A — Windows transient-rename contention hardened and full browser verified**. `src/project-model/work-request.ts` serializes writes per request path, uses the existing `renameWithTransientRetry()` helper, and removes a temporary file after a final failed replacement. Request identity, owner scope, status transitions, and Runtime/Agent boundaries remain unchanged.
- Evidence: `user-ui/src/components/Icon.tsx`, `user-ui/src/pages/Auth.tsx`, `user-ui/src/pages/Landing.tsx`, `user-ui/src/pages/Onboarding.tsx`, `user-ui/src/pages/NotFound.tsx`, `tests/user-ui-entry-icon-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-ui-world-state-contract.test.ts`, `src/project-model/work-request.ts`, `tests/project-model-stores.test.ts`, and `tests/user-ui-world-state-contract.test.ts`. Entry contract passed `1/1`; combined focus passed `16/16`; user-product passed `217/217`; root passed `662/662`; both builds passed; and full isolated browser E2E passed all journeys with two accounts, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- The first full browser attempt exposed a dynamic mission-label selector and an intermittent Work Request durability race. The failed artifact showed the durable request still `queued` while a transient file contained `running` and the linked Run was already `DONE`; the per-path write queue plus transient rename retry fixed that boundary. Focused AI proposal execution passed three consecutive runs after the fix.
- Boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, approved-design source uncertainty, deployment/push state, and deferred AI Broadcast Room remain untouched. No external AI/provider request, Runtime/Agent/browser restart, data deletion, UNKNOWN replay, or deployment occurred.
## 2026-09-27 latest verification: mobile Project Workspace navigation

- Project Workspace mobile navigation is **A — implemented and browser verified**. `user-ui/src/pages/Projects.tsx` exposes `개요`, `작업`, `AI 협업`, and `실행·증거` through a mobile-only semantic tablist. Desktop retains the existing all-sections workspace; mobile switches the visible surface without changing the underlying project/API/approval/Runtime flows.
- Project structure is rendered under 작업, AI proposal/discussion panels under AI 협업, and lifecycle/history/Runtime/verified evidence under 실행·증거. Solo projects explicitly report that AI collaboration is unavailable. No fake AI completion or execution state is introduced.
- Evidence: `user-ui/src/pages/Projects.tsx`, `tests/user-ui-project-workspace-mobile-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused mobile contract passed `1/1`; combined related contracts passed `5/5`; user-product passed `225/225`; root passed `662/662`; both builds passed; focused mobile browser verification passed; and full isolated browser E2E passed with `projectWorkspaceMobileTabsUi: passed`, two accounts, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: final approved character/background/environment art sources remain unavailable in the supplied ZIP; the provisional environment asset remains explicitly provisional. Operational Runtime/Agent, dataRoot, stale lock, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and deferred AI Broadcast Room artifacts remain untouched. No external AI/provider request or process restart occurred.
## 2026-09-27 latest verification: personal-space navigation truthfulness

- Desktop sidebar `개인 공간` navigation is **A — fixed and browser verified**. `user-ui/src/components/Navigation.tsx` now uses a real accessible link to `/world` instead of a non-functional button; the personal/team space visual boundary and all existing routes remain intact.
- Evidence: `user-ui/src/components/Navigation.tsx`, `tests/user-ui-navigation-personal-space-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. The RED→GREEN navigation contract passed `1/1`; user-product passed `226/226`; root passed `662/662`; both builds passed; `git diff --check` passed with existing line-ending warnings; focused browser verification passed; and full isolated browser E2E passed with `personalSpaceNavigationUi: passed`, two-account isolation, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Boundary: the first focused browser run used the pre-change static bundle and failed only because the UI build was stale; rebuilding the user UI resolved it. Operational Runtime PID `1708`, Agent PID `22416`, ports `18890`/`18891`, dataRoot, stale lock, UNKNOWN records, external providers, deployment/push state, approved-design source uncertainty, and deferred AI Broadcast Room artifacts remain untouched.

## 2026-09-27 latest verification: owner-scoped Personal AI project context

- Personal AI project context is **A — owner/team ACL, durable message selection, permission-aware UI, bounded local Runtime context, and full browser verified**. `user-ui/src/pages/AIChat.tsx` exposes `AI 대화 프로젝트 연결` using authenticated `listUserProjects()` data and the authenticated `aiAccess.projectFiles` setting. `src/ai-chat/service.ts` validates the selected project against the principal's visible projects and permission, persists `projectId` only on the user message, and sends bounded project metadata without file contents or execution rights.
- UI state is truthful: the selection is restored from the latest user message after reload, and the selected message reports `프로젝트 맥락 연결됨`; no selection preserves the existing bounded private context behavior. A foreign project id is rejected before a message is appended.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-project-context.test.ts`, `tests/user-ui-ai-chat-contract.test.ts`, `tests/user-ui-ai-chat-project-context-contract.test.ts`, `tests/user-ui-ai-chat-runtime-browser-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused contracts passed; user-product passed `232/232`; both builds passed; and full isolated browser E2E passed two-account persistence/isolation, permission-off selector behavior, plus `responsiveViewports: [390, 768, 1024, 1440]` and `responsiveRoutes: 13`.
- Remaining scope: file attachment, editable context, execution-plan generation/approval, and AI Broadcast Room are not claimed as implemented. The final approved art source remains unavailable as previously tracked.
- Safety boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and prior durable records remain untouched. No external AI/provider request, process restart, data deletion, UNKNOWN replay, or deployment occurred.

## 2026-09-27 latest verification: public profile and social character asset fidelity

- Public profile/social identity visuals are **A — shared project character asset integrated and browser verified; final approved per-user variants remain unavailable**. `user-ui/src/pages/Profile.tsx` no longer presents a display-name initial color circle; it uses `UserCharacterAsset`. `user-ui/src/pages/Friends.tsx` uses the same asset in search results, friend list, and the selected message header.
- Evidence: `user-ui/src/pages/Profile.tsx`, `user-ui/src/pages/Friends.tsx`, `user-ui/src/components/CharacterAssets.tsx`, `tests/user-ui-profile-character-asset-contract.test.ts`, `tests/user-ui-profile-icon-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. The new RED→GREEN contract passed; related Profile/Friends contracts passed `5/5`; user-product passed `227/227`; root passed `662/662`; both builds passed; and full isolated browser E2E verified the public profile `<img>` uses `/app/assets/characters/iseol-user-character-v1.png` while retaining two-account privacy, reload, and responsive checks.
- Data/ACL boundary: no public avatar field or character appearance projection was added. The existing social API continues to expose bounded profile/growth/project/learning/portfolio projections only, and the character image is presentation-only with explicit failure fallback.
- Remaining design gap: the attached ZIP contains no final approved per-user profile/character image variants. The v1 asset is a real project-bound implementation asset, but it is not claimed as final art approval or a unique per-user visual. AI Broadcast Room remains deferred.
- Safety boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, browser profile, and prior durable records remain untouched.

## 2026-09-27 latest verification: truthful AI Chat conversation export

- AI Chat conversation export is **A — local Markdown download implemented and full browser verified**. `user-ui/src/pages/AIChat.tsx` exposes `대화 내보내기` only when the selected owner-scoped conversation has persisted messages and no competing operation is busy. It creates a browser-local Blob and stable `iseol-ai-conversation-<id>.md` filename; no Runtime or external upload is involved.
- Evidence: `user-ui/src/pages/AIChat.tsx`, `tests/user-ui-ai-chat-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused AI Chat contracts passed `2/2`; user-product passed `227/227`; root build passed; user UI build passed; and full isolated browser E2E verified the download event/filename alongside two-account privacy, reload persistence, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Truthfulness boundary: file attachment, explicit project linking, execution-plan approval/rejection, and editable context remain unavailable because their durable request/schema/ACL contracts are not present. They are not presented as active no-op controls. AI Broadcast Room remains deferred.
- Safety boundary: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and prior durable records remain untouched.

## 2026-09-27 latest verification: server-revoked logout and reconnect-safe relogin

- Authentication logout is **A — server session revocation, stale-request protection, and full browser verified**. `POST /api/user/logout` revokes only the authenticated platform session; the old bearer token is rejected by `/api/user/me` after logout.
- Settings logout always clears browser storage and navigates to login. The API client only clears a session after `401` when the failed token is still current, and successful login resets the user store to `loading` before the protected shell mounts. This prevents a late pre-logout request or stale unauthenticated store state from invalidating a new login.
- Evidence: `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/store/userStore.ts`, `user-ui/src/pages/Settings.tsx`, `user-ui/src/pages/Auth.tsx`, `tests/platform-user-auth.test.ts`, `tests/user-ui-auth-boundary-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused auth contracts passed `4/4`; product regression passed `236/236`; root regression passed `662/662`; both builds passed; focused logout/relogin passed; and full isolated browser E2E passed `logoutServerRevocationAndRelogin: passed`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining gaps are unchanged: final approved art sources remain unavailable, live Ollama/AI generation is unverified, external connectors are unavailable/unconfigured, and AI Broadcast Room remains deferred. No file attachment/editable AI context/execution-plan schema was invented.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and prior durable records remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider call, deployment, or push occurred.

## 2026-09-27 latest verification: My World AI approval visibility

- My World AI approval visibility is **A — durable read-model join and full browser verified**. `user-ui/src/pages/MyWorld.tsx` reads the existing AI Team proposal list for the current AI/mixed project and joins accepted proposals to queued or waiting Work Requests through `workRequestId`. It does not create, mutate, or dispatch work.
- The character-centered overview now exposes `사용자 확인이 필요한 AI 작업`, with `실행 확인 대기` or `재개 확인 대기` based on the actual persisted Work Request status. The card links to the existing Project Workspace checkpoint; the empty state explicitly states that no AI work is awaiting confirmation.
- Evidence: `user-ui/src/pages/MyWorld.tsx`, `user-ui/src/api/userApi.ts`, `tests/user-ui-world-ai-approval-contract.test.ts`, `tests/user-ui-my-world-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `package.json`. Focused contracts passed `3/3`; user-product passed `228/228`; root and UI builds passed; diff validation passed with existing line-ending warnings; and full isolated browser E2E passed `aiTeamProposalExecutionApprovalUi: passed`, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` across 13 routes.
- Boundary: no new AI execution path, external AI/provider request, Runtime/Agent restart, operational data mutation, UNKNOWN replay, stale-lock repair, deployment, push, approved-design source assumption, or AI Broadcast Room implementation occurred. Final approved character/background/environment sources remain unavailable in the supplied ZIP as previously recorded.

## 2026-09-27 latest verification: owner-scoped AI Chat text attachments

- AI Chat bounded text attachments are **A — API, durable persistence, local Runtime context, and full browser verified**. `src/ai-chat/service.ts` validates authenticated conversation ownership, text-only MIME/extension input, path-safe names, 3-file/24KB-per-file/48KB-per-message limits, and restart persistence. Attachments are stored only on the user's message and are not added to private memory.
- `user-ui/src/pages/AIChat.tsx` provides the real multiple-file input, local text reading, pending removal, durable rendering, and Markdown export. `src/ai-chat/local-runtime.ts` receives bounded attachment text with an explicit non-execution boundary; no binary upload, file execution, workspace write, external AI call, or automatic approval was introduced.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/router.ts`, `src/ai-chat/local-runtime.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-attachments.test.ts`, `tests/ai-chat-api.test.ts`, `tests/ai-chat-local-runtime.test.ts`, `tests/user-ui-ai-chat-attachments-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused tests passed `13/13`; AI Chat suite passed `20/20`; user-product passed `241/241`; root passed `662/662`; both builds passed; and focused/full isolated browser E2E passed `aiChatAttachmentsUi: passed` with two-account isolation, reload persistence, export, project-context permission behavior, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining scope is unchanged: editable AI context and execution-plan generation/approval still need an approved durable request/schema/ACL contract; live Ollama/model generation and external connectors remain unverified/unconfigured; final approved character/background/environment art sources remain unavailable; AI Broadcast Room remains deferred.
- Safety boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and prior durable records remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 latest verification: per-message AI Chat context editing

- AI Chat context editing is **A — permission-aware selection, durable message state, local Runtime filtering, and full browser verified**. `src/ai-chat/contracts.ts` adds `AiChatContextSelection`; `src/ai-chat/service.ts` stores the selected five-section scope on each user message and filters memory, learning, project, activity, and team-doc context before dispatch. The user can never elevate a disabled `aiAccess` permission through this request.
- `user-ui/src/pages/AIChat.tsx` exposes `맥락 편집`, shows which source is allowed or blocked by Settings, applies changes only to the next message, restores the persisted selection after reload, and states that file changes/execution rights are excluded. `projectIdForMessage` prevents a project from being sent when the project context switch is off.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-context-selection.test.ts`, `tests/user-ui-ai-chat-context-selection-contract.test.ts`, `tests/user-ui-ai-chat-project-context-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Context focus passed `3/3`; AI Chat suite passed `22/22`; user-product passed `241/241`; root passed `662/662`; both builds passed; focused browser passed `aiChatContextSelectionUi: passed`; and full isolated browser E2E passed all existing journeys plus `aiChatContextSelectionUi: passed` and `aiChatAttachmentsUi: passed` with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Task 109 now adds an explicit approved-plan → owner project `queued` Work Request handoff with durable `workRequestId`; it still deliberately does not create or start a Run. Real operational Runtime execution-plan generation and editable AI-generated plan content remain unverified/unimplemented; live Ollama/model generation and external connectors remain unverified/unconfigured; final approved art sources remain unavailable; AI Broadcast Room remains deferred.
- Safety boundary: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external connectors/providers, deployment/push state, and prior durable records remain untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 latest verification: AI Chat plan-to-workspace approval handoff

- AI Chat approved-plan navigation is **A — owner-scoped queued Work Request linked to the existing Project Workspace approval checkpoint and full browser verified**. `user-ui/src/pages/AIChat.tsx` exposes `프로젝트 작업실에서 실행 승인 검토` only after a durable `workRequestId` exists and routes to the selected project workspace. `user-ui/src/pages/Projects.tsx` remains the only Run approval boundary; no AI Chat link starts or claims a Run.
- Evidence: `user-ui/src/pages/AIChat.tsx`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-ui-ai-chat-execution-plan-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `docs/superpowers/plans/2026-09-25-iseol-approved-ui-integrated-product.md`. Focused UI contract passed `1/1`; AI Chat passed `25/25`; user-product passed `241/241`; root passed `662/662`; both builds passed; focused and full isolated browser E2E passed `aiChatExecutionPlanUi: passed`, with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Truthfulness boundary: the workspace checkpoint was opened and cancelled in the isolated browser while the linked request remained `queued`, had no Run, and reported `runtime.status: not-started`. Actual Run dispatch still requires the existing explicit owner approval and a configured Runtime/Agent path.
- Remaining gaps are unchanged: live Ollama/model generation is unavailable/unverified, external connectors and final approved art sources are unavailable, and AI Broadcast Room remains deferred. Operational Runtime/Agent, dataRoot, stale lock, UNKNOWN records, external providers, deployment/push state, and prior durable records remain untouched.

## 2026-09-27 latest verification: Project Workspace bounded Run observability

- Project Workspace Run observability is **A — owner-scoped durable projection, UI rendering, and full browser verified**. `src/project-model/run-observability.ts` and `src/project-model/user-project-service.ts` expose only evidence matching both project and Run identity, separated into changed files, test/build checks, and command-log summaries.
- `user-ui/src/pages/Projects.tsx` renders `Run 관찰 기록` with explicit empty/waiting/unknown states and no fabricated preview URL. `user-ui/src/api/userApi.ts` mirrors the bounded read model. Preview remains `not-available` until a Runtime contract records an address.
- Evidence: `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and the files above. Focused project/UI tests passed `16/16`; user-product `242/242`; root `662/662`; both builds passed; focused and full isolated browser E2E passed with two-user isolation, reload persistence, real Runtime completion/recovery, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining boundary: raw execution logs, live preview URL, and final approved character/background/environment source assets are not claimed when the Runtime or design source has not provided them. Live Ollama/model generation and external connectors remain unavailable/unverified; AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, external providers/connectors, deployment/push state, and prior durable records remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 latest verification: Project Workspace bounded file inventory

- Project Workspace file inventory is **A — owner-scoped metadata projection, UI rendering, and full browser verified**. `src/project-model/workspace-files.ts` lists only relative paths and byte sizes from the selected project workspace. It reads metadata, not file contents; skips symlinks, secret-like names, and generated/metadata directories; rejects path escape; and caps traversal at 500 files and eight directory levels.
- `src/project-model/user-project-service.ts` exposes the projection only through the existing authenticated project view and ACL. `user-ui/src/pages/Projects.tsx` renders `실제 작업공간 파일` with explicit unavailable, empty, and truncated states. The mobile 작업 tab uses the same owner-scoped read model without replacing the desktop workspace.
- Evidence: `src/project-model/workspace-files.ts`, `src/project-model/user-project-service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/UI tests passed `18/18`; user-product `244/244`; root `662/662`; both builds passed; and full isolated browser E2E passed two-account isolation, reload persistence, actual Project Workspace Runtime execution/approval/recovery/team transitions, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Truthfulness boundary: no file content/preview API, live preview URL, upload, external provider call, or new execution path was introduced. Final approved art sources remain unavailable; live Ollama/model generation and external connectors remain unverified/unconfigured; AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and prior durable records remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 latest verification: verified Project Workspace preview links

- Verified Project Workspace previews are **A — evidence-gated URL projection, UI rendering, and full browser verified**. `src/project-model/run-observability.ts` exposes `preview.status: ready` only when the selected Run has `production-verification` evidence with a safe HTTP(S) reference. A matching deployment evidence record contributes its provider; `javascript:`, credential-bearing, malformed, and non-HTTP(S) references are ignored.
- `user-ui/src/pages/Projects.tsx` renders `기록된 미리보기 주소` and `미리보기 열기` only for that durable verified URL. Runs without the evidence pair remain `미리보기 주소가 기록되지 않았습니다.`; missing durable Runs remain `unknown`. No URL is inferred from `local://pending`, a workspace path, or a successful status.
- Evidence: `src/project-model/run-observability.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project/UI tests passed `20/20`; user-product `246/246`; root `662/662`; both builds passed; and full isolated browser E2E passed two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, `responsiveViewports: [390, 768, 1024, 1440]`, and `responsiveRoutes: 13`.
- Scope boundary: this reads a previously recorded URL and does not start a preview server, revalidate it, deploy externally, or claim that a missing preview is live. Final approved art sources remain unavailable; live Ollama/model generation and external connectors remain unverified/unconfigured; AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and prior durable records remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## 2026-09-27 latest verification: accessible mobile navigation modal

- Mobile navigation accessibility is **A — semantic modal, keyboard handling, focus containment/return contract, and full product/browser regression verified**. `user-ui/src/components/Navigation.tsx` keeps the approved visual menu and route map while adding `role="dialog"`, `aria-modal`, a labelled title, `aria-controls`, Escape dismissal, Tab focus containment, initial close-button focus, and focus return to the trigger.
- Evidence: `user-ui/src/components/Navigation.tsx`, `tests/user-ui-navigation-accessibility-contract.test.ts`, `tests/user-ui-responsive-contract.test.ts`, `tests/user-ui-navigation-personal-space-contract.test.ts`, `tests/user-ui-notifications-contract.test.ts`, `tests/user-ui-notification-availability-contract.test.ts`, and `package.json`. Focused navigation contracts passed `5/5`; user-product passed `247/247`; root passed `662/662`; both builds passed; full isolated browser E2E passed two-account isolation, reload persistence, Project Workspace execution/approval/recovery/team transitions, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining gaps are unchanged: live Ollama/model generation is unavailable/unverified, external connectors and final approved art sources are unavailable, weekly digest remains intentionally unavailable without a producer/spec, and AI Broadcast Room remains deferred.
- Safety: operational Runtime/Agent PID `1708`/`22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, Ollama/model state, external providers/connectors, deployment/push state, and prior durable records remained untouched. No restart, operational mutation, UNKNOWN replay, external AI/provider request, deployment, or push occurred.

## Task 114 — live browser proof for mobile navigation accessibility

- Status: A for the bounded mobile navigation accessibility slice; actual browser behavior is now verified in addition to the static contract.
- Implemented: `scripts/iseol-user-ui-e2e.ts` now runs `verifyMobileNavigationAccessibilityUi` at a 390px viewport and checks the real menu trigger, dialog semantics, focus entry, Tab/Shift+Tab wrapping, Escape close, and focus restoration. The full browser journey invokes both the personal-space navigation verifier and this mobile verifier before reporting success.
- Evidence: focused contract `2/2`; focused browser `mobileNavigationAccessibilityUi: "passed"`; isolated full browser E2E passed with two accounts, four viewport widths (`390/768/1024/1440`), 13 responsive routes, and the navigation pass fields; user-product regression `248/248`; root regression `662/662`; both UI and root builds passed.
- Scope: this is not evidence that the entire ISEOL product is complete. Live Ollama/model availability, external connector credentials, final approved character art, and other B/D items remain separately tracked; AI Broadcast Room remains deferred.
- Safety: this unit used isolated browser accounts and local builds/tests only. Operational Runtime/Agent, stale lock metadata, durable records, and UNKNOWN requests were preserved; no restart, external AI call, deployment, push, or deferred broadcast change occurred.

## Task 115 — safe Runtime/Agent status and browser-verified UI trust fixes

- Runtime/Agent capability surface: **A — safe authenticated status projection and browser verified**. The user API exposes only `state`, `projectExecution`, `agent`, and `aiChat` capability states; Settings labels the local execution Runtime and Desktop Agent separately without exposing ports, roots, lock data, or operator metadata. The operational Runtime remains separately owned and was not changed.
- Settings permission persistence: **A — durable owner-scoped API, rapid-toggle handling, reload persistence, and two-user browser verified**. Initial settings loading is awaited when a user acts immediately; independent patches are queued and persisted in order. Account B does not receive Account A's changes.
- Character/export trust labels: **A — browser verified**. The approved ISEOL accessible labels and canonical AI conversation export name are used by the real UI; PNG loading and the personal-world environment asset pass in the isolated browser.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/user-router.ts`, `user-ui/src/pages/Settings.tsx`, `user-ui/src/components/CharacterAssets.tsx`, `user-ui/src/pages/AIChat.tsx`, `tests/user-runtime-status-api.test.ts`, `tests/user-ui-settings-contract.test.ts`, `tests/user-ui-ai-chat-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused contracts `41/41`, user-product `248/248`, root `662/662`, root/UI builds passed, and full browser E2E passed all journeys with two accounts and four viewport widths.
- Boundary: live Ollama/model execution, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain B/D or deferred and are not claimed as complete. Deterministic isolated Runtime fixtures are test evidence only.

## Task 116 — live Agent capability refresh across Project Workspace and Settings

- Runtime Agent status is **A — required-Agent aggregation, late disconnect/reconnect behavior, authenticated refresh, and isolated browser verified** for this bounded capability surface. `src/runtime/iseol-runtime-services.ts` now aggregates the configured Idea Lab and/or Project Workspace Agent IDs and updates the safe `agent` state from Desktop transport events. It does not expose transport internals or alter the operational Runtime.
- Settings status refresh is **A — bounded polling, visibility refresh, cleanup, and user UI regression verified**. `user-ui/src/pages/Settings.tsx` refreshes `/api/user/runtime-status` every 10 seconds while visible, refreshes immediately when returning to a visible document, and cleans up both interval and listener on unmount.
- Settings durable writes also use the existing transient Windows rename retry boundary in `src/settings/store.ts`; `tests/settings-isolation.test.ts` verifies a retried `EPERM` rename survives reload.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/settings/store.ts`, `user-ui/src/pages/Settings.tsx`, `tests/iseol-runtime-services.test.ts`, `tests/settings-isolation.test.ts`, and `tests/user-ui-integrations-contract.test.ts`. Focused Runtime/UI contracts `35/35`, Settings persistence contracts `4/4`, user-product `249/249`, root `663/663`, root/UI builds, `git diff --check`, and full isolated browser E2E passed. Browser evidence included Runtime status, settings permission isolation, Project Workspace local-Agent/execution/recovery, and responsive `390/768/1024/1440` coverage across 13 routes.
- Scope boundary: this does not claim live Ollama/model generation, external connector connectivity, final approved art originals, weekly digest production, or AI Broadcast Room completion. Broadcast artifacts remain preserved and deferred.

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

- Project Work Request cancellation now integrates with the existing activity ledger. `src/project-model/user-project-service.ts` records one owner-scoped `project.work.cancelled` event only after a queued request is durably marked `cancelled`.
- Evidence is deliberately `unverified` and actor-attributed to the user; the payload contains only `projectId` and `workRequestId`. The event therefore remains visible for audit/portfolio provenance but does not grant growth XP or imply a successful Run.
- Verification: focused API/UI contracts `5/5`; focused browser cancellation journey verified the activity event, reload persistence, and growth XP `0`; user-product `251/251`; root `663/663`; root/UI builds and `git diff --check`; full isolated browser E2E with two accounts, all existing journeys, and responsive `390/768/1024/1440` across 13 routes passed.
- Status remains bounded: live Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unavailable/unverified or deferred.

## 2026-09-27 continuation: queued Work Request creation activity evidence

- Project Work Request creation is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the activity-evidence slice. `src/project-model/user-project-service.ts` records one `project.work.created` event only when a new request and its workspace tree are durably created.
- The event is user-attributed and `unverified`, carries only project/request identities, and does not grant XP. Idempotent replay is guarded by `result.created`, so retries do not duplicate activity evidence. Existing cancellation evidence remains separate as `project.work.cancelled`.
- Evidence: `tests/user-project-api.test.ts`, `tests/user-ui-project-cancellation-contract.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and `src/project-model/user-project-service.ts`. Focused API/UI contracts `6/6`, focused browser cancellation/activity journey, user-product `252/252`, root `663/663`, root/UI builds, and full isolated browser E2E passed all reported journeys, including AI team execution approval and responsive `390/768/1024/1440` coverage across 13 routes.
- Boundary: this proves local durable activity projection and UI/runtime integration only; it does not prove live Ollama generation, external connector delivery, or operational Runtime ownership. AI Broadcast Room remains deferred and its artifacts are preserved.

## 2026-09-27 continuation: project creation activity and My World ledger layout

- Project creation activity is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified**. After durable project/workspace creation, `src/project-model/user-project-service.ts` records one `project.created` event with `unverified` user attribution and no growth projection.
- My World recent activity is **A — browser regression repaired and verified**. The ledger remains the approved card/style and activity deep links, but now lives in the scrollable content area rather than the fixed 320px `overflow-hidden` character header. This preserves access when the durable ledger grows beyond the initial record count.
- Evidence: `src/project-model/user-project-service.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-project-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused API/UI `6/6`, user-product `253/253`, root `663/663`, root/UI builds, and full isolated browser E2E with AI team execution, two-user isolation, reload persistence, and responsive `390/768/1024/1440` across 13 routes passed.
- Boundary: the event is local durable evidence only; it does not claim live Ollama/model generation, external connector delivery, operational Runtime ownership, final approved art availability, weekly digest production, or AI Broadcast Room completion.

## 2026-09-27 continuation: learning → project application provenance

- Learning project application acceptance is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the provenance slice. `src/learning/service.ts` records one `learning.project.application.accepted` ActivityEvent only after the accepted application, LearningLink, and linked Work Request are durable.
- The event is user-attributed and `unverified`, carries only goal/project/proposal/Work Request identities, and does not grant XP or imply mastery, execution, or verified technical contribution. Repeated acceptance does not duplicate the event.
- Evidence: `src/learning/service.ts`, `tests/learning-project-application-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused learning-application API coverage passed `1/1`; user-product `254/254`; root `663/663`; root/UI builds passed; and full isolated browser E2E passed all reported journeys, including `learningProjectApplicationUi`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, or design source changed.

## 2026-09-27 continuation: Project → Task → Run request activity evidence

- Initial Run request activity is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified**. Once a Work Request has a durable Run and the request status is durably projected to `running` or `waiting`, `src/project-model/user-project-service.ts` records one `project.run.requested` ActivityEvent.
- The event is deliberately `user` + `unverified`, carries only `projectId`, `workRequestId`, and `runId`, and has no Growth/XP projection. It is audit/provenance evidence of a user request, not completion, Runtime success, or verified technical contribution.
- Evidence: `src/project-model/user-project-service.ts`, `tests/user-project-api.test.ts`, `scripts/iseol-user-ui-e2e.ts`, and the existing Activity/Growth/Portfolio read models. Focused API coverage passed `7/7`; user-product `254/254`; root `663/663`; both builds passed; and full isolated browser E2E passed the Run request and completion journey with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining boundary: resume/retry request history is not newly expanded in this unit; live operational Runtime ownership, live Ollama/model output, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred.

## 2026-09-28 continuation: Project Task dependency execution boundary

- Project Task dependencies are **B — user-visible, durably persisted, owner-scoped, and isolated-browser verified**. The Project Workspace dependency planner sends `dependencies` through the authenticated user API, restores the graph after reload, and displays prerequisite labels.
- `src/project-model/user-project-service.ts` now blocks dependent Run creation before build approval/Runtime enqueue when any prerequisite is not `completed`; the dependent request remains `waiting` with a truthful blocker and no Run identity. The existing scheduler and worker dependency checks remain authoritative.
- Evidence: `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `src/project-model/user-project-service.ts`, `tests/user-project-api.test.ts`, `tests/user-ui-project-workspace-mobile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project API/execution/work-request coverage passed `36/36`; dependency UI contract `2/2`; user-product `258/258`; root `663/663`; root/UI builds passed; and full isolated browser E2E passed all journeys, including `projectTaskDependencyUi`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, or design source changed.

## 2026-09-28 continuation: community comment persistence

- Community comments are **B — authenticated, durable, user-attributed, public-post scoped, and isolated-browser verified**. `CommunityComment` records are persisted per post, comments are returned in chronological order with the authenticated author's display identity, and only published-post comments are listed or created.
- Evidence: `src/community/contracts.ts`, `src/community/store.ts`, `src/community/service.ts`, `src/community/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Community.tsx`, `tests/community-flow.test.ts`, `tests/user-ui-community-contract.test.ts`, `tests/iseol-user-journeys.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: community service `2/2`, community UI contract `2/2`, user-product `274/274`, root `663/663`, root/UI builds, diff validation, and full isolated browser E2E passed with `publicCommunityCommentPersistence: passed`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining boundary: moderation workflows and external social integrations remain outside this unit. Comment notifications are covered by the follow-up verification below. No UNKNOWN or operational data changed; AI Broadcast Room remains deferred.

## 2026-09-28 continuation: learning report to portfolio publication bridge

- Status: **B — owner-scoped, durably persisted, explicitly user-triggered, publication-capable, and isolated-browser verified**.
- Verified outcomes from a user's local-evidence Learning Report are projected as selectable `learning-report` Portfolio evidence. The Portfolio service injects the existing Learning service, filters by authenticated owner and `verificationStatus: verified`, preserves report/outcome provenance for the owner, and strips internal report provenance from public views.
- The Learning UI creates a **private** Portfolio draft only after an explicit user click; the user can then edit its visibility to `public`, and the public API/route expose the title, summary, and verified evidence. Self-report outcomes remain excluded; no auto-publication, XP, Runtime dispatch, or external AI request is involved.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/portfolio-learning-report.test.ts`, `tests/user-ui-learning-report-contract.test.ts`, `tests/user-ui-portfolio-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused contracts `11/11`; product regression `272/272`; root regression `663/663`; root/UI builds passed; focused browser `learningReportPortfolioDraftUi: passed`; full isolated browser E2E passed with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain environment-dependent, unavailable, or deferred. No UNKNOWN or operational data changed.

## 2026-09-28 continuation: public product information routes

- Status: **A — real local routes, truthful boundary copy, and isolated-browser verified**.
- Landing footer links now navigate to `/terms`, `/privacy`, and `/help` instead of dead hash targets. The shared information page explains owner-scoped data, approval-gated AI/Runtime behavior, public portfolio visibility, external integration limits, and the deferred AI Broadcast Room without presenting unavailable services as connected.
- Evidence: `user-ui/src/pages/Information.tsx`, `user-ui/src/pages/Landing.tsx`, `user-ui/src/app/routes.ts`, `tests/user-ui-landing-links-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused contracts `2/2`, focused browser `informationRoutesUi: passed`, user-product `272/272`, root/UI builds, and full isolated browser E2E passed with two-user isolation and responsive `[390,768,1024,1440]` across 13 routes.
- Remaining boundary: these pages are product guidance, not legal review or proof of external connector availability. No UNKNOWN or operational data changed.

## 2026-09-28 continuation: authenticated password change

- Password change is **B — authenticated, owner-scoped, durable, session-revoking, and isolated-browser verified**. `POST /api/user/password` requires the current user's platform session, verifies the current credential, persists a new salt/hash, revokes all active sessions for that user, and exposes only `{ passwordChanged: true }` on success.
- Settings implements current/new/confirmation inputs and returns the user to login after success. The old credential is rejected and the new credential succeeds in a fresh isolated browser account; unrelated users and the operational Runtime are not involved.
- Evidence: `src/identity/store.ts`, `src/platform-user/service.ts`, `src/web-control-plane/user-router.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/platform-user-auth.test.ts`, `tests/user-ui-settings-contract.test.ts`, `tests/user-ui-auth-boundary-contract.test.ts`, `tests/iseol-user-journeys.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused coverage `12/12`, user-product `270/270`, root `663/663`, both builds, and full isolated browser E2E passed.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified, unavailable, or deferred. No UNKNOWN record, operational data, external provider, approved design source, deployment, or push changed.

## 2026-09-28 continuation: owner-scoped Personal AI profile Runtime context

- Personal AI profile integration is **B — persisted Settings data, owner-scoped Runtime context, loopback prompt integration, and isolated-browser verified; live model generation remains unverified**. The authenticated profile's bounded name/personality/tone/role now reaches only the same user's `AiChatContextSnapshot` and is rendered as style metadata for the local adapter.
- `src/ai-chat/service.ts` reads through `AiAgentProfileService` under the authenticated principal; `src/ai-chat/local-runtime.ts` labels profile values as non-authoritative style guidance; and both composed Runtime paths inject the same owner-scoped service. Missing/failed profile reads omit optional style metadata without widening data access or inventing a reply.
- Evidence: `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/ai-chat/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/pages/Settings.tsx`, `user-ui/src/pages/AIChat.tsx`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-local-runtime.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused AI Chat/profile coverage passed `33/33`; user-product `267/267`; root `663/663`; root/UI builds passed; and focused browser `aiAgentProfileUi: passed` verified save → reload → AI Chat display in an isolated account.
- Remaining boundary: live Ollama/model output, operational Runtime ownership, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified, unavailable, or deferred. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: project lifecycle activity provenance

- Project lifecycle activity provenance is **B — completed-Run evidence projection, owner-scoped durable ledger, deterministic idempotency, and full isolated-browser verified**. After a completed Run, `src/project-model/user-project-service.ts` records only matching Harness evidence as `project.artifact.recorded`, `project.revision.recorded`, or `project.deployment.recorded` ActivityEvents.
- The events preserve `system` attribution and `verified` status, include project/Run/evidence identities, and are outside Growth/XP projection. Path-like evidence IDs are retained in payloads while a deterministic hash provides a valid ActivityEvent source identity; repeated project reads do not duplicate records.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/lifecycle.ts`, `src/activity/service.ts`, `tests/user-project-execution.test.ts`, `tests/project-lifecycle.test.ts`, `tests/user-project-runtime-integration.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused lifecycle/API/Runtime integration passed `21/21`; user-product `265/265`; root `663/663`; root/UI builds passed; and full isolated browser E2E passed Project Runtime growth/portfolio, activity timeline, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live operational Runtime ownership and Ollama/model generation remain unverified; external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unavailable/deferred. No UNKNOWN or operational data changed.

## 2026-09-28 continuation: local AI execution-plan envelope

- Local Personal AI execution-plan parsing is **B — loopback adapter contract, bounded validation, owner-scoped persistence/approval path, and isolated-browser regression verified; live model generation remains unverified**.
- `src/ai-chat/local-runtime.ts` now maps only an explicit structured model envelope into the existing `executionPlan` result; plain text is unchanged, malformed plans wait with a bounded blocker, and the adapter never executes or approves anything. Existing `src/ai-chat/service.ts` remains the owner/approval/queued-Work-Request boundary.
- Evidence: `src/ai-chat/local-runtime.ts`, `tests/ai-chat-local-runtime.test.ts`, `src/ai-chat/service.ts`, and `scripts/iseol-user-ui-e2e.ts`. AI Chat focused contracts passed `28/28`; user-product `264/264`; root `663/663`; root/UI builds passed; focused browser `aiChatExecutionPlanUi: passed`; and full isolated browser E2E passed all reported journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: no live Ollama model was started or called; operational Runtime ownership, external connectors, final art, weekly digest, and AI Broadcast remain unverified/deferred. No UNKNOWN or operational data changed.

## 2026-09-28 continuation: explicit Project queue scheduler

- Project queue scheduling is **B — user-visible, owner-scoped, durably persisted, and isolated-browser verified**. The authenticated `schedule` route selects only dependency-ready queued Work Requests, enforces a bounded `1..8` concurrency limit, serializes competing scheduler calls for the same project in-process, and uses the existing Run/approval/Runtime boundary for each selected task.
- `ProjectQueueScheduler` is explicit rather than startup-driven: the user chooses the limit and starts the queue, sees selected/started/waiting counts, and must confirm persisted Build Run approval when enabled. No task is marked completed by scheduling; preflight or Runtime blockers remain visible as `waiting`.
- Evidence: `src/project-model/user-project-service.ts`, `src/project-model/user-project-router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-api.test.ts`, `tests/user-ui-project-workspace-mobile-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused contracts passed `42/42`, including the already-active Run guard and concurrent scheduler serialization; browser focus and full isolated browser E2E passed; user-product `262/262`; root `663/663`; root/UI builds passed.
- Remaining boundary: live operational Runtime throughput and external provider availability remain environment-dependent; no auto-scheduler, external dispatch, approved design source, deployment, push, data deletion, or AI Broadcast Room implementation was added in this unit. Operational PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, stale PID `55000`, UNKNOWN records, and durable operational data were not changed.

## 2026-09-28 continuation: AI team discussion request provenance

- AI team technical discussion requests are **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the activity-evidence slice. After a completed or Runtime-waiting discussion is durably saved, `src/ai-team/discussion-service.ts` records one `ai.team.discussion.requested` ActivityEvent.
- The event is user-attributed and `unverified`, bounded to project/team/discussion/request/agent/status identities, and outside Growth/XP. Repeated requests with the same request ID return the existing discussion without duplicating the event; no Work Request is created.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/discussion-service.ts`, `tests/ai-team-discussion-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused discussion/API/UI contracts passed `4/4`; user-product `256/256`; root `663/663`; root/UI builds passed; and full isolated browser E2E passed all reported journeys, including AI-team discussion, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, or design source changed.

## 2026-09-28 continuation: AI team proposal acceptance provenance

- AI team proposal acceptance is **B — locally implemented, owner-scoped, idempotent, and isolated-browser verified** for the human-approval provenance slice. `src/ai-team/service.ts` records one `ai.team.proposal.accepted` ActivityEvent only after the accepted proposal and queued Work Request are durable.
- The event is user-attributed and `unverified`, bounded to project/team/proposal/Work Request/agent identities, and outside Growth/XP. Acceptance does not start a Run; repeated acceptance remains idempotent.
- Evidence: `src/ai-team/contracts.ts`, `src/ai-team/service.ts`, `tests/ai-team-proposals-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused proposal/API/UI contracts passed `5/5`; user-product `256/256`; root `663/663`; root/UI builds passed; and full isolated browser E2E passed all reported journeys, including AI-team proposal approval, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, or design source changed.

## 2026-09-27 continuation: Project Run resume/retry activity provenance

## 2026-09-28 continuation: Project Workspace bounded file preview

- Project file preview is **B — owner/team-scoped, bounded, read-only, durable-workspace backed, and isolated-browser verified**. The service exposes only files already under the project workspace ACL; it does not read arbitrary paths supplied by another user.
- `src/project-model/workspace-files.ts` validates canonical relative paths, rejects traversal/out-of-root paths, secret-like names, symlinks, non-files, files larger than 128 KiB, NUL bytes, and invalid UTF-8. `src/project-model/user-project-router.ts` returns an explicit `not-available` envelope for an unavailable owner-visible file and `404` for an inaccessible project. `user-ui/src/pages/Projects.tsx` requests content only after `파일 열기` and renders it as read-only text.
- Evidence: `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused tests passed `36/36` plus browser contract `1/1`; user-product `276/276`; root `663/663`; both builds passed; full isolated browser E2E passed the Local Agent-generated `package.json` preview and existing responsive/account-isolation journeys.
- Remaining boundary: binary/diff-aware viewers, live operational Runtime ownership, Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: owner-controlled Project Run pause checkpoint

- Project Run pause/resume is **B — locally implemented, owner-scoped, durable, same-Run, and isolated-browser verified**. `src/project-model/user-project-service.ts` exposes the owner boundary, `src/project-model/user-project-router.ts` exposes `POST /runs/pause`, and `src/harness/run-service.ts` persists `PAUSED` checkpoints.
- A paused Run projects to a waiting Work Request without changing `runId`; reload and resume use the same identity. `src/harness/run-supervisor.ts` rejects stale in-flight executor results and restarts a resumed `READY` checkpoint instead of applying a result captured before the pause.
- `user-ui/src/pages/Projects.tsx` exposes the confirmation and reload-safe resume control while explicitly stating that an in-flight OS process is not force-terminated. The flow records one unverified `project.run.paused` event and does not grant growth.
- Evidence: `tests/harness-run-supervisor.test.ts`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused coverage `48/48`; user-product `280/280`; root `665/665`; both builds passed; focused and full isolated browser E2E passed with responsive `[390,768,1024,1440]` and 13-route coverage.
- Remaining boundary: live operational Runtime pause behavior still requires an approved operational verification window; the isolated pause-gate is not evidence of operational process termination or external provider behavior. Final approved art originals, weekly digest production, external connector availability, and AI Broadcast Room remain unavailable/deferred. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: Project Workspace line-numbered preview

- Project file preview remains **B — owner/team-scoped, bounded, read-only, durable-workspace backed, and isolated-browser verified**. The UI now renders each real preview line with a stable non-selectable number and accessible `파일 줄 번호 N` label, improving code/log readability without changing the source content or implying editing capability.
- Evidence: `user-ui/src/pages/Projects.tsx`, `tests/user-ui-project-lifecycle-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused UI contract passed `6/6`; user-product `276/276`; root `663/663`; both builds passed; and isolated browser E2E verified line 1 on the real Local Agent-generated `package.json` plus existing account-isolation, reload, and responsive journeys.
- Remaining boundary is unchanged: binary/diff-aware viewers, live operational Runtime ownership, Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

- Project Run recovery provenance is **B — locally implemented, owner-scoped, idempotent per durable action identity, and isolated-browser verified**. `src/project-model/user-project-service.ts` records `project.run.resumed` after a durable waiting-Run resume and `project.run.retried` after a durable failed-Run retry transition.
- Both events are user-attributed and `unverified`, do not grant XP, and do not imply successful Runtime execution. Resume event identity includes the durable waiting checkpoint, while retry event identity includes the durable retry cycle; later recovery actions therefore cannot overwrite earlier provenance. The Runtime-unavailable retry path records the action only after its waiting checkpoint is durable.
- Evidence: `src/project-model/user-project-service.ts`, `tests/user-project-api.test.ts`, `tests/user-project-execution.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project API/execution coverage passed `23/23`; user-product `256/256`; root `663/663`; both builds passed; and full isolated browser E2E passed the failure-recovery journey with two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.
- Remaining boundary: live operational Runtime ownership, Ollama/model generation, external connector delivery, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, or design source changed.

## 2026-09-28 continuation: community comment owner notifications

- Community comment notifications are **B — owner-scoped, settings-gated, durable, idempotent, SSE-compatible, and isolated two-account browser verified**. A comment on a persisted public post notifies only the persisted post owner when `notifications.newMessage` is enabled; self-comments and muted owners do not create notifications. Repeated delivery for the same comment identity returns the existing notification.
- The existing user notification bell displays the bounded `새 커뮤니티 댓글` entry, marks it read through the authenticated notification route, and returns to `/app/community`. The public comment remains durable even if notification production fails; no private comment content is placed in the notification body.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/service.ts`, `src/community/contracts.ts`, `src/community/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/components/Navigation.tsx`, `tests/user-notifications.test.ts`, `tests/community-flow.test.ts`, `tests/user-ui-notifications-contract.test.ts`, `tests/user-ui-community-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused service/UI checks `14/14`; `npm.cmd run test:iseol-user-product` `284/284`; `npm.cmd test` `666/666`; `npm.cmd run build` passed; approved user UI build passed; `git diff --check` passed; focused browser reported `communityCommentNotificationUi: "passed"`; full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: Learning AI Runtime readiness status surface

- Learning AI Runtime readiness visibility is **B — authenticated, truthful, composed-Runtime-backed, and isolated-browser verified**. `/api/user/runtime-status` now exposes `learningAi: "ready"` only when plan, content, action, and feedback dispatchers are all configured; otherwise it exposes `"unavailable"` without claiming live model quality.
- `src/runtime/iseol-runtime-services.ts` derives the value from the same explicitly configured local Learning dispatchers. `src/web-control-plane/server.ts` and `src/web-control-plane/user-router.ts` pass the bounded capability into the authenticated user snapshot. The isolated browser server maps its deterministic Learning fixture state without contacting Ollama.
- `user-ui/src/api/userApi.ts` types the field and `user-ui/src/pages/Settings.tsx` adds the existing integration-card row `학습 AI Runtime` with `학습 AI 준비됨`, `학습 AI 미연결`, or an unknown-state label. Deterministic local learning and syntax verification remain unchanged.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/server.ts`, `src/web-control-plane/user-router.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-runtime-status-api.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-runtime-status.md`.
- Verification: focused API/UI checks passed `3/3`; `npm.cmd run test:iseol-user-product` passed `299/299`; `npm.cmd test` passed `675/675`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, Learning Runtime, AI Team proposal/discussion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes; `git diff --check` reported no whitespace errors.
- Boundary: this is configuration/readiness visibility, not live Ollama/model verification. No Ollama request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remain untouched.

## 2026-09-28 continuation: AI Team Runtime readiness status surface

- AI Team Runtime readiness visibility is **B — authenticated, truthful, composed-Runtime-backed, and isolated-browser verified**. `/api/user/runtime-status` now exposes `aiTeam: "ready"` only when both proposal and technical-discussion dispatchers are configured, and otherwise exposes `"unavailable"`; no model quality or external connectivity is implied.
- `src/runtime/iseol-runtime-services.ts` derives the status from the same explicit local dispatchers used by the AI Team services. `src/web-control-plane/server.ts` and `src/web-control-plane/user-router.ts` pass the bounded capability into the authenticated user snapshot. The isolated browser server passes its deterministic AI Team fixture state without contacting Ollama.
- `user-ui/src/api/userApi.ts` types the field and `user-ui/src/pages/Settings.tsx` adds the existing integration-card row `AI 팀 Runtime` with `AI 팀 준비됨`, `AI 팀 미연결`, or an unknown-state label. The existing compact approved layout and all external integration states remain unchanged.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/server.ts`, `src/web-control-plane/user-router.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `scripts/iseol-user-ui-e2e.ts`, `tests/user-runtime-status-api.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `docs/superpowers/plans/2026-09-28-ai-team-runtime-status.md`.
- Verification: focused API/UI checks passed `3/3`; `npm.cmd run test:iseol-user-product` passed `299/299`; `npm.cmd test` passed `675/675`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, AI Team proposal/discussion journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes; `git diff --check` reported no whitespace errors.
- Boundary: this is configuration/readiness visibility, not live Ollama/model verification. No Ollama request, operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remain untouched.

## 2026-09-28 continuation: AI Team loopback Ollama Runtime adapter

- AI Team local model integration is **B — bounded loopback adapter and composed Runtime wiring implemented; live model quality and operational ownership remain unverified**. `src/ai-team/local-runtime.ts` sends only structured proposal/discussion prompts to an explicitly enabled Ollama-compatible loopback endpoint, validates bounded JSON envelopes, and returns `waiting` for malformed, oversized, rejected, or unavailable responses.
- `src/runtime/iseol-runtime-services.ts` now creates these proposal/discussion dispatchers only when `ISEOL_LOCAL_AI_RUNTIME_ENABLED=true` with an explicit model. Explicit injected dispatchers still take priority; when disabled, AI Team remains in the existing honest `waiting-runtime` state. Human proposal acceptance and project Run approval remain separate.
- Evidence: `src/ai-team/local-runtime.ts`, `src/runtime/iseol-runtime-services.ts`, `tests/ai-team-local-runtime.test.ts`, `tests/iseol-runtime-services.test.ts`, and `docs/superpowers/plans/2026-09-28-ai-team-local-ollama-runtime.md`. Focused adapter/composed Runtime coverage passed `41/41`; `npm.cmd run test:iseol-user-product` passed `299/299`; `npm.cmd test` passed `675/675`; both builds passed; full isolated browser E2E passed all existing product journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: tests used injected fetch implementations and did not contact Ollama. Live local model availability/answer quality, operational Runtime throughput, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, stale lock, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: explicit AI Team dispatcher injection in composed Runtime

- AI Team proposal/discussion composition is **B — explicitly injectable at the local composed Runtime boundary, owner-scoped, shared-gate aware, and regression/browser verified**. `src/runtime/iseol-runtime-services.ts` now accepts optional `aiTeamProposalDispatcher` and `aiTeamDiscussionDispatcher` inputs and forwards them to the existing services through the shared per-user dispatch gate. This closes the local composition gap without claiming that the operational Runtime has an available provider.
- When either dispatcher is absent, the existing `waiting` behavior remains unchanged; no implicit model/provider call or default autonomous execution was added. Proposal acceptance remains a separate human approval/Work Request boundary.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/ai-team/contracts.ts`, `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `tests/iseol-runtime-services.test.ts`, and `docs/superpowers/plans/2026-09-28-ai-team-runtime-dispatcher-injection.md`. Focused composed Runtime coverage passed `36/36`; `npm.cmd run test:iseol-user-product` passed `295/295`; `npm.cmd test` passed `670/670`; both builds passed; full isolated browser E2E passed AI Team proposal/discussion Runtime and approval journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: this is explicit dependency injection and process-local gate evidence only. Live operational Runtime ownership/throughput, Ollama/model availability, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, stale lock, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: Project Workspace diff-aware and binary-safe preview

- Project Workspace file preview is **B — owner/team-scoped, bounded, read-only, diff-aware for unified patches, binary-safe, and isolated-browser verified**. `src/project-model/workspace-files.ts` preserves the existing path/ACL/size boundaries, classifies valid bounded unified diffs into hunk lines and addition/deletion statistics, and returns an explicit binary blocker for NUL-containing files without exposing bytes.
- `user-ui/src/pages/Projects.tsx` renders unified diff hunks with old/new line numbers, context/addition/deletion markers, accessible labels, statistics, and an explicit read-only state. Normal text previews remain unchanged; no apply, edit, stage, commit, revert, download, or execution control is added.
- Evidence: `src/project-model/workspace-files.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Projects.tsx`, `tests/user-project-execution.test.ts`, `tests/user-ui-project-lifecycle-contract.test.ts`, `tests/user-ui-project-runtime-browser-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused project service/API/UI checks passed `41/41`; user-product `295/295`; root `670/670` after the Runtime injection unit; both builds passed; full isolated browser E2E passed the real Local Agent `change.patch` flow, `image.bin` binary-blocker rendering, all existing two-account/reload journeys, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Remaining boundary: diff parsing intentionally supports bounded unified-diff display only; it does not apply or validate a patch. Operational Runtime ownership/throughput, Ollama/model generation, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: explicit personal-memory team sharing

- Personal memory sharing is **B — explicit owner-controlled scope, durable, active-membership ACL, UI/API, AI-context, and isolated two-account browser verified**. `MemoryRecord.sharedTeamIds` defaults empty; legacy records normalize private-only. `src/memory/service.ts` validates owner active membership before adding a team, returns only shared records to active human members, and rechecks membership on every read. Team leave/removal and owner unshare immediately revoke access without copying memory data.
- Follow-up ACL hardening validates every team in the requested replacement scope, not only newly added teams. An owner who has left a selected team cannot re-save that stale scope through the API.
- `/api/user/memory/:id/sharing` and `/api/user/memory/shared?teamId=` are authenticated. `MemoryVault.tsx` adds team checkboxes/save and a read-only received-memory section; Personal AI adds shared-memory documents only under selected team context and `aiAccess.teamDocs`, preserving private memory and private study submissions.
- Evidence: `src/memory/contracts.ts`, `src/memory/store.ts`, `src/memory/service.ts`, `src/personal-world/router.ts`, `src/ai-chat/service.ts`, `user-ui/src/pages/MemoryVault.tsx`, `tests/personal-memory-sharing.test.ts`, `tests/user-ui-memory-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused coverage passed `19/19` after ACL hardening; product regression `288/288`; root regression `668/668`; both builds passed; focused and full isolated browser E2E passed.
- Boundary: team-shared memory is not public portfolio/community content; no outsider access is granted; no external AI/model call was made. Live operational Runtime ownership, stale lock PID `55000`, UNKNOWN records, external connectors, final approved art, deployment/push, and deferred AI Broadcast Room remain unchanged.

## 2026-09-28 continuation: learning Runtime per-user dispatch concurrency

- Learning local dispatcher concurrency is **B — same-user FIFO serialization and different-user concurrency implemented and verified at the composed service boundary**. `src/learning/service.ts` now gates plan, lesson-content, learning-action, feedback, and dispute re-evaluation dispatches by authenticated user ID. A user’s queued requests execute in arrival order; different users do not share the gate.
- The gate preserves existing owner-bound durable requests, callbacks, pending states, and idempotency behavior. It is intentionally an in-process service-instance boundary, not evidence of cross-process or operational Runtime scheduling throughput.
- Evidence: `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`, `tests/learning-content-request.test.ts`, `tests/learning-feedback-evaluator.test.ts`, `tests/learning-feedback-reevaluation.test.ts`, `tests/learning-plan-preview.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Focused learning coverage passed `16/16`; product regression `288/288`; root regression `668/668`; both builds passed; full isolated browser E2E passed learning flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: no external model/provider call was made and no operational Runtime/Agent state was changed. Stale PID `55000`, live Runtime PID `1708`, Desktop Agent PID `22416`, UNKNOWN records, external connectors, final approved art, deployment/push, weekly digest specification gap, and deferred AI Broadcast Room remain unchanged.

## 2026-09-28 continuation: Personal AI Runtime per-user dispatch concurrency

- Personal AI local Runtime dispatch concurrency is **B — same-user FIFO serialization and different-user concurrency implemented and verified at the composed service boundary**. `src/ai-chat/service.ts` now gates only `runtimeDispatcher` calls by authenticated user ID. A user’s pending messages are persisted before dispatch, queued calls execute in order, and different users do not share the gate.
- Existing private context assembly, owner-bound async `complete` callbacks, accepted/waiting states, assistant response persistence, notifications, attachments, and execution-plan approval remain unchanged. The gate is intentionally in-process and does not claim cross-process or operational Runtime scheduling throughput.
- Evidence: `src/ai-chat/service.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, the AI Chat attachment/context/execution-plan/local-runtime suites, and `scripts/iseol-user-ui-e2e.ts`. Focused AI Chat/runtime/UI coverage passed `40/40`; product regression `292/292`; root regression `668/668`; both builds passed; full isolated browser E2E passed private AI, Runtime, attachment, context, execution-plan, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: no external model/provider call was made and no operational Runtime/Agent state was changed. Stale PID `55000`, live Runtime PID `1708`, Desktop Agent PID `22416`, UNKNOWN records, external connectors, final approved art, deployment/push, weekly digest specification gap, and deferred AI Broadcast Room remain unchanged.

## 2026-09-28 continuation: shared Personal AI/Learning Runtime dispatch gate

- Cross-domain local Runtime concurrency is **B — one shared in-process per-user FIFO gate is injected into the composed Runtime and isolated browser server**. `src/runtime/user-runtime-dispatch-gate.ts` serializes same-user Personal AI and learning dispatcher calls together while preserving concurrency between different users. Direct service construction keeps a private default gate for backward-compatible isolation.
- `src/runtime/iseol-runtime-services.ts` and `scripts/iseol-user-ui-isolated-server.ts` create one gate and inject it into both `createLearningService` and `createAiChatService`. Messages and learning actions remain durably recorded before waiting for the gate; accepted/waiting responses and owner-bound completion callbacks remain unchanged.
- Evidence: `src/runtime/user-runtime-dispatch-gate.ts`, `src/ai-chat/contracts.ts`, `src/ai-chat/service.ts`, `src/learning/contracts.ts`, `src/learning/service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/iseol-runtime-services.test.ts`, and `scripts/iseol-user-ui-e2e.ts`. Cross-domain and AI Runtime focused coverage passed; composed Runtime coverage `35/35`; product regression `293/293`; root regression `669/669`; both builds passed; full isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: this is process-local composition evidence, not a claim about cross-process operational Runtime scheduling. Live Runtime PID `1708`, Desktop Agent PID `22416`, stale lock PID `55000`, UNKNOWN records, external providers/connectors, final approved art, deployment/push, weekly digest specification gap, and deferred AI Broadcast Room remain unchanged.

## 2026-09-28 continuation: AI Team proposal/discussion shared Runtime gate

- AI Team local Runtime dispatch concurrency is **B — proposal and technical-discussion dispatches accept the shared per-user FIFO gate, preserve different-user concurrency, and remain bounded by existing team ACL/capability checks**. `src/ai-team/service.ts` and `src/ai-team/discussion-service.ts` gate only the dispatcher call; waiting/proposed/completed persistence, request idempotency, activity provenance, and human proposal acceptance remain unchanged.
- `src/runtime/iseol-runtime-services.ts` and `scripts/iseol-user-ui-isolated-server.ts` inject the same gate already used by Personal AI and learning. No AI proposal acceptance automatically starts a Run, and no discussion creates work.
- Evidence: `src/runtime/user-runtime-dispatch-gate.ts`, `src/ai-team/contracts.ts`, `src/ai-team/service.ts`, `src/ai-team/discussion-service.ts`, `src/runtime/iseol-runtime-services.ts`, `scripts/iseol-user-ui-isolated-server.ts`, `tests/ai-team-proposals.test.ts`, `tests/ai-team-discussion.test.ts`, API/UI contract tests, and `scripts/iseol-user-ui-e2e.ts`. Focused AI team coverage passed `9/9`; product regression `294/294`; root regression `669/669`; both builds passed; full isolated browser E2E passed AI team permissions/proposal/discussion flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: this remains process-local composition evidence, not live operational Runtime throughput. Runtime PID `1708`, Desktop Agent PID `22416`, stale lock PID `55000`, UNKNOWN records, external providers/connectors, final approved art, deployment/push, weekly digest specification gap, and deferred AI Broadcast Room remain unchanged.

## 2026-09-28 continuation: durable Control Plane event replay

- Status: **A for the bounded local authenticated Control Plane SSE boundary**. `WebProductEventBus` optionally writes one bounded event record atomically under an explicit journal root, reloads it after a bus restart, and returns only records after a known `Last-Event-ID`. Unknown or malformed cursors/records fail closed to an empty replay; callers without a journal root retain the existing live-only behavior.
- `/api/events` authenticates before opening the stream, subscribes before reading replay history, emits whether replay was requested, buffers live events while replay is read, deduplicates the replay/live race by event id, and remains live if journal reading fails. The existing Control Plane browser script retains the last received event id in memory and sends it on reconnect; it does not persist bearer credentials or event payloads in the journal cursor.
- Evidence: `src/web-control-plane/event-bus.ts`, `src/web-control-plane/server.ts`, `web/app.js`, `tests/web-control-plane-server.test.ts`, and `tests/web-control-plane-static.test.ts`. Focused Control Plane server/static checks passed `15/15`; root TypeScript build, product regression `288/288`, root regression `668/668`, approved UI build, and full isolated browser E2E passed. The browser result included two-account isolation, all existing product journeys, and responsive `[390,768,1024,1440]` across `13` routes.
- The journal is enabled for a server with an explicit `eventJournalRoot`, or by deriving `web-events` below the configured `platformRoot`; tests use temporary roots. This is not evidence that the currently running operational Runtime PID `1708` was restarted or backfilled. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, external providers/connectors, final approved design originals, and deferred AI Broadcast Room artifacts remain untouched.

## 2026-09-28 continuation: durable user notification SSE replay

- User notification stream replay is **A for the local authenticated product boundary**. `src/notifications/store.ts` persists owner-scoped `NotificationStreamEvent` records beside notification data; `src/notifications/service.ts` records each durable `created`/`read` transition once and exposes cursor-filtered replay. Event bodies contain only bounded stream identity/change fields, never notification title, body, or private source data.
- `src/web-control-plane/server.ts` authenticates before reading `Last-Event-ID`, subscribes before replay, buffers live events during asynchronous journal reads, and de-duplicates a live event that is also returned by replay. `user-ui/src/api/userApi.ts` carries the last received event id on reconnect without storing credentials or notification payloads in browser storage.
- Evidence: `src/notifications/contracts.ts`, `src/notifications/store.ts`, `src/notifications/service.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-stream.test.ts`, and `tests/user-ui-notifications-contract.test.ts`.
- Verification: focused notification/service/stream/UI checks `13/13`; `npm.cmd run test:iseol-user-product` `288/288`; `npm.cmd test` `666/666`; `npm.cmd run build` and approved user UI build passed; focused `growth-notifications` and full isolated browser E2E passed with `liveUserNotificationStream: "passed"`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes; `git diff --check` passed.
- Boundary: replay is bounded by the retained per-user local journal and an unknown cursor intentionally produces no fabricated history; REST remains the canonical snapshot. No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: community moderation report intake

- Community moderation intake is **B — authenticated, target-bound, durable, idempotent, private, and isolated two-account browser verified**. An authenticated user can report a published post or comment with a bounded reason. The service resolves the target author from persisted Community data, rejects self-reports and mismatched/foreign targets, and reuses the same open report for repeated submissions by the same reporter and target.
- Reports are stored separately below the Community root and are not included in public post/comment reads. The approved Community surface reuses its existing compact action pattern, displays `게시글 신고`/`댓글 신고`, and shows `신고가 저장되었습니다.` without hiding or changing the reported content. This unit intentionally provides intake only; it does not invent an operator moderation queue, resolution workflow, or external moderation integration.
- Report drafts and busy state are keyed by target type and target id, so a post report and multiple comment reports do not overwrite one another in the same browser session.
- Evidence: `src/community/contracts.ts`, `src/community/store.ts`, `src/community/service.ts`, `src/community/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Community.tsx`, `tests/community-flow.test.ts`, `tests/user-ui-community-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused service/UI checks `9/9`; `npm.cmd run test:iseol-user-product` `287/287`; `npm.cmd test` `666/666`; `npm.cmd run build` and approved user UI build passed; focused browser reported `communityModerationUi: "passed"`; full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- Safety boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: timezone-aware learning review scheduling

- Learning review rescheduling is **B — owner-scoped, durable, local-calendar aware, and isolated-browser regression verified**. `src/learning/service.ts` now preserves the learner's local wall-clock time when advancing `ReviewItem.dueAt` by an interval, including spring-forward and fall-back daylight-saving transitions. Principals without timezone metadata retain the existing deterministic UTC-24-hour fallback.
- Existing interval policy, owner ACL, durable review persistence, verified `learning.review.completed` ActivityEvent, and UI review controls are unchanged. The change corrects only the conversion from a completed review timestamp to the next due timestamp.
- Evidence: `src/learning/service.ts`, `tests/learning-review-flow.test.ts`, `docs/ISEOL_LEARNING_SPEC.md`, and `docs/superpowers/plans/2026-09-28-learning-review-timezone.md`.
- Verification: focused learning review coverage passed `4/4` with literal New York spring-forward/fall-back fixtures; `npm.cmd run test:iseol-user-product` passed `301/301`; `npm.cmd test` passed `675/675`; both builds passed; full isolated browser E2E passed `learningReviewScheduling`, all existing user journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes; `git diff --check` returned exit `0`.
- Boundary: no Ollama or external provider was contacted, no operational Runtime/Agent process or durable record was changed, and AI Broadcast Room remains deferred. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, external connectors, final approved art sources, deployment/push state, and design decisions remain untouched.

## 2026-09-28 continuation: account-timezone My World mission dates

- My World daily mission recording is **B — account-timezone aware, owner-scoped, date-idempotent, and isolated-browser verified**. `user-ui/src/domain/worldState.ts` now derives `YYYY-MM-DD` with the authenticated user's persisted timezone instead of using a UTC date string. Browser-timezone fallback remains available while the profile is loading or legacy data is incomplete.
- `user-ui/src/store/userStore.ts` carries the platform user's timezone into the authenticated profile, `user-ui/src/api/userApi.ts` uses it when creating the existing `world.mission.completed` activity identity, and `user-ui/src/pages/MyWorld.tsx` passes the profile timezone. The event remains a user-attributed, unverified self-report and does not create XP or verified evidence.
- Evidence: `user-ui/src/domain/worldState.ts`, `user-ui/src/store/userStore.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/MyWorld.tsx`, `tests/user-world-mission-timezone.test.ts`, `tests/user-ui-world-state-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: fixed UTC-boundary/DST focused tests plus existing World Mission contracts passed `7/7`; `npm.cmd run test:iseol-user-product` passed `304/304`; `npm.cmd test` passed `675/675`; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed `worldMissionCompletionUi`, all existing journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes; `git diff --check` returned exit `0`.
- Boundary: this improves local calendar identity only; it does not verify external notifications, live Ollama/model generation, operational Runtime throughput, final approved art originals, weekly digest production, external connectors, deployment, push, UNKNOWN replay, or AI Broadcast Room. Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

## 2026-09-28 continuation: learning coding-attempt activity provenance

- Coding-learning answer submission provenance is **B — owner-scoped, durable, idempotent, activity-linked, and regression/browser verified**. `src/learning/service.ts` now records one `learning.coding.attempt.submitted` ActivityEvent after the final durable answer/verifier state. Repeated submissions reuse the same event identity, and older attempts can be backfilled through the idempotent path.
- The event contains only bounded exercise id, language, practice status, and executor identity. It is `actorType=user` and `verificationStatus=unverified`, so a saved answer contributes a truthful practice record but cannot grant Growth/XP or become a verified correctness/mastery claim. `environment-required` and syntax-only verifier boundaries remain unchanged. The existing Activity Timeline maps this event to `코딩 연습 답안 제출` while retaining the raw source identity and `미검증` state.
- Evidence: `src/learning/service.ts`, `tests/learning-coding-test.test.ts`, `src/activity/service.ts`, `src/growth/read-model.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `tests/user-ui-activity-contract.test.ts`, `src/runtime/iseol-runtime-services.ts`, and `scripts/iseol-user-ui-isolated-server.ts`. Focused learning/coding/activity coverage passed `9/9`; Activity Timeline UI contract passed `1/1`; user-product regression passed `305/305`; root regression passed `675/675`; both builds passed; full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Remaining coding boundary: no general code-test execution or correctness evaluator is claimed. The approved local JavaScript syntax verifier remains syntax-only; non-JavaScript and unavailable execution remain explicitly waiting. Live operational Runtime throughput, local model availability, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred.
- Safety boundary: no operational Runtime/Agent restart, stale-lock change, UNKNOWN replay, external AI/provider request, deployment, push, data deletion, or approved-design change occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, and stale PID `55000` remained untouched.

## 2026-09-28 continuation: Learning report unverified-detail projection

- The Learning report card now expands each durable `unverifiedOutcomes` entry into a visible `미검증 기록 상세` list with its bounded label and evidence-reference count. This makes coding practice status inspectable instead of presenting only an aggregate number.
- No record is reclassified: verified outcomes, portfolio eligibility, mastery, XP, and correctness claims remain unchanged. The UI reads the existing owner-scoped report response only.
- Evidence: `user-ui/src/pages/Learning.tsx`, `tests/user-ui-learning-report-contract.test.ts`, `src/learning/service.ts`, and `tests/learning-report.test.ts`.
- Verification: focused report/API/UI coverage `4/4`; user-product regression `308/308`; approved user UI build passed; full isolated browser E2E passed `learningReportUi`, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: no correctness evaluator, hidden tests, external provider, operational Runtime change, UNKNOWN replay, design-source change, deployment, push, data deletion, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: coding practice in Learning progress and reports

- Learning progress/report projection is **B — owner/session/date-scoped, durable, and evidence-separated**. `LearningProgress.actual.codingAttempts` now counts coding attempts separately from legacy question attempts, while `LearningReport.unverifiedOutcomes` includes coding attempts belonging to the report's goal sessions and local-calendar period.
- Environment-required, syntax-only, and syntax-invalid coding practice remains explicitly unverified. These records cannot become verified outcomes, mastery, XP, or portfolio evidence; existing verified study-attempt and evaluator boundaries are unchanged. The approved Learning UI now labels the report aggregate as `미검증 기록` instead of incorrectly describing every item as a self-report.
- Evidence: `src/learning/contracts.ts`, `src/learning/service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-progress.test.ts`, `tests/learning-report.test.ts`, `tests/user-ui-learning-report-contract.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-coding-report-evidence.md`.
- Verification: focused learning/API/UI coverage `20/20`; `npm.cmd run test:iseol-user-product` `308/308`; `npm.cmd test` `675/675`; both builds passed with only existing Vite warnings; full isolated browser E2E passed all learning journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Remaining boundary: this unit does not implement correctness execution, hidden tests, verified coding mastery, XP projection from coding feedback, live Ollama/model quality, operational Runtime ownership, external connectors, final approved art originals, weekly digest production, or AI Broadcast Room. No operational process, UNKNOWN record, external provider, deployment, push, data deletion, or approved-design source changed.

## 2026-09-28 continuation: Learning syntax-only evidence boundary

- Learning feedback verification is **B — owner-bound, evidence-aware, and regression/browser verified** for the current local verifier boundary. `src/learning/service.ts` no longer allows `local-syntax-verifier` evidence to promote evaluator feedback to `verified`; a syntax receipt can support a durable answer/evidence link but not correctness or mastery.
- The guard preserves `tentative` feedback with an explicit correctness-verifier blocker when an evaluator requests `verified` without correctness evidence. Existing `environment-required` behavior, artifact linkage, evaluator callbacks, dispute/re-evaluation history, ownership, and UI states remain unchanged. No correctness executor was invented.
- Evidence: `src/learning/service.ts`, `tests/learning-feedback-evaluator.test.ts`, `tests/learning-feedback-dispute.test.ts`, `tests/learning-feedback-reevaluation.test.ts`, `tests/learning-actions-answers.test.ts`, `tests/learning-coding-test-api.test.ts`, `tests/user-ui-coding-test-contract.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-syntax-evidence-boundary.md`.
- Verification: feedback regression `5/5`; learning/coding/action/API/UI focus `21/21`; `npm.cmd run test:iseol-user-product` `307/307`; `npm.cmd test` `675/675`; root and approved user UI builds passed with only existing Vite warnings; focused Project Runtime browser journey passed; fresh full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: this unit does not implement hidden tests, general code execution, correctness evaluation, verified mastery, XP projection, live model quality, or operational Runtime throughput. No operational process, stale lock, UNKNOWN record, external provider, connector, deployment, push, data deletion, approved-design source, or AI Broadcast Room artifact changed.

## 2026-09-28 continuation: coding practice count in Learning progress UI

- The approved Learning progress view now visibly projects the durable `LearningProgress.actual.codingAttempts` count as `코딩 실습 N건`. This keeps coding practice discoverable beside legacy study attempts without presenting it as a correctness, mastery, XP, or portfolio claim.
- The UI contract remains additive and owner-scoped through the existing progress API. Existing evidence labels, pending evaluation state, and the explicit no-fabricated-mastery copy remain unchanged.
- Evidence: `user-ui/src/pages/Learning.tsx`, `tests/user-ui-learning-progress-contract.test.ts`, `src/learning/contracts.ts`, `src/learning/service.ts`, and `user-ui/src/api/userApi.ts`.
- Verification: focused Learning progress/report/API/UI coverage `8/8` passed after a RED contract failure and GREEN implementation.
- Verification: `npm.cmd run test:iseol-user-product` passed `308/308`; `npm.cmd test` passed `675/675` in a clean serial run; `npm.cmd run build` and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed all journeys, including `learningProgressEvidence`, `learningReportUi`, coding exercise persistence, syntax verifier, pending evaluation, feedback dispute, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes. The first concurrent all-suite run had two unrelated Desktop Agent timing failures; the focused file and clean serial root run both passed.
- Boundary: no operational Runtime/Agent restart, UNKNOWN replay, external provider request, design-source change, deployment, push, data deletion, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: Learning Answer verifier-artifact linkage

- Coding-learning evidence linkage is **B — owner-bound, durable, API/UI integrated, idempotent, and isolated-browser verified**. `submitLearningAnswer` now derives bounded artifact references from the authenticated user's persisted `CodingAttempt.practiceResult` and merges them with optional user-provided file references. The Learning UI passes the attempt refs, and the server remains authoritative.
- A syntax verifier receipt such as `coding-syntax:<attemptId>` now survives into `LearningAnswerReceipt.artifactRefs`, allowing the existing evaluator validation to see actual practice evidence. Legacy receipts missing refs are repaired on an idempotent repeat; answer text, attempt identity, feedback status, and verification boundaries remain unchanged. `environment-required` still produces no verifier artifact and remains evaluation-pending.
- Evidence: `src/learning/service.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-actions-answers.test.ts`, `tests/learning-actions-answers-api.test.ts`, `tests/learning-coding-test-api.test.ts`, and `tests/user-ui-coding-test-contract.test.ts`. Focused learning/action/coding/verifier/UI coverage passed `15/15`; user-product regression passed `306/306`; root regression passed `675/675`; both builds passed; full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Remaining boundary: verifier output remains syntax-only today; no general hidden tests, safe code-test execution, correctness evaluator, verified mastery, or XP projection is claimed. Local model availability, live operational Runtime throughput, external connectors, final approved art originals, weekly digest production, and AI Broadcast Room remain unverified/unavailable or deferred.
- Safety boundary: no operational Runtime/Agent restart, stale-lock change, UNKNOWN replay, external AI/provider request, deployment, push, data deletion, or approved-design change occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, and stale PID `55000` remained untouched.

## 2026-09-28 continuation: authenticated Markdown activity export surface

- Activity export UI is now **B — owner-scoped JSON/Markdown download surface, API-backed, and isolated-browser verified**. The existing 개인정보 > 데이터 관리 section exposes the already-supported Markdown format alongside JSON; both buttons call the authenticated `exportActivity(format)` API and use the server-provided filename/content.
- The JSON button preserves its existing behavior and status copy. The Markdown button downloads `iseol-activity-export.md` and reports a separate completion message. No activity records are transformed, reclassified, or copied into a new store; the existing owner-scoped API remains authoritative.
- Evidence: `user-ui/src/pages/Settings.tsx`, `user-ui/src/api/userApi.ts`, `src/growth/router.ts`, `tests/user-ui-settings-contract.test.ts`, `tests/activity-export-api.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused export/settings checks `2/2`; `npm.cmd run test:iseol-user-product` `308/308`; `npm.cmd run user-ui:build` passed with only existing Vite warnings; full isolated browser E2E passed `activityExportDownload`, including JSON parsing (`events` array) and Markdown heading/content checks, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remain untouched.

## 2026-09-28 continuation: user-scoped integration consent and delivery ledger

- Calendar, GitHub, and Discord consent/status is **B — owner-scoped, durable, fail-closed, and isolated-browser verified**. `UserSettings.integrations` defaults to opt-out and persists each provider independently. `GET /api/user/integrations` reports consent, configured-adapter truth, and the last durable delivery state without claiming a live connection.
- `src/integrations/service.ts` persists one bounded delivery identity per authenticated user/provider/source/event/version. Explicitly injected adapters may deliver once; disabled consent, missing adapters, and adapter exceptions become durable `blocked`, `not-configured`, or `unknown` states and are not silently retried. No credentials or raw provider response is stored.
- `user-ui/src/pages/Settings.tsx` exposes the existing Calendar/GitHub/Discord cards with explicit `외부 전달 동의` controls and `연동 API 미연결` when no adapter is configured. This adds no OAuth, external call, disconnect action, or design-system replacement.
- Evidence: `src/integrations/contracts.ts`, `src/integrations/store.ts`, `src/integrations/service.ts`, `src/integrations/router.ts`, `src/settings/service.ts`, `src/runtime/iseol-runtime-services.ts`, `src/web-control-plane/server.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Settings.tsx`, `tests/integrations-delivery.test.ts`, `tests/integrations-api.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: focused integration/settings/UI checks passed `12/12`; `npx.cmd tsc -p user-ui/tsconfig.json --noEmit`, `npm.cmd run build`, and `npm.cmd run user-ui:build` passed; full isolated browser E2E passed `integrationConsentPersistenceIsolation`, all existing journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: live Calendar/GitHub/Discord authorization or delivery remains unverified and intentionally unconfigured. Operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, final approved art sources, deployment/push state, external AI calls, and deferred AI Broadcast Room artifacts remain untouched.

## 2026-09-28 continuation: portfolio actor provenance labels

- The active Portfolio and public Portfolio screens now translate persisted `user`/`ai`/`system` actor values into explicit Korean labels: `사용자 기여`, `AI 기여`, and `시스템 기록`. This improves the product requirement that human, AI, and system contributions remain distinguishable without changing the underlying evidence or public visibility rules.
- Evidence: `user-ui/src/domain/provenance.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `user-ui/src/pages/PublicPortfolio.tsx`, and `tests/user-ui-portfolio-contract.test.ts`. The user UI baseline and isolated server were recorded in commit `6f3935f` (`feat: add owner-scoped NPC user UI`).
- Verification: portfolio contract checks passed `6/6` before the full product run; `npm.cmd run test:iseol-user-product` passed `309/309`; `npm.cmd run user-ui:build` passed with only existing Vite warnings; isolated browser E2E passed all journeys, including public portfolio export/share, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: this is a presentation/provenance-label improvement only. No evidence was reclassified, no XP/mastery claim was added, and no operational Runtime/Agent restart, UNKNOWN replay, external provider/connector request, deployment, push, data deletion, approved-design source change, or AI Broadcast Room implementation occurred.

## 2026-09-28 continuation: portfolio export content verification

- Portfolio export browser coverage is now **A for the local authenticated UI path**. The existing Portfolio screen's JSON download is parsed and required to contain the durable entry plus `entries`/`evidence` collections; the Markdown download is read and required to contain the portfolio heading, entry title, and saved summary.
- The public portfolio route, public-link fallback, two-account isolation, and responsive matrix remain unchanged. This closes only the local browser content-verification gap; it does not claim hosting, deployment, or external sharing delivery.
- Evidence: `scripts/iseol-user-ui-e2e.ts`, `user-ui/src/pages/PortfolioScreen.tsx`, `user-ui/src/api/userApi.ts`, `src/portfolio/router.ts`, `src/portfolio/service.ts`, and `tests/user-ui-portfolio-contract.test.ts`.
- Verification: portfolio API/UI journey checks `6/6`; root TypeScript check passed; full isolated browser E2E passed `publicPortfolioRouteAndJsonExport` with JSON and Markdown content assertions, `publicPortfolioShareControl`, all other journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: no operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, external connector mutation, deployment, push, data deletion, approved-design change, weekly digest implementation, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, durable operational data, final approved art sources, and deferred broadcast artifacts remain untouched.

## 2026-09-28 continuation: integration delivery concurrency boundary

- Integration delivery is **B — owner-scoped, durable, idempotent, and concurrency-serialized for the local adapter boundary**. `IntegrationDeliveryService` now queues same-identity `enqueue`/`dispatch` operations behind an in-process owner+delivery lock, preventing concurrent duplicate provider adapter calls while retaining the durable delivery identity and bounded terminal outcomes.
- Evidence: `src/integrations/service.ts`, `tests/integrations-delivery.test.ts`, `tests/integrations-api.test.ts`, `tests/settings-api.test.ts`, `tests/settings-isolation.test.ts`, `tests/user-ui-integrations-contract.test.ts`, and `scripts/iseol-user-ui-e2e.ts`.
- Verification: RED reproduced two concurrent adapter calls; GREEN integration delivery `7/7`, combined integration/API/settings/UI `13/13`, full user product `309/309`, root regression `676/676`, UI build, and isolated browser E2E all passed. Browser coverage includes two-account consent isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: live Calendar/GitHub/Discord authorization and external delivery are still intentionally unconfigured and unverified. This unit does not claim cross-process locking or provider-side exactly-once guarantees; those require a shared durable coordination mechanism and provider receipt semantics before live delivery is enabled.
- Safety: Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, final approved art sources, deployment/push state, external AI calls, and deferred AI Broadcast Room artifacts remain untouched. Commit: `43cbec9 fix: serialize integration delivery attempts`.

## 2026-09-28 continuation: composed user integration adapter boundary

- Runtime composition is **B — explicit adapter injection, owner-scoped delivery, truthful provider readiness, and full regression/browser verified**. `IseolRuntimeInput.integrationAdapters` accepts only explicitly supplied Calendar/GitHub/Discord adapters; the composed service forwards them to `IntegrationDeliveryService`, and the Control Plane receives the corresponding configured-provider list.
- Evidence: `src/runtime/iseol-runtime-services.ts`, `src/integrations/contracts.ts`, `src/integrations/service.ts`, `src/web-control-plane/server.ts`, and `tests/iseol-runtime-services.test.ts`.
- Verification: RED reproduced missing provider readiness and delivery at the composition boundary; GREEN focused composition/integration/settings/UI checks `51/51`; user-product `309/309`; root `677/677`; UI build; and isolated browser E2E all passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: the default Runtime still has no live adapters, and live OAuth/provider delivery remains intentionally unconfigured. The explicit injection path does not claim cross-process locking or provider-side exactly-once semantics. Commit: `39cef53 feat: wire explicit user integration adapters`.

## 2026-09-28 continuation: user notification idempotency boundary

- Notification creation is **B — owner-scoped, durable, idempotent, and process-local concurrency-serialized**. `src/notifications/service.ts` now gates each producer’s load/save/publish sequence by authenticated user and source identity; concurrent duplicate direct/team/community/AI/invite/achievement calls converge on one durable record and one stream event. Read transitions use the same notification identity gate.
- Evidence: `src/notifications/service.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-stream.test.ts`, `tests/user-notifications-api.test.ts`, `tests/user-ui-notifications-contract.test.ts`.
- Verification: focused notification/API/SSE/UI `15/15`; TypeScript/root build/user UI build; root regression `678/678`; isolated browser E2E all passed. The full user-product regression was `309/312` because three pre-existing Learning Session Revision expectation tests remain out of sync with the current revision behavior.
- Remaining boundary: no cross-process distributed lock, external push/provider delivery, weekly digest scheduler (specification gap), or AI Broadcast Room implementation is claimed. Existing Runtime/Agent/UNKNOWN/connector/design safety boundaries remain unchanged.

## 2026-09-28 continuation: Learning Session revision CAS

- Learning sessions are **B — owner-scoped, durable, revision-bound, and browser verified**. `LearningSession.revision` advances on durable session mutations; resume/completion can require the current revision, stale writes fail closed, and concurrent completion produces one terminal transition and one activity event.
- Evidence: `src/learning/contracts.ts`, `src/learning/store.ts`, `src/learning/service.ts`, `src/learning/router.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/Learning.tsx`, `tests/learning-session-completion.test.ts`, `tests/learning-api.test.ts`, and the Learning UI contract tests.
- Verification: focused Learning Session `8/8`; user-product `313/313`; root regression `678/678`; TypeScript checks and both builds; isolated browser E2E all passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Remaining boundary: the mutation tail is process-local and does not claim distributed cross-process exactly-once behavior. Content generation, correctness evaluation, mastery, XP, external connectors, weekly digest scheduling, and AI Broadcast Room remain bounded/deferred under their existing specifications. Commits: `49bbfff`, `acd5560`.

## 2026-09-28 continuation: durable cross-instance learning session CAS

- Learning session mutation safety is now **B — owner-scoped, durable, cross-service-instance serialized, API/UI propagated, and isolated-browser verified**. The existing in-process promise tail remains, and `src/learning/session-lock.ts` adds an exact owner/session filesystem lock below the learning data root before resume/completion reads and writes.
- A competing service instance receives the existing bounded `Learning session revision conflict` rather than overwriting the session. Lock metadata is bounded to version/PID/token/timestamp; normal and exceptional paths remove the exact lock in `finally`, while a dead owner PID can reclaim only that exact session lock. Active owner processes and malformed lock records fail closed.
- Evidence: `src/learning/session-lock.ts`, `src/learning/service.ts`, `tests/learning-session-completion.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-session-durable-cas-lock.md`.
- Verification: RED reproduced two concurrent completions across two service instances; GREEN learning coverage `69/69`, user-product regression `315/315`, serial root regression `678/678`, root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E all passed. Browser coverage included `learningSessionCompletion: "passed"`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: this is a same-host filesystem lock, not a distributed or cross-machine coordinator, and it does not claim provider-side exactly-once semantics. Content correctness, live Runtime throughput, external connectors, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain bounded/deferred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, and approved design artifacts remained untouched.

## 2026-09-28 continuation: learning content reservation boundary

- Status: **B — owner-scoped, durable, idempotent across same-host service instances, and browser-regression verified; local Runtime content generation remains B/C**. Content request reservation and completion use the session mutation tail plus an exact owner/session lock. A bounded wait is used only for idempotent content operations, and dispatch remains after reservation so a competing caller returns the existing request without a duplicate local Runtime dispatch.
- Evidence: `src/learning/session-lock.ts`, `src/learning/service.ts`, `tests/learning-content-request.test.ts`, and `docs/superpowers/plans/2026-09-28-learning-content-reservation-lock.md`.
- Verification: focused content `5/5`; user-product `318/318`; root `678/678`; root/user UI TypeScript checks; both builds; `git diff --check`; isolated browser E2E with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: same-host locking only; no cross-machine coordinator, provider-side exactly-once guarantee, content correctness evaluator, live throughput proof, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent, stale PID `55000`, UNKNOWN records, external providers, deployment/push state, and approved design assets remain untouched.

## 2026-09-28 continuation: project queue durable scheduling boundary

- Status: **B — owner-scoped, durable, same-host cross-service scheduler serialization, and browser-regression verified; live operational Runtime throughput remains B**. `src/project-model/schedule-lock.ts` adds an exact project schedule lock below the project model root. `scheduleProjectRuns` re-reads the project after acquiring it, so one queued Work Request yields one enqueue/Run identity while a waiting service returns `selected: 0` after the first transition.
- Evidence: `src/project-model/schedule-lock.ts`, `src/project-model/user-project-service.ts`, `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, `user-ui/src/pages/Projects.tsx`, and `docs/superpowers/plans/2026-09-28-project-scheduler-durable-lock.md`.
- Verification: focused user-project execution `19/19`; user-product `319/319`; root `678/678`; root/user UI TypeScript checks; both builds; `git diff --check`; isolated browser E2E with project Runtime execution, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: same-host/shared-root lock only; no cross-machine coordinator, provider-side exactly-once, live production Runtime throughput, automatic startup/recovery scheduling, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent, stale PID `55000`, UNKNOWN records, external providers, deployment/push state, and approved design assets remain untouched.

## 2026-09-28 continuation: Project Work Request idempotency boundary

- Status: **B — owner/project-scoped, durable, same-host cross-service idempotency, and browser-regression verified**. `src/project-model/work-request-lock.ts` hashes the bounded `idempotencyKey` into an exact project model lock path. `createProjectWorkRequest` performs dependency lookup, existing-key comparison, and first durable save under that lock, so concurrent callers converge on one Task/Work Request identity and conflicting payloads fail closed.
- Evidence: `src/project-model/work-request-lock.ts`, `src/project-model/work-request.ts`, `src/project-model/user-project-service.ts`, `tests/project-work-request.test.ts`, `tests/user-project-execution.test.ts`, and `docs/superpowers/plans/2026-09-28-project-work-request-idempotency-lock.md`.
- Verification: focused Project Work Request `14/14`; user-product `319/319`; root `680/680`; root/user UI TypeScript checks; backend build; `git diff --check`; isolated browser E2E with project Runtime execution, learning content/session completion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Remaining boundary: same-host/shared-root lock only; no database/cross-machine coordinator, provider-side exactly-once, live operational Runtime throughput, automatic execution, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent, stale PID `55000`, UNKNOWN records, external providers, deployment/push state, and approved design assets remain untouched.

## 2026-09-28 continuation: direct Project Run start serialization

- Project Run direct-start concurrency is **B — owner/project-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. The new exact lock path is below the configured project model root at `.locks/work-request-runs/<projectId>-<workRequestId>.lock`; the start flow re-reads the persisted Work Request after acquisition and preserves an existing non-terminal durable Run identity, including `waiting + runId` observations.
- Actual implementation: `src/project-model/work-request-lock.ts` adds bounded wait, active-owner preservation, exact dead-owner reclamation, and `finally` cleanup; `src/project-model/user-project-service.ts` wraps the authenticated `startProjectRun` flow; `tests/user-project-execution.test.ts` covers the cross-service race and one-enqueue/one-identity invariant.
- Verification evidence: focused execution `20/20`; user-product `320/320`; final serial root `680/680`; Idea Lab isolated rerun `4/4`; backend/user UI TypeScript, both builds, diff check, and isolated browser E2E passed. Browser matrix remains two-account isolation, reload persistence, responsive `[390,768,1024,1440]`, and `13` routes.
- Remaining boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, provider-side exactly-once receipt, live operational throughput, automatic scheduler startup, live external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety evidence: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, operational data, external providers, deployment/push state, and approved/deferred design artifacts were not modified. Documentation commit follows implementation commit `4106127`.

## 2026-09-28 continuation: Project Run lifecycle serialization

- Status: **B — owner/project-scoped, durable, same-host cross-service lifecycle serialization, and isolated-product verified; provider-side exactly-once and live operational Runtime throughput remain unverified**. One exact Work Request Run lock now covers `start`, `resume`, `pause`, and `retry`; the lifecycle services re-read durable state under that lock and preserve one Run identity across competing callers.
- Evidence: `src/project-model/work-request-lock.ts`, `src/project-model/user-project-service.ts`, and `tests/user-project-execution.test.ts`.
- Confirmed implementation verification: lifecycle-focused `3/3`, user-project execution `23/23`, user-product `321/321`, serial root regression `680/680`, backend/user UI TypeScript checks, backend/user UI builds, and full isolated browser E2E. Browser coverage includes all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes. An initial full E2E timeout was transient; the focused journey and immediate full rerun passed.
- Remaining boundary: no cross-machine/database coordinator, provider-side exactly-once receipt, automatic startup/recovery scheduling, live operational Runtime throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service recruitment application reviews

- Recruitment application accept/reject is **B — application-scoped, durable, same-host cross-service terminal review serialization, and isolated-browser verified**. `src/recruitment/review-lock.ts` and `src/recruitment/service.ts` share a durable review lock and re-read the application so concurrent manager decisions produce one terminal review and one explicit conflict.
- Evidence: `src/recruitment/review-lock.ts`, `src/recruitment/service.ts`, `tests/recruitment-flow.test.ts`.
- Verification: focused recruitment `3/3`; user-product `361/361`; root `682/682`; backend/user UI TypeScript, both builds, and sequential isolated browser E2E passed with recruitment application review, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `fe7c434 feat: serialize recruitment application reviews`.
- Boundary: same-host/shared-root coordination only; no distributed review coordinator, external invitation exactly-once delivery, live provider quality, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service AI Team proposal decisions

- AI Team proposal acceptance/rejection is **B — project/proposal-scoped, durable, same-host cross-service terminal decision serialization, and isolated-browser verified**. `src/ai-team/proposal-decision-lock.ts` and `src/ai-team/service.ts` share a durable decision lock and re-read the proposal so concurrent accept/reject calls produce one terminal decision and one explicit status conflict.
- Evidence: `src/ai-team/proposal-decision-lock.ts`, `src/ai-team/service.ts`, `tests/ai-team-proposals.test.ts`.
- Verification: focused AI Team proposals `4/4`; user-product `360/360`; root `682/682`; backend/user UI TypeScript, both builds, and sequential isolated browser E2E passed with AI Team proposal approval, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. The first browser run overlapped `user-ui:build`; the clean browser-only rerun passed. Commit: `90a8037 feat: serialize AI team proposal decisions`.
- Boundary: same-host/shared-root coordination only; no distributed proposal decision coordinator, live AI Team/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning feedback completions

- Learning feedback completion is **B — owner/feedback-scoped, durable, same-host cross-service compare-and-set, and isolated-browser verified**. `src/learning/feedback-completion-lock.ts` and `src/learning/service.ts` re-read feedback inside a durable lock so competing evaluations preserve the first persisted evaluation and later calls return the durable completed feedback.
- Evidence: `src/learning/feedback-completion-lock.ts`, `src/learning/service.ts`, `tests/learning-feedback-evaluator.test.ts`, and `tests/learning-feedback-reevaluation.test.ts`.
- Verification: focused Learning evaluator/re-evaluation `5/5`; user-product `359/359`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning feedback evaluation/dispute/re-evaluation, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `5b67ddc feat: serialize learning feedback completions`.
- Boundary: same-host/shared-root coordination only; no distributed evaluator coordinator, live evaluator/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning action completions

- Learning session action completion is **B — owner/action-scoped, durable, same-host cross-service compare-and-set, and isolated-browser verified**. `src/learning/action-lock.ts` and `src/learning/service.ts` re-read the action inside a durable lock so competing responses preserve the first persisted response and later different responses fail with an explicit completion conflict.
- Evidence: `src/learning/action-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`.
- Verification: focused Learning actions/answers `9/9`; user-product `358/358`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning action waiting/completion, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `b74ec6f feat: serialize learning action completions`.
- Boundary: same-host/shared-root coordination only; no distributed action coordinator, live Runtime/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning session actions

- Learning session action creation is **B — owner/session/action-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/action-lock.ts` serializes session re-read, action idempotency check, durable action save, and the optional injected Runtime boundary so concurrent submissions with one `actionId` return one action identity.
- Evidence: `src/learning/action-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`.
- Verification: focused Learning actions/answers `8/8`; user-product `357/357`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning action waiting, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `c24fe29 feat: serialize learning session actions`.
- Boundary: same-host/shared-root coordination only; no distributed action coordinator, live Runtime/provider quality or throughput, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning feedback disputes

- Learning feedback dispute creation is **B — owner/feedback-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/feedback-dispute-lock.ts` serializes feedback/answer re-read, existing-dispute check, dispute save, feedback/answer status changes, and optional injected re-evaluation boundary so concurrent same-reason disputes return one dispute identity.
- Evidence: `src/learning/feedback-dispute-lock.ts`, `src/learning/service.ts`, `tests/learning-feedback-dispute.test.ts`.
- Verification: focused Learning feedback dispute `2/2`; user-product `356/356`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning feedback dispute, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `94d6ec3 feat: serialize learning feedback disputes`.
- Boundary: same-host/shared-root coordination only; no distributed dispute coordinator, live evaluator/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: Windows-open-file project Run lock contention

- Project Run lifecycle lock handling is **B — bounded same-host contention handling and isolated-browser verified**. `src/project-model/work-request-lock.ts` recognizes Windows `EPERM` caused by an already-open exact lock file as bounded contention, while unrelated permission failures still fail closed.
- Evidence: `src/project-model/work-request-lock.ts`, `tests/user-project-execution.test.ts`.
- Verification: focused retry lock `1/1`; user-product `348/348`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed. Commit: `d351ce9 fix: tolerate Windows project run lock contention`.
- Boundary: local filesystem behavior only; distributed coordination, live Runtime/Agent throughput, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain unverified or untouched.

## 2026-09-28 continuation: durable cross-service Learning plan adjustment acceptance

- Learning plan adjustment acceptance is **B — owner/goal/adjustment-scoped, durable, same-host cross-service idempotent CAS acceptance, and isolated-browser verified**. `src/learning/plan-adjustment-acceptance-lock.ts` adds an exact hashed user/goal/adjustment lock; `src/learning/service.ts` now re-reads and commits one superseded base PlanVersion, one adjusted PlanVersion, one goal revision, and one accepted adjustment for concurrent accepts.
- Evidence: `src/learning/plan-adjustment-acceptance-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- Verification: focused Learning plan preview/adjustment `9/9`; user-product `348/348`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning plan preview/adjustment, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `39e8877 feat: serialize learning plan adjustment acceptance`.
- Boundary: same-host/shared-root coordination only; no distributed Learning acceptance coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning project application acceptance

- Learning project application acceptance is **B — owner/goal/proposal-scoped, durable, same-host cross-service idempotent acceptance, and isolated-browser verified**. `src/learning/project-application-acceptance-lock.ts` serializes proposal re-read, linked Work Request creation, accepted proposal save, learning link creation, and acceptance activity recording; an already accepted proposal returns without repeating side effects.
- Evidence: `src/learning/project-application-acceptance-lock.ts`, `src/learning/service.ts`, `tests/learning-project-application.test.ts`, and `tests/learning-project-application-api.test.ts`.
- Verification: focused Learning project application/API `5/5`; user-product `349/349`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning application UI, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `64f308f feat: serialize learning project application acceptance`.
- Boundary: same-host/shared-root coordination only; no distributed acceptance coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning report creation

- Learning report creation is **B — owner/goal/period-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/report-lock.ts` serializes the source-revision read, evidence aggregation, report save, and same-input re-read so concurrent requests converge on one report identity.
- Evidence: `src/learning/report-lock.ts`, `src/learning/service.ts`, `tests/learning-report.test.ts`, and `tests/learning-report-api.test.ts`.
- Verification: focused Learning report `3/3`; user-product `350/350`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning report UI, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `72478a5 feat: serialize learning report creation`.
- Boundary: same-host/shared-root coordination only; no distributed report coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning goal session starts

- Learning goal day session start is **B — owner/goal/plan/day-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/goal-session-lock.ts` serializes active-session re-read, plan activation, goal activation/revision, and session save; concurrent identical starts return one active session while stale revisions still fail when no matching session exists.
- Evidence: `src/learning/goal-session-lock.ts`, `src/learning/service.ts`, `tests/learning-goal-start.test.ts`, and `tests/learning-goal-start-api.test.ts`.
- Verification: focused Learning goal-start/API `4/4`; user-product `351/351`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning goal/day session, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `f07938f feat: serialize learning goal session starts`.
- Boundary: same-host/shared-root coordination only; no distributed session coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service legacy Learning session starts

- General Learning plan session start is **B — owner/plan-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/session-start-lock.ts` serializes active-session re-read and session save so one legacy plan cannot acquire two active sessions concurrently.
- Evidence: `src/learning/session-start-lock.ts`, `src/learning/service.ts`, `tests/learning-persistence.test.ts`.
- Verification: focused Learning persistence `4/4`; user-product `352/352`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning session persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `77496e3 feat: serialize legacy learning session starts`.
- Boundary: same-host/shared-root coordination only; no distributed session coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning review completions

- Learning review completion is **B — owner/review-item-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/learning/review-lock.ts` serializes item re-read, interval/review-count calculation, durable save, and verified activity recording so concurrent reviews preserve both transitions.
- Evidence: `src/learning/review-lock.ts`, `src/learning/service.ts`, `tests/learning-review-flow.test.ts`.
- Verification: focused Learning review/code-analysis `5/5`; user-product `353/353`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning review scheduling, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `111ca56 feat: serialize learning review completions`.
- Boundary: same-host/shared-root coordination only; no distributed review coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning coding attempt submissions

- Learning coding attempt submission is **B — owner/exercise/client-request-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/coding-attempt-lock.ts` serializes idempotency re-read, durable attempt save, optional injected verifier boundary, and activity receipt so one client request ID creates one attempt.
- Evidence: `src/learning/coding-attempt-lock.ts`, `src/learning/service.ts`, `tests/learning-coding-test.test.ts`.
- Verification: focused Learning coding `4/4`; user-product `354/354`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with coding exercise persistence/local verifier boundaries, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `6740986 feat: serialize learning coding attempt submissions`.
- Boundary: same-host/shared-root coordination only; no distributed coding submission coordinator, live external execution/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning answer submissions

- Learning answer submission is **B — owner/session/attempt-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/answer-lock.ts` serializes source re-read, artifact merge, answer receipt save, pending feedback save, and optional injected evaluator boundary so one session/attempt produces one answer receipt.
- Evidence: `src/learning/answer-lock.ts`, `src/learning/service.ts`, `tests/learning-actions-answers.test.ts`, and `tests/learning-actions-answers-api.test.ts`.
- Verification: focused Learning actions/answers `7/7`; user-product `355/355`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with answer evaluation-pending/artifact boundaries, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `aa0fad0 feat: serialize learning answer submissions`.
- Boundary: same-host/shared-root coordination only; no distributed answer coordinator, live evaluator/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning plan adjustments

- Learning plan adjustment drafts are **B — owner/goal/input-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/plan-adjustment-lock.ts` adds an exact hashed user/goal/input lock; `src/learning/service.ts` now re-checks and persists one proposed adjustment inside it, preserving one acceptance target for later CAS approval.
- Evidence: `src/learning/plan-adjustment-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- Verification: focused Learning plan preview/adjustment `8/8`; user-product `347/347`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning plan preview/adjustment, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed Learning adjustment coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning plan previews

- Learning plan preview creation is **B — owner/goal-scoped, durable, same-host cross-service idempotent with CAS preservation, and isolated-browser verified**. `src/learning/plan-preview-lock.ts` adds an exact hashed user/goal lock; `src/learning/service.ts` now serializes interpretation, PlanVersion, and goal revision writes while preserving stale expected-revision rejection for sequential requests.
- Evidence: `src/learning/plan-preview-lock.ts`, `src/learning/service.ts`, `tests/learning-plan-preview.test.ts`.
- Verification: focused Learning plan preview/API `8/8`; user-product `346/346`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning plan preview/adjustment, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed Learning plan coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service Learning project applications

- Learning project application creation is **B — owner/goal/project-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/learning/project-application-lock.ts` adds an exact hashed user/goal/project lock; `src/learning/service.ts` now re-checks and persists one proposed application inside it, preserving one approval path and one linked Work Request identity on later acceptance.
- Evidence: `src/learning/project-application-lock.ts`, `src/learning/service.ts`, `tests/learning-project-application.test.ts`.
- Verification: focused Learning project application/API `4/4`; user-product `345/345`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with Learning project application/approval coverage, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed Learning application coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service AI Team discussion requests

- AI Team discussion requests are **B — project/request-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/ai-team/discussion-lock.ts` adds an exact hashed project/request lock; `src/ai-team/discussion-service.ts` now performs the request lookup, local Runtime dispatch, discussion save, and activity receipt inside it, preserving one discussion identity and one dispatch for concurrent retries.
- Evidence: `src/ai-team/discussion-lock.ts`, `src/ai-team/discussion-service.ts`, `tests/ai-team-discussion.test.ts`.
- Verification: focused AI Team discussion `4/4`; user-product `344/344`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with AI discussion/approval coverage, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed AI Team discussion coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service AI Team proposal requests

- AI Team proposal requests are **B — project/request-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/ai-team/proposal-lock.ts` adds an exact hashed project/request lock; `src/ai-team/service.ts` now performs the request lookup, local Runtime dispatch, and proposal save inside it, preserving one proposal identity and one dispatch for concurrent retries.
- Evidence: `src/ai-team/proposal-lock.ts`, `src/ai-team/service.ts`, `tests/ai-team-proposals.test.ts`.
- Verification: focused AI Team proposal `3/3`; user-product `343/343`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with AI proposal execution approval, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed AI Team proposal coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service settings mutations

- User settings mutations are **B — owner-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/settings/settings-lock.ts` adds an exact hashed per-user lock; `src/settings/service.ts` applies it to both initialization and patch read-modify-write paths so independent settings changes survive across service instances.
- Evidence: `src/settings/settings-lock.ts`, `src/settings/service.ts`, `tests/settings-isolation.test.ts`.
- Verification: focused settings/API `4/4`; user-product `342/342`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with settings permission persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed settings coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service personal world mutations

- Personal world and character mutations are **B — owner-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/personal-world/world-lock.ts` adds an exact hashed per-user lock; `src/personal-world/service.ts` applies it to world and character read-modify-write paths so disjoint patches survive and character/world synchronization remains one user mutation boundary.
- Evidence: `src/personal-world/world-lock.ts`, `src/personal-world/service.ts`, `tests/personal-world-persistence.test.ts`.
- Verification: focused personal-world/API `4/4`; user-product `342/342`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with personal-world environment/customization, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed personal-world coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service recruitment application creation

- Recruitment application creation is **B — post/applicant-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/recruitment/application-lock.ts` adds a local queue plus exact durable lock; `src/recruitment/service.ts` now re-checks and creates one pending application inside it, preserving one activity receipt on concurrent retries.
- Evidence: `src/recruitment/application-lock.ts`, `src/recruitment/service.ts`, `tests/recruitment-flow.test.ts`.
- Verification: focused recruitment `2/2`; user-product `341/341`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with recruitment review/team-invite coverage, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed recruitment coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service platform user creation

- Platform user creation is **B — owner-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/platform-user/user-lock.ts` adds a process-local per-root/user queue plus an exact durable lock below the platform root; `src/platform-user/service.ts` now protects identity/profile/credential creation and returns the existing record for matching retries.
- Evidence: `src/platform-user/user-lock.ts`, `src/platform-user/service.ts`, `tests/platform-user-isolation.test.ts`.
- Verification: focused platform auth/isolation `11/11`; user-product `338/338`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed identity coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service password change compare-and-set

- Password changes are **B — owner-scoped, durable, same-host cross-service compare-and-set serialized, and isolated-browser verified**. `src/platform-user/service.ts` now protects old-credential verification, credential replacement, and session revocation with the platform-user lock, allowing only one concurrent change from the same prior password to commit.
- Evidence: `src/platform-user/user-lock.ts`, `src/platform-user/service.ts`, `tests/platform-user-auth.test.ts`.
- Verification: focused platform auth/isolation `12/12`; user-product `339/339`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed auth coordinator, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service community like toggles

- Community like toggles are **B — viewer/post-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/community/like-lock.ts` adds a local queue plus exact durable lock; `src/community/service.ts` now re-reads and applies each toggle inside that boundary.
- Evidence: `src/community/like-lock.ts`, `src/community/service.ts`, `tests/community-flow.test.ts`.
- Verification: focused community `6/6`; user-product `340/340`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with public community persistence, two-account isolation, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed reaction coordinator, provider-side delivery, live model/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service study space creation

- Study space creation is **B — team-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/study/space-lock.ts` protects the one-active-space-per-team check/create path in `src/study/service.ts`.
- TDD/verification: concurrent creation moved from two distinct IDs to one shared ID and one active space; focused study `5/5`; user-product `337/337`; root `682/682`; types, both builds, and browser E2E passed on retry with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service study submission mutations

- Study submissions are **B — study-space/task/user-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/study/submission-lock.ts` protects the personal submission read-modify-save path in `src/study/service.ts`.
- TDD/verification: concurrent submission batches moved from `8/24` complete to `24/24` with one valid durable answer; focused study `4/4`; user-product `336/336`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service growth projection mutations

- Growth projections/retractions are **B — owner/event-scoped, durable, same-host cross-service idempotent, notification-safe, and isolated-browser verified**. `src/growth/projection-lock.ts` protects the ledger and achievement calculation path in `src/growth/read-model.ts`.
- TDD/verification: concurrent projection batches moved from `7/24` complete to `24/24` with exactly 100 XP; focused activity/growth `8/8`; user-product `335/335`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed growth coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service activity event mutations

- Activity event record/retract mutations are **B — owner/event-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/activity/event-lock.ts` protects deterministic event identity in `src/activity/service.ts`.
- TDD/verification: concurrent identical event writes moved from `45/48` successful calls to `48/48` with exactly 24 records; focused activity/growth/API/export `6/6`; user-product `334/334`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed evidence coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service portfolio entry mutations

- Portfolio entry updates are **B — owner/entry-scoped, durable, same-host cross-service serialized, patch-preserving, and isolated-browser verified**. `src/portfolio/entry-lock.ts` protects the read-modify-save path in `src/portfolio/service.ts`.
- TDD/verification: concurrent title/visibility edits moved from a lost title patch to preserving both changes; focused portfolio/provenance/API `5/5`; user-product `333/333`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service team membership mutations

- Team membership mutations are **B — team-scoped, durable, same-host cross-service serialized, capacity-safe, and isolated-browser verified**. `src/teams/membership-lock.ts` protects human/AI add, remove, and leave paths in `src/teams/service.ts`.
- TDD/verification: concurrent capacity test moved from two successful adds to one success plus `Team is full`; focused team membership/chat/API/collaboration `7/7`; user-product `330/330`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed coordination, live model/provider execution, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: Windows notification lock contention hardening

- Existing notification idempotency is **B — bounded Windows transient-contention handling added and repeatedly verified**. `src/notifications/notification-lock.ts` retries the narrow `EPERM` followed by `ENOENT` disappearance edge without changing ownership or idempotency semantics.
- Verification: five sequential focused notification runs passed `9/9` each; product `330/330`; root `682/682`; types, both builds, `git diff --check`, and browser E2E passed.
- Boundary: provider-side exactly-once delivery and external connector delivery remain unverified; operational Runtime/Agent state and UNKNOWN records remain untouched.

## 2026-09-28 continuation: durable cross-service social block mutations

- Social block/unblock mutations are **B — blocker/target-scoped, durable, same-host cross-service serialized, idempotent, and isolated-browser verified**. `src/social/block-lock.ts` protects the read-modify-write record in `src/social/service.ts` and suppresses duplicate active-block activity events.
- TDD/verification: concurrent 24-target stress moved from `45/48` successful calls to `48/48` with exactly 24 active blocks; focused social safety/messaging/profile/API/UI `7/7`; user-product `331/331`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed coordination, live model/provider execution, provider-side exactly-once delivery, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service community report idempotency

- Community reports are **B — reporter/target-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/community/report-lock.ts` protects the identity check and creation path in `src/community/service.ts`.
- TDD/verification: concurrent identical reports moved from two random report IDs to one shared ID; focused community/API/UI `10/10`; user-product `332/332`; root `682/682`; types, both builds, and browser E2E passed with two-account isolation and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; distributed moderation coordination, live model/provider execution, provider-side delivery, external connector delivery, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred.

## 2026-09-28 continuation: durable cross-service friend request mutations

- Friend request mutations are **B — friendship-record-scoped, durable, same-host cross-service idempotent, and isolated-browser verified**. `src/social/friend-request-lock.ts` provides an exact hashed friendship-record lock; `src/social/service.ts` uses it for request creation and accept/reject transitions.
- Evidence: `src/social/friend-request-lock.ts`, `src/social/service.ts`, `tests/social-messaging.test.ts`, and the existing collaboration/social API/UI coverage.
- Verification: focused social/friend/API/UI `13/13`; user-product `329/329`; root `682/682`; backend/user UI TypeScript, both builds, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, external provider delivery, live model/provider execution, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service social profile mutations

- Social profile writes are **B — owner-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/social/profile-lock.ts` adds an exact hashed per-user lock below the platform root; `src/social/service.ts` applies it to profile read-modify-save updates.
- Evidence: `src/social/profile-lock.ts`, `src/social/service.ts`, `tests/social-public-profile-privacy.test.ts`, and the social/profile UI contract tests.
- Verification: focused social/profile/API/UI `11/11`; user-product `328/328`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider execution, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service private memory mutations

- Private memory mutations are **B — owner/memory-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/memory/memory-lock.ts` adds an exact hashed lock below the platform root; `src/memory/service.ts` applies it to update, sharing, and delete read-modify-write paths.
- Evidence: `src/memory/memory-lock.ts`, `src/memory/service.ts`, `tests/personal-memory-isolation.test.ts`, `tests/personal-memory-sharing.test.ts`, and `tests/user-ui-memory-contract.test.ts`.
- Verification: focused memory/sharing/UI `8/8`; user-product `327/327`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider execution, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service AI agent profile mutations

- AI agent profile writes are **B — owner-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/ai-agent/profile-lock.ts` adds an exact hashed per-user lock below the platform root; `src/ai-agent/service.ts` re-reads and saves the profile within that lock so concurrent service instances preserve both disjoint patches.
- Evidence: `src/ai-agent/profile-lock.ts`, `src/ai-agent/service.ts`, `tests/ai-agent-profile.test.ts`, and `tests/ai-agent-profile-api.test.ts`.
- Verification: focused AI agent profile/API `6/6`; user-product `326/326`; root `682/682`; backend/user UI TypeScript, both builds, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root coordination only; no distributed coordinator, live model/provider execution, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Operational Runtime/Agent state, UNKNOWN records, external providers, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service user notification idempotency

- User notifications are **B — owner-scoped, durable, idempotent, same-host cross-service serialized, and isolated-browser verified**. `src/notifications/notification-lock.ts` provides an exact hashed lock below the notification root; `src/notifications/service.ts` applies it to all producer mutations and authenticated read transitions. Same-source concurrent calls converge on one durable record and one SSE refresh event across service instances.
- The lock is bounded and fail-closed: active owners are preserved, dead owners can reclaim only their exact lock, malformed metadata remains a conflict, exceptional paths clean up in `finally`, and Windows-open-file `EPERM` is handled as contention only after the record is confirmed present.
- Evidence: `src/notifications/notification-lock.ts`, `src/notifications/service.ts`, `tests/user-notifications.test.ts`, `tests/user-notifications-api.test.ts`, `tests/user-notifications-stream.test.ts`, and `docs/superpowers/plans/2026-09-28-notification-durable-lock.md`.
- Verification: focused notifications/API/SSE `14/14`; user-product `325/325`; root `682/682`; backend/user UI TypeScript, backend/user UI builds, `git diff --check`, and isolated browser E2E all passed. Browser coverage includes notification journeys, two-account isolation, reload persistence, live stream delivery, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; no database/cross-machine coordinator, provider-side exactly-once receipt, external push/provider delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `f84c261 feat: serialize user notification mutations`.
- Safety: Runtime/Agent/browser processes, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable cross-service AI Chat conversation mutations

- AI Chat conversation writes are **B — owner-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/ai-chat/conversation-lock.ts` provides an exact hashed lock below the AI Chat root; `src/ai-chat/service.ts` applies it to message append/private-memory persistence, assistant completion, execution-plan approval/rejection, and approved-plan Work Request handoff. Two service instances updating one conversation now preserve both messages.
- Lock behavior is bounded and fail-closed: active owners remain protected, dead owners can reclaim only the exact lock, malformed metadata remains a conflict, Windows-open-file `EPERM` is treated as contention only after the lock record is confirmed present, and exceptional paths clean up in `finally`.
- Evidence: `src/ai-chat/conversation-lock.ts`, `src/ai-chat/service.ts`, `tests/ai-chat-persistence.test.ts`, `tests/ai-chat-runtime-dispatch.test.ts`, `tests/ai-chat-context-selection.test.ts`, `tests/ai-chat-attachments.test.ts`, `tests/ai-chat-execution-plan.test.ts`, `tests/ai-chat-local-runtime.test.ts`, `tests/ai-chat-project-context.test.ts`, and `tests/ai-chat-api.test.ts`.
- Verification: focused AI Chat suite `35/35`; user-product `326/326`; root `682/682`; backend/user UI TypeScript, backend/user UI builds, `git diff --check`, and isolated browser E2E all passed. Browser coverage includes private AI persistence/isolation, attachments, context selection, execution-plan approval, Runtime response, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Boundary: same-host/shared-root coordination only; the Runtime dispatch gate remains process-local and live model/provider quality or operational Runtime throughput is not claimed. External connectors, weekly digest scheduling, final approved design-source completeness, and AI Broadcast Room remain unverified/deferred. Commit: `4f316ca feat: serialize AI chat conversation mutations`.
- Safety: Runtime/Agent/browser processes, stale PID `55000`, UNKNOWN records, durable operational data, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project Work Request cancellation lifecycle

- Project Work Request cancellation is **B — lifecycle-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/user-project-service.ts` now protects queued cancellation with the same `src/project-model/work-request-lock.ts` lifecycle lock as Run start/resume/pause/retry, re-reading current state before the terminal transition.
- Evidence: `tests/user-project-execution.test.ts`, `tests/user-project-api.test.ts`, and the Project Workspace cancellation/browser coverage. A concurrent start/cancel race now has one lifecycle winner; a cancellation arriving after start observes the current non-queued state and cannot revert it.
- Verification: focused execution `24/24`; user-product `362/362`; root `682/682`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root lifecycle coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `9d0ab4b feat: serialize project work request cancellation`.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: user-domain durable lock cleanup ownership hardening

- User-domain durable locks are **B — same-host durable and isolated-browser verified with owner-token cleanup**. Settings, private memory, and notification finalizers remove only their own lock records, preventing Windows waiter/owner cleanup races.
- Evidence: existing settings, memory, notification, AI persistence, and browser journeys remain green after the cleanup boundary was unified.
- Verification: settings/memory focused `8/8`; notifications/AI persistence `12/12`; user-product `364/364`; root `698/698`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `b4f63a2 fix: protect user lock cleanup ownership`.
- Boundary: user-domain lock cleanup ownership only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Prototype archive guard

- Prototype archive is **B — candidate-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/idea-lab/prototype-actions.ts` uses the prototype lock's atomic update guard for promoted rejection and archived idempotence, preventing stale archive writes across promotion.
- Evidence: `tests/project-model-promotion.test.ts` proves archive waits for a competing durable candidate lock; existing archive/promotion/API/browser journeys remain green.
- Verification: focused Idea Lab/promotion/stores `20/20`; user-product `364/364`; root `698/698`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `f855be9 feat: serialize prototype archive guard`.
- Boundary: same-host/shared-root Prototype archive/promotion coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Prototype browser-acceptance guard

- Prototype browser acceptance is **B — candidate-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/prototype-store.ts` applies promoted-state validation inside `src/project-model/prototype-lock.ts`, preventing stale acceptance writes across promotion.
- Evidence: `tests/project-model-promotion.test.ts` proves acceptance waits for a competing durable candidate lock; existing promotion/API/browser journeys remain green.
- Verification: focused promotion+stores `15/15`; user-product `364/364`; root `697/697`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `85c39e1 feat: serialize prototype acceptance guard`.
- Boundary: same-host/shared-root Prototype acceptance/promotion coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: project-model durable lock cleanup ownership hardening

- Project-model durable locks are **B — same-host durable and isolated-browser verified with owner-token cleanup**. History, promotion, schedule, work-request, and Workspace lock finalizers now remove only their own lock record, preventing Windows waiter/owner cleanup races.
- Evidence: existing project-model stores, project execution/team/promotion, and browser journeys remain green after the cleanup boundary was unified with the newer Idea Lab/Portfolio locks.
- Verification: project-model stores `9/9`; execution/team/promotion focused coverage `32/32`; user-product `364/364`; root `696/696`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `0edc49b fix: protect project lock cleanup ownership`.
- Boundary: lock cleanup ownership only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Portfolio document creation synchronization

- Portfolio document ensure/create is **B — project-Portfolio-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/portfolio-store.ts` now shares `src/project-model/portfolio-lock.ts` across existence check and first save, alongside existing patch serialization.
- Evidence: `tests/project-model-stores.test.ts` proves creation waits for a competing durable Portfolio lock; existing Portfolio provenance/public API and browser journeys remain green.
- Verification: focused project-model stores `9/9`; user-product `364/364`; root `696/696`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `bd50f42 feat: serialize portfolio document creation`.
- Boundary: same-host/shared-root project Portfolio creation coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab campaign creation synchronization

- Campaign creation is **B — campaign-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/web-control-plane/idea-lab-actions.ts` now shares `src/idea-lab/campaign-lock.ts` across duplicate detection, persistence, and the creation event append.
- Evidence: `tests/idea-lab-web-control-plane.test.ts` proves creation waits for a competing durable campaign lock and preserves bounded validation/idempotent event behavior; existing Idea Lab/browser journeys remain green.
- Verification: focused web-control-plane `11/11`; user-product `364/364`; root `695/695`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `c5d6017 feat: serialize Idea Lab campaign creation`.
- Boundary: same-host/shared-root campaign creation coordination only; runtime enqueue remains capability-bound and live worker throughput is unverified. No distributed coordinator, live provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab candidate materialization synchronization

- Candidate materialization is **B — Prototype-candidate-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/idea-lab/production-service.ts` shares `src/project-model/prototype-lock.ts` across validation, identity re-read, and first save.
- Evidence: `tests/idea-lab-production-service.test.ts` proves materialization waits for a competing durable prototype lock and preserves idempotent identity checks; existing Idea Lab promotion and browser journeys remain green.
- Verification: focused production-service `5/5`; project-model stores `8/8`; user-product `364/364`; root `694/694`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `55f0c62 feat: serialize Idea Lab candidate materialization`.
- Boundary: same-host/shared-root candidate materialization coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab production-driver synchronization

- Idea Lab production driver mutations are **B — production-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/idea-lab/production-lock.ts` protects both `createProduction` and `advanceProduction`; owner-token cleanup prevents a releasing waiter from deleting a newer lock owner.
- Evidence: `tests/idea-lab-production-runtime-driver.test.ts` proves both public driver entry points wait for a competing durable production lock; existing production recovery, provider-boundary, and browser journeys remain green.
- Verification: focused production-runtime-driver `32/32`; user-product `364/364`; root `693/693`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `bcf628e feat: serialize Idea Lab production driver`.
- Boundary: same-host/shared-root production-driver coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab campaign cancellation synchronization

- Campaign cancellation is **B — campaign-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/web-control-plane/idea-lab-actions.ts` shares `src/idea-lab/campaign-lock.ts` with campaign supervision across re-read, status transition, persistence, and cancellation event append.
- Evidence: `tests/idea-lab-web-control-plane.test.ts` proves the authenticated cancel action waits for a competing durable campaign lock and keeps idempotent cancellation behavior; existing Idea Lab/browser journeys remain green.
- Verification: focused Idea Lab web-control-plane `10/10`; user-product `364/364`; root `691/691`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `1f2b8b8 feat: serialize Idea Lab campaign cancellation`.
- Boundary: same-host/shared-root campaign cancellation coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab campaign supervision synchronization

- Campaign supervision is **B — campaign-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/idea-lab/campaign-lock.ts` and `src/idea-lab/campaign-supervisor.ts` protect the full supervisor loop so competing campaign supervisors cannot interleave state transitions.
- Evidence: `tests/idea-lab-campaign-supervisor.test.ts` proves supervision waits for a competing durable campaign lock; existing Idea Lab campaign/runtime/browser journeys remain green.
- Verification: focused campaign-supervisor `10/10`; user-product `364/364`; root `690/690`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `b47350a feat: serialize Idea Lab campaign supervision`.
- Boundary: same-host/shared-root campaign supervision coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project Work Request patch serialization

- Project Work Request patches are **B — record-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/work-request.ts` now applies an exact update lock around read-modify-save, so concurrent lifecycle, scheduler, reconciliation, and operator patches preserve disjoint fields.
- Evidence: `tests/project-work-request.test.ts` proves concurrent status/run and node/execution patches retain all fields. Existing Project Workspace/API/runtime integration coverage remains green.
- Verification: focused Work Request `15/15`; user-product `362/362`; root `683/683`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root record coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `e3b4236 feat: serialize project work request patches`.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project Work Request reconciliation ordering

- Project Run reconciliation is **B — Work Request-reconciliation-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/work-request.ts` now serializes observe/decide/project under a distinct reconciliation lock, preserving terminal DONE/FAILED/CANCELLED projections against stale observations without re-entering the Run lifecycle lock used by `getProject()` and start/resume paths.
- Evidence: `tests/project-work-request.test.ts` proves a stale WAITING observation cannot overwrite a concurrent terminal DONE projection; the existing project execution and browser journeys remain green.
- Verification: focused Work Request `16/16`, combined Work Request/user-project execution `40/40`; user-product `362/362`; root `684/684`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root reconciliation ordering only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `38bd3cb feat: serialize project work request reconciliation`.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project Workspace mutations

- Project Workspace task-tree mutations are **B — project-Workspace-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/workspace-lock.ts` is shared by Work Request task-node creation and Harness Run attachment, preventing concurrent tree read-modify-save loss.
- Evidence: `tests/user-project-execution.test.ts` proves two concurrent Work Requests retain both task nodes; existing Project Workspace API/runtime/browser journeys remain green.
- Verification: focused user-project execution `25/25`; user-product `363/363`; root `684/684`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Workspace coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `4f415b0 feat: serialize project workspace mutations`.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project team transition synchronization

- Project team transitions are **B — project-Workspace-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/user-project-service.ts` now holds `src/project-model/workspace-lock.ts` across the project/team record and Workspace identity update, preventing competing Workspace mutations from interleaving with the transition.
- Evidence: `tests/user-project-team-transition.test.ts` proves the transition waits for a competing durable Workspace lock and preserves the updated team identity; existing Project Workspace/team API and browser journeys remain green.
- Verification: focused team-transition `2/2`; user-product `364/364`; root `684/684`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with `projectTeamTransitionUi`, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Boundary: same-host/shared-root Workspace transition coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed. Commit: `2d9ceda feat: serialize project team transitions`.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project purpose selection synchronization

- Project purpose selection is **B — project-Workspace-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/workspace-store.ts` now uses `src/project-model/workspace-lock.ts` across purpose profile and history persistence, with a bounded wait for competing Workspace mutations.
- Evidence: `tests/project-purpose-profile.test.ts` proves purpose selection waits for a competing durable Workspace lock and persists the selected profile after release; existing Project Workspace purpose/profile and browser journeys remain green.
- Verification: focused purpose/profile `10/10`; user-product `364/364`; root `684/684`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `f1b93c3 feat: serialize project purpose selection`.
- Boundary: same-host/shared-root Workspace purpose-selection coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable project history append-once synchronization

- Project history append-once writes are **B — project-history-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/history-lock.ts` and `src/project-model/history-store.ts` now protect the full read/identity-check/append sequence, preventing duplicate identical history events across service instances.
- Evidence: `tests/project-model-stores.test.ts` proves concurrent identical append-once calls return one `true`/one `false` result and leave one event; existing Project Workspace history/runtime/browser journeys remain green.
- Verification: focused project-model stores `6/6`; user-product `364/364`; root `685/685`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `b94ead7 feat: serialize project history append-once`.
- Boundary: same-host/shared-root project history append-once coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable prototype candidate patch synchronization

- Prototype candidate patches are **B — candidate-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/prototype-lock.ts` and `src/project-model/prototype-store.ts` protect candidate read-modify-save updates so disjoint status/promotion/metadata patches are retained.
- Evidence: `tests/project-model-stores.test.ts` proves concurrent candidate patches preserve both `status` and `promotedProjectId`; existing Idea Lab, Promotion, and browser journeys remain green.
- Verification: focused project-model stores `7/7`; user-product `364/364`; root `686/686`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `a87b29a feat: serialize prototype candidate patches`.
- Boundary: same-host/shared-root Prototype candidate patch coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Prototype-to-Project promotion synchronization

- Prototype promotion is **B — promotion-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/promotion-lock.ts` and `src/project-model/promotion.ts` protect the full candidate-to-Workspace promotion boundary; process-local in-flight dedupe is no longer the only coordination mechanism.
- Evidence: `tests/project-model-promotion.test.ts` proves promotion waits for a competing durable promotion lock and the existing idempotency, Genesis import, and browser-acceptance gates remain green.
- Verification: focused promotion `5/5`; user-product `364/364`; root `687/687`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed after a clean rerun with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `d907b74 feat: serialize project promotion`.
- Boundary: same-host/shared-root Prototype-to-Project promotion coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Idea Lab campaign event append-once synchronization

- Idea Lab campaign event append-once writes are **B — campaign-event-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/idea-lab/event-lock.ts` and `src/idea-lab/event-store.ts` protect the identity-check/append sequence, preventing duplicate JSONL events across Campaign supervisor/action instances.
- Evidence: `tests/idea-lab-stores.test.ts` proves concurrent identical event calls return one `true`/one `false` result and leave one event; existing Idea Lab campaign/runtime/browser journeys remain green.
- Verification: focused Idea Lab stores `5/5`; user-product `364/364`; root `688/688`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `82d476f feat: serialize Idea Lab campaign events`.
- Boundary: same-host/shared-root Idea Lab campaign event coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-28 continuation: durable Portfolio document patch synchronization

- Portfolio document patches are **B — project-Portfolio-scoped, durable, same-host cross-service serialized, and isolated-browser verified**. `src/project-model/portfolio-lock.ts` and `src/project-model/portfolio-store.ts` protect validated section/readme read-modify-save updates so disjoint edits are retained.
- Evidence: `tests/project-model-stores.test.ts` proves concurrent section patches preserve both edited sections; existing Portfolio provenance/public API and browser journeys remain green.
- Verification: focused project-model stores `8/8`; user-product `364/364`; root `689/689`; backend TypeScript build, user UI build, `git diff --check`, and isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. Commit: `fe9fbce feat: serialize portfolio document patches`.
- Boundary: same-host/shared-root project Portfolio patch coordination only; no distributed coordinator, live Runtime/provider quality, external connector delivery, weekly digest scheduler, final approved design-source completeness, or AI Broadcast Room implementation is claimed.
- Safety: Runtime/Agent/browser processes, UNKNOWN records, external providers/connectors, deployment/push state, and approved/deferred design artifacts remain untouched.

## 2026-09-30 continuation: replay and guild-reset inventory refresh

- UI-02 now has a durable Web Product event journal and `Last-Event-ID` replay path. `tests/web-control-plane-server.test.ts` verifies journal recovery after a bus restart, cursor filtering, and the subscribe-before-replay live-event race boundary; real browser reconnect acceptance remains unverified.
- DISC-02's Discord progress bridge now subscribes before replaying the durable journal and uses durable delivery records to suppress already accepted notifications after restart. `tests/discord-project-progress-event-bridge.test.ts` covers restart replay, duplicate suppression, and replay/live ordering; live Discord delivery remains unverified.
- DISC-09's guild reset regression now covers target-guild GitHub account-link removal while preserving another guild's link in `data/github-users.json`; the destructive Discord action itself remains unexecuted in production.

## 2026-10-01 continuation: public portfolio privacy projection

- Public Portfolio is now **A — owner-scoped source selection with an explicit privacy projection**. `src/portfolio/service.ts` no longer returns the owner-facing `PortfolioEntry` or full `PortfolioEvidence` objects from `/api/public/portfolio/:entryId`; the public contract removes the internal `userId`, selected `evidenceIds`, and source project/report/activity identifiers while preserving the public title, summary, visibility, dates, actor attribution, verification state, and bounded evidence summary.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `user-ui/src/api/userApi.ts`, and `tests/portfolio-public-api.test.ts`. The RED test first observed `entry.userId` in the anonymous response; the GREEN contract verifies that owner and provenance identifiers are absent while public and private visibility behavior remains unchanged.
- Verification: focused portfolio/public API/provenance and portfolio UI contracts pass; `npm.cmd run test:iseol-user-product` passes `445/445`; `npm.cmd test` passes `792/792`; TypeScript and user UI production builds pass; and isolated browser E2E passes with `publicPortfolioRouteAndJsonExport`, `publicPortfolioShareControl`, two-account privacy, and responsive `[390,768,1024,1440]` across 13 routes.
- Boundary: this is an anonymous public projection change only. Owner-authenticated portfolio editing/export, private evidence selection, live Runtime/provider execution, external connector delivery, final approved design-source completeness, and AI Broadcast Room remain governed by their existing boundaries.

## 2026-10-01 continuation: public portfolio evidence identifier removal

- The anonymous Portfolio evidence projection now also omits the internal evidence record `id`; the public page renders without receiving any durable evidence identifier and keeps only bounded summary, actor, verification, date, and optional provider display data.
- Evidence: `src/portfolio/contracts.ts`, `src/portfolio/service.ts`, `user-ui/src/api/userApi.ts`, `user-ui/src/pages/PublicPortfolio.tsx`, and `tests/portfolio-public-api.test.ts`. The RED test observed `evidence[0].id`; the GREEN contract removes it while preserving the public route and evidence count.
- Verification: focused public API/UI contracts pass `14/14`; `npm.cmd run test:iseol-user-product` passes `445/445`; `npm.cmd test` passes `792/792`; TypeScript and user UI production builds pass; and isolated browser E2E passes for the public portfolio route/JSON export, share control, two-account privacy, and responsive `[390,768,1024,1440]` across 13 routes.
- Boundary: owner-authenticated portfolio snapshots still retain IDs for editing/provenance navigation; this change affects only the anonymous public projection.

## 2026-10-01 continuation: public portfolio malformed-path boundary

- The anonymous public portfolio route now validates the decoded entry identity before calling the portfolio service, and both public and authenticated portfolio prefixes reject raw backslash normalization before route dispatch. Malformed, encoded-slash, or otherwise unsafe entry paths return bounded `404` responses instead of surfacing service identity exceptions or resolving a normalized alternate path.
- Evidence: `src/portfolio/router.ts`, `src/web-control-plane/server.ts`, and `tests/portfolio-public-api.test.ts`. RED coverage observed `500 !== 404` for an encoded `entryId/suffix` and `200 !== 404` for a raw HTTP `/api/public/portfolio\\entryId`; GREEN coverage catches decode/identity validation failures, preserves query-bearing public reads, and keeps existing public/private behavior.
- Verification: focused portfolio/public API/provenance/UI contracts pass `14/14`; root TypeScript and user UI production builds pass; `npm.cmd run test:iseol-user-product` passes `445/445`; isolated browser E2E passes with public portfolio route/JSON export, share control, two-account privacy, and responsive `[390,768,1024,1440]` across 13 routes; `git diff --check` passes.

## 2026-10-01 continuation: private memory malformed-path boundary

- The authenticated private memory route now validates both path identities and the `shared?teamId=` query identity before calling the memory service. Malformed, encoded-slash, or otherwise unsafe memory paths return bounded `404 memory not found` responses, while invalid shared-team queries return `400 teamId is invalid` instead of surfacing an identity exception as HTTP 500; the `/sharing` sub-route keeps its existing route ordering and owner-bound behavior.
- Evidence: `src/personal-world/router.ts` and `tests/personal-world-api.test.ts`. RED regressions observed `500 !== 404` for an encoded `memoryId/suffix` and `500 !== 400` for `team/id` in the shared-memory query; the GREEN route validates the decoded path/query identities, rejects malformed percent-encoding, covers the `/sharing` branch, and preserves normal update/delete behavior.
- Verification: focused personal-world and memory tests pass `6/6`; `npm.cmd run test:iseol-user-product` passes `445/445`; root TypeScript and user UI production builds pass; isolated browser E2E passes with private memory CRUD/isolation and team ACL coverage plus responsive `[390,768,1024,1440]` across 13 routes; `git diff --check` passes.

## 2026-10-01 continuation: activity retraction malformed-path boundary

- The authenticated growth and activity routes now fail closed when URL normalization would reinterpret a raw backslash as a route separator. Activity retraction continues to validate event identities before calling the activity service, and query-bearing retractions still resolve the parsed pathname identity.
- Evidence: `src/growth/router.ts`, `src/web-control-plane/server.ts`, and `tests/activity-growth-api.test.ts`. The RED regression observed `200 !== 404` for a raw HTTP `/api/user/activity\\eventId` request; GREEN coverage rejects the raw request at the HTTP boundary, preserves `?next=%2F` retractions, keeps cross-owner events private, maps unknown events to 404, and verifies one compensating growth entry with repeated-retraction idempotence.
- Verification: focused activity/growth tests pass `12/12`; `npm.cmd run test:iseol-user-product` passes `445/445`; root TypeScript and user UI production builds pass; isolated browser E2E passes with growth achievements/activity timeline and responsive `[390,768,1024,1440]` across 13 routes; `git diff --check` passes.

## 2026-10-01 continuation: private memory limit query boundary

- The authenticated private memory list route now accepts `limit` only when it is one positive ASCII-decimal safe integer. Missing limits keep the service default; malformed, fractional, non-finite, zero, negative, precision-rounding, and duplicate query values return bounded `400 limit must be a positive integer` responses before the memory service is called.
- Evidence: `src/personal-world/router.ts` and `tests/personal-world-api.test.ts`. RED regressions observed `200 !== 400` for `limit=not-a-number` and the precision-rounding token `1.00000000000000001`; the GREEN route rejects duplicate parameters, validates exact decimal syntax before numeric conversion, and preserves owner-scoped memory search behavior.
- The concurrent study-submission path now performs its initial study-space existence read without taking the study-space lock, then rechecks the current space and membership after acquiring the authoritative team mutation lock. This prevents high-fan-in submissions from exhausting an unrelated pre-lock 2-second space-read wait while preserving the existing owner/member boundary.
- Evidence: `src/study/service.ts` and `tests/study-space.test.ts`. The focused concurrency regression previously observed only `15–19/24` fulfilled submission batches with `Study space concurrency conflict`; after the lock-order correction all `24` batches complete and the final owner-scoped submission remains durable.
- Verification: focused personal-world API test passes; `npm.cmd run test:iseol-user-product` passes `445/445`; `npm.cmd test` passes `792/792`; backend and user UI production builds pass; isolated browser E2E passes private memory CRUD/ACL, two-account privacy, and responsive `[390,768,1024,1440]` coverage across 13 routes; `git diff --check` passes.

## 2026-10-01 continuation: collaboration malformed-path boundary

- Authenticated collaboration routes now fail closed when a team, recruitment, or social path contains malformed percent-encoding or encoded separators. Raw backslashes are rejected against the normalized collaboration prefix before route matching or mutation.
- Evidence: `src/collaboration-router.ts`, `src/web-control-plane/server.ts`, and `tests/collaboration-api.test.ts`. RED coverage observed `503 !== 404` for an encoded team separator; GREEN coverage preserves query-bearing team reads, rejects encoded team/recruitment/social separators, verifies a real Node HTTP raw-backslash request, and keeps normal collaboration flows intact.
- Boundary: this change only hardens collaboration route decoding and HTTP normalization; service authorization, membership, social ACL, recruitment state, and team-chat behavior are unchanged.

## 2026-10-01 continuation: learning malformed-path boundary

- Authenticated learning goal, project-proposal, and report routes now fail closed when a path identity contains malformed percent-encoding. The shared path decoder returns no route identity instead of translating a malformed URL into the learning router's generic `400` error path.
- Evidence: `src/learning/router.ts`, `src/web-control-plane/server.ts`, `src/web-control-plane/user-router.ts`, and `tests/learning-goals-api.test.ts`. RED coverage observed `400 !== 404` for malformed goal, project-proposal goal, report goal, and proposal identities, `201 !== 404` for encoded-slash and raw-backslash plan-preview requests, and `201 !== 404` for a raw-backslash learning prefix; GREEN coverage preserves the raw request target, rejects malformed/encoded separators before suffix matching and at the HTTP boundary, and verifies bounded `404` responses while normal goal ownership and persistence behavior remain intact.
- Boundary: this change only hardens learning route decoding; goal ownership, proposal acceptance, report creation, and learning service state transitions are unchanged.

## 2026-10-01 continuation: community malformed-path boundary

- Authenticated community comment, report, and like routes now fail closed when a post identity contains malformed percent-encoding or encoded separators. Raw backslashes are rejected against the normalized community prefix before route mutation.
- Evidence: `src/community/router.ts`, `src/web-control-plane/server.ts`, and `tests/community-flow.test.ts`. RED coverage observed `409 !== 404` for malformed comment IDs and `201 !== 404` for raw-backslash community comment requests; GREEN coverage verifies malformed comment/report/like requests, direct router calls, and a real Node HTTP raw request all return bounded `404` responses without creating a comment.
- Boundary: this change only hardens community route decoding and HTTP normalization; post visibility, comment persistence, report handling, and like state transitions are unchanged.

## 2026-10-01 continuation: AI Chat malformed-path boundary

- Authenticated AI Chat conversation and execution-plan routes now fail closed when identity segments contain malformed percent-encoding or encoded separators. Raw backslashes are rejected against the normalized AI Chat prefix before message or plan mutations.
- Evidence: `src/ai-chat/router.ts`, `src/web-control-plane/server.ts`, and `tests/ai-chat-api.test.ts`. RED coverage observed `400 !== 404` for malformed conversation/plan identities, `404 !== 200` for query-bearing conversation reads, and the raw HTTP normalization path; GREEN coverage matches routes on parsed pathname, preserves query-bearing conversation/message behavior, verifies bounded `404` responses, and confirms no raw-path message is appended.
- Boundary: this change only hardens AI Chat route decoding and HTTP normalization; conversation privacy, message persistence, attachment validation, and execution-plan state transitions are unchanged.

## 2026-10-01 continuation: user project malformed-path boundary

- Authenticated user project, work-request, run, file, AI proposal, and AI discussion routes now validate every path identity and reject malformed percent-encoding or encoded separators. Raw backslashes are rejected against the normalized project prefix before authentication or project mutation dispatch.
- Evidence: `src/project-model/user-project-router.ts`, `src/web-control-plane/server.ts`, and `tests/user-project-api.test.ts`. RED coverage observed `200 !== 404` for a raw HTTP `/api/user/projects\\projectId` request; GREEN coverage preserves query-bearing project reads, rejects encoded project separators, and keeps the existing owner-scoped work/run behavior intact.
- Boundary: this change only hardens user project route decoding and HTTP normalization; project ownership, work-request idempotency, scheduler locking, run approval, and Runtime execution behavior are unchanged.

## 2026-10-01 continuation: study, notification, and integration malformed-path boundary

- Authenticated Study, notification, and integration routes now fail closed on malformed percent-encoding and encoded separators. Raw backslashes are rejected against each normalized prefix before study mutations, notification reads, integration delivery, or notification-stream dispatch.
- Evidence: `src/study/router.ts`, `src/notifications/router.ts`, `src/integrations/router.ts`, `src/web-control-plane/server.ts`, and the corresponding API tests. RED coverage observed `201 !== 404` for an encoded Study separator and `200 !== 404` for raw backslash Study, notification, and integration paths; GREEN coverage preserves query-bearing Study reads, owner-scoped notification reads, and truthful integration delivery behavior.
- Boundary: this change only hardens these three user route decoders and HTTP normalization; team membership, study privacy, notification ownership, integration opt-in/configuration, and delivery state transitions are unchanged.

## 2026-10-01 continuation: operator project raw-path boundary

- Operator Control Plane project/work-request routes now receive the original request target and reject raw backslash normalization before project reads or mutations. Direct router calls apply the same guard, while existing project ID decoding continues to reject malformed or path-like identities.
- Evidence: `src/web-control-plane/router.ts`, `src/web-control-plane/server.ts`, `tests/web-control-plane-router.test.ts`, and `tests/web-control-plane-server.test.ts`. RED coverage observed an operator work-request mutation path crossing the raw backslash boundary; GREEN coverage returns bounded `404` for direct and actual Node HTTP requests without creating a Work Request.
- Boundary: this change only hardens operator project route transport/identity handling; operator authentication, project/work-request lifecycle, reconciliation approvals, and Idea Lab behavior are unchanged.

## 2026-10-01 continuation: top-level user raw-path boundary

- Top-level user authentication, settings, personal-world, private-memory, and AI agent profile routes now receive and validate the original request target before authentication, body parsing, or durable mutation. Raw backslash normalization returns bounded `404` in both direct routers and the HTTP server.
- Evidence: `src/web-control-plane/user-router.ts`, `src/settings/router.ts`, `src/personal-world/router.ts`, `src/ai-agent/router.ts`, `src/web-control-plane/server.ts`, and the corresponding auth/settings/world/agent API tests. RED coverage observed normalized raw-backslash requests reaching logout, password, settings, world, and AI profile mutations; GREEN coverage preserves authenticated reads and returns `404` without changing durable state.
- Boundary: this change only hardens top-level user route transport handling; credentials, session lifecycle, settings permissions, personal-world privacy, memory ownership, and AI agent profile semantics are unchanged.

## 2026-10-01 continuation: GitHub repository identity boundary

- Discord project GitHub repository parsing now validates the raw path before URL dot/empty-segment normalization, then rejects malformed percent-encoding, raw or encoded backslashes, encoded separators or URL delimiters, credentials, query/hash suffixes, and invalid final owner/repository identities with one bounded validation error before GitHub API construction. Existing shorthand `ORG/REPO`, canonical GitHub URL inputs, and valid dot-leading repository names such as `.github` remain supported.
- Evidence: `src/services/github.ts` and `tests/github-webhook.test.ts`. RED coverage observed a raw `URIError` for malformed repository input and accepted path-like normalization candidates; independent review also reproduced dot/empty segments, post-`.git` invalid identities, encoded delimiters, and double-encoded separators. GREEN coverage preserves canonical owner/repo identity and returns the bounded repository-format error for all unsafe forms.
- Boundary: this change only hardens local repository identity parsing; GitHub API/network calls, webhook delivery, Discord project lifecycle, and external credentials remain unchanged.

## 2026-10-01 continuation: GitHub review repository identity boundary

- PR review automation now reuses the canonical GitHub repository identity parser instead of splitting `owner/repo` independently. Review requests reject extra path segments, malformed percent-encoding, raw or encoded separators, dot normalization, empty query/hash markers, and query/hash suffixes before GitHub review API calls, while canonical URLs and valid dot-leading repository names remain supported. Parsed identities are canonicalized before review locking and durable deduplication.
- Evidence: `src/services/review/github-review.ts`, `src/services/github.ts`, and `tests/github-ci-review.test.ts`. RED coverage observed the review parser accepting `owner/repo/extra`, lacking bounded URL identity validation, and using distinct lock keys for shorthand versus canonical URLs; GREEN coverage preserves shorthand/URL/`.github` identities, rejects unsafe review repository forms, and emits one review for equivalent identity forms.
- Boundary: this change only aligns PR review repository parsing with the existing GitHub identity boundary; review state locking, CI artifact validation, provider calls, GitHub API behavior, and external credentials remain unchanged.

## 2026-10-01 continuation: Notion page identity boundary

- Notion page parsing now rejects credentials, non-default ports, raw or encoded backslashes, and empty input before a Notion page reference is persisted. HTTPS Notion workspace/custom-site links, page UUID normalization, and supported query parameters such as `pvs=4` remain compatible.
- Evidence: `src/services/notion.ts`, `tests/notion.test.ts`, and the `test:notion` npm script. RED coverage observed unsafe authority/path inputs being accepted as page references; GREEN coverage preserves supported public page links and returns bounded Notion-link errors for unsafe forms.
- Boundary: this change only hardens local Notion URL parsing; Notion API calls, page access permissions, integration credentials, and Discord project lifecycle behavior remain unchanged.

## 2026-10-01 continuation: YouTube video identity boundary

- Music YouTube input parsing now rejects credentials, non-default ports, raw or encoded backslashes, dot or empty path segments, arbitrary watch paths, and extra video path segments before playback validation. Existing `youtu.be`, `/watch`, `/watch/`, and `/shorts` forms plus HTTP/HTTPS compatibility remain supported.
- Evidence: `src/services/music.ts`, `tests/music.test.ts`, and the `test:music` npm script. RED coverage observed that the extractor was not independently testable and accepted unsafe authority/path forms; GREEN coverage preserves supported video IDs and returns `null` for unsafe forms.
- Boundary: this change only hardens local YouTube URL identity parsing; Discord music commands, play-dl/YouTube validation, external requests, playback, and playlist persistence remain unchanged.

## 2026-10-01 continuation: Figma file identity boundary

- Figma file parsing now returns bounded validation errors for empty or malformed input and rejects credentials, non-default ports, raw or encoded backslashes, dot or empty path segments, encoded separators, unsupported path depth, and invalid file-key identities before project creation or Figma API calls. Supported `figma.com`/`www.figma.com` design, file, board, and proto links retain their optional filename suffix and query parameters such as `node-id`.
- Evidence: `src/services/figma.ts`, `tests/figma.test.ts`, and the `test:figma` npm script. RED coverage observed raw `Invalid URL` errors and accepted unsafe authority/path forms; GREEN coverage preserves supported public Figma links and returns bounded Figma-link errors for unsafe forms.
- Boundary: this change only hardens local Figma URL/file-key parsing; Figma API requests, project channel creation, version/comment polling, and stored integration lifecycle behavior remain unchanged.

## 2026-10-01 continuation: Vercel GitHub repository identity boundary

- Idea Lab's Vercel deployment adapter now reuses the canonical GitHub repository identity parser and rejects credentials, non-default ports, query/hash suffixes, raw or encoded separators, dot or empty segments, extra path depth, and invalid `.git`-derived identities before Vercel deployment, reconciliation, or verification provider calls. Existing canonical GitHub URL, case-insensitive HTTP scheme, and case-insensitive `.git` suffix support remain compatible.
- Evidence: `src/idea-lab/vercel-deploy-adapter.ts`, `src/services/github.ts`, `tests/idea-lab-vercel-deploy-adapter.test.ts`, and the `test:vercel-deploy` npm script. RED coverage observed unsafe repository URL forms reaching reconciliation/verification provider reads; GREEN coverage returns a bounded repository URL error with zero provider calls, preserves uppercase `HTTPS://` and `.GIT` compatibility, and keeps the existing deployment/reconciliation tests passing.
- Boundary: this change only aligns the Vercel adapter with the canonical GitHub repository identity boundary; Vercel deployment/reconciliation/verification semantics, credentials, and provider API contracts remain unchanged.

## 2026-10-01 continuation: Idea Lab runtime repository configuration boundary

- Idea Lab runtime configuration now reuses the canonical GitHub repository identity parser instead of a permissive URL regex, rejecting credentials, query/hash suffixes, raw or encoded separators, dot or empty segments, encoded separators, and invalid repository identities before runtime startup. Explicit HTTPS remains required, with case-insensitive scheme and `.git` suffix compatibility preserved.
- Evidence: `src/idea-lab/runtime-config.ts`, `src/services/github.ts`, `tests/idea-lab-runtime-config.test.ts`, and the `test:idea-lab-runtime-config` npm script. RED coverage observed unsafe repository configuration values passing the regex; GREEN coverage returns the bounded runtime-config error and preserves a valid `HTTPS://...repo.GIT` value.
- Boundary: this change only hardens Idea Lab startup configuration validation; repository contents, sandbox roots, deployment adapters, preview execution, and runtime lifecycle behavior remain unchanged.

## 2026-10-01 continuation: local-preview listener URL identity boundary

- Idea Lab local-preview verification now accepts only the exact loopback HTTP listener URL owned by the adapter, rejecting credentials, alternate protocol, path, query, hash, and malformed URL variants before readiness fetch. Deployment receipt construction uses the same canonical listener URL builder.
- Evidence: `src/idea-lab/local-preview-deploy-adapter.ts`, `tests/idea-lab-local-preview.test.ts`, and the `test:local-preview` npm script. RED coverage observed same-host unsafe and normalization-sensitive URLs reaching readiness fetch; GREEN coverage compares raw input before URL normalization, returns a bounded listener-URL error with zero readiness fetches, and preserves process startup, verification, reconciliation, and disposal behavior.
- Boundary: this change only hardens local-preview deployment URL verification; loopback host/port configuration, workspace containment, process ownership, readiness semantics, and Vercel behavior remain unchanged.
