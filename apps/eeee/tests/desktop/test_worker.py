import os
import threading
import time

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PySide6")

from PySide6.QtCore import QEventLoop
from PySide6.QtWidgets import QApplication

from app.desktop.worker import QtTaskRunner


def _wait_for(app: QApplication, predicate) -> None:
    deadline = time.monotonic() + 2
    while not predicate() and time.monotonic() < deadline:
        app.processEvents(QEventLoop.ProcessEventsFlag.AllEvents, 50)
        time.sleep(0.01)


def test_runner_executes_operation_off_main_thread_and_delivers_result_on_main_thread():
    app = QApplication.instance() or QApplication([])
    main_thread_id = threading.get_ident()
    operation_thread_id = None
    callback_thread_id = []
    result = []
    errors = []
    runner = QtTaskRunner()

    def operation():
        nonlocal operation_thread_id
        operation_thread_id = threading.get_ident()
        return {"state": "completed"}

    def on_success(value):
        callback_thread_id.append(threading.get_ident())
        result.append(value)

    runner.submit(operation, on_success, errors.append)
    _wait_for(app, lambda: bool(result or errors))
    runner.shutdown()

    assert not errors
    assert result == [{"state": "completed"}]
    assert operation_thread_id != main_thread_id
    assert callback_thread_id == [main_thread_id]


def test_runner_delivers_operation_error_to_main_thread():
    app = QApplication.instance() or QApplication([])
    main_thread_id = threading.get_ident()
    callback_thread_id = []
    errors = []
    runner = QtTaskRunner()

    def on_error(error):
        callback_thread_id.append(threading.get_ident())
        errors.append(error)

    runner.submit(lambda: (_ for _ in ()).throw(ValueError("boom")), lambda _: None, on_error)
    _wait_for(app, lambda: bool(errors))
    runner.shutdown()

    assert [str(error) for error in errors] == ["boom"]
    assert callback_thread_id == [main_thread_id]


def test_runner_suppresses_late_result_after_shutdown():
    app = QApplication.instance() or QApplication([])
    started = threading.Event()
    results = []
    errors = []
    runner = QtTaskRunner()

    def operation():
        started.set()
        time.sleep(0.1)
        raise ValueError("late error")

    runner.submit(operation, results.append, errors.append)
    assert started.wait(1)
    runner.shutdown()
    app.processEvents(QEventLoop.ProcessEventsFlag.AllEvents, 50)

    assert results == []
    assert errors == []
