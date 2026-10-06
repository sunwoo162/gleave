# Personal Development Orchestrator 설계 문서

- 작성일: 2026-09-28
- 상태: 제품 방향 승인됨, 구현 전 설계
- 범위: 하나의 프로젝트와 노트북의 개발 도구·Codex 창·에이전트를 통합 관리하는 로컬 우선 비서

## 1. 목적

이 시스템의 비서는 긴 대화 하나를 계속 유지하며 모든 개발 작업을 직접 수행하는 단일 코딩 에이전트가 아니다. 사용자의 프로젝트를 하나의 운영 단위로 만들고, 여러 Codex 창을 작업자 에이전트로 등록·배정·격리·통합·검증하는 상위 Coordinator다.

사용자는 여러 창의 상태와 토큰 사용량을 직접 조정하지 않고, 비서에게 결과 중심의 요청을 한다. 비서는 필요한 도구와 작업자를 선택하고, 최신 프로젝트 상태를 기준으로 결과를 통합한 뒤 변경 사항과 검증 결과를 보고한다.

## 2. 해결하려는 문제

- 하나의 Codex 대화가 길어지면서 전체 대화 맥락과 반복적인 코드 설명이 토큰을 계속 소모한다.
- 여러 Codex 창이 같은 폴더를 수정하면 변경 순서와 최신 상태가 불분명해진다.
- 작업자마다 서로 다른 기준 커밋을 보고 작업해 충돌과 재작업이 발생한다.
- 에이전트의 완료 주장을 실제 테스트·빌드 결과와 구분하기 어렵다.
- 파일, 터미널, Git, 브라우저, 패키지 관리자, 개발 서버를 각각 수동으로 조작해야 한다.

## 3. 목표와 성공 기준

### 목표

1. 프로젝트마다 하나의 비서 세션과 정식 최신 상태를 제공한다.
2. Codex 창 하나를 등록된 작업자 에이전트 하나로 취급한다.
3. 작업별로 필요한 맥락만 전달해 긴 대화의 반복 토큰을 줄인다.
4. 작업자별 브랜치·worktree·파일 소유권을 관리해 동시 수정 충돌을 줄인다.
5. 통합은 최신 기준에서 단일 Coordinator가 수행하고, 통합 후 결정론적 검증을 다시 실행한다.
6. 파일시스템·터미널·Git·브라우저·개발 도구를 공통 도구 인터페이스로 사용한다.
7. 사용자가 전체 권한 모드를 선택하더라도 모든 작업은 기록·감사·복구 가능하게 한다.

### 성공 기준

- 사용자는 “로그인 기능을 추가하고 테스트까지 끝내줘”처럼 결과 중심으로 요청할 수 있다.
- 비서는 작업을 백엔드·프론트엔드·테스트 등으로 분해하고 각 작업자를 추적한다.
- 작업자는 자신에게 필요한 요구사항·파일 목록·기준 revision만 받는다.
- 기준 revision이 오래된 작업자는 통합 전에 stale 상태로 차단된다.
- 통합 브랜치의 모든 완료 표시는 최신 테스트·빌드·검증 결과를 근거로 한다.
- 모든 도구 실행에는 호출 목적, 실행 주체, 명령, 결과, 영향 파일이 남는다.
- 작업자 수를 늘렸는데 중복 맥락 때문에 토큰이 증가하는 경우 Coordinator가 병렬화를 줄인다.

## 4. 비목표

- 모든 운영체제의 임의 GUI를 초기 버전부터 완벽하게 자동 조작하지 않는다.
- 연결되지 않은 기존 Codex 창의 내부 대화나 의도를 추측하지 않는다. 창은 등록·heartbeat·handoff 프로토콜에 참여해야 한다.
- 무제한 자율 멀티에이전트 swarm을 만들지 않는다.
- 사용자 승인 없이 배포, 외부 메시지 전송, 결제, 데이터 삭제를 수행하지 않는다.
- 초기 버전에서 여러 컴퓨터를 중앙 클라우드로 동기화하지 않는다. 우선 한 노트북·한 프로젝트를 대상으로 한다.

## 5. 사용자 경험

### 프로젝트 세션

사용자가 저장소나 작업 폴더를 프로젝트로 열면 비서는 현재 HEAD, 작업트리 변경, 실행 환경, 기존 작업자를 스냅샷으로 기록한다. 프로젝트 화면에는 다음을 보여준다.

