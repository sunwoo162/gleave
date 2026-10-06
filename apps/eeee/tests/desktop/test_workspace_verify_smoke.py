import os
import time

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest

pytest.importorskip("PySide6")

from PySide6.QtCore import QEventLoop
from PySide6.QtWidgets import QApplication

from app.config import Settings
from app.desktop.__main__ import connect_desktop_api
from app.desktop.window import PetWindow


def _wait_for(app: QApplication, predicate) -> None:
    deadline = time.monotonic() + 10
    while not predicate() and time.monotonic() < deadline:
        app.processEvents(QEventLoop.ProcessEventsFlag.AllEvents, 50)
        time.sleep(0.01)


def test_desktop_embedded_workspace_verify_flow_stays_responsive(tmp_path):
    app = QApplication.instance() or QApplication([])
    settings = Settings(
        data_dir=tmp_path / "data",
        workspace_root=tmp_path / "workspaces",
        execution_mode="workspace_verify",
    )
    client, runtime = connect_desktop_api(settings=settings)
    window = None
    try:
        workspace = tmp_path / "workspaces" / "default"
        (workspace / "sample.py").write_text("answer = 42\n", encoding="utf-8")
        window = PetWindow(client)
        window.show()
        _wait_for(app, lambda: window.current_state.get("state") == "idle")

        window.request_input.setText("Build a web app")
        started = time.monotonic()
        window._create_request()
        assert time.monotonic() - started < 0.1
        _wait_for(app, lambda: window.current_state.get("state") == "awaiting_approval")
        assert window.candidate_select.count() > 0

        started = time.monotonic()
        window._approve()
        assert time.monotonic() - started < 0.1
        _wait_for(app, lambda: window.current_state.get("state") == "completed")

        assert window.current_state["report"]["status"] == "passed"
        verification_path = workspace / window.current_state["task_id"] / "verification.md"
        assert verification_path.is_file()
        assert "All deterministic checks passed" in verification_path.read_text(encoding="utf-8")
    finally:
        if window is not None:
            window.close()
        runtime.stop()
