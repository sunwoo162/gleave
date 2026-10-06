import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


FIXTURES = Path(__file__).parent / "fixtures"


def test_local_plugin_routes_cover_discover_approve_invoke_and_health(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    client = TestClient(create_app(settings))
    manifest = json.loads((FIXTURES / "echo-plugin.json").read_text(encoding="utf-8"))
    manifest["command"] = [sys.executable, str(FIXTURES / "echo_plugin.py")]
    manifest_path = tmp_path / "echo-plugin.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    discovered = client.post("/api/plugins/discover", json={"source": str(manifest_path)})
    assert discovered.status_code == 200
    registered = client.post("/api/plugins/echo/register", json=discovered.json())
    assert registered.status_code == 200
    connected = client.post("/api/plugins/echo/connect", json={"approved": True})
    assert connected.status_code == 200

    invoked = client.post(
        "/api/plugins/echo/invoke",
        json={"action": "echo", "input": {"message": "route"}},
    )
    assert invoked.status_code == 200
    assert invoked.json()["status"] == "completed"
    assert client.get("/api/plugins/echo/health").json()["status"] == "healthy"
