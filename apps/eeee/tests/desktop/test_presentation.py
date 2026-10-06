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
