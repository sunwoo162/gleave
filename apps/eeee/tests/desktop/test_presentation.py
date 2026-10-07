import pytest

from app.desktop.presentation import PetPresentation


@pytest.mark.parametrize(
    ("state", "expression", "show_approval"),
    [
        ("idle", "sleepy", False),
        ("researching", "curious", False),
        ("awaiting_approval", "thinking", True),
        ("working", "focused", False),
        ("verifying", "checking", False),
        ("completed", "happy", False),
        ("blocked", "alert", False),
        ("failed", "worried", False),
    ],
)
def test_known_state_maps_to_pet_presentation(state, expression, show_approval):
    presentation = PetPresentation.from_view_model(
        {"state": state, "message": "State message", "required_action": "approve_selection"}
    )

    assert presentation.state == state
    assert presentation.expression == expression
    assert presentation.show_approval is show_approval
    assert presentation.detail == "State message"
    assert presentation.blocked is False


@pytest.mark.parametrize(
    "payload",
    [{"message": "Missing state"}, {"state": "future_state", "message": "Unknown state"}],
)
def test_missing_or_unknown_state_fails_closed_to_blocked(payload):
    presentation = PetPresentation.from_view_model(payload)

    assert presentation.state == "blocked"
    assert presentation.expression == "confused"
    assert presentation.show_approval is False
    assert presentation.blocked is True


def test_completed_web_project_surfaces_runtime_and_quality_status():
    presentation = PetPresentation.from_view_model(
        {
            "state": "completed",
            "message": "웹앱 생성 완료",
            "qualityStatus": "PASS",
            "projectProfile": {
                "runtimeProfile": "web_app",
                "connectors": [
                    {"connectorId": "google_oauth", "state": "awaiting_configuration"},
                    {"connectorId": "github", "state": "ready"},
                ],
            },
        }
    )

    assert presentation.runtime_profile == "web_app"
    assert presentation.quality_status == "PASS"
    assert presentation.deployment_readiness == "awaiting_configuration"
    assert presentation.missing_connectors == ("google_oauth",)
