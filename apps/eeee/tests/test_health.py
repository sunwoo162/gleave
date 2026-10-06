import pytest

from app.config import Settings
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_execution_settings_require_supported_mode_and_positive_limits():
    with pytest.raises(ValueError):
        Settings(execution_mode="unknown")
    with pytest.raises(ValueError):
        Settings(command_timeout_seconds=0)
    with pytest.raises(ValueError):
        Settings(max_command_output_chars=0)
