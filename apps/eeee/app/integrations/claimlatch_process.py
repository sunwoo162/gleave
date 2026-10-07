from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ClaimLatchProcessResult:
    url: str | None
    started: bool
    reason: str | None = None


class ClaimLatchProcessManager:
    """Own the bundled ClaimLatch official plugin process for EEEE."""

    def __init__(
        self,
        *,
        repo_root: str | Path,
        port: int = 4318,
        llm_model: str | None = None,
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
        tavily_api_key: str | None = None,
    ) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.port = port
        self.llm_model = llm_model
        self.llm_api_key = llm_api_key
        self.llm_base_url = llm_base_url
        self.tavily_api_key = tavily_api_key
        self._process: subprocess.Popen[bytes] | None = None

    def start(self) -> ClaimLatchProcessResult:
        if not self.llm_model or not self.tavily_api_key:
            return ClaimLatchProcessResult(
                url=None,
                started=False,
                reason="ClaimLatch provider credentials are not configured",
            )
        if self._process is not None and self._process.poll() is None:
            return ClaimLatchProcessResult(url=self.url, started=True, reason="already running")

        adapter_root = self.repo_root / "integrations" / "claimlatch-adapter"
        npm = "npm.cmd" if os.name == "nt" else "npm"
        environment = os.environ.copy()
        environment.update(
            CLAIMLATCH_LLM_MODEL=self.llm_model,
            TAVILY_API_KEY=self.tavily_api_key,
        )
        if self.llm_api_key:
            environment["CLAIMLATCH_LLM_API_KEY"] = self.llm_api_key
        if self.llm_base_url:
            environment["CLAIMLATCH_LLM_BASE_URL"] = self.llm_base_url
        self._process = subprocess.Popen(
            [npm, "run", "start", "--", "--port", str(self.port)],
            cwd=adapter_root,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return ClaimLatchProcessResult(url=self.url, started=True)

    def stop(self) -> None:
        process = self._process
        self._process = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"
