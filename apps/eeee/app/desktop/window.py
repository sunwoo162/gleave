"""PySide6 desktop pet window."""

from pathlib import Path

from app.desktop.client import PetApiClient
from app.desktop.presentation import PetPresentation
from app.desktop.session import DesktopSession
from app.desktop.worker import QtTaskRunner


class PetWindow:
    """Build the GUI lazily so importing the desktop package stays display-free."""

    def __new__(cls, client: PetApiClient, *, initial_error: str | None = None):
        try:
            from PySide6.QtCore import Qt, QTimer
            from PySide6.QtGui import QFont
            from PySide6.QtWidgets import (
                QAction,
                QComboBox,
                QHBoxLayout,
                QLabel,
                QLineEdit,
                QMenu,
                QPushButton,
                QApplication,
                QStyle,
                QSystemTrayIcon,
                QVBoxLayout,
                QWidget,
            )
        except ImportError as exc:
            raise RuntimeError(
                'PySide6 is required for the desktop shell. Install with `pip install -e ".[desktop]"`.'
            ) from exc

        class _Window(QWidget):
            def __init__(self):
                super().__init__()
                self.client = client
                self.session = DesktopSession(client)
                self.current_state: dict[str, object] = {}
                self.desktop_snapshot: dict[str, object] = {}
                self._drag_offset = None
                self._busy = False
                self._closing = False
                self._quit_requested = False
                self._tray = None
                self._task_runner = QtTaskRunner(parent=self)
                self.setWindowTitle("EEEE • Gleave")
                self.setWindowFlags(
                    Qt.WindowType.FramelessWindowHint
                    | Qt.WindowType.WindowStaysOnTopHint
                    | Qt.WindowType.Tool
                )
                self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
                self.setMinimumWidth(320)

                root = QVBoxLayout(self)
                root.setContentsMargins(14, 14, 14, 14)
                root.setSpacing(8)

                self.character = QLabel("🐾")
                self.character.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.character.setFont(QFont("Segoe UI Emoji", 34))
                root.addWidget(self.character)

                self.headline = QLabel("Ready")
                self.headline.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.headline.setFont(QFont("Segoe UI", 14, QFont.Weight.Bold))
                root.addWidget(self.headline)

                self.detail = QLabel("Start a development request.")
                self.detail.setWordWrap(True)
                self.detail.setAlignment(Qt.AlignmentFlag.AlignCenter)
                root.addWidget(self.detail)

                self.project_status = QLabel("Project: local default")
                self.project_status.setWordWrap(True)
                root.addWidget(self.project_status)
                self.trust_status = QLabel("ClaimLatch: checking")
                self.trust_status.setWordWrap(True)
                root.addWidget(self.trust_status)
                self.mobile_status = QLabel("Mobile bridge: available from Desktop")
                self.mobile_status.setWordWrap(True)
                root.addWidget(self.mobile_status)

                assistant_row = QHBoxLayout()
                self.assistant_input = QLineEdit()
                self.assistant_input.setPlaceholderText("Ask EEEE what to do next...")
                self.assistant_button = QPushButton("Ask EEEE")
                self.assistant_button.clicked.connect(self._route_assistant)
                assistant_row.addWidget(self.assistant_input)
                assistant_row.addWidget(self.assistant_button)
                root.addLayout(assistant_row)

                pairing_row = QHBoxLayout()
                self.pairing_button = QPushButton("Generate phone code")
                self.pairing_button.clicked.connect(self._issue_pairing_code)
                self.pairing_status = QLabel("No pairing code issued")
                self.pairing_status.setWordWrap(True)
                pairing_row.addWidget(self.pairing_button)
                pairing_row.addWidget(self.pairing_status)
                root.addLayout(pairing_row)

                self.events_view = QLabel("No recent EEEE events")
                self.events_view.setWordWrap(True)
                root.addWidget(self.events_view)

                request_row = QHBoxLayout()
                self.request_input = QLineEdit()
                self.request_input.setPlaceholderText("What should we build?")
                self.request_button = QPushButton("Start")
                self.request_button.clicked.connect(self._create_request)
                request_row.addWidget(self.request_input)
                request_row.addWidget(self.request_button)
                root.addLayout(request_row)

                self.candidate_select = QComboBox()
                self.approve_button = QPushButton("Approve selection")
                self.approve_button.clicked.connect(self._approve)
                root.addWidget(self.candidate_select)
                root.addWidget(self.approve_button)

                self.advance_button = QPushButton("Advance demo step")
                self.advance_button.clicked.connect(self._advance)
                root.addWidget(self.advance_button)

                self.retry_button = QPushButton("Retry")
                self.retry_button.clicked.connect(self._retry)
                root.addWidget(self.retry_button)

                self.workspace_button = QPushButton("Open workspace")
                self.workspace_button.clicked.connect(self._open_workspace)
                root.addWidget(self.workspace_button)

                self.hide_button = QPushButton("Hide to tray")
                self.hide_button.clicked.connect(self.hide_to_tray)
                root.addWidget(self.hide_button)

                self.setStyleSheet(
                    "QWidget { background: #fff8ef; border: 1px solid #d7b98e; "
                    "border-radius: 16px; color: #3d2b1f; }"
                    "QLineEdit, QComboBox { background: #ffffff; padding: 6px; "
                    "border: 1px solid #d7b98e; border-radius: 7px; }"
                    "QPushButton { background: #f0a35b; padding: 7px; border-radius: 7px; }"
                    "QPushButton:disabled { background: #e2d8cd; color: #8f8175; }"
                )
                self._timer = QTimer(self)
                self._timer.timeout.connect(self.refresh)
                self._setup_tray(QApplication, QStyle, QSystemTrayIcon, QAction, QMenu)
                if initial_error:
                    self._render({"state": "blocked", "message": initial_error})
                else:
                    self._timer.start(1500)
                    self.refresh()

            def mousePressEvent(self, event):
                if event.button() == Qt.MouseButton.LeftButton:
                    self._drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                super().mousePressEvent(event)

            def mouseMoveEvent(self, event):
                if self._drag_offset is not None and event.buttons() & Qt.MouseButton.LeftButton:
                    self.move(event.globalPosition().toPoint() - self._drag_offset)
                super().mouseMoveEvent(event)

            def mouseReleaseEvent(self, event):
                self._drag_offset = None
                super().mouseReleaseEvent(event)

            def closeEvent(self, event):
                if self._tray is not None and not self._quit_requested:
                    self.hide_to_tray()
                    event.ignore()
                    return
                self._closing = True
                self._timer.stop()
                self._task_runner.shutdown()
                if self._tray is not None:
                    self._tray.hide()
                super().closeEvent(event)

            def _setup_tray(self, QApplication, QStyle, QSystemTrayIcon, QAction, QMenu):
                if not QSystemTrayIcon.isSystemTrayAvailable():
                    return
                self._double_click_reason = QSystemTrayIcon.ActivationReason.DoubleClick
                icon = QApplication.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
                self._tray = QSystemTrayIcon(icon, self)
                self._tray.setToolTip("EEEE local assistant")
                menu = QMenu(self)
                show_action = QAction("Show EEEE", self)
                show_action.triggered.connect(self.restore_from_tray)
                hide_action = QAction("Hide", self)
                hide_action.triggered.connect(self.hide_to_tray)
                quit_action = QAction("Quit", self)
                quit_action.triggered.connect(self.request_quit)
                menu.addAction(show_action)
                menu.addAction(hide_action)
                menu.addSeparator()
                menu.addAction(quit_action)
                self._tray.setContextMenu(menu)
                self._tray.activated.connect(self._on_tray_activated)
                self._tray.show()

            def _on_tray_activated(self, reason):
                if self._tray is not None and reason == self._double_click_reason:
                    self.restore_from_tray()

            def hide_to_tray(self):
                self.hide()

            def restore_from_tray(self):
                self.showNormal()
                self.raise_()
                self.activateWindow()

            def request_quit(self):
                self._quit_requested = True
                self.close()

            def refresh(self):
                def operation():
                    legacy_state = self.client.get_state()
                    if not hasattr(self.client, "get_desktop_state"):
                        return legacy_state
                    snapshot = self.session.refresh()
                    project_state = snapshot.get("projectState")
                    if isinstance(project_state, dict):
                        return {**snapshot, **project_state}
                    return {**snapshot, **legacy_state}

                self._submit(operation, "Connecting to the local EEEE coordinator...")

            def _update_controls(self):
                view = PetPresentation.from_view_model(self.current_state)
                self.request_input.setEnabled(not self._busy)
                self.request_button.setEnabled(not self._busy)
                self.assistant_input.setEnabled(not self._busy)
                self.assistant_button.setEnabled(not self._busy)
                self.candidate_select.setEnabled(not self._busy)
                self.approve_button.setEnabled(
                    not self._busy and view.show_approval and self.candidate_select.count() > 0
                )
                self.advance_button.setEnabled(
                    not self._busy and view.state in {"researching", "working", "verifying"}
                )
                self.retry_button.setEnabled(
                    not self._busy and view.state in {"blocked", "failed"}
                )
                self.workspace_button.setEnabled(
                    not self._busy and isinstance(self.current_state.get("workspace"), str)
                )

            def _submit(self, operation, busy_message: str, on_success=None):
                if self._busy or self._closing:
                    return
                self._busy = True
                self.detail.setText(busy_message)
                self._update_controls()

                def success(payload):
                    if self._closing:
                        return
                    self._busy = False
                    if on_success is None:
                        self._render(payload)
                    else:
                        on_success(payload)

                def failure(error):
                    if self._closing:
                        return
                    self._busy = False
                    failed_payload = dict(self.current_state)
                    failed_payload.update({"state": "blocked", "message": str(error)})
                    self._render(failed_payload)

                try:
                    self._task_runner.submit(operation, success, failure)
                except RuntimeError as exc:
                    failure(exc)

            def _render(self, payload: dict[str, object]):
                self.desktop_snapshot = payload if "claimLatch" in payload else self.desktop_snapshot
                project_state = payload.get("projectState")
                view_payload = (
                    {**payload, **project_state}
                    if isinstance(project_state, dict)
                    else payload
                )
                if not isinstance(view_payload.get("state"), str):
                    assistant_route = payload.get("assistantRoute")
                    if isinstance(assistant_route, dict):
                        view_payload = {
                            **view_payload,
                            "state": "idle",
                            "message": assistant_route.get(
                                "message", "EEEE completed the request."
                            ),
                        }
                self.current_state = view_payload
                view = PetPresentation.from_view_model(view_payload)
                self.character.setText({
                    "sleepy": "😴",
                    "curious": "🔎",
                    "thinking": "🤔",
                    "focused": "🛠️",
                    "checking": "🧪",
                    "happy": "🎉",
                    "alert": "⚠️",
                    "worried": "😟",
                    "confused": "❔",
                }[view.expression])
                self.headline.setText(view.headline)
                self.detail.setText(view.detail)
                self._render_desktop_status(payload)
                candidates = payload.get("candidates", [])
                self.candidate_select.clear()
                for candidate in candidates if isinstance(candidates, list) else []:
                    if isinstance(candidate, dict):
                        repository = candidate.get("repository", {})
                        if isinstance(repository, dict) and isinstance(repository.get("full_name"), str):
                            self.candidate_select.addItem(repository["full_name"])
                self._update_controls()

            def _render_desktop_status(self, payload: dict[str, object]) -> None:
                project_id = payload.get("projectId")
                self.project_status.setText(
                    f"Project: {project_id}" if isinstance(project_id, str) else "Project: none selected"
                )
                claim_latch = payload.get("claimLatch")
                if isinstance(claim_latch, dict):
                    status = claim_latch.get("status", "unknown")
                    profile = claim_latch.get("profileVersion", "unknown")
                    self.trust_status.setText(f"ClaimLatch: {status} • {profile}")
                mobile = payload.get("mobileBridge")
                if isinstance(mobile, dict):
                    paired = mobile.get("pairedDevices", 0)
                    self.mobile_status.setText(f"Mobile bridge: {paired} paired device(s)")
                events = payload.get("events")
                if isinstance(events, list) and events:
                    labels = [
                        str(event.get("kind", "event"))
                        for event in events[-4:]
                        if isinstance(event, dict)
                    ]
                    self.events_view.setText("Recent: " + " • ".join(labels))
                elif "claimLatch" in payload:
                    self.events_view.setText("Recent: no EEEE lifecycle events")

            def _route_assistant(self):
                text = self.assistant_input.text().strip()
                if not text:
                    return

                def on_success(payload):
                    self.assistant_input.clear()
                    self._render(payload)

                self._submit(
                    lambda: self.session.route(text),
                    "EEEE is selecting the best capability...",
                    on_success=on_success,
                )

            def _issue_pairing_code(self):
                def on_success(payload):
                    code = payload.get("code")
                    expires = payload.get("expiresAt")
                    if isinstance(code, str):
                        suffix = f" (expires {expires})" if isinstance(expires, str) else ""
                        self.pairing_status.setText(f"Phone code: {code}{suffix}")

                self._submit(
                    self.session.issue_pairing_code,
                    "Issuing a short-lived phone pairing code...",
                    on_success=on_success,
                )

            def _create_request(self):
                text = self.request_input.text().strip()
                if not text:
                    return

                def operation():
                    payload = self.client.create_request(text)
                    task_id = payload.get("task_id")
                    if payload.get("state") == "researching" and isinstance(task_id, str):
                        return self.client.run(task_id)
                    return payload

                def on_success(payload):
                    self.request_input.clear()
                    self._render(payload)

                self._submit(operation, "Starting research...", on_success=on_success)

            def _approve(self):
                request_id = self.current_state.get("request_id")
                task_id = self.current_state.get("task_id")
                selected = self.candidate_select.currentText()
                if isinstance(request_id, str) and selected:
                    def operation():
                        payload = self.client.approve(request_id, [selected])
                        if payload.get("state") == "working" and isinstance(task_id, str):
                            return self.client.run(task_id)
                        return payload

                    self._submit(operation, "Applying approval...")

            def _advance(self):
                task_id = self.current_state.get("task_id")
                if isinstance(task_id, str):
                    self._submit(
                        lambda: self.client.advance(task_id),
                        "Advancing the pet task...",
                    )

            def _retry(self):
                task_id = self.current_state.get("task_id")
                if isinstance(task_id, str):
                    self._submit(lambda: self.client.retry(task_id), "Retrying the pet task...")

            def _open_workspace(self):
                workspace = self.current_state.get("workspace")
                if isinstance(workspace, str):
                    path = Path(workspace)
                    if path.exists():
                        import os
                        os.startfile(path)

        return _Window()


# Keep the old import working while presenting the product as Gleave Desktop.
DesktopWindow = PetWindow
