from app.design.references import ReferenceCollector
from app.design.tokens import DesignTokenExtractor


def test_reference_with_explicit_license_preserves_provenance_and_disables_copying():
    def fetcher(_url):
        return {
            "title": "Example dashboard",
            "source_kind": "website",
            "license_name": "MIT",
            "license_url": "https://example.test/license",
            "notes": "Used for layout inspiration only",
        }

    pack = ReferenceCollector(fetcher=fetcher).collect(
        ["https://example.test/dashboard"], ["dashboard"], "web_app"
    )

    reference = pack.references[0]
    assert reference.license_name == "MIT"
    assert reference.allowed_uses == ["reference_only", "derived_tokens"]
    assert "direct_asset_copying" not in reference.allowed_uses
    assert "https://example.test/dashboard" in pack.attribution[0]

    tokens = DesignTokenExtractor().extract(pack)
    assert tokens["sources"] == ["https://example.test/dashboard"]
    assert "colors" in tokens
    assert "spacing" in tokens


def test_missing_license_is_reference_only_and_is_not_copied():
    pack = ReferenceCollector(fetcher=lambda _url: {"title": "Unlicensed example"}).collect(
        ["https://example.test/unlicensed"], [], "web_app"
    )

    reference = pack.references[0]
    assert reference.license_name is None
    assert reference.allowed_uses == ["reference_only"]
    assert "license" in reference.notes.lower()
    assert "reference_only" in pack.attribution[0]
