"""Versioned task leases and fresh-context review contracts."""

from collections.abc import Iterable
import re
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.domain.models import RequestBrief
from app.harness.state import AgentTask, ProjectState
from app.storage.sqlite import SQLiteStore


class HarnessError(RuntimeError):
    """Base error for invalid coordination transitions."""


class StaleStateError(HarnessError):
    """A task was planned against an older shared state version."""


class OwnershipConflictError(HarnessError):
    """A task overlaps paths currently leased by another task."""


class HandoffError(HarnessError):
    """A task handoff lacks the evidence required to release its lease."""


class ReviewBlockedError(HarnessError):
    """A review finding must be resolved or explicitly waived before completion."""


class ReviewReport(BaseModel):
    status: Literal["PASS", "WARN", "BLOCKED"]
    findings: list[str] = Field(default_factory=list)
    required_actions: list[str] = Field(default_factory=list)


class ReviewerAgent(Protocol):
    def review(self, diff: str, requirements: RequestBrief) -> ReviewReport:
        """Review only the latest diff and requirements in a fresh context."""


class StaticReviewer:
    """Fail closed on obvious destructive, external, or secret-bearing changes."""

    _rules = (
        (
            re.compile(r"\b(?:curl|wget|invoke-webrequest|requests\.(?:post|put)|upload|transfer|send)\b", re.IGNORECASE),
            "Diff contains an external transfer operation",
            "Remove or explicitly approve external data transfer",
        ),
        (
            re.compile(r"\b(?:rm\s+-rf|rmdir|del\s+/s|shutil\.rmtree|unlink\s*\()", re.IGNORECASE),
            "Diff contains a destructive deletion operation",
            "Remove destructive deletion or obtain explicit approval",
        ),
        (
            re.compile(r"\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]", re.IGNORECASE),
            "Diff contains a possible secret",
            "Remove the secret and use local configuration instead",
        ),
    )

    def review(self, diff: str, _requirements: RequestBrief) -> ReviewReport:
        added_lines = [
            line[1:]
            for line in diff.splitlines()
            if line.startswith("+") and not line.startswith("+++")
        ]
        content = "\n".join(added_lines or diff.splitlines())
        findings: list[str] = []
        required_actions: list[str] = []
        for pattern, finding, action in self._rules:
            if pattern.search(content):
                findings.append(finding)
                required_actions.append(action)
        return ReviewReport(
            status="BLOCKED" if findings else "PASS",
            findings=findings,
            required_actions=required_actions,
        )


class Coordinator:
    """Persist shared project state and enforce non-overlapping task leases."""

    def __init__(
        self,
        store: SQLiteStore,
        project_id: str,
        *,
        requirements_hash: str = "",
        reviewer: ReviewerAgent | None = None,
    ) -> None:
        self.store = store
        self.project_id = project_id
        self.requirements_hash = requirements_hash
        self.reviewer = reviewer or StaticReviewer()

    def get_state(self) -> ProjectState:
        try:
            return self.store.get_harness_state(self.project_id)
        except KeyError:
            state = ProjectState(
                version=0,
                requirements_hash=self.requirements_hash,
                current_commit=None,
                active_tasks=[],
                artifacts=[],
            )
            self.store.save_harness_state(self.project_id, state)
            return state

    def start_task(self, task: AgentTask, state: ProjectState) -> AgentTask:
        current = self.get_state()
        if state.version != current.version or task.state_version != current.version:
            raise StaleStateError(
                f"Task {task.id} targets state {task.state_version}, current state is {current.version}"
            )
        for active in current.active_tasks:
            if active.id == task.id or _paths_overlap(active.owned_paths, task.owned_paths):
                raise OwnershipConflictError(
                    f"Task {task.id} overlaps active task {active.id}"
                )
        started = task.model_copy(update={"state_version": current.version, "status": "running"})
        next_state = current.model_copy(
            update={"active_tasks": [*current.active_tasks, started]}
        )
        self.store.save_harness_task(self.project_id, started)
        self.store.save_harness_state(self.project_id, next_state)
        return started

    def record_handoff(self, task_id: str, handoff: dict[str, object]) -> ProjectState:
        current = self.get_state()
        task = self.store.get_harness_task(task_id)
        if not any(active.id == task_id for active in current.active_tasks):
            raise HandoffError(f"Task {task_id} does not hold an active lease")
        changed_files = _string_list(handoff.get("changed_files"), "changed_files")
        summary = handoff.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            raise HandoffError("handoff requires a non-empty summary")
        next_steps = handoff.get("next_steps", handoff.get("next_step_notes"))
        if not isinstance(next_steps, (str, list)) or not next_steps:
            raise HandoffError("handoff requires next_steps")
        evidence = _string_list(
            handoff.get("evidence_paths", handoff.get("evidence", [])),
            "evidence_paths",
        )
        updated_task = task.model_copy(
            update={"status": "handed_off", "handoff": dict(handoff)}
        )
        artifacts = _unique([*current.artifacts, *changed_files, *evidence])
        commit = handoff.get("commit")
        next_state = current.model_copy(
            update={
                "version": current.version + 1,
                "current_commit": commit if isinstance(commit, str) else current.current_commit,
                "active_tasks": [
                    active for active in current.active_tasks if active.id != task_id
                ],
                "artifacts": artifacts,
            }
        )
        self.store.save_harness_task(self.project_id, updated_task)
        self.store.save_harness_state(self.project_id, next_state)
        return next_state

    def review(self, diff: str, requirements: RequestBrief) -> ReviewReport:
        if self.reviewer is None:
            return ReviewReport(
                status="WARN",
                findings=["No fresh-context reviewer is configured"],
                required_actions=["Configure a reviewer or explicitly waive the review"],
            )
        return self.reviewer.review(diff, requirements)

    def require_review(
        self, diff: str, requirements: RequestBrief, *, waived: bool = False
    ) -> ReviewReport:
        report = self.review(diff, requirements)
        if report.status != "PASS" and not waived:
            raise ReviewBlockedError(
                "Review must PASS before completion or be explicitly waived"
            )
        return report


def _string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise HandoffError(f"handoff requires {field} as a list of strings")
    return list(value)


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _paths_overlap(left: list[str], right: list[str]) -> bool:
    left_parts = [_path_parts(path) for path in left]
    right_parts = [_path_parts(path) for path in right]
    return any(_is_prefix(first, second) or _is_prefix(second, first) for first in left_parts for second in right_parts)


def _path_parts(value: str) -> tuple[str, ...]:
    return tuple(part.casefold() for part in value.replace("\\", "/").split("/") if part)


def _is_prefix(prefix: tuple[str, ...], value: tuple[str, ...]) -> bool:
    return bool(prefix) and value[: len(prefix)] == prefix
