"""Deterministic screenshot comparison for local applications."""

from collections.abc import Callable
from pathlib import Path
import filecmp
import platform
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field


class VisualReport(BaseModel):
    status: Literal["PASS", "WARN", "BLOCKED"]
    actual_screenshot: Path | None
    baseline: Path
    differences: list[str] = Field(default_factory=list)
    viewport: dict[str, int]
    environment: dict[str, str]
    blocking_reason: str | None = None


Screenshotter = Callable[[str, Path], Path]


class VisualVerifier:
    def __init__(
        self,
        *,
        screenshotter: Screenshotter | None = None,
        viewport: dict[str, int] | None = None,
    ) -> None:
        self.screenshotter = screenshotter or self._playwright_screenshot
        self.viewport = viewport or {"width": 1280, "height": 800}

    def compare(self, url: str, expected: Path) -> VisualReport:
        environment = {
            "browser": "chromium",
            "platform": platform.system(),
            "python": platform.python_version(),
        }
        base = Path(expected)
        if not base.is_file():
            return self._blocked(base, environment, f"Baseline does not exist: {base}")
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }:
            return self._blocked(base, environment, "Visual verification only allows local app URLs")
        try:
            actual = Path(self.screenshotter(url, base))
        except Exception as exc:
            return self._blocked(base, environment, str(exc))
        if not actual.is_file():
            return self._blocked(base, environment, f"Screenshot was not created: {actual}")
        if filecmp.cmp(actual, base, shallow=False):
            return VisualReport(
                status="PASS",
                actual_screenshot=actual,
                baseline=base,
                viewport=self.viewport,
                environment=environment,
            )
        return VisualReport(
            status="WARN",
            actual_screenshot=actual,
            baseline=base,
            differences=["Screenshot differs from baseline"],
            viewport=self.viewport,
            environment=environment,
        )

    def _blocked(
        self, baseline: Path, environment: dict[str, str], reason: str
    ) -> VisualReport:
        return VisualReport(
            status="BLOCKED",
            actual_screenshot=None,
            baseline=baseline,
            viewport=self.viewport,
            environment=environment,
            blocking_reason=reason,
        )

    def _playwright_screenshot(self, url: str, expected: Path) -> Path:
        from playwright.sync_api import sync_playwright

        actual = expected.with_name(f"{expected.stem}.actual{expected.suffix}")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport=self.viewport)
            page.goto(url, wait_until="networkidle")
            page.screenshot(path=str(actual), full_page=True)
            browser.close()
        return actual
