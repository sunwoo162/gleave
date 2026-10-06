from pathlib import Path

import pytest

from app.harness.state import AgentTask, ProjectState


def test_harness_state_models_keep_version_tasks_and_artifacts(tmp_path):
    task = AgentTask(
        id="task-1",
        role="builder",
        state_version=3,
        workspace=tmp_path,
        owned_paths=["src/app.py"],
        status="pending",
    )
    state = ProjectState(
        version=3,
        requirements_hash="requirements-hash",
        current_commit="abc123",
        active_tasks=[task],
        artifacts=["plan.md"],
    )

    assert state.active_tasks[0].workspace == Path(tmp_path)
    assert state.model_dump(mode="json")["current_commit"] == "abc123"


def test_harness_state_rejects_negative_versions():
    with pytest.raises(ValueError):
        ProjectState(
            version=-1,
            requirements_hash="hash",
            current_commit=None,
            active_tasks=[],
            artifacts=[],
        )
