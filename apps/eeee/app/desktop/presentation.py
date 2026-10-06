from dataclasses import dataclass


@dataclass(frozen=True)
class PetPresentation:
    state: str
    expression: str
    headline: str
    detail: str
    show_approval: bool
    blocked: bool

    @classmethod
    def from_view_model(cls, payload: dict[str, object]) -> "PetPresentation":
        state = payload.get("state")
        message = payload.get("message")
        detail = message if isinstance(message, str) and message else "The project state is unavailable."
        expressions = {
            "idle": ("sleepy", "Ready"),
            "researching": ("curious", "Researching"),
            "awaiting_approval": ("thinking", "Approval needed"),
            "working": ("focused", "Working"),
            "verifying": ("checking", "Verifying"),
            "completed": ("happy", "Completed"),
            "blocked": ("alert", "Blocked"),
            "failed": ("worried", "Failed"),
        }
        if not isinstance(state, str) or state not in expressions:
            return cls(
                state="blocked",
                expression="confused",
                headline="Blocked",
                detail=detail,
                show_approval=False,
                blocked=True,
            )
        expression, headline = expressions[state]
        return cls(
            state=state,
            expression=expression,
            headline=headline,
            detail=detail,
            show_approval=state == "awaiting_approval",
            blocked=False,
        )
