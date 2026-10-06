# ISEOL 인수인계

작성 기준: 2026-09-21, 소스 `91e3605329deb2543187d46caa4accf2d6c8de86`. 변동 상태는 [조사 보고](audits/2026-09-21-system-review.md)의 시점 증거다.

## 제품과 이번 결정

ISEOL은 아이디어 → 복수 실제 프로토타입 → 체험/선택 → 기존 코드 기반 장기 개발 → 테스트/빌드/Git/리뷰/배포와 기록을 연결하는 플랫폼이다. 웹과 Discord는 같은 프로젝트에 접근하는 인터페이스다. 캠페인에서 후보를 선택하는 것은 플랫폼 전체의 프로젝트 수를 하나로 제한하지 않는다.

사용자는 기존 기능을 모두 보존하며 개인 세계·캐릭터·개인 AI 기억·성장·학습·스터디·사람/AI 혼합 팀·교류·포트폴리오를 추가하도록 확정했다. JSON durable store, Runtime, Harness, WebWorker, Desktop Agent와 기존 Discord를 단계적으로 확장하는 방향을 승인했다. 현재 문서 작성만 승인됐으며 신규 기능이 구현됐다는 뜻은 아니다.

## 기존 시스템 지도

| 책임 | 실제 위치 | 경계 |
|---|---|---|
| Discord bootstrap/기존 서비스 | `src/index.ts`, `src/commands`, `src/services` | 실제 계정 연결과 발신 가능; 조사 시 실행하지 않음 |
| 독립 Runtime CLI | `scripts/iseol-runtime-host.ts` | 설정, owner, stop, recovery, DPAPI operator 인증 |
| Runtime 조립 | `src/runtime/iseol-runtime-services.ts` | Desktop/브라우저/Harness/Web 조립, Project enqueue |
| 단계 실행 | `src/harness` | Run/state/checkpoint/evidence, 승인, side-effect ledger |
| 웹 AI | `src/chatgpt-web` | session/turn/intent, structured JSON/PATCH_FRAME_V1, bounded correction |
| 로컬 실행 | `src/desktop-agent` | connection capability, 승인된 intent, 경로/프로세스 제한, lease/result/containment |
| Idea Lab | `src/idea-lab`, `src/project-model/prototype-store.ts` | campaign/proposal/production과 READY candidate는 별도 모델 |
| 장기 프로젝트 | `src/project-model` | workspace/tree/history/purpose/queue/portfolio |
| 사용자 웹 | `src/web-control-plane`, `web` | 단일 bearer token, read model, fetch SSE; 다중 사용자 인가 아님 |
| 평가 | `src/evaluation` | quick/soak, fault/security/recovery fixture와 보고서 |

Run은 AI 대화가 아니라 durable 기록이 권위다. AI 제안, Desktop 실제 결과, provider 수락, 테스트/빌드 증거를 구별한다. UNKNOWN은 실패/미실행과 같지 않다. 학습 세션은 Project Run으로 위장하지 않고 새 도메인에 저장한다.

## 이력과 보존 대상

주요 흐름: calendar/review → Project Model/Harness → Web/Discord 공통 맥락 → ChatGPT Web/Desktop bridge → Idea Lab production/evaluation → Project root 분리/장기 실행 → containment/maintenance → 보호 operator credential → owner/version/통제 종료 → waiting 수정. 상세 커밋은 조사 보고에 있다.

다음은 테스트 fixture로 쓰지 않는다.

- `run-project-dogfood-02-1-context`, `run-project-dogfood-02-3-context`: pending이면서 contained. 과거 GIT_INIT 결과를 추정하지 않는다.
- `run-campaign-9973888a-f642-4f1c-ab20-76287283a761-prod-8`: WAITING_EXTERNAL, 과거 외부 결과 UNKNOWN.
- `run-project-dogfood-01-2`: WAITING_AGENT; agent reconnect만으로 재개하지 않는다.
- 기존 Run 1–5, retry budget, approval/audit/result, browser profile, 사용자 Git history 전체.

## 새 세션의 읽기 전용 확인

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
npm.cmd run iseol:runtime -- status
npm.cmd run iseol:runtime -- maintenance-status
```

설정은 `iseol-runtime.json`의 경로 필드만 검사한다. `.env` 전체, operator credential, cookie, raw AI 응답을 출력하지 않는다. JSON은 UTF-8로 읽는다. Windows PowerShell 기본 인코딩에 의한 깨짐을 JSON 손상으로 오판하지 않는다.

최신 Runtime의 공식 `stop`은 보호된 운영자 identity와 lock owner/fingerprint를 확인한 뒤 Runtime 자체의 identity-bound local control endpoint(named pipe on Windows)를 호출한다. `stop-requested`만으로 정상 종료를 판단하지 않고, Runtime이 `services.dispose()`와 lock release를 끝내 `{"state":"stopped"}`를 반환한 경우에만 성공으로 본다. 원본 콘솔을 잃은 legacy Windows 프로세스의 `operator-stop` 외부 종료는 graceful disposal이 아니다. 기존 stop 검증을 우회하거나 lock을 수동 삭제하지 않는다. operator-stop, lock-only recovery, startup은 각각 별도 승인 대상이다. 과거 승인은 새 PID/lock에 자동 적용되지 않는다.

## 후속 구현 상태

2026-09-21 후속 구현에서 Idea Lab root 중복, Project 목록 누락, 분리 root promotion 경계를 합성 fixture로 재현하고 수정했다. `scripts/iseol-runtime-host.ts`는 canonical store가 있는 legacy `<dataRoot>/idea-lab` 설정을 컨테이너 root로 정규화하며 canonical/nested 데이터가 동시에 있으면 fail-closed한다. `GET /api/projects`와 UI 목록은 기존 workspace를 직접 조회하고, promotion은 `projectModelRoot`에 저장한다. 다음 세션은 이 변경을 운영에 반영하기 전 startup recovery와 WAITING_EXTERNAL barrier를 운영과 분리된 배포 fixture에서 재검증해야 한다.

등록된 Web token은 operator DPAPI credential과 별개다. 브라우저 acceptance에는 운영자 직접 인증 또는 합성 서버/합성 토큰을 사용한다. 테스트용 토큰을 운영 credential로 등록하지 않는다.

소스의 이름만 존재하는 기능은 완료가 아니다. 전체 npm test에도 일부 집중 suite가 포함되지 않는다. 테스트 명령과 실제 출력은 조사 보고에 기록한다. 새로운 UI 구현은 API/Domain/durable/failure/reconnect까지 확인한 뒤 완료 판정한다.
