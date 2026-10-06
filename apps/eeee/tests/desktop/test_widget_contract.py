import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest

pytest.importorskip("PySide6")

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication

from app.desktop.client import PetApiClient
from app.desktop.window import PetWindow


def test_desktop_companion_is_an_interactive_always_on_top_widget():
    app = QApplication.instance() or QApplication([])
    window = PetWindow(PetApiClient("http://127.0.0.1:1"))
    try:
        assert window.windowFlags() & Qt.WindowType.WindowStaysOnTopHint
        assert hasattr(window, "hide_to_tray")
        assert hasattr(window, "restore_from_tray")
        assert hasattr(window, "request_quit")
        assert hasattr(window, "assistant_input")
        assert hasattr(window, "assistant_button")
        assert hasattr(window, "trust_status")
        assert hasattr(window, "pairing_button")
        assert hasattr(window, "events_view")

        window.show()
        window.hide_to_tray()
        assert not window.isVisible()
        window.restore_from_tray()
        assert window.isVisible()
    finally:
        window.request_quit()
        window.close()
        app.processEvents()
