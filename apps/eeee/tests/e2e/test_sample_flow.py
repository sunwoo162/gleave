from pathlib import Path

from fastapi.testclient import TestClient

from app.agent.protocol import AgentRequest, AgentResult
from app.config import Settings
from app.domain.models import CandidateScore
from app.main import create_app


def candidate(name: str, branch: str) -> CandidateScore:
    return CandidateScore(
        repository={
            "full_name": name,
            "html_url": f"https://github.com/{name}",
            "description": "A verified OSS starting point",
            "stars": 500,
            "forks": 50,
            "open_issues": 4,
            "license_spdx": "MIT",
            "default_branch": branch,
            "pushed_at": "2026-09-28T00:00:00Z",
            "topics": ["web-app"],
        },
        total=0.8,
        dimension_scores={"fit": 0.8},
        evidence=["Matches the requested target"],
        risks=[],
        status="candidate",
    )


class FakeGitHubResearcher:
    def research(self, _brief):
        return [candidate("sample/alpha", "main"), candidate("sample/beta", "stable")]


class FakeAgentRuntime:
    def run(self, request: AgentRequest) -> AgentResult:
        (request.workspace / "src").mkdir(parents=True, exist_ok=True)
        (request.workspace / "src" / "app.py").write_text("print('sample')\n", encoding="utf-8")
        return AgentResult(
            status="completed",
            summary="Sample implementation completed",
            events=[{"type": "verification", "status": "passed"}],
            changed_files=["src/app.py"],
            test_commands=["pytest -q"],
            error=None,
        )


def test_sample_flow_writes_decision_lock_test_and_final_reports(tmp_path):
    workspace = tmp_path / "workspaces" / "sample"
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    client = TestClient(
        create_app(
            settings,
            researcher=FakeGitHubResearcher(),
            agent_runtime=FakeAgentRuntime(),
        )
    )

    created = client.post(
        "/api/requests",
        json={"text": "Build a web app sample", "workspace": str(workspace)},
    ).json()
    request_id = created["request_id"]
    client.post(f"/api/requests/{request_id}/research")
    approved = client.post(
        f"/api/requests/{request_id}/approve",
        json={"selected": ["sample/alpha"]},
    )
    assert approved.status_code == 200

    executed = client.post(f"/api/runs/{created['run_id']}/execute")

    assert executed.status_code == 200
    run = executed.json()
    assert run["status"] == "completed"
    artifact_dir = workspace / created["run_id"]
    expected_files = {
        "OSS-DECISIONS.md",
        "DEPENDENCIES.lock",
        "TEST-RESULTS.md",
        "FINAL-REPORT.md",
    }
    assert {path.name for path in artifact_dir.iterdir()} >= expected_files
    assert "https://github.com/sample/alpha" in (artifact_dir / "OSS-DECISIONS.md").read_text()
    assert "MIT" in (artifact_dir / "OSS-DECISIONS.md").read_text()
    assert "sample/alpha @ main" in (artifact_dir / "DEPENDENCIES.lock").read_text()
    assert "pytest -q" in (artifact_dir / "TEST-RESULTS.md").read_text()
    assert "completed" in (artifact_dir / "FINAL-REPORT.md").read_text()
    assert Path(run["workspace"]) == workspace
