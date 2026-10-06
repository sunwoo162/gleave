# 2026-09-21 전체 시스템 조사

이 문서는 해당 조사 시점의 관찰이다. PID·HEAD·데이터 개수는 영구적인 제품 계약이 아니다. 제품 요구사항은 [제품 명세](../ISEOL_PRODUCT_SPEC.md), 기능별 코드/API/테스트 매핑은 [인벤토리](../ISEOL_FEATURE_INVENTORY.md)를 참조한다.

## 범위와 Git 근거

저장소 `C:/Users/user/Documents/discord-project-automation-bot-v3`, 브랜치 `feat/calendar-code-review`, 조사 기준 HEAD `91e3605329deb2543187d46caa4accf2d6c8de86`. 시작 working tree는 clean. 이번 변경은 문서뿐이며 소스·운영 설정·credential을 변경하지 않았다.

다음 커밋은 실제 Git object가 존재하고 `git merge-base --is-ancestor <commit> 91e3605`가 모두 0을 반환했다. 해시의 표면적 순서로 포함 여부를 추정하지 않았다.

| 커밋 | 확인한 변경 및 현행 경로 |
|---|---|
| 17dfe8f | Runtime owner/codeVersion; `scripts/iseol-runtime-host.ts`, host 테스트 |
| 1143496 | 저장 credential operator identity 우선; host 및 테스트 |
| cc08e43 | lock-only recovery; host/테스트/복구·인벤토리 문서 |
| 7cfe687 | recovery confirmation 정규화; host/테스트 |
| c37eab5, 32fbc2f | 통제 종료 및 절차 보완; host/테스트/문서 |
| e206c44 | 통제 종료 CLI 보완; host |
| 91e3605 | enqueue 불가 시 waiting; `src/web-control-plane/router.ts`, `tests/project-purpose-profile.test.ts` |

주요 이전 변경군도 Git 이력과 현행 구현을 대조했다: 9dce5c0/4609f0b의 Idea 상세·UI, 7541406의 실행·알림 연결, 22b645b의 scheduler, a611dc6/5711dc2/f8cb8c3의 알림 및 통합, a70b1eb/c1391d5/b2e29d8의 recovery, 8c80aac부터 9510573까지의 credential/Windows DPAPI 수정, c0b34e7/021677d/23f83f1/d081e11/18c49e4의 containment, 231ea53의 Project root, 663d83c의 purpose, 6cd769c의 portfolio. 이 목록은 모든 과거 커밋을 재실행했다는 뜻이 아니다. 기존 `docs/superpowers/` 설계·계획을 보존한다.

## 운영 관찰과 보호

공식 읽기 전용 status에서 Runtime PID 9108, running, owner verified, codeVersionSource git-head, codeVersion은 조사 HEAD와 동일했다. maintenance/recovery는 stopped. Runtime lock fingerprint는 `c1dd9459258076716e27c57186ef7ccb6d082813f54284957449a793e7a5c068`, ownerCreatedAt은 `2026-09-20T16:24:03.6536610Z`였다. 이는 운영 승인에 재사용할 값이 아니다.

8790/8791 loopback listener는 이 조사 흐름에서 PID 9108로 확인했다. Desktop Agent PID 7288의 8791 established 연결을 확인했다. PID 8740은 이전 운영자의 독립 조사에서 Desktop Agent로 확인됐으며 이번에 종료하거나 재분류하지 않았다. 연결 관찰만으로 모든 capability의 실행 성공을 주장하지 않는다.

| 기록 | 읽기 전용 관찰 |
|---|---|
| run-project-dogfood-02-1-context | pending, revision `2026-09-19T13:50:08.484Z:pending:1`, contained=true, lease/result 없음 |
| run-project-dogfood-02-3-context | pending, revision `2026-09-20T00:38:32.930Z:pending:1`, contained=true, lease/result 없음 |
| run-project-dogfood-01-2 | CONTEXT / WAITING_AGENT |
| campaign-9973888a-f642-4f1c-ab20-76287283a761-prod-8 | production running; 연결 Run IMPLEMENT / WAITING_EXTERNAL; 과거 외부 결과 UNKNOWN 유지 |

Runtime 시작/종료, lock 복구, approval 발급, containment 변경, Run 재개, credential 등록, 외부 AI·Discord·GitHub·배포를 실행하지 않았다. 핵심 상태를 조회했고 변경 명령을 수행하지 않았다는 보존 근거다. 전체 운영 파일의 전후 byte hash를 확보한 감사라고 주장하지 않는다.

## 빈 목록의 정확한 원인

아래 경로에서 `<repo>`는 위 저장소다. 설정 파일의 비밀 값은 보고하지 않는다.

