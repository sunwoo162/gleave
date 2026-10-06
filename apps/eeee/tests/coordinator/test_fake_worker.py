from app.coordinator.fake_worker import DeterministicFakeWorker
from app.domain.models import PetState, TaskRecord


def task(state: PetState) -> TaskRecord:
    return TaskRecord(
        id="task-1",
        project_id="project-1",
        request_id="request-1",
        state=state,
        message="",
        required_action=None,
        revision="rev-1",
        report_id=None,
        report=None,
    )


def test_fake_worker_advances_work_and_returns_deterministic_report():
    worker = DeterministicFakeWorker()

    verifying = worker.advance(task(PetState.working))
    completed = worker.advance(task(PetState.verifying))

    assert verifying == (PetState.verifying, "Running verification", None, None)
    assert completed[0] == PetState.completed
    assert completed[1] == "Verification passed"
    assert completed[2] is None
    assert completed[3] == {
        "status": "passed",
        "summary": "All deterministic checks passed",
        "checks": [{"name": "fake-tests", "status": "passed"}],
    }
