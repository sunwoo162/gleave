from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, run


def test_package_metadata_exposes_console_script():
    metadata = Path("pyproject.toml").read_text(encoding="utf-8")

    assert "oss-product-builder = \"app.main:run\"" in metadata


def test_run_passes_host_and_port_to_uvicorn():
    with patch("app.main.uvicorn.run") as uvicorn_run:
        run(host="0.0.0.0", port=8123)

    uvicorn_run.assert_called_once_with("app.main:create_app", factory=True, host="0.0.0.0", port=8123)


def test_create_app_health_endpoint_works_with_explicit_paths(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        workspace_root=tmp_path / "workspace",
    )

    with TestClient(create_app(settings)) as client:
        assert client.get("/health").json() == {"status": "ok"}
