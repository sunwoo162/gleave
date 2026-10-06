"""Deterministic worker used to prove the coordinator state loop."""

from app.domain.models import PetState, TaskRecord


class DeterministicFakeWorker:
    def advance(
        self, task: TaskRecord
    ) -> tuple[PetState, str, str | None, dict[str, object] | None]:
        if task.state == PetState.working:
            return PetState.verifying, "Running verification", None, None
        if task.state == PetState.verifying:
            return (
                PetState.completed,
                "Verification passed",
                None,
                {
                    "status": "passed",
                    "summary": "All deterministic checks passed",
                    "checks": [{"name": "fake-tests", "status": "passed"}],
                },
            )
        raise ValueError(f"Fake worker cannot advance task in state {task.state.value}")
