import sys

from app.execution.models import CommandResult
from app.harness.verifier import VerificationRunner


class RecordingRunner:
    def __init__(self, result: CommandResult | None = None):
        self.result = result or CommandResult(
            name="check-1",
            argv=(sys.executable, "-m", "pytest", "-q"),
            status="passed",
            exit_code=0,
            duration_ms=5,
            stdout="ok\n",
            stderr="",
            truncated=False,
        )
        self.calls = []

    def run(self, spec, workspace):
        self.calls.append((spec, workspace))
        return self.result


def test_verification_runner_passes_only_after_runner_evidence(tmp_path):
    runner = RecordingRunner()
    report = VerificationRunner(runner, commit_resolver=lambda _workspace: "abc123").run(
        tmp_path,
        ["Run the tests"],
        [[sys.executable, "-m", "pytest", "-q"]],
    )

    assert report.status == "PASS"
    assert report.commit == "abc123"
    assert report.checks[0]["status"] == "passed"
    assert len(runner.calls) == 1
    assert report.evidence_paths[0].endswith("harness-verification.json")


def test_failed_mandatory_command_blocks_verification(tmp_path):
    runner = RecordingRunner(
        CommandResult(
            name="check-1",
            argv=(sys.executable, "-m", "pytest", "-q"),
            status="failed",
            exit_code=1,
            duration_ms=5,
            stdout="",
            stderr="failure",
            truncated=False,
        )
    )

    report = VerificationRunner(runner, commit_resolver=lambda _workspace: None).run(
        tmp_path,
        ["Tests must pass"],
        [[sys.executable, "-m", "pytest", "-q"]],
    )

    assert report.status == "BLOCKED"
    assert "check-1" in report.blocking_reasons[0]


def test_unapproved_command_is_blocked_without_starting_process(tmp_path):
    runner = RecordingRunner()

    report = VerificationRunner(runner, commit_resolver=lambda _workspace: None).run(
        tmp_path,
        ["Do not delete files"],
        [["powershell.exe", "-Command", "Remove-Item", "important.txt"]],
    )

    assert report.status == "BLOCKED"
    assert runner.calls == []
    assert report.checks[0]["status"] == "blocked"
