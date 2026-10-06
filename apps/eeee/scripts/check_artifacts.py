from __future__ import annotations

import argparse
import tarfile
import zipfile
from pathlib import Path


FORBIDDEN_MARKERS = (".env", ".oss-builder", "workspaces", ".pytest_cache")


def _contains_forbidden_state(names: list[str]) -> bool:
    return any(any(marker in name for marker in FORBIDDEN_MARKERS) for name in names)


def validate_artifacts(dist_dir: Path) -> None:
    wheels = sorted(dist_dir.glob("*.whl"))
    sources = sorted(dist_dir.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sources) != 1:
        raise ValueError("expected exactly one wheel and one source distribution")

    with zipfile.ZipFile(wheels[0]) as archive:
        wheel_names = archive.namelist()
    with tarfile.open(sources[0], "r:gz") as archive:
        source_names = archive.getnames()

    if _contains_forbidden_state(wheel_names + source_names):
        raise ValueError("forbidden local state found in release artifact")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate OSS Product Builder release artifacts")
    parser.add_argument("dist_dir", type=Path)
    args = parser.parse_args()
    validate_artifacts(args.dist_dir)
    print(f"validated {args.dist_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
