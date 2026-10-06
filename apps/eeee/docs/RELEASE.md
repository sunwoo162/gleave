# OSS Product Builder Release Checklist

This project uses manual, maintainer-controlled releases. A pull request or
ordinary push must never publish to PyPI or create a public release.

## Before tagging

From a clean checkout with Python 3.12:

```powershell
python -m pip install -e ".[dev]"
$env:QT_QPA_PLATFORM="offscreen"
python -m pytest -q
python -m compileall -q app
python -m build --no-isolation
python scripts/check_artifacts.py dist
docker compose config
```

Confirm that the version in `pyproject.toml`, `CHANGELOG.md`, and the tag
match. Inspect the wheel and source archive for `.env`, `.oss-builder`,
`workspaces`, and test caches. Confirm Docker runs as `ossbuilder` and uses
demo mode by default.

## Tag and publish

1. Update the changelog and version in a reviewed change.
2. Create an annotated tag such as `v0.1.0` after CI is green.
3. Let the tag workflow build and validate the artifacts.
4. A maintainer explicitly publishes the artifacts to the intended registry.
5. Create the GitHub release from the tag and attach the validated artifacts.
6. Verify the documented install and `/health` check from a fresh checkout.

Publishing requires maintainer credentials and is never performed automatically
for pull requests.
