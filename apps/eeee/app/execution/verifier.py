"""Run the fixed verification checks for a project workspace."""

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Literal

from app.execution.models import CommandResult, CommandSpec
from app.execution.runner import WorkspaceCommandRunner


VerificationStatus = Literal["passed", "failed"]


@dataclass(frozen=True)
class VerificationResult:
    status: VerificationStatus
    summary: str
    checks: list[dict[str, object]]

    def as_report_payload(self) -> dict[str, object]:
        return {
            "status": self.status,
            "summary": self.summary,
            "checks": self.checks,
        }


class WorkspaceVerifier:
    """Execute only the deterministic checks supported by the MVP."""

    def __init__(self, runner: WorkspaceCommandRunner):
        self.runner = runner

    def verify(self, workspace: str | Path) -> VerificationResult:
        workspace_path = Path(workspace)
        checks: list[dict[str, object]] = []
        failed_names: list[str] = []

        for name, spec in self._check_specs(workspace_path):
            if spec is None:
                checks.append(self._skipped_check(name))
                continue
            result = self.runner.run(spec, workspace_path)
            check = self._result_to_check(result)
            checks.append(check)
            if result.status in {"failed", "timeout"}:
                failed_names.append(result.name)

        if failed_names:
            summary = f"Verification failed: {', '.join(failed_names)}"
            status: VerificationStatus = "failed"
        else:
            summary = "All deterministic checks passed"
            status = "passed"
        return VerificationResult(status=status, summary=summary, checks=checks)

    def _check_specs(self, workspace: Path) -> list[tuple[str, CommandSpec | None]]:
        return [
            (
                "compileall",
                CommandSpec("compileall", (sys.executable, "-m", "compileall", ".")),
            ),
            (
                "pytest",
                CommandSpec("pytest", (sys.executable, "-m", "pytest", "-q"))
                if (workspace / "tests").is_dir()
                else None,
            ),
            (
                "git-diff-check",
                CommandSpec("git-diff-check", ("git", "diff", "--check"))
                if (workspace / ".git").exists()
                else None,
            ),
        ]

    @staticmethod
    def _result_to_check(result: CommandResult) -> dict[str, object]:
        return {
            "name": result.name,
            "status": result.status,
            "command": list(result.argv),
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "truncated": result.truncated,
        }

    @staticmethod
    def _skipped_check(name: str) -> dict[str, object]:
        return {"name": name, "status": "skipped", "command": None, "exit_code": None}
