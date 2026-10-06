# Safe Workspace Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 프로젝트 workspace에서 고정된 검증 명령만 안전하게 실행하고, 실제 결과를 task 상태와 `verification.md`에 기록한다.

**Architecture:** 저수준 `WorkspaceCommandRunner`가 workspace 경계, argv 정책, `shell=False`, timeout, 출력 제한을 담당한다. `WorkspaceVerifier`는 프로젝트 파일 상태에 따라 고정된 `compileall`, `pytest`, `git diff --check` 체크를 조합한다. Coordinator는 verifier를 선택적으로 주입받아 기존 demo fake worker를 보존하면서 `workspace_verify` 모드에서만 실제 검증 결과를 사용한다.

**Tech Stack:** Python 3.12, Pydantic, `subprocess`, FastAPI, SQLite, PySide6, pytest.

**Spec:** `docs/superpowers/specs/2026-09-29-safe-workspace-executor-design.md`

## Global Constraints

- 프로젝트는 Python 3.12 이상과 Windows를 기준으로 한다.
- 검증기는 프로젝트 workspace 내부에서만 실행한다.
- 명령은 애플리케이션이 정한 고정 argv만 실행하고 `shell=True`를 사용하지 않는다.
- 명령별 기본 timeout은 120초다.
- stdout/stderr는 각각 최대 8,000자만 report에 넣고 잘림 여부를 기록한다.
- 자연어, Markdown, 환경 변수에서 실행 명령을 조립하지 않는다.
- 파일 생성, 패키지 설치, git commit/push, 네트워크 호출은 v1 허용 목록에 없다.
- 기본 `Settings.execution_mode`는 `demo`이며, 실제 검증은 `workspace_verify`에서만 켠다.
- 기존 `GITHUB_TOKEN`, `PET_API_URL`, `PET_PROJECT_ID`, API 경로와 fake worker 동작은 보존한다.
- 구현은 기존 `feature/safe-workspace-executor` worktree에서 수행하고 `main`에는 직접 커밋하지 않는다.

## Review Focus

- workspace가 `workspace_root` 밖이거나 symlink를 통해 밖으로 탈출하는 입력은 프로세스를 시작하지 않고 `blocked`가 되어야 한다. (Task 1)
- argv에 shell 문법이나 추가 인자를 넣어도 문자열 명령으로 실행되지 않아야 한다. (Task 1)
- timeout과 8,000자 출력 제한이 프로세스·보고서에 정확히 반영되어야 한다. (Task 1)
- 앞선 검증 명령이 실패해도 안전한 후속 검증 명령은 계속 실행되어야 한다. (Task 2)
- verifier가 없는 demo 모드와 verifier가 있는 workspace 모드가 서로의 상태 전이를 오염시키지 않아야 한다. (Task 3)

### Task 1: 명령 모델과 안전한 WorkspaceCommandRunner

**Files:**
- Create: `app/execution/__init__.py`
- Create: `app/execution/models.py`
- Create: `app/execution/runner.py`
- Test: `tests/execution/test_runner.py`

**Interfaces:**
- `CommandSpec(name: str, argv: tuple[str, ...], timeout_seconds: float | None = None)`은 애플리케이션 내부에서 만든 명령 하나를 표현한다.
- `CommandResult`는 `name`, `argv`, `status`, `exit_code`, `duration_ms`, `stdout`, `stderr`, `truncated`를 가진다. `status`는 `passed | failed | timeout` 중 하나다.
- `WorkspaceCommandRunner(workspace_root: str | Path, default_timeout_seconds: float = 120.0, max_output_chars: int = 8_000)`는 `run(spec: CommandSpec, workspace: str | Path) -> CommandResult`를 제공한다.
- workspace가 경계를 벗어나거나 디렉터리가 아니면 `WorkspaceExecutionBlocked`를 발생시키며 subprocess를 시작하지 않는다.

