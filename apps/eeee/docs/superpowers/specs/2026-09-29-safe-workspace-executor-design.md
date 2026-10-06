# 안전한 Workspace 실행·검증기 설계

## 1. 목표와 범위

현재 프로젝트는 요청 분석, OSS 후보 조사, 사용자 승인, 계획 문서 생성,
fake worker 기반 상태 전이까지 구현되어 있다. 다음 단계의 목표는 승인된
workspace에서 실제 검증 명령을 실행하고, 결과를 task 상태와
`verification.md`에 남기는 것이다.

이번 단계에서는 **코드 생성이나 임의 명령 실행을 구현하지 않는다.**
자연어 요청에서 명령을 만들거나, PowerShell을 그대로 실행하거나, 네트워크
명령을 실행하는 기능은 별도의 승인 설계가 필요한 후속 범위다.

성공 기준은 다음과 같다.

- 검증기는 프로젝트 workspace 내부에서만 실행된다.
- 명령은 애플리케이션이 정한 고정 argv만 실행하며 `shell=True`를 사용하지 않는다.
- 명령별 timeout, 종료 코드, stdout/stderr 요약을 기록한다.
- 모든 검증이 통과하면 task가 `completed`가 되고 실제 검증 보고서가 생성된다.
- 하나라도 실패하거나 timeout이면 task가 `failed`가 되고 `retry_task`가 요구된다.
- 기본 실행 모드는 기존 demo 동작을 유지하며, 실제 workspace 검증은 명시적으로 켠다.

## 2. 선택한 접근

### 권장: allowlist 기반 로컬 subprocess 검증기

검증 명령을 코드로 고정하고, `subprocess.run(..., shell=False, cwd=workspace)`로
실행한다. workspace 경계, timeout, 출력 크기를 중앙 실행기가 책임진다.
Windows에서 추가 런타임을 설치하지 않아도 되고, 기존 FastAPI·PySide6 구조에
작게 연결할 수 있어 첫 번째 실제 실행 기반으로 적합하다.

### 보류안: Docker/VM 샌드박스

격리는 더 강하지만 Windows 개발 환경에서 Docker 가용성, 이미지 관리, 파일
마운트, 실행 시간 관리가 추가된다. 실행기 계약이 안정된 뒤 보안 수준을 높이는
2단계로 미룬다.

### 제외안: 자연어를 PowerShell로 변환해 바로 실행

구현은 빠르지만 명령 주입, workspace 밖 파일 변경, 삭제·네트워크 작업을
통제하기 어렵다. 현재 제품의 승인 모델과도 맞지 않으므로 채택하지 않는다.

## 3. 구성 요소와 책임

### `WorkspaceCommandRunner`

`app/execution/runner.py`에 둔다.

- `CommandSpec`: 내부에서 정의한 명령 이름, argv, timeout을 표현한다.
- `CommandResult`: 실행 여부, 종료 코드, timeout 여부, 소요 시간,
  stdout/stderr 요약을 표현한다.
- `WorkspaceCommandRunner`: 명령 실행 전 workspace 경계와 정책을 검사하고,
  subprocess를 실행한다.

실행기는 사용자 입력으로 받은 문자열을 명령으로 해석하지 않는다. 호출자는
이미 검증된 `CommandSpec`만 전달한다. `argv[0]`과 고정 인자 외의 추가 인자는
허용하지 않으며, `shell=False`를 항상 사용한다.

### `WorkspaceVerifier`

`app/execution/verifier.py`에 둔다. 실제 명령 조합과 보고서 의미를 담당하고,
저수준 subprocess 세부사항은 `WorkspaceCommandRunner`에 위임한다.

v1 명령 정책은 다음과 같다.

- 항상 `python -m compileall .`을 실행한다. Python 실행 파일은 현재 앱이
  사용하는 `sys.executable`을 사용한다.
- workspace에 `tests` 디렉터리가 있을 때만 `python -m pytest -q`를 실행한다.
  테스트 디렉터리가 없으면 `skipped` 체크로 보고한다.
- workspace가 Git 저장소일 때만 `git diff --check`를 실행한다.
  저장소가 아니면 `skipped` 체크로 보고한다.

검증기는 명령을 자연어 요청, Markdown, 환경 변수에서 조립하지 않는다. 모든
체크가 `passed` 또는 `skipped`이면 전체 결과는 `passed`, 하나라도
`failed`/`timeout`이면 `failed`다.

### Coordinator 연결

기존 `DeterministicFakeWorker` 계약은 유지한다. `Coordinator`에 선택적
`verifier`를 주입하고, task가 `verifying` 상태일 때 verifier가 있으면 실제
workspace 검증을 실행한다. `working`에서 `verifying`으로 가는 기존 전이는
그대로 둔다.

- verifier 없음: 현재 fake report를 사용한다.
- verifier 있음: 실제 `CommandResult` 목록으로 report payload를 만든다.
- 전체 통과: `completed`, required action 없음.
- 실패/timeout: `failed`, required action은 `retry_task`.
- workspace 경계 위반이나 정책 자체 오류: `blocked`, 원인과 복구 안내를 이벤트에 기록한다.

기본 `Settings.execution_mode`는 `demo`로 둔다. `workspace_verify`일 때만
`WorkspaceVerifier`를 `main.py`에서 Coordinator에 연결한다. 이 방식으로 기존
테스트와 사용자의 현재 demo 흐름을 보존하면서 실제 실행을 명시적으로 선택할
수 있다.

## 4. 안전 정책

### Workspace 경계

