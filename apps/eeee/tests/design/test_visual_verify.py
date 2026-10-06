from pathlib import Path

from app.design.visual_verify import VisualVerifier


def baseline(tmp_path: Path) -> Path:
    path = tmp_path / "baseline.png"
    path.write_bytes(b"baseline")
    return path


def test_visual_verifier_reports_pass_for_matching_screenshot(tmp_path):
    expected = baseline(tmp_path)

    def screenshotter(_url, _expected):
        actual = tmp_path / "actual.png"
        actual.write_bytes(b"baseline")
        return actual

    report = VisualVerifier(screenshotter=screenshotter).compare(
        "http://127.0.0.1:8000", expected
    )

    assert report.status == "PASS"
    assert report.actual_screenshot == tmp_path / "actual.png"
    assert report.differences == []
    assert report.viewport == {"width": 1280, "height": 800}


def test_visual_verifier_reports_warn_for_mismatch(tmp_path):
    expected = baseline(tmp_path)

    def screenshotter(_url, _expected):
        actual = tmp_path / "actual.png"
        actual.write_bytes(b"different")
        return actual

    report = VisualVerifier(screenshotter=screenshotter).compare(
        "http://localhost:8000", expected
    )

    assert report.status == "WARN"
    assert report.actual_screenshot is not None
    assert report.differences == ["Screenshot differs from baseline"]


def test_visual_verifier_blocks_unreachable_local_app(tmp_path):
    expected = baseline(tmp_path)

    def screenshotter(_url, _expected):
        raise ConnectionError("connection refused")

    report = VisualVerifier(screenshotter=screenshotter).compare(
        "http://127.0.0.1:65500", expected
    )

    assert report.status == "BLOCKED"
    assert report.actual_screenshot is None
    assert "connection refused" in report.blocking_reason
