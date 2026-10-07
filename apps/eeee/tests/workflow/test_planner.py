import pytest

from app.domain.models import CandidateScore, RepositorySnapshot
from app.workflow.planner import build_work_plan, parse_request


@pytest.mark.parametrize("text", ["", "   \n  "])
def test_parse_request_rejects_blank_input(text):
    with pytest.raises(ValueError):
        parse_request(text)


@pytest.mark.parametrize(
    ("text", "target_type"),
    [
        ("Build a web app for document search", "web_app"),
        ("Create a developer CLI tool for releases", "developer_tool"),
        ("Automate invoice processing", "automation"),
        ("Build a local AI app for notes", "local_ai_app"),
        ("Build a garden planner", "unknown"),
    ],
)
def test_parse_request_classifies_known_targets_without_inventing_constraints(text, target_type):
    brief = parse_request(text)

    assert brief.raw_text == text
    assert brief.goal
    assert brief.target_type == target_type
    assert any("build" in criterion.lower() for criterion in brief.acceptance_criteria)
    assert any("test" in criterion.lower() for criterion in brief.acceptance_criteria)
    if target_type == "unknown":
        assert text in brief.constraints
        assert brief.needs_confirmation
        assert brief.uncertainties


@pytest.mark.parametrize("text", [
    "Todo 앱 만들어줘",
    "할 일 앱 제작해줘",
    "체크리스트 앱 구현해줘",
])
def test_equivalent_todo_requests_have_one_canonical_intent(text):
    brief = parse_request(text)

    assert brief.target_type == "todo_app"
    assert brief.canonical_intent == "project.create.todo_app"


def test_login_todo_web_request_selects_web_runtime_profile():
    brief = parse_request("로그인 기능이 있는 Todo 웹앱 만들어줘")

    assert brief.target_type == "web_app"
    assert brief.runtime_profile == "web_app"
    assert brief.canonical_intent == "project.create.web_app"


def test_plain_todo_web_request_selects_web_runtime_profile():
    brief = parse_request("Todo 웹 만들어줘")

    assert brief.target_type == "web_app"
    assert brief.runtime_profile == "web_app"


def test_local_todo_request_keeps_static_runtime_profile():
    brief = parse_request("Todo 앱 만들어줘")

    assert brief.target_type == "todo_app"
    assert brief.runtime_profile == "static_app"


def test_parse_request_keeps_explicit_constraints_and_marks_missing_platform_uncertain():
    text = "  Build a web app for notes using Python; must work offline  "
    brief = parse_request(text)

    assert brief.raw_text == text
    assert brief.goal == "Build a web app for notes"
    assert brief.constraints == ["using Python", "must work offline"]
    assert brief.needs_confirmation
    assert any("platform" in item.lower() for item in brief.uncertainties)
    assert not any("windows" in item.lower() for item in brief.constraints)


def test_parse_request_marks_vague_goal_for_confirmation():
    brief = parse_request("Build something")

    assert brief.needs_confirmation
    assert any("goal" in item.lower() for item in brief.uncertainties)


def test_parse_request_marks_conflicting_target_patterns_for_confirmation():
    text = "Build a web app and developer CLI tool for releases on Windows"
    brief = parse_request(text)

    assert brief.raw_text == text
    assert brief.target_type == "unknown"
    assert brief.needs_confirmation
    assert any("target" in item.lower() and "ambig" in item.lower() for item in brief.uncertainties)


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


def test_build_work_plan_orders_research_selection_execution_and_verification():
    brief = parse_request("Build a web app for notes using Python")
    plan = build_work_plan(brief, [_candidate("org/one"), _candidate("org/two")])

    assert [step.id for step in plan.steps] == [
        "confirm", "research", "compare", "approve", "implement", "verify"
    ]
    assert plan.requires_selection
    assert all(step.title and step.description and step.expected_outputs for step in plan.steps)
    assert [step.id for step in plan.steps if step.requires_approval] == ["approve", "implement"]
    assert "org/one" in plan.steps[2].description
    assert "org/two" in plan.steps[2].description


def test_build_work_plan_keeps_research_open_until_two_candidates_exist():
    brief = parse_request("Build a web app for notes on Windows using Python")
    plan = build_work_plan(brief, [_candidate("org/one")])

    assert not plan.requires_selection
    assert plan.steps[0].id == "research"
    assert "at least two" in plan.steps[1].description.lower()