- 프로젝트 최신 통합 revision
- 진행 중·대기·차단·stale 작업
- 작업자별 역할, worktree, 기준 revision, 마지막 heartbeat
- 변경 파일과 통합 대기 커밋
- 테스트·빌드·실행 결과
- 토큰 예산과 작업별 사용량 추정
- 승인 대기 중인 위험 작업

### 결과 중심 명령

예시 요청:

> 결제 기능을 추가하고, 현재 구조에 맞게 구현한 뒤 테스트와 개발 서버 확인까지 해줘.

비서는 요구사항을 작업 계획으로 만들고, 필요한 작업자를 등록한 뒤 다음 단계를 자동으로 수행한다.

1. 현재 상태를 기준으로 작업 계획과 완료 기준을 만든다.
2. 독립 작업만 병렬화하고, 같은 파일을 만지는 작업은 순서를 정한다.
3. 각 작업자에 최소 맥락 작업 패킷을 전달한다.
4. 결과를 구조화된 handoff로 회수한다.
5. 통합 큐에서 충돌과 stale 상태를 검사한다.
6. Coordinator가 최신 상태에 통합한다.
7. 테스트·빌드·실행 검증을 수행한다.
8. diff, 로그, 실패 원인, 남은 작업을 보고한다.

## 6. 시스템 구조

```text
사용자
  ↓
Coordinator 비서
  ├─ 요구사항·작업 계획기
  ├─ 프로젝트 최신 상태 저장소
  ├─ 작업자 등록·lease·heartbeat 관리자
  ├─ 토큰·맥락 예산 관리자
  ├─ 권한·명령 정책
  ├─ 통합 큐·충돌 관리자
  ├─ 결정론적 검증기
  └─ 도구 어댑터
       ├─ 파일시스템
       ├─ 터미널·프로세스
       ├─ Git·worktree
       ├─ Codex 작업자 창
       ├─ 브라우저·문서
       ├─ 패키지 관리자
       └─ 개발 서버
```

### Coordinator

Coordinator만 프로젝트의 정식 최신 상태를 변경한다. 작업자에게 작업을 배정하고, 작업자 결과를 저장하며, 통합과 검증을 순서대로 실행한다.

### Worker Session

Codex 창은 `AgentSession`으로 등록된다. 등록 정보에는 역할, 작업 ID, worktree, 기준 revision, 소유 경로, 허용 도구, 토큰 예산, 상태, heartbeat가 포함된다. 작업자는 전체 프로젝트 대화가 아니라 작업 패킷과 필요한 파일의 요약만 받는다.

### State Store

초기 버전은 로컬 SQLite를 사용한다. SQLite WAL과 트랜잭션을 이용해 작업 등록, lease 갱신, 이벤트 append, revision 기록을 직렬화한다. 다른 컴퓨터나 여러 사용자가 필요해질 때만 서버 DB로 확장한다.

### Tool Adapter

각 도구는 공통 인터페이스로 노출한다.

- `inspect`: 상태·파일·로그 읽기
- `plan`: 작업 계획 생성
- `edit`: 승인된 작업공간 수정
- `run`: 승인된 명령·프로세스 실행
- `test`: 결정론적 검증 실행
- `report`: 결과·diff·산출물 정리

어댑터는 모델이 주장한 결과가 아니라 실제 도구의 반환값을 상태에 기록한다.

## 7. 최신 상태와 동시성 모델

### 정식 최신 상태

“최신”은 파일의 수정 시각이 아니라 Coordinator가 승인한 `ProjectRevision`으로 정의한다. revision에는 기준 commit SHA, 작업트리 fingerprint, 통합 시각, 검증 결과가 포함된다.

### 작업 격리

각 작업자는 가능하면 별도 Git worktree와 브랜치를 사용한다. 공용 폴더에서 직접 수정하는 fallback은 읽기 전용 조사나 단일 작업자에 한정한다.

### Lease와 stale 처리

작업·파일 소유권은 만료 시간이 있는 lease로 관리한다. heartbeat가 일정 시간 끊기거나 기준 revision이 현재 통합 revision과 다르면 작업자를 stale로 표시한다. stale 작업의 결과는 자동 통합하지 않고 재기준화 또는 재검토를 요구한다.

### 통합 단일화

작업자는 통합 브랜치에 직접 쓰지 않는다. Coordinator만 통합 큐에서 커밋을 적용하고 충돌을 분류한다. 통합 후에는 테스트와 빌드를 최신 revision에서 다시 수행한다.

## 8. 토큰 최적화 전략

