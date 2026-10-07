from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from app.domain.models import Project, RequestBrief
from app.activity.models import ActivityEvent
from app.activity.store import ActivityLedger
from app.planning.models import PlanningArtifact, PlanningDecision, PlanningHandoff, PlanningSession
from app.runtime.store import StaleProjectRevision
from app.storage.sqlite import SQLiteStore


_QUESTIONS = (
    "What are the core user scenarios?",
    "What platform and constraints should we support?",
    "What makes the project complete and acceptable?",
)
_ARTIFACT_KINDS = (
    "project-brief", "requirements", "user-scenarios", "ux-flow", "technical-decisions",
    "data-model", "acceptance-criteria", "qa-plan", "task-dag", "decision-log",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _content_hash(content: dict[str, object]) -> str:
    encoded = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


class PlanningService:
    def __init__(self, store: SQLiteStore, activity: ActivityLedger | None = None) -> None:
        self.store = store
        self.activity = activity

    def start(
        self, project: Project, request: RequestBrief, mode: Literal["deep", "quick"]
    ) -> PlanningSession:
        now = _now()
        session = PlanningSession(
            session_id=f"planning-{uuid4().hex}", project_id=project.id,
            project_revision=project.revision, mode=mode,
            status="interviewing" if mode == "deep" else "draft",
            current_question=_QUESTIONS[0] if mode == "deep" else None,
            revision=1, created_at=now, updated_at=now,
        )
        self.store.save_planning_session(session)
        self._record(session, "planning.started", "Start planning session", "Every project gets a planning gate",
                     [], [f"planning://{session.session_id}"], "active")
        return session

    def get_session(self, session_id: str) -> PlanningSession:
        return self.store.get_planning_session(session_id)

    def answer(self, session_id: str, answer: str, expected_revision: int) -> PlanningSession:
        session = self.get_session(session_id)
        if session.revision != expected_revision:
            raise StaleProjectRevision(f"stale planning session revision for {session_id}: {expected_revision}")
        if session.status not in {"interviewing", "awaiting_approval"}:
            raise ValueError(f"planning session cannot accept an answer in {session.status}")
        if not answer.strip():
            raise ValueError("planning answer cannot be blank")
        question_index = _QUESTIONS.index(session.current_question) if session.current_question in _QUESTIONS else len(_QUESTIONS) - 1
        next_index = question_index + 1
        now = _now()
        decision = PlanningDecision(
            decision_id=f"decision-{uuid4().hex}", planning_session_id=session.session_id,
            project_id=session.project_id, project_revision=session.project_revision,
            summary=f"Answered: {session.current_question}",
            reason="User supplied an answer in the planning interview",
            alternatives=[], selected_because=answer.strip(), created_at=now,
        )
        self.store.append_planning_decision(decision)
        updated = session.model_copy(update={
            "status": "awaiting_approval" if next_index >= len(_QUESTIONS) else "interviewing",
            "current_question": _QUESTIONS[next_index] if next_index < len(_QUESTIONS) else None,
            "revision": session.revision + 1, "updated_at": now,
        })
        self.store.save_planning_session(updated)
        self._record(updated, "decision.made", decision.summary, decision.reason, decision.alternatives,
                     [f"planning://{session.session_id}"], "completed")
        return updated

    def approve(self, session_id: str, expected_revision: int, actor: str) -> PlanningHandoff:
        session = self.get_session(session_id)
        if session.revision != expected_revision:
            raise StaleProjectRevision(f"stale planning session revision for {session_id}: {expected_revision}")
        if session.status == "handed_off":
            raise ValueError("planning session is already handed off")
        if session.status != "awaiting_approval":
            raise ValueError("planning session is not awaiting approval")
        artifacts = self.store.list_planning_artifacts(session_id)
        required = {"project-brief", "requirements", "user-scenarios", "ux-flow", "technical-decisions",
                    "data-model", "acceptance-criteria", "qa-plan", "task-dag", "decision-log"}
        if {item.kind for item in artifacts} != required:
            raise ValueError("required planning artifacts are incomplete")
        return self._handoff(session, artifacts, actor=actor, mode=session.mode)

    def quick_plan(
        self, project: Project, request: RequestBrief,
        memory_ids: list[str], qa_baseline_ids: list[str],
    ) -> PlanningHandoff:
        session = self.start(project, request, "quick")
        now = _now()
        target = request.target_type if request.target_type != "unknown" else "local desktop project"
        contents: dict[str, dict[str, object]] = {
            "project-brief": {"goal": request.goal, "target": target, "constraints": request.constraints},
            "requirements": {"items": [request.goal, *request.acceptance_criteria]},
            "user-scenarios": {"items": [{"actor": "user", "goal": request.goal, "outcome": "verified project result"}]},
            "ux-flow": {"items": [{"step": 1, "title": "Open project"},
                                    {"step": 2, "title": "Use the requested feature"},
                                    {"step": 3, "title": "See completion state"}]},
            "technical-decisions": {"items": [
                {"summary": "FSD feature boundary", "reason": "Keep project features isolated and testable",
                 "alternatives": ["single page module"], "selectedBecause": "Supports maintainable project growth"},
                {"summary": "Use default design baseline", "reason": "Provide a consistent usable starting point",
                 "alternatives": ["unstructured custom UI"], "selectedBecause": "User can refine after creation"},
            ]},
            "data-model": {"entities": [{"name": "Todo"}, {"name": "Todo status"}]},
            "acceptance-criteria": {"items": [*request.acceptance_criteria, "Build succeeds", "Tests and QA report PASS"]},
            "qa-plan": {"checks": ["unit", "integration", "e2e", "responsive", "encoding", "build"]},
            "task-dag": {"tasks": [
                {"id": "plan", "role": "planning", "title": "Finalize planning handoff"},
                {"id": "feature", "role": "frontend", "title": "Implement requested feature", "dependsOn": ["plan"]},
                {"id": "qa", "role": "qa", "title": "Run independent QA", "dependsOn": ["feature"]},
                {"id": "release", "role": "release", "title": "Verify and release", "dependsOn": ["qa"]},
            ]},
            "decision-log": {"memoryIds": memory_ids, "qaBaselineIds": qa_baseline_ids},
        }
        artifacts = [self._save_artifact(session, kind, contents[kind], now) for kind in _ARTIFACT_KINDS]
        self.store.append_planning_decision(PlanningDecision(
            decision_id=f"decision-{uuid4().hex}", planning_session_id=session.session_id,
            project_id=project.id, project_revision=project.revision,
            summary="Apply safe defaults for direct project request",
            reason="Direct requests still require a complete plan before ISEOL execution",
            alternatives=["skip planning"], selected_because="Preserve the same quality gates for simple requests",
            created_at=now,
        ))
        return self._handoff(session, artifacts, actor="policy", mode="quick")

    def _save_artifact(
        self, session: PlanningSession, kind: str, content: dict[str, object], created_at: datetime,
    ) -> PlanningArtifact:
        artifact = PlanningArtifact(
            artifact_id=f"artifact-{uuid4().hex}", planning_session_id=session.session_id,
            project_id=session.project_id, project_revision=session.project_revision,
            kind=kind, content=content, content_hash=_content_hash(content), created_at=created_at,
        )
        self.store.save_planning_artifact(artifact)
        return artifact

    def _handoff(
        self, session: PlanningSession, artifacts: list[PlanningArtifact], *, actor: str, mode: PlanningMode,
    ) -> PlanningHandoff:
        by_kind = {item.kind: item.content for item in artifacts}
        now = _now()
        handoff = PlanningHandoff(
            schema_version="planning-handoff.v1", handoff_id=f"handoff-{uuid4().hex}",
            planning_session_id=session.session_id, project_id=session.project_id,
            project_revision=session.project_revision, mode=mode,
            user_intent=by_kind["project-brief"].get("goal", "project request"),
            requirements=list(by_kind["requirements"].get("items", [])),
            user_scenarios=list(by_kind["user-scenarios"].get("items", [])),
            ux_flow=list(by_kind["ux-flow"].get("items", [])),
            technical_decisions=list(by_kind["technical-decisions"].get("items", [])),
            data_model=list(by_kind["data-model"].get("entities", [])),
            acceptance_criteria=list(by_kind["acceptance-criteria"].get("items", [])),
            qa_plan=list(by_kind["qa-plan"].get("checks", [])),
            task_dag=by_kind["task-dag"], artifact_ids=[item.artifact_id for item in artifacts],
            rules_snapshot={"memoryIds": by_kind["decision-log"].get("memoryIds", []),
                            "qaBaselineIds": by_kind["decision-log"].get("qaBaselineIds", [])},
            approval={"status": "approved", "actor": actor, "timestamp": now.isoformat()},
            created_at=now,
        )
        self.store.save_planning_handoff(handoff)
        updated = session.model_copy(update={"status": "handed_off", "revision": session.revision + 1,
                                             "updated_at": now})
        self.store.save_planning_session(updated)
        self._record(updated, "planning.handoff.created", "Create approved planning handoff",
                     "ISEOL must receive a structured plan before execution", [], handoff.artifact_ids, "completed")
        return handoff

    def _record(self, session: PlanningSession, event_type: str, summary: str, reason: str,
                alternatives: list[str], evidence_refs: list[str], status: str) -> None:
        if self.activity is None:
            return
        self.activity.append(ActivityEvent(
            event_type=event_type, project_id=session.project_id, project_revision=session.project_revision,
            node_id=f"planning:{session.session_id}", actor_type="coordinator", actor_id="EEEE.PlanningRoom",
            summary=summary, reason=reason, alternatives=alternatives, selected_because=summary,
            outputs=[f"planning://{session.session_id}"], evidence_refs=evidence_refs,
            status=status, occurred_at=_now(),
        ))
