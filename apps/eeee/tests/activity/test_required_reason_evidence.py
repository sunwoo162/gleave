from datetime import datetime, timezone

import pytest

from app.activity.models import ActivityEvent
from app.activity.store import ActivityLedger


def test_completed_work_requires_reason_and_evidence() -> None:
    event = ActivityEvent(event_type="commit.created", project_id="p", project_revision="1",
                          run_id="r", node_id="frontend", actor_type="agent", actor_id="a",
                          summary="Commit", reason="", alternatives=[], selected_because="",
                          inputs=[], outputs=[], evidence_refs=[], status="completed",
                          occurred_at=datetime.now(timezone.utc))
    with pytest.raises(ValueError, match="reason"):
        ActivityLedger.require_explanation(event)