토큰 절약은 단순히 창을 많이 여는 방식이 아니라, 불필요한 맥락 전달을 없애는 방식으로 달성한다.

- 작업마다 목표, 완료 기준, 허용 경로, 기준 revision, 관련 파일만 전달한다.
- 작업자 결과는 전체 대화가 아닌 요약, 변경 파일, 커밋, 테스트 결과, blockers로 회수한다.
- 전체 저장소 재탐색 대신 프로젝트 인덱스와 파일 fingerprint를 재사용한다.
- 실패한 작업은 같은 긴 컨텍스트를 무한 재사용하지 않고 원인 요약과 최신 diff로 새 작업자에게 넘긴다.
- 리뷰 작업자는 전체 프로젝트가 아니라 최신 diff, 요구사항, 검증 결과만 받는다.
- 독립성이 낮은 작업은 병렬화하지 않아 중복 읽기와 충돌을 줄인다.
- 각 작업에 예산·재시도 횟수·시간 제한을 둔다.

Coordinator 자체의 판단 비용도 포함해 총 토큰 사용량을 측정한다. 병렬화로 총량이 증가하면 자동으로 순차 처리하거나 작업을 더 크게 묶는다.

## 9. 권한과 안전

사용자는 프로젝트별 실행 모드를 선택한다.

- `supervised`: 파일 수정·설치·명령별 승인을 받음
- `local_auto`: 지정 프로젝트 작업공간 내 수정·설치·테스트를 자동 수행
- `trusted`: 사용자가 승인한 도구와 범위에서 최대한 자동 수행

모드와 관계없이 다음은 별도 보호한다.

- 프로젝트 밖 경로 접근
- 데이터 삭제·파괴적 명령
- Git push·배포·외부 메시지·결제
- 시스템 전역 설정 변경
- 비밀정보의 모델 입력·로그 노출

모든 도구 실행에는 실행 전 정책 판정과 실행 후 결과 기록이 필요하다. 취소 버튼, 작업 중단, 마지막 통합 revision 복구, 명령 로그 조회를 제공한다.

## 10. 핵심 데이터 모델

- `Project`: 저장소 경로, 작업공간, 기본 실행 모드, 현재 통합 revision
- `ProjectRevision`: commit SHA, 상태 fingerprint, 부모 revision, 검증 결과
- `AgentSession`: Codex 창 또는 런타임, 역할, worktree, 상태, heartbeat, 토큰 예산
- `Task`: 목표, 완료 기준, 의존 작업, 소유 경로, 상태, 기준 revision
- `TaskLease`: 작업자, 경로, 만료 시각, 갱신 이벤트
- `Handoff`: 요약, 변경 파일, 커밋, 테스트, blockers, 다음 작업
- `ToolAction`: 도구, 명령, 권한 판정, 결과, 영향 파일, 실행 주체
- `VerificationReport`: 명령, exit code, 출력 경로, PASS/WARN/BLOCKED
- `Artifact`: diff, 로그, 리포트, 스크린샷, 실행 결과

## 11. 단계별 구현 범위

### 1단계: Coordinator 기반

- 프로젝트 세션과 현재 revision 기록
- Task·AgentSession·lease·heartbeat 저장
- worktree 생성 및 상태 확인
- 구조화된 작업 패킷·handoff 형식
- 통합 큐와 stale 차단

### 2단계: Codex 작업자 연결

- 작업자 등록 API 또는 로컬 CLI
- 작업 시작·진행·완료·실패 이벤트
- 작업자별 기준 revision 및 변경 커밋 수집
- 수동으로 열린 Codex 창도 등록할 수 있는 프로토콜

### 3단계: 도구 실행과 검증

- 파일·터미널·Git·패키지·개발 서버 어댑터
- 명령 정책과 작업공간 경계
- 최신 통합 상태에서 테스트·빌드 검증
- 토큰 예산·재시도·중단 정책

### 4단계: 로컬 Web UI

- 프로젝트 현황판
- 작업자·작업·충돌·통합 큐 화면
- 실행 로그와 변경 diff
- 승인·중단·재기준화 조작

### 5단계: 확장 도구

- 브라우저 자동화
- 문서·검색 연결
- 디자인·시각 검증
- 백업·복구와 개발환경 진단

## 12. 현재 코드와의 연결

현재 저장소의 `SQLiteStore`, 실행 이벤트 저장, 요구사항 planner, 승인·권한 서비스는 Coordinator 기반의 초기 재료다. 다음 구현에서는 기존 기능을 버리지 않고 다음 모듈을 추가한다.

