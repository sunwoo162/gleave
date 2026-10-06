# ISEOL 통합 개발 로드맵

상태: 승인된 architecture 1의 구현 계획. 이번 세션은 문서 작성만 승인됐으며 아래 구현·운영 action을 수행하지 않았다. 기존 JSON store/Runtime/Harness/WebWorker/Desktop/Discord를 유지한다. [조사](../../audits/2026-09-21-system-review.md), [제품](../../ISEOL_PRODUCT_SPEC.md), [학습](../../ISEOL_LEARNING_SPEC.md), [아키텍처](../../ISEOL_ARCHITECTURE.md)를 먼저 읽는다.

## 완료: 저장소 경로와 목록 회귀 복구

목적은 기존 사용자가 존재하는 campaign과 workspace를 실제 화면에서 선택하게 하는 것이었다. 운영 화면을 채우기 위해 새 campaign을 만들지 않았다.

1. 최신 Git/작업 트리 및 읽기 전용 상태를 확인했다. 운영 root는 fixture로 사용하지 않았다.
2. 임시 root에 campaign 1개, WAITING_EXTERNAL production/run 1개, 완료된 candidate 1개, 별도 Project root에 기존 active workspace 1개를 구성한다. 모든 ID와 경로는 합성값이다.
3. `src/idea-lab/store-utils.ts`, `scripts/iseol-runtime-host.ts`, `src/runtime/iseol-runtime-services.ts`와 Web Control Plane의 root 전달 계약을 테스트로 고정한다. root 중복이 빈 성공으로 숨는 경우를 재현한다. 기존 canonical layout을 보존할 방식을 선택하고 자동 운영 migration은 하지 않는다.
4. `src/web-control-plane/router.ts`와 `web/app.js`에 대한 별도 project list 회귀를 먼저 작성한다. existing workspace와 promoted candidate의 관계를 분리한다. Project 목록 API 계약/권한과 선택 상태를 설계한 뒤 구현한다.
5. 서로 다른 modelRoot/projectModelRoot에서 promotion→workspace detail의 쓰기/읽기 위치를 재현한다. origin/genesis evidence 보존 및 같은 candidate 반복 promotion의 idempotency를 검증한다.
6. root 수정 후 startup fixture에서 WAITING_EXTERNAL/WAITING_AGENT/contained job enqueue·redispatch가 0회인지 검사한다. 읽기 복구가 실행 허가를 의미하지 않게 한다.
7. 실제 임시 브라우저에서 인증→목록→상세→뒤로→오류를 검증한다. fixture promotion만 수행하고 운영 token/profile은 사용하지 않는다.
8. 집중 테스트, 기존 runtime/containment 회귀, npm test/build/static 검사와 합성 Chrome 검증을 통과시켰다. 운영 설정 반영은 결과와 영향 범위를 제시하고 별도 승인받는다.

완료 기준 충족: fixture 목록 수가 durable 원본과 일치하고 기존 project가 prototype 없이도 선택 가능하다. production waiting은 완료 preview로 보이지 않는다. 분리 root promotion 상세가 성공하며 보호 작업 dispatch 0회다. 합성 Chrome에서 목록·상세·뒤로 이동·promotion·오류·빈 상태를 확인했다. 운영 browser acceptance는 아직 미검증이다.

## 다음 세션의 첫 작업

운영 Runtime을 교체하지 않고, 동일 수정본을 별도 배포 fixture로 기동해 canonical root discovery와 recovery barrier를 검증한다. 그 다음 단계는 queue의 terminal Run observer와 명시적 resume UX다.

## 단계별 범위·검증·완료 기준

| 단계 | 목적과 사용자 기능 / 코드 범위 | 선행·위험 | 테스트와 실제 acceptance / 완료 기준 |
|---|---|---|---|
| 0 기존 조회 복구 | 위 root/list/promotion, 기존 Idea/Project UX 유지 | 현재 결함 재현; 운영 discovery 변화 위험 | 위 fixture와 실제 브라우저, 보호 상태 자동실행 0 |
| 1 실행 일관성 | work-request/Runtime/router: 실행 허가·claim·Run 연결·terminal 관찰·inspect/resume UI | 0; Run identity, 늦은 결과, 동시 batch 전역 예산 | crash A–F, dependency 모든 상태, 동시 claim, UNKNOWN 재생성0; UI waiting/blocker→허가된 fixture Run→history 일치 |
| 2 실제 개발 acceptance | 기존 WebWorker/ChatGPT adapter/Desktop/Harness로 신규 격리 앱 생성 경로 | 1, Desktop capability/허용 workspace/AI 예산; 운영 UNKNOWN 재사용 금지 | 먼저 fake provider+실제 fixture files/test/build/git, 이후 별도 승인된 최대1 신규 Live Run; 파일·테스트·빌드·커밋 evidence까지 있어야 Live 성공 |
| 3 기존 외부 연동 완성 | Discord client 주입/event fact 누락 정책, calendar/review/GitHub/deploy 및 resume UX | 1과 병렬 가능; 채널 권한, accepted≠exactly once, 외부 비용 | mock end-to-end와 timeout/unknown/no resend; 별도 계정 승인 후 실제 메시지/PR/배포 각각 확인. 기존 명령 회귀 유지 |
| 4 사용자 기반 | 제안 `src/identity`, `src/access`, platform JSON namespace, 개인·팀 소유권 | 기존 operator control와 분리; legacy 데이터 자동 귀속 금지 | A/B IDOR, path traversal, membership revoke, auth 만료, backup/restore; 사용자별 read/write 차단이 API/UI 모두 증명됨 |
| 5 개인 세계·AI·활동 | 제안 world/profile/memory/activity/growth; evidence attribution | 4; 사적 기억 유출, AI 기여를 사용자 역량으로 오인 | event dedup/retraction, private/team retrieval, source 삭제; 근거로 성장 결과 추적·정정 가능 |
| 6 학습 최소 흐름 | 제안 learning stores/API/UI, AI 작업 adapter, 템플릿 A/B/C/D/E/F | 4, 공통 AI 계약; 세 입력 이외 필수 질문 금지 | fake adapter로 분야 자유입력→계획 preview→시작→수업→답변→feedback→재접속; UNKNOWN 재전송0, 두 사용자 격리 |
| 7 학습 장기 운영 | 템플릿 G/H/I/J/K, review/plan version/progress/calendar 연결 | 6, 5는 growth 연동 선행; 시간대/결석/AI 오답 | 고정 clock으로 30일 압축, 일정 변경CAS, 두 기기 중복 제출, 평가 정정; 완료 기록 보존·복습·계획 재조정 실제 브라우저 확인 |
| 8 스터디·혼합 팀 | membership/role/shared task, 솔로·AI·사람·혼합 팀 UX | 4; AI actor와 human principal, private memory 경계 | 초대/탈퇴/역할 변경/동시 편집; 스터디 공동 자료만 공유되고 개인 답변은 동의 없이 비공개 |
| 9 교류·모집 | profile/friend/chat/community/recruitment/application/join | 4,8; 차단·스팸·첨부 권한·중복 합류 | 지원→승인→membership 원자적 관계, 철회/거절, 차단 사용자 접근; 기존 Discord 명령 보존 |
| 10 포트폴리오 통합 | 기존 project portfolio draft+user evidence projection | 5,7,8; 공동/AI 기여 귀속, 공개 동의 | Git/test/review/learning evidence 링크, 권한 철회, 소스 없는 문장 표시; 사용자가 검수한 공개본만 외부 공유 |

