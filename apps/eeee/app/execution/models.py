"""Data models for safe workspace commands."""

from dataclasses import dataclass
from typing import Literal


CommandStatus = Literal["passed", "failed", "timeout"]


@dataclass(frozen=True)
class CommandSpec:
    name: str
    argv: tuple[str, ...]
    timeout_seconds: float | None = None


@dataclass(frozen=True)
class CommandResult:
    name: str
    argv: tuple[str, ...]
    status: CommandStatus
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str
    truncated: bool
