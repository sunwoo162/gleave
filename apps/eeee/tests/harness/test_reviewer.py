import json
from types import SimpleNamespace

from app.domain.models import RequestBrief
from app.harness.coordinator import ReviewReport
from app.harness.reviewer import OpenHandsReviewer


class FakeLLM:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeAgent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeConversation:
    events = []
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.messages = []
        self.instances.append(self)

    def send_message(self, prompt):
        self.messages.append(prompt)

    def run(self):
        return list(self.events)


def sdk():
    return SimpleNamespace(LLM=FakeLLM, Agent=FakeAgent, Conversation=FakeConversation)


def requirements():
    return RequestBrief(
        raw_text="Build a local web app",
        goal="Build a local web app",
        target_type="web_app",
        constraints=["local only"],
        acceptance_criteria=["Tests pass"],
    )


def test_openhands_reviewer_parses_structured_pass_report():
    FakeConversation.events = [{
        "content": json.dumps({"status": "PASS", "findings": [], "required_actions": []})
    }]

    report = OpenHandsReviewer(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=sdk,
    ).review("+ return render_app()", requirements())

    assert report == ReviewReport(status="PASS", findings=[], required_actions=[])
    assert "+ return render_app()" in FakeConversation.instances[-1].messages[0]
    assert "Tests pass" in FakeConversation.instances[-1].messages[0]


def test_openhands_reviewer_returns_warn_without_configuration_or_parseable_report():
    missing = OpenHandsReviewer(api_key=None, model="gpt-test", sdk_loader=sdk)
    missing_report = missing.review("diff", requirements())

    FakeConversation.events = [{"content": "The change looks okay."}]
    unstructured = OpenHandsReviewer(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=sdk,
    ).review("diff", requirements())

    assert missing_report.status == "WARN"
    assert "LLM_API_KEY" in missing_report.required_actions[0]
    assert unstructured.status == "WARN"
    assert "structured" in unstructured.required_actions[0].lower()


def test_openhands_reviewer_reports_sdk_failure_as_warn():
    def missing_sdk():
        raise ModuleNotFoundError("No module named 'openhands'")

    report = OpenHandsReviewer(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=missing_sdk,
    ).review("diff", requirements())

    assert report.status == "WARN"
    assert "OpenHands SDK" in report.findings[0]
