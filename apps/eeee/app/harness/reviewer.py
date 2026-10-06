"""Optional fresh-context OpenHands reviewer adapter."""

from collections.abc import Callable, Mapping
import json
from importlib import import_module
import re
from typing import Any

from app.domain.models import RequestBrief


class OpenHandsReviewer:
    """Ask an isolated OpenHands conversation for a structured review report."""

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

    def review(self, diff: str, requirements: RequestBrief):
        from app.harness.coordinator import ReviewReport

        if not self.api_key:
            return ReviewReport(
                status="WARN",
                findings=["LLM_API_KEY is not configured for fresh-context review"],
                required_actions=["Set LLM_API_KEY before relying on model review"],
            )
        if not self.model:
            return ReviewReport(
                status="WARN",
                findings=["LLM_MODEL is not configured for fresh-context review"],
                required_actions=["Set LLM_MODEL before relying on model review"],
            )
        try:
            sdk = self._sdk_loader()
            llm_kwargs: dict[str, object] = {"model": self.model, "api_key": self.api_key}
            if self.base_url:
                llm_kwargs["base_url"] = self.base_url
            llm = sdk.LLM(**llm_kwargs)
            agent = sdk.Agent(llm=llm, tools=[])
            conversation = sdk.Conversation(agent=agent)
            conversation.send_message(self._build_prompt(diff, requirements))
            events = conversation.run()
            report = self._parse_report(events)
            if report is None:
                return ReviewReport(
                    status="WARN",
                    findings=["Fresh-context reviewer returned no structured report"],
                    required_actions=["Return a structured JSON report with status, findings, and required_actions"],
                )
            return ReviewReport(**report)
        except (ImportError, ModuleNotFoundError) as exc:
            return ReviewReport(
                status="WARN",
                findings=[f"OpenHands SDK unavailable: {exc}"],
                required_actions=["Install the optional OpenHands SDK or use static review"],
            )
        except Exception as exc:
            return ReviewReport(
                status="WARN",
                findings=[f"Fresh-context review failed: {self._redact(str(exc))}"],
                required_actions=["Inspect reviewer configuration and retry"],
            )

    @staticmethod
    def _load_sdk() -> Any:
        sdk = import_module("openhands.sdk")
        return sdk

    @staticmethod
    def _build_prompt(diff: str, requirements: RequestBrief) -> str:
        return (
            "You are a fresh-context code reviewer. Review only the supplied diff and requirements.\n"
            "Return JSON only with exactly: status (PASS, WARN, or BLOCKED), findings (array of strings), "
            "required_actions (array of strings). Do not modify files or execute commands.\n"
            f"Requirements: {requirements.model_dump_json()}\n"
            f"Diff:\n{diff}"
        )

    @staticmethod
    def _parse_report(events: Any) -> dict[str, object] | None:
        try:
            candidates = list(events)
        except TypeError:
            candidates = [events]
        for event in reversed(candidates):
            content = event.get("content") if isinstance(event, Mapping) else getattr(event, "content", None)
            if not isinstance(content, str):
                continue
            try:
                payload = json.loads(content)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict) or payload.get("status") not in {"PASS", "WARN", "BLOCKED"}:
                continue
            findings = payload.get("findings", [])
            required_actions = payload.get("required_actions", [])
            if not all(isinstance(item, str) for item in findings) or not all(
                isinstance(item, str) for item in required_actions
            ):
                continue
            return {
                "status": payload["status"],
                "findings": list(findings),
                "required_actions": list(required_actions),
            }
        return None

    @staticmethod
    def _redact(value: str) -> str:
        return re.sub(
            r"\b(?:sk|ghp|github_pat)[-_][A-Za-z0-9_-]+\b",
            "[REDACTED]",
            value,
        )
