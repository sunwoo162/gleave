from __future__ import annotations

import os
import socket
import subprocess
import time
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
        if self._process is not None and self._process.poll() is None:
            return ClaimLatchProcessResult(url=self.url, started=True, reason="already running")
        try:
            with socket.create_connection(("127.0.0.1", self.port), timeout=0.1):
                # Another EEEE instance already owns the local adapter. Reuse
                # it instead of racing a second Node process onto the port.
                return ClaimLatchProcessResult(url=self.url, started=True, reason="already available")
        except OSError:
            pass

        adapter_root = self.repo_root / "integrations" / "claimlatch-adapter"
        npm = "npm.cmd" if os.name == "nt" else "npm"
        environment = os.environ.copy()
        environment.update(
            # The adapter has a deterministic local verifier fallback. External
            # provider credentials improve claim verification but are not needed
            # to verify local project evidence and release boundaries.
            CLAIMLATCH_LOCAL_MODE="0" if self.llm_model and self.tavily_api_key else "1",
        )
        if self.llm_model:
            environment["CLAIMLATCH_LLM_MODEL"] = self.llm_model
        if self.tavily_api_key:
            environment["TAVILY_API_KEY"] = self.tavily_api_key
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
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                return ClaimLatchProcessResult(
                    url=None,
                    started=False,
                    reason="ClaimLatch adapter exited during startup",
                )
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.1):
                    return ClaimLatchProcessResult(url=self.url, started=True)
            except OSError:
                time.sleep(0.05)
        return ClaimLatchProcessResult(
            url=None,
            started=False,
            reason="ClaimLatch adapter did not become ready",
        )

    def stop(self) -> None:
        process = self._process
        self._process = None
        if process is None:
            return
        if os.name == "nt" and process.poll() is None:
            # npm.cmd is only a wrapper; terminating it alone leaves the Node
            # adapter child listening on the fixed port between app restarts.
            pid = int(process.pid)
            os.system(f"taskkill /PID {pid} /T /F >NUL 2>&1")
            self._wait_until_unavailable()
        if process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)

    def _wait_until_unavailable(self, timeout: float = 2.0) -> None:
        """Wait for the child listener to release the fixed local port."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.05):
                    time.sleep(0.05)
            except OSError:
                return

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"
