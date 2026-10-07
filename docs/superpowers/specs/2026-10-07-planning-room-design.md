# EEEE Planning Room Design

## 1. 목적

EEEE의 기존 기획 책임을 별도의 `Planning Room` 시스템 기능으로 분리한다. 사용자는 기획실에서 프로젝트 요구사항을 충분히 구체화할 수 있고, 기획실을 사용하지 않고 EEEE에 직접 요청한 경우에도 내부적으로 최소 기획을 자동 생성한 뒤 ISEOL에 넘긴다.

성공 기준은 다음과 같다.

- 사용자가 기획실에서 요구사항, 사용자 흐름, UX, 데이터, 기술 선택, 완료 기준, QA 기준을 단계적으로 정리할 수 있다.
- “Todo 앱 만들어줘”와 같은 직접 요청도 기획 단계를 건너뛰지 않는다.
- 승인된 기획만 ISEOL 실행 계획으로 전달된다.
- ISEOL은 기획된 작업을 세부 에이전트로 분해하고 개발·리뷰·QA·통합을 담당한다.
- ClaimLatch는 기획·실행·QA 결과의 주장과 근거를 검증하며, 검증되지 않은 결과는 릴리스나 기억 승격에 사용하지 않는다.
- 기존 EEEE 영속 기억, 프로젝트 revision, stale-write 보호를 유지한다.

## 2. 책임 경계

```text
사용자
  │
  ▼
EEEE
  ├─ Planning Room       요구사항을 기획 문서와 실행 계약으로 변환
  ├─ Memory               승인된 결과와 검증된 회고 저장
  ├─ Rule/Policy Engine   사용자·프로젝트 규칙의 우선순위와 승인 정책
  └─ Plugin Host          선택적 도구와 기본 시스템 플러그인 관리
       ├─ ISEOL            실행 계획·에이전트 조율·개발·QA·통합
       └─ ClaimLatch       주장·근거·해시·revision·릴리스 신뢰 검증
```

Planning Room은 외부에서 설치하는 일반 플러그인이 아니다. EEEE에 기본 포함되는 시스템 기능이며, ISEOL과 ClaimLatch도 기본 설치되는 시스템 플러그인으로 취급한다. 일반 플러그인은 별도 lifecycle로 pause/resume할 수 있지만, 핵심 안전 게이트는 사용자가 실수로 우회할 수 없도록 한다.

## 3. 실행 경로

### 3.1 깊은 기획 경로

1. 사용자가 Planning Room을 연다.
2. Planning Agent가 한 번에 하나씩 질문한다.
3. 답변이 들어올 때마다 세션 revision과 decision log를 갱신한다.
4. 다음 산출물을 만든다.
   - `project-brief.md`
   - `requirements.json`
   - `user-scenarios.md`
   - `ux-flow.md`
   - `technical-decisions.md`
   - `data-model.md`
   - `acceptance-criteria.md`
   - `qa-plan.md`
   - `task-dag.json`
   - `decision-log.md`
5. 사용자가 승인하면 Planning Room이 immutable handoff를 만들고 ISEOL에 전달한다.
6. ISEOL은 handoff를 기준으로 전문 에이전트 팀을 구성한다.

### 3.2 직접 요청 경로

1. 사용자가 EEEE에 “Todo 앱 만들어줘”라고 입력한다.
2. EEEE는 `quick planning`을 자동 실행한다.
3. 사용자에게 불필요한 질문을 반복하지 않고 기본값을 적용한다.
   - 기본 디자인 기준
   - FSD 구조
   - 로컬 실행
   - 반응형 UI
   - 기본 CRUD와 저장 방식
   - 단위·통합·E2E·반응형 QA
4. 사용자에게 보여줄 수 있는 요약 승인을 만들되, 단순 요청은 안전한 기본 정책에 따라 자동 승인한다.
5. 같은 Planning handoff 형식으로 ISEOL에 전달한다.

따라서 직접 요청은 기획실을 우회하지 않는다. 단지 사용자가 대화형 기획 화면을 직접 보지 않는 `quick planning` 모드일 뿐이다.

## 4. 상태 및 revision 모델

Planning session 상태는 다음으로 제한한다.

```text
draft → interviewing → awaiting_approval → approved → handed_off
                                      └→ blocked
```

- `draft`: 세션이 생성됐지만 질문이 시작되지 않음
- `interviewing`: 질문과 답변을 수집 중
- `awaiting_approval`: 필수 산출물과 acceptance criteria가 생성됨
- `approved`: 사용자 또는 정책에 의해 승인됨
- `handed_off`: ISEOL에 immutable handoff가 생성됨
- `blocked`: 필수 정보, 권한, 충돌 또는 검증 실패로 진행 불가

각 세션은 `project_id`, `revision`, `mode`, `created_at`, `updated_at`, `approved_at`, `handoff_id`를 가진다. 답변·결정·산출물 변경은 revision을 증가시킨다. ISEOL에 넘긴 뒤의 변경은 새 revision을 생성하며 기존 실행에는 소급 적용하지 않는다.

