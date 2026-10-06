"""Manifest discovery and validation for untrusted plugin sources."""

import json
from pathlib import Path
from typing import Any

from app.plugins.models import PluginManifest


def discover_manifest(source: str | Path | dict[str, Any]) -> PluginManifest:
    if isinstance(source, dict):
        data = source
    else:
        path = Path(source)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"could not read plugin manifest: {path}") from exc
    try:
        return PluginManifest.model_validate(data)
    except Exception as exc:
        raise ValueError(f"invalid plugin manifest: {exc}") from exc
