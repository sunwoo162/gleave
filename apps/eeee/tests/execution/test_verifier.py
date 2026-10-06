import sys

from app.execution.models import CommandResult
from app.execution.verifier import WorkspaceVerifier


class RecordingRunner:
    def __init__(self, results: dict[str, CommandResult] | None = None):
        self.results = results or {}
        self.calls: list[tuple[object, str]] = []

    def run(self, spec, workspace):
        self.calls.append((spec, str(workspace)))
        return self.results.get(
            spec.name,
            CommandResult(
                name=spec.name,
                argv=spec.argv,
                status="passed",
                exit_code=0,
                duration_ms=12,
                stdout="ok\n",
                stderr="",
                truncated=False,
            ),
        )


def test_verifier_always_runs_compileall_and_skips_absent_optional_checks(tmp_path):
    workspace = tmp_path / "project"
    workspace.mkdir()
    runner = RecordingRunner()

    result = WorkspaceVerifier(runner).verify(workspace)

    assert result.status == "passed"
    assert [spec.name for spec, _ in runner.calls] == ["compileall"]
    assert runner.calls[0][0].argv == (sys.executable, "-m", "compileall", ".")
    assert result.checks == [
        {
            "name": "compileall",
            "status": "passed",
            "command": [sys.executable, "-m", "compileall", "."],
            "exit_code": 0,
            "duration_ms": 12,
            "stdout": "ok\n",
            "stderr": "",
            "truncated": False,
        },
        {"name": "pytest", "status": "skipped", "command": None, "exit_code": None},
        {
            "name": "git-diff-check",
            "status": "skipped",
            "command": None,
            "exit_code": None,
        },
    ]


def test_verifier_runs_pytest_and_git_diff_check_when_project_contains_them(tmp_path):
    workspace = tmp_path / "project"
    (workspace / "tests").mkdir(parents=True)
    (workspace / ".git").mkdir()
    runner = RecordingRunner()

    result = WorkspaceVerifier(runner).verify(workspace)

    assert result.status == "passed"
    assert [spec.name for spec, _ in runner.calls] == [
        "compileall",
        "pytest",
        "git-diff-check",
    ]
    assert runner.calls[1][0].argv == (sys.executable, "-m", "pytest", "-q")
    assert runner.calls[2][0].argv == ("git", "diff", "--check")
    assert [check["status"] for check in result.checks] == [
        "passed",
        "passed",
        "passed",
    ]


def test_verifier_keeps_skipped_checks_in_fixed_order_when_only_git_exists(tmp_path):
    workspace = tmp_path / "project"
    (workspace / ".git").mkdir(parents=True)
    runner = RecordingRunner()

    result = WorkspaceVerifier(runner).verify(workspace)

    assert [spec.name for spec, _ in runner.calls] == ["compileall", "git-diff-check"]
    assert [check["name"] for check in result.checks] == [
        "compileall",
        "pytest",
        "git-diff-check",
    ]


def test_verifier_continues_after_a_failed_check_and_returns_failed_report(tmp_path):
    workspace = tmp_path / "project"
    (workspace / "tests").mkdir(parents=True)
    (workspace / ".git").mkdir()
    runner = RecordingRunner(
        {
            "compileall": CommandResult(
                name="compileall",
                argv=(sys.executable, "-m", "compileall", "."),
                status="failed",
                exit_code=1,
                duration_ms=20,
                stdout="",
                stderr="syntax error",
                truncated=False,
            )
        }
    )

    result = WorkspaceVerifier(runner).verify(workspace)

    assert result.status == "failed"
    assert "compileall" in result.summary
    assert [spec.name for spec, _ in runner.calls] == [
        "compileall",
        "pytest",
        "git-diff-check",
    ]
    assert result.checks[0]["exit_code"] == 1
    assert result.checks[1]["status"] == "passed"
    assert result.checks[2]["status"] == "passed"
