import pytest

from app.domain.models import CandidateScore, RepositorySnapshot
from app.storage.sqlite import SQLiteStore
from app.workflow.approvals import (
    AlreadyApprovedError,
    ApprovalService,
    CandidateSetChangedError,
    InsufficientCandidatesError,
    UnknownCandidateError,
)


def _candidate(name):
    return CandidateScore(
        repository=RepositorySnapshot(
            full_name=name,
            html_url=f"https://github.com/{name}",
            description="Example",
            stars=1,
            forks=0,
            open_issues=0,
            license_spdx="MIT",
            default_branch="main",
            pushed_at="2026-01-01T00:00:00Z",
            topics=[],
        ),
        total=50,
        dimension_scores={"fit": 50},
        evidence=["example"],
        risks=[],
        status="candidate",
    )


@pytest.fixture
def store(tmp_path):
    value = SQLiteStore(tmp_path / "workflow.sqlite")
    value.init()
    return value


def test_approval_rejects_unknown_candidate_without_recording_decision(store):
    store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])

    with pytest.raises(UnknownCandidateError):
        ApprovalService(store).approve_decision("request-1", ["org/other"])

    assert store.get_decision("request-1") is None
    assert store.get_decision_events("request-1") == []


def test_approval_requires_two_distinct_compared_candidates(store):
    store.save_candidates("request-1", [_candidate("org/one")])

    with pytest.raises(InsufficientCandidatesError):
        ApprovalService(store).approve_decision("request-1", ["org/one"])


def test_approval_persists_selection_alternatives_and_event(store):
    store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])

    decision = ApprovalService(store).approve_decision("request-1", ["org/two"])

    assert decision.request_id == "request-1"
    assert decision.selected == ["org/two"]
    assert decision.alternatives == ["org/one"]
    assert decision.approved
    assert ApprovalService(store).get_decision("request-1") == decision
    assert store.get_decision_events("request-1") == [
        {"action": "approved", "selected": ["org/two"]}
    ]


def test_approved_decision_cannot_be_revised(store):
    store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])
    service = ApprovalService(store)
    original = service.approve_decision("request-1", ["org/one"])

    with pytest.raises(AlreadyApprovedError):
        ApprovalService(store).approve_decision("request-1", ["org/two"])

    assert store.get_decision("request-1") == original
    assert len(store.get_decision_events("request-1")) == 1


def test_approval_reports_candidate_change_between_read_and_write(tmp_path):
    class ChangingStore(SQLiteStore):
        def get_candidates(self, request_id):
            snapshot = super().get_candidates(request_id)
            self.save_candidates(request_id, [_candidate("org/one"), _candidate("org/three")])
            return snapshot

    changing_store = ChangingStore(tmp_path / "changing.sqlite")
    changing_store.init()
    changing_store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])

    with pytest.raises(CandidateSetChangedError, match="candidate set changed"):
        ApprovalService(changing_store).approve_decision("request-1", ["org/one"])

    assert changing_store.get_decision("request-1") is None
    assert changing_store.get_decision_events("request-1") == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("repository", "updated description"),
        ("total", 49),
        ("dimension_scores", {"fit": 49}),
        ("evidence", ["updated evidence"]),
        ("risks", ["new risk"]),
        ("status", "rejected"),
    ],
)
def test_approval_rejects_changed_candidate_content_between_read_and_write(tmp_path, field, value):
    class ChangingStore(SQLiteStore):
        def get_candidates(self, request_id):
            snapshot = super().get_candidates(request_id)
            if field == "repository":
                updated = snapshot[0].model_copy(update={
                    "repository": snapshot[0].repository.model_copy(update={"description": value})
                })
            else:
                updated = snapshot[0].model_copy(update={field: value})
            self.save_candidates(request_id, [updated, snapshot[1]])
            return snapshot

    changing_store = ChangingStore(tmp_path / "changing-content.sqlite")
    changing_store.init()
    changing_store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])

    with pytest.raises(CandidateSetChangedError, match="candidate set changed"):
        ApprovalService(changing_store).approve_decision("request-1", ["org/one"])

    assert changing_store.get_decision("request-1") is None
    assert changing_store.get_decision_events("request-1") == []


def test_approval_rejects_candidate_reordering_between_read_and_write(tmp_path):
    class ReorderingStore(SQLiteStore):
        def get_candidates(self, request_id):
            snapshot = super().get_candidates(request_id)
            self.save_candidates(request_id, list(reversed(snapshot)))
            return snapshot

    changing_store = ReorderingStore(tmp_path / "reordered.sqlite")
    changing_store.init()
    changing_store.save_candidates("request-1", [_candidate("org/one"), _candidate("org/two")])

    with pytest.raises(CandidateSetChangedError, match="candidate set changed"):
        ApprovalService(changing_store).approve_decision("request-1", ["org/one"])

    assert changing_store.get_decision("request-1") is None
    assert changing_store.get_decision_events("request-1") == []


@pytest.mark.parametrize(
    ("action", "expected"),
    [
        ("inspect files", "read"),
        ("edit workspace file", "workspace_write"),
        ("run tests", "command"),
        ("build project", "command"),
        ("GitHub research", "network"),
        ("pip install dependencies", "network"),
        ("git clone repository", "network"),
        ("delete files", "external"),
        ("git push", "external"),
        ("deploy app", "external"),
        ("send message", "external"),
        ("external transfer", "external"),
        ("system-wide change", "external"),
        ("read file and write workspace file", "workspace_write"),
        ("edit file and run tests", "command"),
        ("run curl", "network"),
        ("read file and curl", "network"),
        ("run tests and deploy app", "external"),
        ("inspect files and restart service", "external"),
        ("read file and frobnicate service", "external"),
        ("run tests and frobnicate service", "external"),
        ("read file and restart GitHub service", "external"),
    ],
)
def test_permission_mapping(action, expected, store):
    assert ApprovalService(store).requirement_for(action) == expected


def test_unknown_action_fails_closed(store):
    assert ApprovalService(store).requirement_for("do something unusual") == "external"
