"""Small deterministic extractor for explicit user preference statements."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ExtractedPreference:
    key: str
    value: str


_PREFIX = re.compile(r"^(?:기억해줘|기억해|앞으로는|앞으로|항상)\s*", re.I)


def extract_preference(text: str) -> ExtractedPreference | None:
    value = _PREFIX.sub("", " ".join(text.split())).strip(" .!?。！？")
    if value == text.strip(" .!?。！？"):
        return None
    if not value:
        return None
    lowered = value.casefold()
    if "한국어" in value or "한글" in value:
        return ExtractedPreference("language", "한국어")
    if "영어" in value or "english" in lowered:
        return ExtractedPreference("language", "English")
    if "기존 코드" in value or "재사용" in value:
        return ExtractedPreference("implementation.reuse", value)
    if "포트폴리오" in value:
        return ExtractedPreference("quality.portfolio", value)
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return ExtractedPreference(f"note.{digest}", value)
