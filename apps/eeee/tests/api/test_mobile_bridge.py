from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_mobile_controls_desktop_owned_assistant_and_receives_live_events(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    client = TestClient(create_app(settings))

    assert client.get("/api/mobile/state").status_code == 401

    pairing = client.post("/api/bridge/pairing/code")
    assert pairing.status_code == 200
    paired = client.post(
        "/api/mobile/pair",
        json={"pairingCode": pairing.json()["code"], "deviceName": "My phone"},
    )
    assert paired.status_code == 200
    token = paired.json()["accessToken"]
    headers = {"X-Gleave-Bridge-Token": token}

    state = client.get("/api/mobile/state", headers=headers)
    assert state.status_code == 200
    assert state.json()["transport"] == "desktop-bridge"
    assert state.json()["bridge"]["realtime"] == "sse-or-polling"

    command = client.post(
        "/api/mobile/assistant/route",
        headers=headers,
        json={"text": "내일 오후 3시에 회의 일정 등록해줘"},
    )
    assert command.status_code == 200
    assert command.json()["selection"]["capability_id"] == "personal-secretary"

    events = client.get("/api/mobile/events", headers=headers)
    assert events.status_code == 200
    kinds = [event["kind"] for event in events.json()["events"]]
    assert "assistant.route.started" in kinds
    assert kinds[-1] == "assistant.route.completed"
    assert events.json()["events"][-1]["payload"]["deviceId"] == paired.json()["deviceId"]


def test_mobile_token_survives_desktop_restart(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    first = TestClient(create_app(settings))
    pairing = first.post("/api/bridge/pairing/code").json()
    token = first.post(
        "/api/mobile/pair",
        json={"pairingCode": pairing["code"], "deviceName": "Restart test"},
    ).json()["accessToken"]

    second = TestClient(create_app(settings))
    response = second.get(
        "/api/mobile/state",
        headers={"X-Gleave-Bridge-Token": token},
    )

    assert response.status_code == 200
    assert response.json()["bridge"]["pairedDevices"] == 1
