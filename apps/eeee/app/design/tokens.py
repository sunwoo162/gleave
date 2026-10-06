"""Extract safe, source-linked design token scaffolding."""

from app.design.references import ReferencePack


class DesignTokenExtractor:
    def extract(self, pack: ReferencePack) -> dict[str, object]:
        source_urls = [reference.source_url for reference in pack.references]
        extracted: dict[str, object] = {
            "colors": {"source_references": source_urls},
            "typography": {"source_references": source_urls},
            "spacing": {"source_references": source_urls},
            "radius": {"source_references": source_urls},
            "breakpoints": {"source_references": source_urls},
            "sources": source_urls,
        }
        for name, values in pack.tokens.items():
            extracted[name] = values
        return extracted