## 단계 1의 구체 안전 계약

queue 저장과 실행 허가를 구분한다. scheduler는 명시적으로 허가된 항목만 고르며 Runtime 미설정은 waiting이다. requestedRunId/executionRequestId를 실제 호출 전에 durable 저장하고 생성 후 응답 유실은 같은 Run 탐색으로 처리한다. 부재를 증명할 수 없으면 UNKNOWN으로 남긴다. active lease나 기존 mutation을 resume 버튼으로 덮지 않는다.

Run terminal 상태를 queue에 투영하는 observer는 실제 Run identity·revision을 확인하고 성공 추정 없이 완료/실패/대기를 매핑한다. 이전 owner의 늦은 결과가 새 상태를 덮지 못해야 한다. queued cancel과 이미 실행된 Run 취소 요청을 다른 action으로 모델링한다. 일반적인 lease 만료를 재실행 허가로 해석하지 않는다.

## 단계 6–7의 구현 단위

1. 사용자별 Goal/PlanVersion/Day/Session/Answer/Feedback/Review JSON 계약 및 CAS/idempotency 구현.
2. 세 입력 화면과 계획 요청 상태/preview. 분야 hardcoded curriculum 금지; 미구현 provider는 blocker로 표시.
3. AI adapter에 templateVersion/inputHash/request identity/schema validator 연결. A–K를 단일 거대 prompt로 합치지 않는다.
4. 답변 먼저 저장→평가 작업→feedback commit; 네트워크 오류 후 같은 answer 재조회. 정답 공개 이후 attempt와 자력 풀이를 구분.
5. plan version 제안/승인, 이전 완료 기록 유지; 복습·기억·성장 이벤트에는 source와 owner를 필수로 둔다.
6. mock acceptance 후 별도 AI 실행 승인. 언어 음성·코드 sandbox 등 capability가 없으면 해당 활동을 완료했다고 하지 않는다.

각 PR은 해당 단위 테스트와 임시 root API 통합을 포함한다. 사용자 간 격리가 없는 상태로 학습 데이터를 기존 operator 전역 store에 운영 저장하는 지름길을 만들지 않는다.

## 병렬 가능성과 승인 경계

- 기존 실행 안정화 0–3을 새 제품 때문에 뒤로 미루지 않는다. 사용자 기반4의 격리 설계/fixture는 1–3과 병렬 가능하다.
- 세계·성장5와 학습6의 독립 코드 작업은 4 이후 병렬 가능하나 사용자 growth 연결은 공통 activity 계약 이후다.
- 스터디8은 학습 전체 Live 완료를 기다릴 필요가 없지만 membership/privacy 선행은 필수다. 포트폴리오의 기존 개발 evidence 개선은 10 이전에도 가능하다.
- 코드·문서·합성 테스트는 운영과 분리한다. Runtime 교체, 기존 root 변경/마이그레이션, 신규 Live AI, 외부 전송·push·배포는 각각 대상·예산·중단 조건을 제시하고 별도 승인받는다.
- 기존 prod-8/WAITING_AGENT/contained job은 어떤 단계에서도 acceptance fixture가 아니다. 예상치 못한 owner, mutation, UNKNOWN 재dispatch가 발견되면 해당 운영 단계는 중단한다.

## 모든 단계의 보고 규칙

구현, API 연결, UI 연결, 실제 브라우저, 격리 Harness, 운영 반영, ChatGPT Web Live, 실제 Discord/GitHub/배포를 서로 다른 열로 기록한다. npm test 통과를 Live 앱 생성이나 학습 정확성 보장으로 바꾸지 않는다. 발견한 새 기능과 과거 설계는 인벤토리에 추가하고 기존 기능을 삭제·skip하여 완료 수치를 만들지 않는다.