stale revision 쓰기는 기존 실행 저장소 정책을 그대로 따른다. 즉 초기 stale 생성은 거부하고, 기존 실행의 실패 관찰만 허용한다. Planning handoff도 동일한 revision 검사를 통과해야 한다.

## 5. 내부 계약

Planning Room은 ISEOL에 자연어만 전달하지 않는다. 다음 구조화된 계약을 전달한다.

```json
{
  "schemaVersion": "planning-handoff.v1",
  "planningSessionId": "...",
  "projectId": "...",
  "projectRevision": 1,
  "mode": "deep|quick",
  "userIntent": "...",
  "requirements": [],
  "userScenarios": [],
  "uxFlow": [],
  "technicalDecisions": [],
  "dataModel": [],
  "acceptanceCriteria": [],
  "qaPlan": [],
  "taskDag": {},
  "designBaseline": "oh-my-design-default",
  "rulesSnapshot": {},
  "approval": {
    "status": "approved",
    "actor": "user|policy",
    "timestamp": "..."
  },
  "evidenceRefs": []
}
```

ISEOL은 이 계약을 받아 작업을 쪼갠다. ISEOL이 자체적으로 작업을 재계획할 수는 있지만, 사용자 요구·승인·프로젝트 규칙을 삭제하거나 ClaimLatch 검증을 우회할 수 없다. 재계획으로 acceptance criteria나 위험도가 바뀌면 Planning Room에 변경 제안을 기록하고 새 revision을 요구한다.

## 6. 규칙 우선순위

충돌 시 다음 순서를 사용한다.

1. 안전·무결성 정책
2. 사용자 명시 요구사항
3. 프로젝트별 규칙
4. 승인된 Planning handoff
5. 기본 디자인·아키텍처·QA 정책
6. 에이전트의 임의 판단

규칙이 충돌하거나 권한이 필요한 경우 ISEOL은 작업을 강행하지 않고 `blocked` 또는 사용자 승인 대기로 전환한다.

## 7. 오류 및 검증

- 필수 기획 산출물이 없으면 ISEOL 실행을 만들지 않는다.
- Planning handoff의 project/revision이 현재 프로젝트와 다르면 stale 오류를 반환한다.
- ClaimLatch는 기획 주장의 evidence ref, 실행 결과, 테스트 로그, 파일 해시, revision을 검증한다.
- ISEOL QA는 코드 품질과 실제 동작을 검증한다. ClaimLatch는 “검증되었다”는 보고 자체의 신뢰성을 검증한다.
- ClaimLatch가 `WARN`이면 릴리스 정책에 따라 사용자 확인을 요구하고, `BLOCK`이면 릴리스·기억 승격을 차단한다.
- 질문 응답과 decision log는 실패해도 전체 세션을 손상시키지 않도록 원자적 저장을 사용한다.

## 8. UI 및 API 범위

첫 구현에서는 기존 데스크톱 작업공간의 프로젝트 화면에 `기획실` 진입점을 추가한다.

필수 API 경계:

- Planning session 생성
- 현재 질문 조회
- 질문 답변 제출
- 산출물 조회
- 계획 승인
- ISEOL handoff 생성
- 세션 상태 및 revision 조회

UI는 깊은 기획과 빠른 기획을 모두 지원한다. 단순 프로젝트 생성 화면은 기존 사용자 경험을 유지하되, 내부 이벤트와 진행 상태에는 Planning session이 표시되어야 한다.

### 8.1 사용자에게 보이는 실행 조직도

프로젝트 카드를 열면 단순한 상태 목록이 아니라, 기획부터 릴리스까지의 실제 실행 구조를 입체적인 조직도 형태로 표시한다. 이 조직도는 장식용 이미지가 아니라 현재 프로젝트의 실행 데이터에서 생성되는 뷰다.

```text
프로젝트 요청
  │
  ▼
👑 EEEE / Planning Room
  ├─ 요구사항 해석
  ├─ 질문·답변·결정 기록
  ├─ UX·데이터·기술·완료 기준 설계
  ├─ 규칙·기본값·사용자 선택 기록
  └─ Planning Handoff 승인
       │
       ▼
🟢 ISEOL Coordinator
  ├─ Task Decomposer
  │    ├─ 작업 분해
  │    ├─ 선행·후행 관계
  │    ├─ 위험도·우선순위
  │    └─ 담당 Agent 선정 이유
  ├─ Agent Team Factory
  │    ├─ UI / Design Agent
  │    ├─ Frontend / Feature Agent
  │    ├─ Backend / Data Agent
  │    ├─ Architecture Agent
  │    ├─ Test / E2E Agent
  │    ├─ Security / Encoding Agent
  │    └─ Documentation Agent
  ├─ Review Coordinator
  │    ├─ 코드 리뷰
  │    ├─ 요구사항 대조
  │    ├─ 회귀 검증
  │    └─ 문제 원인 Agent 재배정
  └─ Integration & Release
       │
       ▼
🔴 Quality & Trust Layer
  ├─ ISEOL QA
  │    ├─ 단위·통합·E2E
  │    ├─ 반응형·접근성
  │    ├─ 인코딩·빌드
  │    └─ 실제 사용자 흐름
  ├─ ClaimLatch
  │    ├─ 주장·근거 연결
  │    ├─ 파일 존재·SHA256
  │    ├─ 테스트 로그 대조
  │    ├─ 프로젝트·revision 일치
  │    └─ PASS / WARN / BLOCK
  └─ Memory Promotion Gate
       ├─ 검증된 결과
       ├─ 트러블슈팅
       ├─ 선택 이유·실패 시도
       └─ 다음 프로젝트 재사용 규칙
```

