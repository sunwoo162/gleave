from pathlib import Path

import pytest

from app.domain.models import RequestBrief
from app.planning.models import PlanningHandoff
from app.planning.service import PlanningService
from app.runtime.store import StaleProjectRevision
from app.storage.sqlite import SQLiteStore


def _request(text: str = "Todo 앱 만들어줘") -> RequestBrief:
    return RequestBrief(
        raw_text=text,
        goal="Todo 앱 만들어줘",
        target_type="unknown",
        constraints=[],
        acceptance_criteria=["Todo를 추가할 수 있다", "Todo를 완료할 수 있다"],
    )


def _service(tmp_path: Path) -> tuple[SQLiteStore, PlanningService]:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Todo", str(tmp_path / "project"), revision="1")
    return store, PlanningService(store)


def test_deep_session_answers_are_ordered_and_incomplete_plan_cannot_be_approved(tmp_path) -> None:
    store, service = _service(tmp_path)
    project = store.get_project("project-1")
    session = service.start(project, _request(), "deep")
    assert session.status == "interviewing"
    assert session.current_question == "What are the core user scenarios?"

    answered = service.answer(session.session_id, "사용자는 할 일을 추가하고 완료 처리한다.", expected_revision=1)
    assert answered.revision == 2
    assert store.list_planning_decisions(session.session_id)[0].reason == "User supplied an answer in the planning interview"
    answered = service.answer(session.session_id, "Windows 데스크톱에서 실행한다.", expected_revision=2)
    answered = service.answer(session.session_id, "추가·완료·삭제와 전체 테스트 PASS가 완료 기준이다.", expected_revision=3)
    assert answered.status == "awaiting_approval"

    with pytest.raises(ValueError, match="required planning artifacts"):
        service.approve(session.session_id, expected_revision=4, actor="user")


def test_quick_plan_creates_detailed_todo_handoff_with_defaults(tmp_path) -> None:
    store, service = _service(tmp_path)
    handoff = service.quick_plan(
        store.get_project("project-1"), _request(), memory_ids=["memory-qa"], qa_baseline_ids=["qa-default"],
    )

    assert isinstance(handoff, PlanningHandoff)
    assert handoff.mode == "quick"
    assert handoff.design_baseline == "oh-my-design-default"
    assert "FSD feature boundary" in [item["summary"] for item in handoff.technical_decisions]
    assert handoff.acceptance_criteria
    assert handoff.qa_plan
    assert handoff.task_dag["tasks"]
    assert handoff.approval["actor"] == "policy"
    assert service.get_session(handoff.planning_session_id).status == "handed_off"


def test_stale_answer_and_approve_are_rejected_and_handoff_is_immutable(tmp_path) -> None:
    store, service = _service(tmp_path)
    project = store.get_project("project-1")
    session = service.start(project, _request(), "deep")

    with pytest.raises(StaleProjectRevision):
        service.answer(session.session_id, "answer", expected_revision=99)

    handoff = service.quick_plan(project, _request(), memory_ids=[], qa_baseline_ids=[])
    with pytest.raises(ValueError, match="already handed off"):
        service.approve(handoff.planning_session_id, expected_revision=2, actor="user")