- [ ] **Step 1: Write the failing tests for safe execution**

  `tests/execution/test_runner.py`에 다음 테스트를 먼저 작성한다.

  - `test_runner_executes_fixed_argv_without_shell_and_captures_success`
  - `test_runner_rejects_workspace_outside_allowed_root_before_starting_process`
  - `test_runner_rejects_symlinked_workspace_that_resolves_outside_root`
  - `test_runner_marks_nonzero_exit_as_failed`
  - `test_runner_marks_timeout_and_limits_output`

  성공 테스트는 임시 workspace와 `sys.executable -c` 고정 argv를 사용하고,
  monkeypatch로 `subprocess.run` 호출의 `shell=False`, `cwd`, `timeout`을
  확인한다. 경계 테스트는 `subprocess.run`이 호출되지 않았음을 단언한다.

- [ ] **Step 2: Run the runner tests to verify they fail**

  Run: `python -m pytest tests/execution/test_runner.py -q`

  Expected: FAIL during import because `app.execution` and its runner types do not exist yet.

- [ ] **Step 3: Implement the command models and runner**

  `app/execution/models.py`에 immutable dataclass 또는 Pydantic 모델로
  `CommandSpec`와 `CommandResult`를 정의한다. `status`와 `argv`는 결과 report로
  변환할 수 있어야 한다.

  `app/execution/runner.py`의 `WorkspaceCommandRunner.run`은 다음 순서로
  구현한다: `workspace_root.resolve()`와 `workspace.resolve()`를 비교해
  `relative_to` 가능 여부를 확인하고, 디렉터리 여부를 확인한 뒤,
  `subprocess.run(list(spec.argv), cwd=str(workspace), shell=False,
  capture_output=True, text=True, timeout=effective_timeout)`을 호출한다.
  `TimeoutExpired`는 `timeout` 결과로 바꾸고, stdout/stderr는 각 8,000자까지
  보존하며 잘림 여부를 기록한다. 임계값과 timeout은 0보다 커야 한다.

- [ ] **Step 4: Run the runner tests to verify they pass**

  Run: `python -m pytest tests/execution/test_runner.py -q`

  Expected: all five runner tests PASS.

- [ ] **Step 5: Commit the runner slice**

  ```bash
  git add app/execution tests/execution/test_runner.py
  git commit -m "feat: add safe workspace command runner"
  ```

### Task 2: 고정 검증 조합과 Verification artifact

**Files:**
- Create: `app/execution/verifier.py`
- Modify: `app/workspace/artifacts.py`
- Test: `tests/execution/test_verifier.py`
- Modify: `tests/workspace/test_artifacts.py`

**Interfaces:**
- `WorkspaceVerifier(runner: WorkspaceCommandRunner)`가 `verify(workspace: str | Path) -> VerificationResult`를 제공한다.
- `VerificationResult`는 `status: Literal["passed", "failed"]`, `summary: str`, `checks: list[dict[str, object]]`를 가지며 `as_report_payload() -> dict[str, object]`를 제공한다.
- verifier는 항상 `compileall`, `tests` 디렉터리가 있을 때만 `pytest`, `.git`이 있을 때만 `git diff --check`를 순서대로 실행한다.
- `WorkspaceArtifactWriter.write_verification`은 기존 `status`, `summary`, `checks` 인터페이스를 유지하면서 체크의 command/exit_code/duration/stdout/stderr/truncated를 Markdown으로 기록한다.

- [ ] **Step 1: Write failing verifier and artifact tests**

  `tests/execution/test_verifier.py`에 다음을 작성한다.

  - `test_verifier_always_runs_compileall_and_skips_absent_optional_checks`
  - `test_verifier_runs_pytest_and_git_diff_check_when_project_contains_them`
  - `test_verifier_continues_after_a_failed_check_and_returns_failed_report`

  `tests/workspace/test_artifacts.py`에는 command, exit code, duration,
  output truncation이 `verification.md`에 남는지 단언하는 테스트를 추가한다.
  runner는 Task 1의 실제 결과 계약을 사용하고, 명령 호출 자체는 가짜
  `WorkspaceCommandRunner`로 주입해 verifier 테스트를 결정적으로 만든다.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `python -m pytest tests/execution/test_verifier.py tests/workspace/test_artifacts.py -q`

  Expected: FAIL because `WorkspaceVerifier` and the expanded verification rendering do not exist yet.

