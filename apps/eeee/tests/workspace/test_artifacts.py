from app.domain.models import CandidateScore
from app.workspace.artifacts import WorkspaceArtifactWriter


def candidate(full_name: str) -> CandidateScore:
    return CandidateScore(
        repository={
            "full_name": full_name,
            "html_url": f"https://github.com/{full_name}",
            "description": "Demo repository",
            "stars": 10,
            "forks": 1,
            "open_issues": 0,
            "license_spdx": "MIT",
            "default_branch": "main",
            "pushed_at": "2026-09-20T00:00:00Z",
            "topics": ["demo"],
        },
        total=80,
        dimension_scores={"fit": 40},
        evidence=["Matches the request"],
        risks=[],
        status="candidate",
    )


def test_write_plan_creates_task_artifact_with_request_and_selection(tmp_path):
    writer = WorkspaceArtifactWriter()

    path = writer.write_plan(
        tmp_path,
        "task-1",
        request_text="Build a web app",
        revision="rev-1",
        selected=[candidate("demo/alpha")],
    )

    assert path == tmp_path / "task-1" / "plan.md"
    content = path.read_text(encoding="utf-8")
    assert "Build a web app" in content
    assert "rev-1" in content
    assert "demo/alpha" in content


def test_write_verification_creates_report_artifact_with_checks(tmp_path):
    writer = WorkspaceArtifactWriter()

    path = writer.write_verification(
        tmp_path,
        "task-1",
        status="passed",
        summary="All deterministic checks passed",
        checks=[{"name": "fake-tests", "status": "passed"}],
    )

    assert path == tmp_path / "task-1" / "verification.md"
    content = path.read_text(encoding="utf-8")
    assert "passed" in content
    assert "All deterministic checks passed" in content
    assert "fake-tests" in content


def test_write_verification_includes_check_execution_details(tmp_path):
    writer = WorkspaceArtifactWriter()

    path = writer.write_verification(
        tmp_path,
        "task-1",
        status="failed",
        summary="compileall failed",
        checks=[
            {
                "name": "compileall",
                "status": "failed",
                "command": ["python", "-m", "compileall", "."],
                "exit_code": 1,
                "duration_ms": 42,
                "stdout": "partial output",
                "stderr": "syntax error",
                "truncated": True,
            }
        ],
    )

    content = path.read_text(encoding="utf-8")
    assert "python -m compileall ." in content
    assert "Exit code: `1`" in content
    assert "Duration: `42 ms`" in content
    assert "partial output" in content
    assert "syntax error" in content
    assert "Output truncated: `True`" in content