| 용도 | 현재 설정/실제 경로 |
|---|---|
| Runtime dataRoot | `<repo>/data/dogfood-01-20260919` |
| modelRoot | `<dataRoot>/idea-lab` |
| Harness runRoot | `<dataRoot>/runs` |
| 실제 campaign/production | `<dataRoot>/idea-lab/campaigns`, `<dataRoot>/idea-lab/productions` |
| 현재 store가 계산하는 campaign 경로 | `<dataRoot>/idea-lab/idea-lab/campaigns` |
| Project modelRoot | `<repo>/data/project-dogfood-01-20260919/model` |
| Project runRoot | `<repo>/data/project-dogfood-01-20260919/runs` |
| Project Desktop root | `<repo>/data/project-dogfood-01-20260919/desktop-state` |

`scripts/iseol-runtime-host.ts`는 config.modelRoot/runRoot를 서비스와 ISEOL_MODEL_ROOT/ISEOL_RUN_ROOT에 전달한다. `src/web-control-plane/server.ts`와 `src/runtime/iseol-runtime-services.ts`는 이 설정으로 Control Plane을 만든다. `src/idea-lab/store-utils.ts`의 `ideaLabDirectory(root,name)`는 다시 `idea-lab`을 붙인다. 따라서 **서로 다른 두 프로세스가 우연히 다른 저장소를 본 문제가 아니라, 현재 공통으로 전달한 Idea modelRoot가 실제 저장 layout보다 한 단계 깊은 문제**다.

읽기 전용 projection 비교에서 configured modelRoot는 campaign/production/prototype 0/0/0, dataRoot를 model root로 해석한 기존 layout은 1/8/0이었다. GET `/api/idea-lab`은 campaign을 active 상태로만 제한하지 않는다. UI의 “No active Campaigns”는 현재 빈 결과를 설명하는 문구이지 별도 active 필터의 증거가 아니다. Refresh 성공은 잘못 지정된 빈 저장소의 조회 성공일 수 있다.

Project 목록은 독립 결함이다. `web/app.js`의 `refreshProjectOptions()`는 Idea prototype의 `promotedProjectId`만 모으며 기존 workspace 전체를 조회하지 않는다. `listProjectWorkspaces`가 있어도 GET `/api/projects` 목록 경로와 UI 연결이 없다. 상세 GET `/api/projects/:id`는 별도 projectModelRoot를 사용한다. 따라서 기존 active workspace가 있어도 dropdown은 비어 있을 수 있다.

추가 코드상 위험: promotion은 `deps.modelRoot`를 `promotePrototype`에 전달하고 같은 root에 workspace를 쓰지만 상세 조회는 `projectModelRoot ?? modelRoot`를 사용한다. root가 분리된 배치에서 승격 후 상세 404가 가능한 경계다. 운영 promotion으로 재현하지 않았으므로 격리 회귀 재현이 다음 작업이다.

### 존재하는 데이터의 유형과 상태

- Campaign `campaign-9973888a-f642-4f1c-ab20-76287283a761`: producing.
- 해당 campaign의 production `-prod-1`~`-prod-7`: failed; `-prod-8`: running.
- 연결 Harness Run `run-campaign-9973888a-f642-4f1c-ab20-76287283a761-prod-1`~`-7`: IMPLEMENT/FAILED_FINAL; `-8`: IMPLEMENT/WAITING_EXTERNAL.
- proposal 8개, 조사한 해당 model root의 READY candidate 파일 0개. production은 candidate와 다르다. 결과 없는 prod-8에서 preview나 성공 prototype을 만들면 안 된다.
- Workspace `PROJECT-DOGFOOD-01`, `PROJECT-DOGFOOD-02`: active. genesis 참조만으로 실제 성공한 candidate promotion이라고 단정할 수 없다.
- Project Run `run-project-dogfood-01-1`: PREFLIGHT/BLOCKED_USER; `01-2`: CONTEXT/WAITING_AGENT; `01-3`: ANALYZE/PAUSED; `01-4`: ANALYZE/FAILED_RETRYABLE.
- Project Run `run-project-dogfood-02-1`, `02-3`: CONTEXT/FAILED_RETRYABLE; `02-2`, `02-4`, `02-5`: ANALYZE/FAILED_RETRYABLE.

올바른 Idea root에서는 prod-8 production과 campaign이 표시돼야 한다. 정식 프로젝트나 완료된 prototype으로 표시될 기록은 아니다. 현재 빈 화면은 데이터 삭제 증거가 아니며 경로 불일치와 목록 연결 누락으로 설명된다.

## 실행·통합의 실제 경계