- [ ] **Step 3: Implement verifier and artifact rendering**

  verifier는 workspace를 검사해 고정 `CommandSpec` 목록을 만들고, 각 결과를
  체크 dict로 직렬화한다. 결과가 `failed` 또는 `timeout`인 체크가 하나라도
  있으면 전체 상태를 `failed`로 만들되 나머지 체크는 계속 실행한다.
  존재하지 않는 `tests`/`.git` 체크는 `skipped`, `exit_code=None`으로 만든다.

  artifact writer는 기존 Markdown 순서를 유지하고 각 체크에 command, status,
  exit code, duration, stdout/stderr를 선택적으로 추가한다. 출력은 이미
  runner에서 제한되므로 writer가 임의로 원문을 확장하지 않는다.

- [ ] **Step 4: Run focused and existing artifact tests**

  Run: `python -m pytest tests/execution/test_verifier.py tests/workspace/test_artifacts.py -q`

  Expected: all focused tests PASS, including the pre-existing artifact tests.

- [ ] **Step 5: Commit the verifier slice**

  ```bash
  git add app/execution/verifier.py app/workspace/artifacts.py tests/execution/test_verifier.py tests/workspace/test_artifacts.py
  git commit -m "feat: add workspace verification reports"
  ```

### Task 3: Coordinator와 설정에 실제 verifier 연결

**Files:**
- Modify: `app/config.py`
- Modify: `app/main.py`
- Modify: `app/coordinator/service.py`
- Test: `tests/coordinator/test_service.py`
- Test: `tests/api/test_pet_flow.py`

**Interfaces:**
- `Settings`에 `execution_mode: Literal["demo", "workspace_verify"] = "demo"`, `command_timeout_seconds: float = 120.0`, `max_command_output_chars: int = 8_000`을 추가한다.
- `Coordinator(..., verifier: WorkspaceVerifier | None = None)`을 추가한다. 기존 worker 인자와 기본값은 유지한다.
- `advance_task`가 `PetState.verifying`에서 verifier가 있으면 `VerificationResult.as_report_payload()`를 사용하고, 없으면 기존 fake worker report를 사용한다.
- 명령 결과 실패는 `PetState.failed`/`retry_task`, workspace 정책 예외는 `PetState.blocked`/`retry_task`로 변환한다. 두 경우 모두 task event에 원인과 체크 요약을 남긴다.
- `create_app`은 `workspace_verify`일 때만 `WorkspaceCommandRunner`와 `WorkspaceVerifier`를 생성해 Coordinator에 주입한다.

- [ ] **Step 1: Write failing Coordinator/API integration tests**

  `tests/coordinator/test_service.py`에 다음을 추가한다.

  - `test_workspace_verifier_completes_task_and_persists_real_report`
  - `test_workspace_verifier_failure_sets_retry_action_and_report`
  - `test_workspace_policy_error_blocks_task_without_running_commands`

  `tests/api/test_pet_flow.py`에는 `Settings(execution_mode="workspace_verify")`
  로 앱을 만들고 run endpoint가 실제 임시 workspace의 report와
  `verification.md`를 반환하는 테스트를 추가한다. 기존 demo 테스트는
  수정하지 않고 그대로 통과해야 한다.

- [ ] **Step 2: Run the integration tests to verify they fail**

  Run: `python -m pytest tests/coordinator/test_service.py tests/api/test_pet_flow.py -q`

  Expected: FAIL because settings and Coordinator do not yet accept or use a verifier.

- [ ] **Step 3: Implement settings and Coordinator wiring**

  Pydantic settings에 범위와 양수값 검증을 추가한다. `main.py`는 설정값이
  `workspace_verify`일 때만 verifier를 구성하고, default `demo`에서는 현재
  기본 Coordinator 생성 경로를 유지한다.

  Coordinator의 verifying 분기에서 실제 report payload를 작성한 뒤 기존
  artifact/report 저장 경로를 재사용한다. `WorkspaceExecutionBlocked`는
  별도로 잡아 blocked 상태와 이벤트를 만들고, 일반 verification failure는
  failed 상태로 저장한다. retry 후에는 기존 승인 결정을 보존해 approved
  task가 다시 working으로 돌아가도록 한다.

- [ ] **Step 4: Run focused and full backend tests**

  Run: `python -m pytest tests/coordinator/test_service.py tests/api/test_pet_flow.py -q`

  Expected: focused tests PASS and demo/workspace modes both retain their intended state transitions.

