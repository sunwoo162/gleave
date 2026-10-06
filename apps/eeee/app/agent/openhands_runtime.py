"""Lazy OpenHands SDK adapter with structured, redacted run results."""

from collections.abc import Callable, Iterable, Mapping
from importlib import import_module
import re
from types import SimpleNamespace
from typing import Any

from app.agent.protocol import AgentRequest, AgentResult


_SECRET_KEY = re.compile(r"(api[_-]?key|token|secret|password)\s*[:=]\s*([^\s,;]+)", re.I)
_SECRET_VALUE = re.compile(r"\b(?:sk|ghp|github_pat)[-_][A-Za-z0-9_-]+\b")


class OpenHandsRuntime:
    """Run OpenHands only when the optional SDK and model configuration exist."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        sdk_loader: Callable[[], Any] | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self._sdk_loader = sdk_loader or self._load_sdk

    def run(self, request: AgentRequest) -> AgentResult:
        if not self.api_key:
            return self._unavailable("LLM_API_KEY is not configured")
        if not self.model:
            return self._unavailable("LLM_MODEL is not configured")

        try:
            sdk = self._sdk_loader()
        except (ImportError, ModuleNotFoundError) as exc:
            return self._unavailable(f"OpenHands SDK is unavailable: {exc}")

        conversation = None
        try:
            llm_kwargs: dict[str, object] = {
                "model": self.model,
                "api_key": self.api_key,
            }
            if self.base_url:
                llm_kwargs["base_url"] = self.base_url
            llm = sdk.LLM(**llm_kwargs)
            tools = [
                sdk.Tool(name=sdk.TerminalTool.name),
                sdk.Tool(name=sdk.FileEditorTool.name),
                sdk.Tool(name=sdk.TaskTrackerTool.name),
            ]
            agent = sdk.Agent(llm=llm, tools=tools)
            conversation = sdk.Conversation(
                agent=agent,
                workspace=str(request.workspace.resolve()),
            )
            conversation.send_message(self._build_prompt(request))
            run_output = conversation.run()
            events = self._collect_events(conversation, run_output)
            return self._completed(events)
        except Exception as exc:  # SDK failures become reportable run failures.
            events = self._collect_events(conversation, None) if conversation else []
            return AgentResult(
                status="failed",
                summary="OpenHands runtime failed",
                events=events,
                changed_files=self._changed_files(events),
                test_commands=self._test_commands(events),
                error=self._redact_text(str(exc)),
            )

    @staticmethod
    def _load_sdk() -> Any:
        sdk = import_module("openhands.sdk")
        file_editor = import_module("openhands.tools.file_editor")
        task_tracker = import_module("openhands.tools.task_tracker")
        terminal = import_module("openhands.tools.terminal")
        return SimpleNamespace(
            LLM=sdk.LLM,
            Agent=sdk.Agent,
            Conversation=sdk.Conversation,
            Tool=sdk.Tool,
            FileEditorTool=file_editor.FileEditorTool,
            TaskTrackerTool=task_tracker.TaskTrackerTool,
            TerminalTool=terminal.TerminalTool,
        )

    @staticmethod
    def _build_prompt(request: AgentRequest) -> str:
        actions = ", ".join(request.allowed_actions) or "none"
        return (
            f"Run ID: {request.run_id}\n"
            f"Approved workspace: {request.workspace.resolve()}\n"
            f"Allowed actions: {actions}\n"
            "Work only inside the approved workspace. Do not install packages, send "
            "external data, delete files, or change system-wide settings without an "
            "explicit approved action. Report changed files and verification commands.\n"
            f"Task: {request.prompt}"
        )

    def _completed(self, raw_events: Iterable[Any]) -> AgentResult:
        events = [self._serialize_event(event) for event in raw_events]
        return AgentResult(
            status="completed",
            summary=self._summary(events),
            events=events,
            changed_files=self._changed_files(events),
            test_commands=self._test_commands(events),
            error=None,
        )

    @staticmethod
    def _collect_events(conversation: Any, run_output: Any) -> list[Any]:
        if run_output is not None and not isinstance(run_output, (str, bytes, Mapping)):
            try:
                return list(run_output)
            except TypeError:
                pass
        for candidate in (
            getattr(conversation, "events", None),
            getattr(getattr(conversation, "state", None), "events", None),
        ):
            if candidate is not None:
                try:
                    return list(candidate)
                except TypeError:
                    continue
        return []

    @classmethod
    def _serialize_event(cls, event: Any) -> dict[str, object]:
        if isinstance(event, Mapping):
            payload = dict(event)
        elif hasattr(event, "model_dump"):
            payload = event.model_dump(mode="json")
        elif hasattr(event, "to_dict"):
            payload = event.to_dict()
        else:
            payload = {"type": type(event).__name__, "message": str(event)}
        return cls._redact_value(payload)

    @classmethod
    def _redact_value(cls, value: Any, key: str | None = None) -> Any:
        if key and re.search(r"api[_-]?key|token|secret|password", key, re.I):
            return "[REDACTED]"
        if isinstance(value, Mapping):
            return {
                str(item_key): cls._redact_value(item_value, str(item_key))
                for item_key, item_value in value.items()
            }
        if isinstance(value, list):
            return [cls._redact_value(item) for item in value]
        if isinstance(value, tuple):
            return [cls._redact_value(item) for item in value]
        if isinstance(value, str):
            return cls._redact_text(value)
        return value

    @staticmethod
    def _redact_text(value: str) -> str:
        value = _SECRET_KEY.sub(r"\1=[REDACTED]", value)
        return _SECRET_VALUE.sub("[REDACTED]", value)

    @staticmethod
    def _summary(events: list[dict[str, object]]) -> str:
        for event in reversed(events):
            for key in ("summary", "content", "message"):
                value = event.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return "OpenHands task completed"

    @staticmethod
    def _changed_files(events: list[dict[str, object]]) -> list[str]:
        changed: list[str] = []
        for event in events:
            for key in ("changed_files", "files_changed"):
                values = event.get(key)
                if isinstance(values, list):
                    for value in values:
                        if isinstance(value, str) and value not in changed:
                            changed.append(value)
            path = event.get("path")
            action = str(event.get("action", "")).lower()
            event_type = str(event.get("type", "")).lower()
            if isinstance(path, str) and (
                action in {"write", "edit", "create", "modify", "file_edit"}
                or "file" in event_type
            ) and path not in changed:
                changed.append(path)
        return changed

    @staticmethod
    def _test_commands(events: list[dict[str, object]]) -> list[str]:
        commands: list[str] = []
        for event in events:
            values = event.get("test_commands")
            candidates = values if isinstance(values, list) else [event.get("command")]
            for command in candidates:
                if not isinstance(command, str):
                    continue
                lowered = command.lower()
                if any(marker in lowered for marker in ("pytest", "compileall", " test", "test ")):
                    if command not in commands:
                        commands.append(command)
        return commands

    @staticmethod
    def _unavailable(error: str) -> AgentResult:
        return AgentResult(
            status="unavailable",
            summary="OpenHands runtime unavailable",
            events=[],
            changed_files=[],
            test_commands=[],
            error=error,
        )