- 기존 Harness는 단계 상태와 구조화 reasoning 검증을 사용하며 Desktop job/result identity를 구별한다. 웹 AI의 제안은 파일 변경 evidence가 아니다. UNKNOWN 외부 실행과 contained mutation을 자동 재시도해서는 안 된다.
- queue는 실행 의도와 requestedRunId/executionRequestId를 durable 저장한다. enqueue 미설정이면 최종 waiting/blocker, accepted/already-active이면 running으로 연결된다. 다만 claim 직후 일시 running 저장과 실제 enqueue 의미는 더 분리해 검증할 필요가 있다.
- `scheduleProjectWorkRequests`는 명시적으로 호출하는 bounded batch다. 선언 외 Runtime 상시 loop 호출을 확인하지 못했다. 요청 저장만으로 자동 개발을 시작하는 scheduler라고 보고하지 않는다. batch maxConcurrent는 모든 Runtime active Run의 전역 예산 보장과 다르다.
- reconciliation inspection은 읽기 전용이다. UNKNOWN에서 새 Run을 생성하지 않는다. 안전한 재연결 action, terminal Run→queue observer, 명시적 resume UX의 통합 완료는 아직 아니다.
- Discord `src/index.ts` bootstrap은 notification/binding root 설정 시 기존 client adapter를 주입한다. standalone Runtime host가 같은 adapter를 주입하는 경로는 확인되지 않았다. bridge의 발생 근거는 process-local refresh event이며 fact 생성 이전 장애에 대한 durable replay는 없다. fact/accepted 기록 테스트와 실제 채널 전달은 별개다.
- SSE는 fetch Bearer stream과 snapshot refresh다. durable replay가 아니다. 운영자 token 인증을 사용자별 tenant 인가로 취급하지 않는다.
- Git/PR/배포 adapter와 evidence 기반 portfolio draft는 존재하지만 실제 외부 계정 검증 및 개인 기여 귀속은 별도다. 학습/개인 세계/친구/혼합 팀은 이번 문서의 신규 설계다.

## 실제 검증

| 실행 명령 | 이번 결과 |
|---|---|
| `npm.cmd test` | 585 PASS, 0 FAIL, 0 skipped |
| `node --import tsx --test tests/iseol-runtime-host.test.ts tests/iseol-runtime-disposal.test.ts tests/project-purpose-profile.test.ts tests/desktop-agent-operator-reconciliation.test.ts` | 41 PASS, 0 FAIL, 0 skipped |
| `npm.cmd run build` | PASS |
| `node --check web/app.js` | PASS |
| `git diff --check` | PASS; 문서 마감 시 재검증 |

새 문서군과 인벤토리 8개 파일의 상대 Markdown 링크 및 UTF-8 replacement character 검사도 PASS였다. 복구 문서의 오래된 환경변수 전용 인증 설명은 현행 보호 credential 계약으로 정정했다. 이는 인증 코드나 credential 변경이 아니다.

전체 npm 스크립트는 저장소의 모든 test 파일을 포함하지 않는다. 별도 집중 실행 41개를 추가했으며 모든 브라우저/Live acceptance를 포함한다고 주장하지 않는다. 합성 fixture 테스트는 운영 Run을 재실행하지 않았다.

이번 단계의 새 인증 브라우저 acceptance는 미수행이다. 기본 화면 로드와 사용자가 인증 후 빈 목록을 확인한 선행 관찰만 있다. ChatGPT Web 실제 앱 생성, Discord 전송, GitHub push/PR, 배포는 미검증이다. 모든 과거 분기의 모든 코드와 모든 외부 계정까지 검증한 전수 감사도 아니다. 주요 src 영역·명령·API·설계·테스트를 인벤토리에 매핑했다.

## 후속 구현 결과와 다음 안전한 행동

조사에서 발견한 세 결함은 이후 격리 구현에서 해결했다. `loadRuntimeHostConfig`가 canonical Idea Lab store가 있는 legacy modelRoot를 dataRoot 컨테이너로 정규화하고 canonical/nested 충돌을 거부한다. `GET /api/projects`와 Project Workspace UI는 직접 workspace 목록을 읽으며 bearer 인증, 빈 목록, 조회 실패를 구분한다. promotion은 `projectModelRoot`를 사용해 분리 root 상세 조회와 일치하고, 이미 promoted된 후보가 다른 root에 조용히 복제되지 않도록 한다. 합성 브라우저 acceptance는 목록→상세→Idea 상세→promotion→Project 선택→오류/빈 상태를 통과했다. 전체 회귀는 591 PASS로 확장됐다. 이 변경은 운영 PID 9108이나 운영 저장소에 적용되지 않았다.

운영 설정을 바로 고치지 말고 이 변경을 포함한 별도 배포 fixture에서 root 계약과 목록·promotion 경계를 다시 확인한다. WAITING_EXTERNAL discovery가 복구돼도 enqueue 0회임을 검증한다. 오프라인 코드·테스트는 다음 개발 범위로 가능하고, 운영 root 변경·Runtime 교체·Live 요청은 각각 별도 승인이다. 구체 작업은 [로드맵](../superpowers/plans/2026-09-21-integrated-development.md)에 있다.
