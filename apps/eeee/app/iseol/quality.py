"""Deterministic code-quality checks for Review and QA handoffs."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.agent.protocol import AgentResult
from app.iseol.agents import AgentNode


class QualityCheck(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    status: Literal["PASS", "WARN", "BLOCK"]
    message: str = Field(min_length=1)


class QualityReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    decision: Literal["PASS", "WARN", "BLOCK"]
    checks: list[QualityCheck]


class QualityGate:
    _secret_pattern = re.compile(
        r"(?:api[_-]?key|token|secret|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]",
        re.IGNORECASE,
    )

    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace

    def evaluate(self, node: AgentNode, result: AgentResult) -> QualityReport:
        checks: list[QualityCheck] = []
        existing_files: list[tuple[Path, str]] = []
        for relative in result.changed_files:
            path = self.workspace / relative
            if not path.is_file():
                checks.append(QualityCheck(name="artifact-exists", status="WARN", message=f"Artifact not found for inspection: {relative}"))
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                checks.append(QualityCheck(name="encoding", status="BLOCK", message=f"File is not valid UTF-8: {relative}"))
                continue
            existing_files.append((path, text))
            if self._secret_pattern.search(text):
                checks.append(QualityCheck(name="secret-scan", status="BLOCK", message=f"Possible secret detected in {relative}"))

        if existing_files and not any(check.name == "encoding" and check.status == "BLOCK" for check in checks):
            checks.append(QualityCheck(name="encoding", status="PASS", message="Inspected files are valid UTF-8"))
        if not any(check.name == "secret-scan" and check.status == "BLOCK" for check in checks):
            checks.append(QualityCheck(name="secret-scan", status="PASS", message="No secret pattern detected"))

        if node.role == "frontend":
            index = self.workspace / "index.html"
            if index.is_file():
                text = index.read_text(encoding="utf-8", errors="replace").lower()
                checks.append(QualityCheck(
                    name="responsive-viewport",
                    status="PASS" if "name=\"viewport\"" in text or "name='viewport'" in text else "BLOCK",
                    message="Viewport metadata is present" if "viewport" in text else "index.html is missing viewport metadata",
                ))
            else:
                checks.append(QualityCheck(name="responsive-viewport", status="WARN", message="index.html was not available for viewport inspection"))

        decision = "BLOCK" if any(check.status == "BLOCK" for check in checks) else (
            "WARN" if any(check.status == "WARN" for check in checks) else "PASS"
        )
        return QualityReport(decision=decision, checks=checks)
