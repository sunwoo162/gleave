from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TrustDecision = Literal["PASS", "WARN", "BLOCKED"]


class TrustCheck(BaseModel):
    """The durable identity and decision returned by the global trust gate."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    subject_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    project_revision: str = Field(min_length=1)
    action: str = Field(min_length=1)
    decision: TrustDecision
    report_id: str | None = None
    receipt_id: str | None = None
    reason: str = Field(min_length=1)
    claim_latch_profile_version: str = Field(default="claimlatch-v0.2.0", min_length=1)
    claim_latch_version: str = Field(default="0.3.86", min_length=1)