- `app/coordinator/`: 프로젝트 revision, task lease, agent session, integration queue
- `app/workspace/`: worktree·경로 경계·복구
- `app/agent/`: Codex 작업자 프로토콜과 런타임 어댑터
- `app/tools/`: 파일·명령·Git·프로세스 공통 어댑터
- `app/verification/`: 최신 상태 기준 결정론적 검증
- `app/api/` 및 `app/static/`: 로컬 현황판과 조작 API

기존 OSS 조사·선정 흐름은 이 Coordinator가 실행할 수 있는 첫 번째 업무 유형으로 유지한다.

## 13. 주요 위험과 대응

### 작업자 상태를 자동으로 알 수 없음

임의의 Codex 창을 감시하는 것만으로는 내부 의도와 완료 상태를 보장할 수 없다. 등록·heartbeat·handoff를 필수 프로토콜로 하고, 응답이 없으면 stale로 처리한다.

### 병렬화가 토큰을 더 사용함

작업별 토큰 예산과 총량 측정을 두고, 독립성이 낮은 작업은 순차화한다. 비서가 병렬화를 목적이 아니라 비용·시간 최적화 수단으로 선택한다.

### 자동 통합으로 결함이 합쳐짐

Coordinator만 통합하고, 최신 통합 revision에서 테스트·빌드·리뷰를 다시 실행한다. 에이전트의 완료 메시지는 검증 증거로 인정하지 않는다.

### 높은 권한으로 인한 피해

권한 모드, 명령 allowlist, 외부 영향 분리, 실행 로그, 중단·복구 지점을 제공한다. 사용자가 trusted 모드를 선택해도 회복 불가능한 작업은 별도 차단한다.

## 14. 완성 상태

사용자가 프로젝트 하나를 열고 결과 중심의 요청을 하면, 비서가 필요한 Codex 창과 도구를 구성한다. 각 작업자는 최소 맥락으로 작업하고, 비서는 최신 revision·파일 소유권·권한·토큰 예산·검증 결과를 관리한다. 사용자는 개별 창의 내부 진행을 따라가지 않고, 통합된 진행 상태와 최종 결과만 확인한다.

## 15. 오픈소스 활용 전략

이 시스템은 에이전트 실행·상태 관리·도구 프로토콜을 처음부터 재구현하지 않는다. 아래 프로젝트를 실제 의존성 또는 구현 기준으로 사용하고, 프로젝트별 성숙도·라이선스·보안 범위를 확인해 도입한다.

