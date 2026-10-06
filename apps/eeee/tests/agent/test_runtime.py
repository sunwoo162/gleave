from pathlib import Path
from types import SimpleNamespace

from app.agent.openhands_runtime import OpenHandsRuntime
from app.agent.protocol import AgentRequest


class FakeLLM:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.instances.append(self)


class FakeTool:
    def __init__(self, name):
        self.name = name


class FakeAgent:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.instances.append(self)


class FakeConversation:
    instances = []
    events = []
    error = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.messages = []
        self.instances.append(self)

    def send_message(self, prompt):
        self.messages.append(prompt)

    def run(self):
        if self.error is not None:
            raise self.error
        return list(self.events)


def sdk(conversation=FakeConversation):
    return SimpleNamespace(
        LLM=FakeLLM,
        Agent=FakeAgent,
        Conversation=conversation,
        Tool=FakeTool,
        FileEditorTool=SimpleNamespace(name="file_editor"),
        TaskTrackerTool=SimpleNamespace(name="task_tracker"),
        TerminalTool=SimpleNamespace(name="terminal"),
    )


def request(tmp_path: Path) -> AgentRequest:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    return AgentRequest(
        prompt="Implement the approved web app and run the required checks.",
        workspace=workspace,
        allowed_actions=["workspace_write", "command"],
        run_id="run-123",
    )


def test_openhands_runtime_converts_successful_event_stream(tmp_path):
    FakeConversation.events = [
        {"type": "file_edit", "action": "write", "path": "src/app.py"},
        {"type": "command", "command": "pytest -q"},
        {"type": "message", "content": "Implemented and verified."},
    ]
    FakeConversation.error = None

    result = OpenHandsRuntime(
        api_key="sk-test",
        model="gpt-test",
        base_url="https://llm.example.test/v1",
        sdk_loader=lambda: sdk(),
    ).run(request(tmp_path))

    assert result.status == "completed"
    assert result.summary == "Implemented and verified."
    assert result.changed_files == ["src/app.py"]
    assert result.test_commands == ["pytest -q"]
    assert result.error is None
    assert FakeLLM.instances[-1].kwargs == {
        "model": "gpt-test",
        "api_key": "sk-test",
        "base_url": "https://llm.example.test/v1",
    }
    conversation = FakeConversation.instances[-1]
    assert conversation.kwargs["workspace"] == str(tmp_path / "workspace")
    assert "run-123" in conversation.messages[0]
    assert "workspace_write, command" in conversation.messages[0]


def test_openhands_runtime_redacts_secret_patterns_in_events_and_errors(tmp_path):
    FakeConversation.events = [
        {"type": "message", "content": "token=sk-live-secret"},
    ]
    FakeConversation.error = None

    result = OpenHandsRuntime(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=lambda: sdk(),
    ).run(request(tmp_path))

    assert "sk-live-secret" not in str(result.events)
    assert "REDACTED" in str(result.events)


def test_openhands_runtime_reports_missing_configuration_without_loading_sdk(tmp_path):
    loaded = False

    def sdk_loader():
        nonlocal loaded
        loaded = True
        return sdk()

    result = OpenHandsRuntime(api_key=None, sdk_loader=sdk_loader).run(request(tmp_path))

    assert result.status == "unavailable"
    assert result.error == "LLM_API_KEY is not configured"
    assert loaded is False


def test_openhands_runtime_reports_missing_sdk_as_unavailable(tmp_path):
    def missing_sdk():
        raise ModuleNotFoundError("No module named 'openhands'")

    result = OpenHandsRuntime(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=missing_sdk,
    ).run(request(tmp_path))

    assert result.status == "unavailable"
    assert "OpenHands SDK is unavailable" in result.error


def test_openhands_runtime_preserves_runtime_exception_as_failed_result(tmp_path):
    class FailingConversation(FakeConversation):
        error = RuntimeError("request failed token=sk-live-secret")

    result = OpenHandsRuntime(
        api_key="sk-test",
        model="gpt-test",
        sdk_loader=lambda: sdk(FailingConversation),
    ).run(request(tmp_path))

    assert result.status == "failed"
    assert result.summary == "OpenHands runtime failed"
    assert result.error == "request failed token=[REDACTED]"
