from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GitWorkspaceRecord:
    branch: str
    commit: str


class GitWorkspaceError(RuntimeError):
    """A generated workspace could not be recorded in local Git."""


def record_workspace(workspace: str | Path, *, project_id: str, message: str) -> GitWorkspaceRecord:
    root = Path(workspace).resolve()
    root.mkdir(parents=True, exist_ok=True)
    _run(root, ["init", "-b", "main"])
    suffix = re.sub(r"[^a-z0-9-]+", "-", project_id.lower()).strip("-") or "generated"
    branch = "project/" + suffix
    current = _run(root, ["branch", "--show-current"], allow_failure=True).stdout.strip()
    if current != branch:
        _run(root, ["checkout", "-B", branch])
    _run(root, ["config", "user.name", "Gleave"])
    _run(root, ["config", "user.email", "gleave@localhost"])
    _run(root, ["add", "--all"])
    _run(root, ["commit", "--allow-empty", "-m", message])
    commit = _run(root, ["rev-parse", "HEAD"]).stdout.strip()
    if not commit:
        raise GitWorkspaceError("Git did not return a commit id")
    return GitWorkspaceRecord(branch=branch, commit=commit)


def _run(root: Path, args: list[str], *, allow_failure: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=False,
    )
    if result.returncode and not allow_failure:
        detail = (result.stderr or result.stdout).strip()
        raise GitWorkspaceError(f"git {' '.join(args)} failed: {detail}")
    return result