조직도 노드는 `대기·진행·성공·실패·차단·재시도` 상태를 표시한다. 노드를 클릭하면 담당 Agent, 입력, 출력 artifact, 의존 작업, branch/commit, 테스트 결과, 현재 결정 이유까지 펼쳐진다. 실패 노드는 원인 Agent와 재계획 경로까지 연결해 보여준다.

### 8.2 전체 개발 과정 기록

모든 중요한 작업은 append-only `Project Activity Ledger`에 남긴다. 자연어 보고만 저장하지 않고 실제 파일, 커밋, 테스트, QA, ClaimLatch 근거와 연결한다.

```json
{
  "eventType": "task.assigned|task.started|decision.made|agent.output|commit.created|review.completed|qa.completed|claimlatch.checked|memory.promoted",
  "projectId": "...",
  "projectRevision": 3,
  "runId": "...",
  "nodeId": "frontend.todo.list",
  "parentNodeId": "iseol.feature.todo",
  "actor": { "type": "agent|coordinator|user|system", "id": "..." },
  "summary": "Todo 목록 렌더링을 분리함",
  "reason": "요구사항 R-004와 FSD 경계를 유지하기 위해",
  "alternatives": ["페이지 컴포넌트에 직접 작성"],
  "selectedBecause": "재사용성과 테스트 격리를 확보할 수 있음",
  "inputs": ["artifact://planning/requirements.json"],
  "outputs": ["file://src/features/todo-list/..."],
  "evidenceRefs": ["test://todo-list.e2e", "commit://abc123"],
  "status": "completed",
  "occurredAt": "..."
}
```

개발 작업과 중요한 결정 이벤트에는 `reason`, `selectedBecause`, `inputs`, `outputs`, `evidenceRefs`를 필수로 둔다. 진행률 heartbeat처럼 의미가 없는 이벤트만 요약형을 허용한다.

사용자는 프로젝트 상세 화면에서 다음을 볼 수 있다.

1. **조직도**: EEEE → Planning Room → ISEOL → 세부 Agent → QA → ClaimLatch → 릴리스
2. **실행 타임라인**: 작업, 커밋, 리뷰, 재시도, 실패, 재계획
3. **결정 기록**: 무엇을 왜 선택했는지, 검토한 대안, 영향받는 요구사항과 파일
4. **검증 패널**: 테스트 명령, 결과, 로그, 해시, ClaimLatch 판정, 릴리스 가능 여부

원장 이벤트는 project revision과 run ID에 묶고 기존 이벤트를 수정하지 않는다. 정정이 필요하면 정정 이벤트를 추가한다. artifact에는 SHA256을 기록하고, ClaimLatch가 누락이나 불일치를 발견하면 조직도에 `BLOCK`을 표시한다. Memory Promotion Gate는 `PASS`된 실행 기록에서만 회고와 재사용 규칙을 승격한다.

## 9. 테스트 전략

테스트 우선으로 다음을 추가한다.

- 상태 전이와 필수 산출물 단위 테스트
- 질문·답변·revision 원자성 테스트
- 사용자 승인 전 ISEOL handoff 차단 테스트
- 직접 요청의 quick planning 자동 실행 테스트
- planning handoff와 ISEOL plan 계약 변환 테스트
- 조직도 노드와 원장 이벤트의 parent/child 연결 테스트
- 개발 결정 이벤트의 reason/alternative/evidence 필수 필드 테스트
- commit·테스트·QA·ClaimLatch 결과가 동일 run ID로 연결되는지 검증
- 실패 Agent와 재계획 경로가 조직도에 표시되는지 검증
- stale revision 및 재계획 충돌 테스트
- ClaimLatch evidence ref 전달 테스트
- API route 테스트
- 기존 Todo vertical slice 회귀 테스트
- 전체 Python/ISEOL/ClaimLatch 통합 검증

완료 조건은 직접 요청으로 생성한 Todo 프로젝트가 Planning → ISEOL → QA → ClaimLatch 검증 → 결과 반환까지 한 번에 지나고, 각 단계의 기록을 사용자가 조회할 수 있는 것이다.

## 10. 범위 제외

이번 단계에서는 다음을 구현하지 않는다.

- 모바일 클라이언트
- 외부 플러그인 마켓플레이스
- Google Calendar 등 외부 서비스 어댑터
- 포트폴리오 자동 작성 기능
- 새로운 LLM 공급자 또는 별도 서버 인증 시스템

이 기능들은 Planning/ISEOL/ClaimLatch 계약이 안정화된 뒤 플러그인으로 추가한다.