- 프로젝트 workspace와 설정된 `workspace_root`를 `Path.resolve()`한다.
- workspace가 `workspace_root`의 하위 경로가 아니면 실행하지 않는다.
- workspace는 디렉터리여야 하며, 심볼릭 링크를 따라간 실제 경로도 경계 검사에
  포함한다.
- subprocess의 `cwd`는 검증된 프로젝트 workspace 하나로 고정한다.

### 프로세스 정책

- `shell=False`를 사용한다.
- 명령은 고정된 argv 배열만 사용한다.
- 명령별 기본 timeout은 120초이며 설정으로 낮출 수 있다.
- timeout이면 프로세스를 종료하고 해당 체크를 `timeout`으로 기록한다.
- stdout/stderr는 각각 최대 8,000자만 report에 넣는다. 잘린 경우
  `truncated: true`를 기록한다.
- 환경 변수는 현재 프로세스 환경을 최소한으로 상속하되, 실행기에서 명령을
  바꿀 수 있는 사용자 제공 환경 변수는 받지 않는다.

### 승인 경계

v1 검증 명령은 읽기·검사 목적이므로 기존 OSS 선택 승인 이후 실행할 수 있다.
파일 생성, 패키지 설치, git commit/push, 네트워크 호출을 포함한 실제 구현
명령은 이 설계의 허용 목록에 없다. 후속 구현 worker는 `command` 권한을 별도
승인받는 단계로 추가해야 한다.

## 5. 데이터 흐름과 실패 처리

```text
승인 완료
  -> 기존 plan.md 생성
  -> working -> verifying
  -> WorkspaceVerifier가 고정 검증 명령 실행
  -> 결과를 report payload로 변환
  -> verification.md + SQLite report 저장
  -> completed 또는 failed/blocked
```

각 체크는 다음 정보를 가진다.

- `name`: `compileall`, `pytest`, `git-diff-check`
- `status`: `passed`, `failed`, `timeout`, `skipped`
- `command`: 사용자에게 보여줄 안전한 argv 표현
- `exit_code`: 실행하지 않은 경우 `null`
- `duration_ms`
- `stdout`, `stderr`: 길이 제한된 요약
- `truncated`: 출력이 잘렸는지 여부

`verification.md`에는 전체 상태, 요약, 체크별 결과와 출력 요약을 기록한다.
SQLite `ReportRecord.checks`에도 같은 구조를 저장해 API와 desktop이 같은 결과를
보도록 한다. 기존 artifact writer는 이 구조를 Markdown으로 표현하도록
확장한다.

명령 하나가 실패해도 뒤의 독립적인 체크는 계속 실행한다. 단, workspace
경계·정책 위반처럼 실행 자체가 안전하지 않은 경우에는 즉시 `blocked`로
중단한다. API는 기존 state 응답으로 실패 원인과 `retry_task`를 노출하고,
desktop은 기존 Retry 경로를 사용한다.

## 6. 설정과 호환성

`Settings`에 다음 항목을 추가한다.

- `execution_mode: Literal["demo", "workspace_verify"] = "demo"`
- `command_timeout_seconds: float = 120.0`
- `max_command_output_chars: int = 8_000`

환경 변수 예시는 다음과 같다.

```powershell
$env:EXECUTION_MODE = "workspace_verify"
$env:COMMAND_TIMEOUT_SECONDS = "120"
python -m app.desktop
```

기존 `GITHUB_TOKEN`, `PET_API_URL`, `PET_PROJECT_ID` 동작과 API 경로는 바꾸지
않는다. 외부 API 호출은 계속 `GitHubResearcher`의 책임이며, WorkspaceVerifier의
명령 정책에는 포함하지 않는다.

## 7. 테스트 전략

### 단위 테스트

- workspace 경계 안/밖 경로를 각각 허용·거부한다.
- `shell=False`와 고정 argv가 사용되는지 검증한다.
- 성공, 비정상 종료 코드, timeout, 출력 truncation을 검증한다.
- verifier가 `tests`와 Git 저장소 존재 여부에 따라 체크를 선택하는지 검증한다.
- 명령 실패 후에도 후속 체크가 실행되는지 검증한다.

### Coordinator/API 통합 테스트

- 실제 임시 workspace에서 `workspace_verify` 모드가 `verifying`에서
  `completed`로 가고 보고서·`verification.md`를 만든다.
- 실패 명령은 `failed`와 `retry_task`를 만들고, report에 exit code와 출력이
  남는다.
- 경계 위반은 `blocked`가 되며 subprocess가 시작되지 않는다.
- `demo` 모드는 기존 fake worker 결과와 기존 API 테스트를 그대로 유지한다.

### 수동 smoke

- `QT_QPA_PLATFORM=offscreen`에서 desktop 요청→승인→검증 완료 흐름을 실행한다.
- 실제 검증 중 UI가 멈추지 않고, 실패 후 Retry가 활성화되는지 확인한다.

## 8. 단계적 도입 순서

1. 실행 데이터 모델과 `WorkspaceCommandRunner`를 TDD로 구현한다.
2. `WorkspaceVerifier`와 Markdown report를 구현한다.
3. Coordinator의 선택적 verifier 주입과 `workspace_verify` 설정을 연결한다.
4. API/desktop smoke 및 한국어 README 실행 방법을 추가한다.
5. 전체 테스트와 실제 임시 workspace 검증을 통과시킨다.

이 단계가 안정화된 뒤에만, 별도 설계로 실제 파일 생성·패키지 설치·코드 생성
worker를 추가한다.
