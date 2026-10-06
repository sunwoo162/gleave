from app.mobile.bridge import MobileBridge, MobileBridgeError


def test_mobile_pairing_persists_only_authorized_device_state(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    bridge = MobileBridge(path)
    bridge.init()
    pairing = bridge.issue_pairing_code()

    device = bridge.pair(pairing["code"], "Pixel test")

    assert device["deviceId"].startswith("mobile-")
    assert bridge.authorize(device["accessToken"])["deviceName"] == "Pixel test"
    assert bridge.status()["pairedDevices"] == 1

    reopened = MobileBridge(path)
    reopened.init()
    assert reopened.authorize(device["accessToken"])["deviceId"] == device["deviceId"]

    reopened.revoke(device["deviceId"])
    try:
        reopened.authorize(device["accessToken"])
    except MobileBridgeError as exc:
        assert "invalid or revoked" in str(exc)
    else:  # pragma: no cover - protects the authorization boundary
        raise AssertionError("revoked mobile tokens must not authorize")


def test_events_survive_desktop_restart_and_resume_from_cursor(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    bridge = MobileBridge(path)
    bridge.init()
    first = bridge.publish("project.started", {"projectId": "project-1"})
    bridge.publish("project.completed", {"projectId": "project-1"})

    reopened = MobileBridge(path)
    reopened.init()

    resumed = reopened.events_after(first["cursor"])
    assert [event["kind"] for event in resumed["events"]] == ["project.completed"]
