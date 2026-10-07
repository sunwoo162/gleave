from dataclasses import dataclass


@dataclass(frozen=True)
class PetPresentation:
    state: str
    expression: str
    headline: str
    detail: str
    show_approval: bool
    blocked: bool
    runtime_profile: str | None = None
    quality_status: str | None = None
    deployment_readiness: str | None = None
    missing_connectors: tuple[str, ...] = ()

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
        profile = payload.get("projectProfile")
        profile = profile if isinstance(profile, dict) else {}
        runtime_profile = profile.get("runtimeProfile")
        runtime_profile = runtime_profile if isinstance(runtime_profile, str) else None
        quality_status = payload.get("qualityStatus")
        quality_status = quality_status if isinstance(quality_status, str) else None
        connectors = profile.get("connectors", [])
        missing_connectors = tuple(
            str(connector.get("connectorId"))
            for connector in connectors
            if isinstance(connector, dict)
            and connector.get("state") == "awaiting_configuration"
            and isinstance(connector.get("connectorId"), str)
        ) if isinstance(connectors, list) else ()
        deployment_readiness = profile.get("provisioningStatus")
        deployment_readiness = (
            deployment_readiness if isinstance(deployment_readiness, str) else None
        )
        if deployment_readiness is None and missing_connectors:
            deployment_readiness = "awaiting_configuration"
        return cls(
            state=state,
            expression=expression,
            headline=headline,
            detail=detail,
            show_approval=state == "awaiting_approval",
            blocked=False,
            runtime_profile=runtime_profile,
            quality_status=quality_status,
            deployment_readiness=deployment_readiness,
            missing_connectors=missing_connectors,
        )
