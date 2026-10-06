"""Embedded local API runtime for the desktop pet."""

from __future__ import annotations

import threading
import time

import uvicorn

from app.config import Settings
from app.main import create_app


class ApiStartupError(RuntimeError):
    """Raised when the embedded API cannot become ready."""


class EmbeddedApiRuntime:
    """Run the local FastAPI coordinator in a daemon thread."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        host: str = "127.0.0.1",
        port: int = 0,
        startup_timeout: float = 5.0,
    ) -> None:
        self.settings = settings or Settings()
        self.host = host
        self.port = port
        self.startup_timeout = startup_timeout
        self._server: uvicorn.Server | None = None
        self._thread: threading.Thread | None = None
        self._error: BaseException | None = None

    @property
    def is_running(self) -> bool:
        return bool(
            self._server
            and self._thread
            and self._thread.is_alive()
            and self._server.started
            and not self._server.should_exit
        )

    def start(self) -> str:
        if self.is_running:
            raise RuntimeError("Embedded API is already running")

        self._error = None
        self._server = uvicorn.Server(
            uvicorn.Config(
                create_app(self.settings),
                host=self.host,
                port=self.port,
                log_level="critical",
                access_log=False,
            )
        )
        self._thread = threading.Thread(
            target=self._run_server,
            name="desktop-pet-api",
            daemon=True,
        )
        self._thread.start()

        deadline = time.monotonic() + self.startup_timeout
        while time.monotonic() < deadline:
            if self._server.started:
                actual_port = self._server.servers[0].sockets[0].getsockname()[1]
                return f"http://{self.host}:{actual_port}"
            if not self._thread.is_alive():
                break
            time.sleep(0.01)

        detail = str(self._error) if self._error else "startup timed out"
        self.stop()
        raise ApiStartupError(f"Embedded API failed to start: {detail}")

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=self.startup_timeout)

    def _run_server(self) -> None:
        assert self._server is not None
        try:
            self._server.run()
        except BaseException as exc:  # pragma: no cover - depends on server failure
            self._error = exc
