import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from scripts.check_artifacts import validate_artifacts


def test_project_metadata_declares_version_and_console_script():
    metadata = Path("pyproject.toml").read_text(encoding="utf-8")

    assert 'version = "0.1.0"' in metadata
    assert 'license = "MIT"' in metadata
    assert 'license-files = ["LICENSE"]' in metadata
    assert 'oss-product-builder = "app.main:run"' in metadata


def test_artifact_validator_accepts_one_wheel_and_source_distribution(tmp_path):
    with zipfile.ZipFile(tmp_path / "oss_product_builder-0.1.0-py3-none-any.whl", "w") as archive:
        archive.writestr("app/__init__.py", "")
    with tarfile.open(tmp_path / "oss_product_builder-0.1.0.tar.gz", "w:gz") as archive:
        content = b"source"
        info = tarfile.TarInfo("oss-product-builder-0.1.0/README.md")
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))

    validate_artifacts(tmp_path)


def test_artifact_validator_rejects_local_state(tmp_path):
    wheel = tmp_path / "oss_product_builder-0.1.0-py3-none-any.whl"
    with zipfile.ZipFile(wheel, "w") as archive:
        archive.writestr(".env", "SECRET=leak")
    with tarfile.open(tmp_path / "oss_product_builder-0.1.0.tar.gz", "w:gz") as archive:
        content = b"source"
        info = tarfile.TarInfo("oss-product-builder-0.1.0/README.md")
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))

    with pytest.raises(ValueError, match="forbidden local state"):
        validate_artifacts(tmp_path)
