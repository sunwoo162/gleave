"""Independent, allowlisted verification for coordinated workspaces."""

from dataclasses import asdict
import json
from pathlib import Path
import subprocess
import sys
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field

from app.execution.models import CommandResult, CommandSpec


class VerificationReport(BaseModel):
    status: Literal["PASS", "WARN", "BLOCKED"]
    commit: str | None
    checks: list[dict[str, object]] = Field(default_factory=list)
    evidence_paths: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)


class CommandPolicy:
    """Allow only deterministic verification argv; reject everything else."""

    def allows(self, argv: list[str]) -> bool:
        if not argv:
            return False
        executable = Path(argv[0]).name.casefold()
        python_names = {Path(sys.executable).name.casefold(), "python", "python.exe"}
        if executable in python_names and len(argv) >= 3 and argv[1] == "-m":
            if argv[2] == "compileall":
                return argv[3:] == ["."]
            if argv[2] == "pytest":
                return argv[3:] == ["-q"]
            return False
        return executable in {"git", "git.exe"} and argv[1:] == ["diff", "--check"]


class VerificationRunner:
    """Verify integrated state from command output, never agent-written claims."""

    def __init__(
        self,
        runner,
        *,
        command_policy: CommandPolicy | None = None,
        commit_resolver: Callable[[Path], str | None] | None = None,
    ) -> None:
        self.runner = runner
        self.command_policy = command_policy or CommandPolicy()
        self.commit_resolver = commit_resolver or _resolve_commit

    def run(
        self,
        workspace: Path,
        acceptance_criteria: list[str],
        commands: list[list[str]],
    ) -> VerificationReport:
        checks: list[dict[str, object]] = []
        blocking_reasons: list[str] = []
        for index, raw_command in enumerate(commands, start=1):
            argv = [str(part) for part in raw_command]
            if not self.command_policy.allows(argv):
                checks.append(
                    {
                        "name": f"check-{index}",
                        "command": argv,
                        "status": "blocked",
                        "reason": "Command is not approved by CommandPolicy",
                    }
                )
                blocking_reasons.append(f"check-{index}: command is not approved")
                continue
            result = self.runner.run(
                CommandSpec(name=f"check-{index}", argv=tuple(argv)), workspace
            )
            checks.append(_check_payload(result))
            if result.status in {"failed", "timeout"}:
                blocking_reasons.append(f"{result.name}: {result.status}")

        if not commands:
            status: Literal["PASS", "WARN", "BLOCKED"] = "WARN"
            blocking_reasons.append(
                "No approved verification commands were supplied for the acceptance criteria"
            )
        elif blocking_reasons:
            status = "BLOCKED"
        else:
            status = "PASS"
        report = VerificationReport(
            status=status,
            commit=self.commit_resolver(workspace),
            checks=checks,
            evidence_paths=[],
            blocking_reasons=blocking_reasons,
        )
        evidence_path = workspace / "harness-verification.json"
        try:
            evidence_path.write_text(
                json.dumps(report.model_dump(mode="json"), indent=2), encoding="utf-8"
            )
            report = report.model_copy(update={"evidence_paths": [str(evidence_path)]})
            evidence_path.write_text(
                json.dumps(report.model_dump(mode="json"), indent=2), encoding="utf-8"
            )
        except OSError as exc:
            report = report.model_copy(
                update={
                    "status": "BLOCKED",
                    "blocking_reasons": [*report.blocking_reasons, f"evidence write failed: {exc}"],
                }
            )
        return report


def _check_payload(result: CommandResult) -> dict[str, object]:
    payload = asdict(result)
    payload["command"] = payload.pop("argv")
    return payload


def _resolve_commit(workspace: Path) -> str | None:
    if not (workspace / ".git").exists():
        return None
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(workspace),
        shell=False,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    commit = result.stdout.strip()
    return commit or None
