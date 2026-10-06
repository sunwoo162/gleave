from pathlib import Path


REQUIRED_FILES = ("LICENSE", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "docs/RELEASE.md")


def test_release_governance_files_exist():
    for filename in REQUIRED_FILES:
        assert Path(filename).is_file(), filename


def test_release_docs_describe_install_test_security_and_manual_release():
    content = "\n".join(Path(filename).read_text(encoding="utf-8") for filename in REQUIRED_FILES)
    readme = Path("README.md").read_text(encoding="utf-8")

    assert "MIT License" in content
    assert "python -m pytest" in content or "python -m pytest" in readme
    assert "security" in content.lower()
    assert "manual" in content.lower()
    assert "OSS Product Builder" in content