| 영역 | 오픈소스 | 활용 방식 | 도입 판단 |
| --- | --- | --- | --- |
| 코딩 에이전트 실행 | [OpenHands Software Agent SDK](https://github.com/openhands/software-agent-sdk) | Agent, Conversation, Tool, Workspace, Event, Agent Server와 REST/WebSocket 경계를 `app/agent`의 기본 런타임으로 사용 | 1순위 실행 기반. 로컬 workspace와 격리 workspace를 모두 지원하는지 설치 프로토타입으로 확인 |
| 에이전트 제어 화면·백엔드 경계 | [OpenHands](https://github.com/OpenHands/OpenHands) | Agent Canvas와 Agent Server의 다중 에이전트·다중 backend·자동화 구조를 참조하고, 필요한 경우 Agent Server API에 연결 | 전체 UI를 포크하지 않고 우선 API와 경계만 재사용 |
| Coordinator 상태 그래프 | [LangGraph](https://github.com/langchain-ai/langgraph) | 계획·배정·실행·리뷰·통합·검증 노드를 durable execution, checkpoint, human-in-the-loop 상태 그래프로 구성 | Coordinator 1단계의 핵심 후보. SQLite 저장소와 checkpoint 책임을 중복시키지 않는 프로토타입 필요 |
| 도구 연결 표준 | [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) | 파일·Git·명령·브라우저·문서·개발 서버를 MCP server/tool/resource로 노출하고 작업자에게 필요한 도구만 연결 | 직접 만든 도구 API보다 우선 사용. 로컬 stdio와 Streamable HTTP를 모두 고려 |
| 저장소 맥락·토큰 최적화 | [Aider](https://github.com/Aider-AI/aider) | repository map, 파일 중요도·의존성 기반 선택, Git diff/commit/test 연동 방식을 `ContextIndexer`와 작업 패킷 설계에 반영 | Aider 전체를 Coordinator에 내장하지 않고, 필요 시 CLI adapter 또는 해당 패턴의 독립 구현 사용 |
| Codex CLI 병렬 통합 참고 | [MORE-AGENTS](https://github.com/lazeash/more-agents) | LangGraph + Codex CLI + worktree + worker logs + consolidation의 실제 scaffolding을 비교 기준과 테스트 시나리오로 활용 | 2026년 초기 scaffold이며 활동·검증 규모가 작으므로 런타임 의존성으로 채택하지 않고 참고 구현으로만 사용 |

### OpenHands SDK와 자체 Coordinator의 경계

OpenHands SDK는 에이전트의 reasoning-action loop, 대화, 도구, workspace, 이벤트, 원격 Agent Server를 담당한다. 우리 Coordinator는 그 위에서 프로젝트 요구사항, 작업 lease, Codex 창 등록, 토큰 예산, 통합 큐, 최신 revision, 승인 정책, 최종 검증을 담당한다. 동일한 실행·이벤트·workspace 기능을 별도로 재작성하지 않는다.

### LangGraph와 SQLite의 경계

LangGraph는 실행 흐름과 checkpoint를 관리하고, SQLite는 프로젝트·작업자·lease·revision·도구 실행·검증 결과의 감사 가능한 영속 저장소로 둔다. 그래프 checkpoint와 도메인 상태가 서로 다른 사실을 말하지 않도록 매 노드 전환 시 `ProjectRevision`과 이벤트를 함께 기록한다.

### MCP 도구 경계

MCP server는 도구의 호출 경계를 제공하지만 권한 판정의 최종 주체가 아니다. 모든 MCP 호출은 Coordinator의 `CommandPolicy`를 거치고, 작업자·프로젝트·worktree·허용 경로·실행 모드에 따라 허용 여부를 기록한다. MCP server가 직접 프로젝트 밖 경로나 외부 서비스를 열지 않도록 서버별 capability를 명시한다.

## 16. 오픈소스 검증·고정 규칙

- 각 의존성은 공식 저장소 URL, commit/tag, 라이선스, 도입 이유, 대체안, 알려진 위험을 `OSS-DECISIONS.md`에 기록한다.
- `latest` 설치를 금지하고 lockfile과 버전 범위를 고정한다.
- OpenHands의 실행 이미지·Agent Server, MCP server, 브라우저 자동화 도구는 프로젝트 밖 쓰기와 비밀정보 접근을 별도 검증한다.
- Agent Server는 로컬 기본 바인딩과 인증 설정을 확인하고, 인증 없는 외부 노출을 허용하지 않는다.
- 0에 가까운 활동 규모의 프로젝트는 설계 아이디어와 테스트 케이스만 참고하고, 핵심 실행 경로에는 넣지 않는다.
- 오픈소스의 성공 메시지나 에이전트 주장보다 실제 exit code, diff, 테스트 출력, 통합 revision을 우선한다.
- 의존성 업데이트는 Coordinator가 자동으로 적용하지 않고, 변경 diff와 라이선스·보안 영향 보고 후 승인받는다.

## 17. 조사한 공식 소스와 품질 판단

- [OpenHands Software Agent SDK](https://github.com/openhands/software-agent-sdk): 공식 SDK 저장소이며 agent, tool, workspace, event, Agent Server를 직접 소유한다. 실제 실행 기반으로 가장 높은 관련성을 가진다.
- [OpenHands Agent Canvas](https://github.com/OpenHands/OpenHands): 공식 self-hosted control center와 다중 backend 구조를 제공한다. 제품 UI 전체를 그대로 가져오기보다 경계와 API를 참고한다.
- [LangGraph](https://github.com/langchain-ai/langgraph): 공식 저수준 stateful orchestration framework다. 장기 실행·checkpoint·human-in-the-loop가 Coordinator 요구와 직접 겹친다.
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk): 공식 Python SDK로 tool/resource/prompt와 stdio·Streamable HTTP transport를 제공한다. 도구 연결 표준으로 적합하다.
- [Aider](https://github.com/Aider-AI/aider): 실제 코드베이스에서 repository map, Git, lint/test를 운영해온 공식 프로젝트다. 전체 런타임보다 맥락 축소와 변경 회수 패턴이 중요하다.
- [MORE-AGENTS](https://github.com/lazeash/more-agents): Codex CLI와 worktree를 직접 조합한 문제 적합성은 높지만, 초기 scaffold라 품질·지속성 근거가 약하다. 참고용으로만 사용한다.