- [ ] **Step 5: Commit the Coordinator slice**

  ```bash
  git add app/config.py app/main.py app/coordinator/service.py tests/coordinator/test_service.py tests/api/test_pet_flow.py
  git commit -m "feat: wire workspace verifier into coordinator"
  ```

### Task 4: 한국어 문서와 desktop end-to-end 검증

**Files:**
- Modify: `README.md`
- Test: `tests/desktop/test_window.py`
- Test: `tests/desktop/test_runtime.py` or a new `tests/desktop/test_workspace_verify_smoke.py`

**Interfaces:**
- README는 `EXECUTION_MODE`, timeout 설정, demo/workspace_verify 차이를 한국어로 설명한다.
- desktop API client/window API는 변경하지 않는다. 기존 비동기 작업 큐가 실제 verifier 중에도 UI를 막지 않는지를 테스트한다.

- [ ] **Step 1: Write the failing desktop smoke test**

  offscreen QApplication에서 workspace_verify 설정으로 embedded API를 띄우고
  요청→후보 승인→run 흐름을 실행한다. 임시 workspace에 `tests`가 없는
  최소 프로젝트와 실제 compileall 대상 파일을 넣고, 최종 state가
  `completed`이며 `verification.md`가 존재하는지 단언한다. 검증 작업 중
  `_create_request`/`_approve`가 즉시 반환되는 기존 responsiveness 계약도
  유지한다.

- [ ] **Step 2: Run the smoke test to verify the new assertion fails**

  Run: `$env:QT_QPA_PLATFORM='offscreen'; python -m pytest tests/desktop/test_workspace_verify_smoke.py -q`

  Expected: FAIL because the desktop/runtime path does not yet expose the new execution mode end-to-end.

- [ ] **Step 3: Update Korean README and only the required desktop wiring**

  실행 모드 설정과 안전 정책을 README에 추가한다. desktop client/window의
  API 계약은 유지하고, 필요한 경우 smoke 전용 runtime 설정 전달만 추가한다.
  실제 실행은 Qt 작업 큐 밖에서 이미 수행되므로 UI 스레드에 subprocess를
  직접 호출하지 않는다.

- [ ] **Step 4: Run the smoke and complete verification**

  Run: `$env:QT_QPA_PLATFORM='offscreen'; python -m pytest tests/desktop/test_workspace_verify_smoke.py -q`

  Expected: PASS with completed state, verification artifact, and responsive UI assertions.

  Then run:

  ```powershell
  $env:QT_QPA_PLATFORM = "offscreen"
  python -m pytest --basetemp .superpowers/safe-workspace-final-tmp -q
  git diff --check
  ```

  Expected: full suite passes with only the repository's existing Starlette/httpx deprecation warning, and `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Commit documentation and end-to-end coverage**

  ```bash
  git add README.md tests/desktop
  git commit -m "docs: document safe workspace verification mode"
  ```

### Task 5: Branch/PR handoff and review

**Files:**
- No product files; inspect commits and PR metadata.

- [ ] **Step 1: Verify worktree and author identity**

  Run:

  ```powershell
  git status --short --branch
  git log --format=fuller -5
  git config user.name
  git config user.email
  ```

  Expected: clean `feature/safe-workspace-executor` worktree and
  `sunwoo162 <205418898+sunwoo162@users.noreply.github.com>` for new commits.

- [ ] **Step 2: Push the feature branch and open/update a PR**

  ```powershell
  git push -u origin feature/safe-workspace-executor
  gh pr create --base main --head feature/safe-workspace-executor --title "feat: add safe workspace verification" --body "Adds an opt-in, allowlisted workspace verifier with bounded subprocess execution and reports."
  ```

  If PR #1 is still open when this branch is ready, keep the relationship
  explicit in the PR body and retarget/rebase to `main` after PR #1 merges.

- [ ] **Step 3: Request review and address findings**

  Review the complete branch diff against the final base. Fix Critical/Important
  findings, rerun the full suite, and push follow-up commits to the same branch.

- [ ] **Step 4: Merge and clean up only after explicit merge confirmation**

  After the PR is merged, verify the merge commit on `main`, then remove the
  feature worktree and local/remote feature branch. Never delete the branch while
  the PR is open.
