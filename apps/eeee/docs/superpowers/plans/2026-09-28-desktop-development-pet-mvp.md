# 데스크톱 개발 펫 MVP 구현 계획

> **에이전트 작업자용:** 이 계획을 작업 단위별로 실행할 때 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans` 하위 스킬을 반드시 사용한다. 단계는 체크박스(`- [ ]`)로 관리한다.

**목표:** Windows 데스크톱 펫에서 자연어 요청을 입력하고, 승인 게이트를 거쳐 결정론적인 작업 상태와 검증 보고서를 확인할 수 있는 첫 번째 수직 흐름을 구현한다.

**구조:** 기존 FastAPI와 SQLite를 기반으로 명시적인 프로젝트/작업 상태를 추가한다. Coordinator만 상태를 변경하고, API는 펫 셸과 Coordinator 사이의 계약이 된다. 첫 작업 실행은 에이전트 런타임과 분리된 결정론적 fake worker로 검증한 뒤, PySide6 셸이 API 상태를 렌더링한다.

**기술 스택:** Python 3.12, FastAPI, Pydantic, SQLite, httpx, pytest, PySide6(데스크톱 선택 의존성)

**설계 문서:** `docs/superpowers/specs/2026-09-28-desktop-development-pet-design.md`

## 전역 제약

- Windows를 첫 데스크톱 대상 플랫폼으로 한다.
- 데스크톱 셸은 shell command를 직접 실행하지 않는다.
- 상태 전환과 승인 저장은 Coordinator를 통해서만 수행한다.
- `approved=True`인 결정은 일반 저장 메서드로 직접 기록할 수 없다.
- 승인 전에는 작업이 `working`으로 이동하지 않는다.
- workspace 경계, 네트워크, 설치, 삭제, 외부 전송, 시스템 전역 작업은 별도 정책 경계를 유지한다.
- 화면 캡처, 지속적인 화면 감시, 마이크, 음성 제어는 이번 범위에 포함하지 않는다.
- 에이전트 완료 메시지는 검증 근거가 아니며, 검증은 저장된 최신 revision을 기준으로 별도 실행한다.
- 첫 셸은 정적 이미지 또는 CSS 표현만 사용하고 복잡한 3D 캐릭터 시스템은 만들지 않는다.

## 검토 초점

- 후보의 이름은 같지만 설명, 점수, evidence, risks, status 또는 순서가 바뀐 상태에서 승인하면 거부되어야 한다. → Task 1 승인 snapshot 회귀 테스트
- 알 수 없는 상태나 필수 view model 필드가 없는 API 응답은 작업을 진행하지 않고 `blocked`로 표시되어야 한다. → Task 5 presentation 테스트
- 승인되지 않은 작업을 진행시키는 Coordinator/API 호출은 거부되어야 한다. → Task 3 상태 전환 테스트, Task 4 API 테스트
- 프로세스를 재시작해도 마지막 작업 상태와 이벤트 순서가 복구되어야 한다. → Task 2 저장소 테스트
- 이전 revision의 검증 결과가 최신 작업을 완료 처리해서는 안 된다. → Task 3 fake worker/verification 테스트

---

### Task 1: 승인 snapshot 계약과 저장 가드 정리

**파일:**
- 수정: `app/storage/sqlite.py`
- 수정: `app/workflow/approvals.py`
- 수정: `app/domain/errors.py`가 필요할 때만
- 테스트: `tests/storage/test_sqlite.py`
- 테스트: `tests/workflow/test_approvals.py`

**인터페이스:**
 - 소비: `SQLiteStore.get_candidates() -> list[CandidateScore]`, `ApprovalService.approve_decision()`
- 생산: `SQLiteStore.save_approval_once(decision, event, expected_candidates: list[CandidateScore]) -> bool`

- [ ] **1단계: 실패 테스트 작성**

  다음을 고정한다.

  - `SQLiteStore.save_decision()`에 `approved=True`를 직접 넘기면 `ApprovalError`가 발생한다.
  - 승인 후에는 후보의 설명, 점수, dimension scores, evidence, risks, status가 바뀌면 `CandidateSetChangedError`가 발생한다.
  - 승인 후 후보 순서가 바뀌어도 `CandidateSetChangedError`가 발생한다.
  - 후보 이름만 같다는 이유로 변경된 snapshot을 승인하지 않는다.

- [ ] **2단계: 실패 확인**

  실행: `python -m pytest tests/storage/test_sqlite.py tests/workflow/test_approvals.py -q`

  기대 결과: 현재 구현이 직접 승인 저장을 허용하거나 후보 이름만 비교하기 때문에 새 회귀 테스트가 실패한다. 의존성이 설치되지 않은 환경이면 먼저 `ModuleNotFoundError`를 기록하고 개발 의존성을 설치한 뒤 다시 실행한다.

- [ ] **3단계: 전체 후보 snapshot 비교 구현**

  `save_approval_once()`의 세 번째 인자를 전체 `list[CandidateScore]`로 바꾼다. 저장소의 현재 후보 목록을 JSON 정규화 값으로 변환해 순서와 모든 필드를 비교한다. `save_decision()`은 `approved=True`를 받으면 ApprovalService 전용 경로를 사용하라는 `ApprovalError`를 발생시킨다. `ApprovalService`는 처음 읽은 후보 전체를 snapshot으로 넘긴다.

- [ ] **4단계: 회귀 테스트 통과 확인**

  실행: `python -m pytest tests/storage/test_sqlite.py tests/workflow/test_approvals.py -q`

  기대 결과: 전체 테스트 PASS.

- [ ] **5단계: 커밋**

  ```bash
  git add app/domain/errors.py app/storage/sqlite.py app/workflow/approvals.py tests/storage/test_sqlite.py tests/workflow/test_approvals.py
  git commit -m "fix: validate full approval candidate snapshots"
  ```

### Task 2: 프로젝트/작업 상태 모델과 SQLite 저장

**파일:**
- 수정: `app/domain/models.py`
- 수정: `app/storage/sqlite.py`
- 생성: `app/coordinator/__init__.py`
- 테스트: `tests/domain/test_models.py`
- 테스트: `tests/storage/test_project_state.py`

**인터페이스:**
- 소비: 기존 `RequestBrief`, `CandidateScore`, `Decision`, `Run` 모델
- 생산:
  - `PetState`: `idle`, `researching`, `awaiting_approval`, `working`, `verifying`, `completed`, `blocked`, `failed`
  - `Project(id: str, name: str, workspace: str, revision: str, state: PetState, active_task_id: str | None)`
  - `TaskRecord(id: str, project_id: str, request_id: str, state: PetState, message: str, required_action: str | None, revision: str, report_id: str | None, report: dict[str, object] | None)`
  - `ReportRecord(id: str, project_id: str, task_id: str, revision: str, status: str, summary: str, checks: list[dict[str, object]])`
  - `PetViewModel(state: PetState, message: str, task_id: str | None, request_id: str | None, required_action: str | None, candidates: list[CandidateScore], latest_event: dict[str, object] | None, report: dict[str, object] | None, workspace: str | None)`
  - `SQLiteStore.create_project(project_id: str, name: str, workspace: str, revision: str = "initial") -> Project`
  - `SQLiteStore.get_project(project_id: str) -> Project`
  - `SQLiteStore.update_project_state(project_id: str, state: PetState, active_task_id: str | None = None) -> Project`
  - `SQLiteStore.create_task(project_id: str, request_id: str, revision: str) -> TaskRecord`
  - `SQLiteStore.get_task(task_id: str) -> TaskRecord`
  - `SQLiteStore.update_task(task_id: str, state: PetState, message: str, required_action: str | None = None, revision: str | None = None, report_id: str | None = None, report: dict[str, object] | None = None) -> TaskRecord`
  - `SQLiteStore.update_project_revision(project_id: str, revision: str) -> Project`
  - `SQLiteStore.append_task_event(task_id: str, event: dict[str, object]) -> None`
  - `SQLiteStore.get_task_events(task_id: str) -> list[dict[str, object]]`
  - `SQLiteStore.save_report(report: ReportRecord) -> None`
  - `SQLiteStore.get_report(report_id: str) -> ReportRecord`

- [ ] **1단계: 실패 테스트 작성**

  프로젝트와 작업을 생성하고, 상태·메시지·required action·revision·report를 저장한 뒤 새 `SQLiteStore` 인스턴스로 읽어도 같은 값이 나오는 테스트를 작성한다. project revision 갱신과 report 저장/조회도 검증한다. 이벤트 두 개 이상을 추가하고 삽입 순서가 유지되는지도 검증한다.

- [ ] **2단계: 실패 확인**

  실행: `python -m pytest tests/storage/test_project_state.py tests/domain/test_models.py -q`

  기대 결과: 상태 모델과 저장소 인터페이스가 없어 실패한다.

- [ ] **3단계: 모델과 테이블 구현**

  Pydantic 모델에는 `PetState`를 문자열 enum으로 사용한다. SQLite에는 `projects`, `tasks`, `task_events`, `reports` 테이블을 추가하고, 기존 `init()`이 반복 호출되어도 안전하게 동작하도록 한다. task 상태 업데이트와 이벤트 기록은 하나의 연결에서 처리하며 이벤트 위치는 `BEGIN IMMEDIATE`로 직렬화한다.

- [ ] **4단계: 저장소 테스트 통과 확인**

  실행: `python -m pytest tests/storage/test_project_state.py tests/domain/test_models.py -q`

  기대 결과: 전체 테스트 PASS.

- [ ] **5단계: 커밋**

  ```bash
  git add app/domain/models.py app/storage/sqlite.py app/coordinator/__init__.py tests/domain/test_models.py tests/storage/test_project_state.py
  git commit -m "feat: persist project and pet task state"
  ```

### Task 3: Coordinator 상태 머신과 결정론적 fake worker

**파일:**
- 생성: `app/coordinator/service.py`
- 생성: `app/coordinator/fake_worker.py`
- 수정: `app/workflow/approvals.py`가 Coordinator 연결에 필요한 최소 범위에서만
- 테스트: `tests/coordinator/test_service.py`
- 테스트: `tests/coordinator/test_fake_worker.py`

**인터페이스:**
- 소비: Task 1의 `ApprovalService.approve_decision()`, Task 2의 상태 저장 인터페이스
- 생산:
  - `Coordinator.create_project(project_id: str, name: str, workspace: str, revision: str = "initial") -> Project`
  - `Coordinator.create_request(project_id: str, text: str) -> PetViewModel`
  - `Coordinator.get_state(project_id: str) -> PetViewModel`
  - `Coordinator.approve_selection(project_id: str, request_id: str, selected: list[str]) -> PetViewModel`
  - `Coordinator.advance_task(project_id: str, task_id: str) -> PetViewModel`
  - `Coordinator.retry_task(project_id: str, task_id: str) -> PetViewModel`
  - `DeterministicFakeWorker.advance(task: TaskRecord) -> tuple[PetState, str, str | None, dict[str, object] | None]`

- [ ] **1단계: 실패 테스트 작성**

  다음 전환을 테스트한다.

  - 새 요청은 `researching` 상태와 `request_created` 이벤트를 만든다.
  - fake worker가 `researching`을 `awaiting_approval`로 바꾸고 최소 두 개의 결정론적 후보를 저장한다.
  - 승인 전 `advance_task()`는 `working`으로 이동시키지 않는다.
  - 올바른 후보 승인 후 상태가 `working`이 된다.
  - fake worker가 `working → verifying → completed`로 이동하고 report에 검사한 revision을 기록한다.
  - task revision이 현재 project revision과 다르면 완료 처리하지 않고 `blocked`로 남긴다.
  - `completed` 작업을 임의로 다시 진행시키지 않는다.

- [ ] **2단계: 실패 확인**

  실행: `python -m pytest tests/coordinator -q`

  기대 결과: Coordinator와 fake worker가 없어 실패한다.

- [ ] **3단계: Coordinator와 worker 구현**

  Coordinator가 모든 상태 변경을 저장소를 통해 수행하도록 한다. `create_request()`는 `parse_request()` 결과를 저장하고 `researching` task를 만든다. fake worker의 후보와 report는 고정된 값으로 만들되, 실제 OSS client나 shell command를 호출하지 않는다. 완료 report는 `ReportRecord`로 저장하고 task에는 `report_id`를 연결한다. 승인 전 상태에서의 작업 진행은 도메인 오류로 거부한다.

- [ ] **4단계: 상태 머신 테스트 통과 확인**

  실행: `python -m pytest tests/coordinator -q`

  기대 결과: 전체 테스트 PASS.

- [ ] **5단계: 커밋**

  ```bash
  git add app/coordinator app/workflow/approvals.py tests/coordinator
  git commit -m "feat: add coordinator state machine"
  ```

### Task 4: FastAPI 요청/상태/승인 API

**파일:**
- 생성: `app/api/__init__.py`
- 생성: `app/api/routes.py`
- 생성: `tests/api/test_pet_flow.py`
- 수정: `app/main.py`
- 수정: `app/config.py`가 저장소 경로 연결에 필요할 때만

**인터페이스:**
- 소비: Task 3의 `Coordinator` 공개 메서드
- 생산:
  - `POST /projects/{project_id}/requests`
  - `GET /projects/{project_id}/state`
  - `POST /projects/{project_id}/decisions/{request_id}/approve`
  - `POST /projects/{project_id}/tasks/{task_id}/advance`
  - `POST /projects/{project_id}/tasks/{task_id}/retry`
  - `GET /projects/{project_id}/reports/{report_id}`

- [ ] **1단계: 실패하는 API 흐름 테스트 작성**

  `create_app()`이 만드는 `default` 프로젝트를 TestClient로 사용한다. 요청 생성, 상태 조회, fake worker advance, 후보 승인, 작업 advance, 최종 report 조회까지 수행한다. 승인 전 작업 advance는 4xx가 되어야 하고, 최종 상태는 `completed`여야 한다.

- [ ] **2단계: 실패 확인**

  실행: `python -m pytest tests/api/test_pet_flow.py -q`

  기대 결과: 새 API route가 없어 실패한다.

- [ ] **3단계: 앱 wiring과 route 구현**

  `create_app(settings)`가 SQLiteStore를 초기화하고 `default` 프로젝트를 `Settings.workspace_root` 아래에 만든 뒤 Coordinator를 의존성으로 주입한다. 요청 body와 승인 body는 Pydantic 모델로 검증한다. 도메인 오류는 적절한 4xx 응답으로 변환하고, 보고서가 없으면 404를 반환한다. `GET /health`는 기존 응답을 유지한다.

- [ ] **4단계: API 흐름 통과 확인**

  실행: `python -m pytest tests/api/test_pet_flow.py tests/test_health.py -q`

  기대 결과: 전체 테스트 PASS.

- [ ] **5단계: 커밋**

  ```bash
  git add app/api app/main.py app/config.py tests/api
  git commit -m "feat: expose pet coordinator API"
  ```

### Task 5: PySide6 펫 표현 계층과 데스크톱 셸

**파일:**
- 수정: `pyproject.toml`에 `desktop` optional dependency 추가
- 생성: `app/desktop/__init__.py`
- 생성: `app/desktop/presentation.py`
- 생성: `app/desktop/client.py`
- 생성: `app/desktop/window.py`
- 생성: `app/desktop/__main__.py`
- 테스트: `tests/desktop/test_presentation.py`

**인터페이스:**
- 소비: Task 4의 `GET /projects/{project_id}/state` view model
- 생산:
  - `PetPresentation.from_view_model(payload: dict[str, object]) -> PetPresentation`
  - `PetPresentation(state: str, expression: str, headline: str, detail: str, show_approval: bool, blocked: bool)`
  - `python -m app.desktop` 실행 진입점

- [ ] **1단계: 실패 테스트 작성**

  모든 정상 상태에 대해 표정, headline, approval 표시 여부가 결정되는지 테스트한다. 알 수 없는 상태나 `state`가 빠진 payload는 `blocked=True`가 되는지 테스트한다. `awaiting_approval`만 `show_approval=True`여야 한다.

- [ ] **2단계: 실패 확인**

  실행: `python -m pytest tests/desktop/test_presentation.py -q`

  기대 결과: 표현 모델과 변환 함수가 없어 실패한다.

- [ ] **3단계: 표현 계층과 셸 구현**

  순수 Python `presentation.py`가 UI 문구와 상태 표현을 결정한다. `window.py`는 PySide6의 frameless/translucent QWidget을 만들고, 캐릭터 영역·상태 메시지·승인 버튼·보고서/workspace 버튼을 배치한다. 셸은 API client를 통해서만 상태를 읽고 사용자 의도를 전송한다. API 오류나 알 수 없는 상태는 `blocked` 화면으로 렌더링한다.

- [ ] **4단계: 표현 테스트 통과 및 수동 셸 확인**

  실행: `python -m pytest tests/desktop/test_presentation.py -q`

  기대 결과: 전체 테스트 PASS.

  추가 확인: `python -m app.desktop` 실행 후 투명 펫 창이 표시되고, 드래그할 수 있으며, 패널에서 상태 메시지가 보인다. PySide6가 없는 환경에서는 `pip install -e ".[desktop,dev]"` 후 확인한다.

- [ ] **5단계: 커밋**

  ```bash
  git add pyproject.toml app/desktop tests/desktop
  git commit -m "feat: add desktop pet shell"
  ```

### Task 6: Milestone A 전체 검증과 사용 문서

**파일:**
- 생성 또는 수정: `README.md`
- 테스트: `tests/api/test_pet_flow.py`
- 테스트: 전체 `tests/`

**인터페이스:**
- 소비: Task 1~5의 승인, 상태, Coordinator, API, 데스크톱 셸
- 생산: 새 로컬 설치에서 재현 가능한 실행/검증 절차

- [ ] **1단계: 실패하는 설치/흐름 확인**

  README에 적을 설치 명령과 실행 명령을 새 환경에서 확인한다. 의존성이 없으면 실패를 기록하고 설치 후 재실행한다.

- [ ] **2단계: 실행 문서 작성**

  `pip install -e ".[desktop,dev]"`, API 실행 명령, 펫 실행 명령, 프로젝트 workspace 설정, 승인 대기와 실패 상태의 의미를 한국어로 기록한다. 화면 감시와 무승인 명령 실행을 지원하지 않는다는 점도 명시한다.

- [ ] **3단계: 전체 검증 실행**

  실행: `python -m pytest -q`

  기대 결과: 전체 테스트 PASS.

- [ ] **4단계: 커밋**

  ```bash
  git add README.md tests/api/test_pet_flow.py
  git commit -m "docs: document desktop pet MVP flow"
  ```

## 계획 자체 점검

- 설계의 상태 모델, Coordinator 소유권, API 계약, 안전 경계, PySide6 셸, 결정론적 fake worker, revision 검증, 테스트 전략을 Task 1~6에 배치했다.
- 현재 승인 snapshot 테스트가 요구하는 전체 후보 비교를 Task 1에서 먼저 해결해 이후 Coordinator가 불안정한 승인 계약을 물려받지 않게 했다.
- UI는 순수 표현 계층과 실제 PySide6 창을 분리해 화면 서버가 없는 테스트 환경에서도 핵심 상태 표현을 검증할 수 있게 했다.
- agent runtime, 실제 workspace command execution, GitHub 실시간 연구는 Milestone A 밖에 두고 후속 단계로 남겼다.
- 모든 공개 상태 전환은 저장소 이벤트와 함께 기록되며, 오래된 revision의 검증 결과는 Task 3에서 차단한다.
