from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.domain.models import RequestBrief
from app.integrations.contracts import ProjectBriefV1
from app.planning.models import PlanningHandoff


Runner = Callable[[list[str], str, float], str]


class IseolPlanBridge:
    """Call the local ISEOL planner through a versioned JSON stdin/stdout boundary."""

    def __init__(
        self,
        *,
        command: list[str] | None = None,
        timeout: float = 30.0,
        runner: Runner | None = None,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        default_cli = repo_root / "packages" / "iseol" / "dist" / "agent-organization" / "plan-cli.js"
        self.command = list(command or ["node", str(default_cli)])
        self.timeout = timeout
        self.runner = runner or self._run

    def create_plan(
        self,
        *,
        project_id: str,
        project_revision: str,
        request_id: str,
        request: RequestBrief,
        memory_ids: list[str],
        qa_baseline_ids: list[str],
        planning_handoff: PlanningHandoff | None = None,
    ) -> dict[str, Any]:
        brief = ProjectBriefV1(
            schema_version=1,
            project_id=project_id,
            request_id=request_id,
            user_goal=request.goal,
            scope=[request.target_type, *request.acceptance_criteria],
            constraints=list(request.constraints),
            preferences={},
            schedule={},
            retrieved_memory_ids=list(memory_ids),
            qa_baseline_ids=list(qa_baseline_ids),
            created_at="2026-10-07T00:00:00+00:00",
        )
        payload = {
            "brief": brief.model_dump(mode="json", by_alias=True),
            "projectRevision": project_revision,
            "qualityMemory": [{"id": item, "kind": "qa_rule", "status": "active", "content": item, "scope": {}} for item in memory_ids],
        }
        if planning_handoff is not None:
            if planning_handoff.project_id != project_id or planning_handoff.project_revision != project_revision:
                raise ValueError("planning handoff identity does not match ISEOL plan")
            payload["planningHandoff"] = planning_handoff.model_dump(mode="json", by_alias=True)
        try:
            raw = self.runner(self.command, json.dumps(payload, ensure_ascii=False), self.timeout)
            value = json.loads(raw)
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
            raise RuntimeError("ISEOL planner is unavailable; project execution is blocked") from exc
        if not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("projectId") != project_id or not isinstance(value.get("tasks"), list):
            raise RuntimeError("invalid ISEOL plan")
        if planning_handoff is not None:
            value["planningHandoff"] = planning_handoff.model_dump(mode="json", by_alias=True)
        return value

    @staticmethod
    def _run(command: list[str], payload: str, timeout: float) -> str:
        result = subprocess.run(command, input=payload, text=True, capture_output=True, timeout=timeout, check=False)
        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
        return result.stdout
