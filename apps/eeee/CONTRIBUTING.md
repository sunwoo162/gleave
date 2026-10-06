# Contributing to OSS Product Builder

Thanks for helping improve OSS Product Builder. Contributions should preserve
the local-first model and the explicit approval and workspace safety boundaries.

## Development setup

On Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Run the complete suite with:

```powershell
$env:QT_QPA_PLATFORM="offscreen"
python -m pytest -q
```

## Pull requests

- Add or update tests for behavior changes.
- Keep demo mode deterministic and usable without private credentials.
- Do not add package installation, deletion, data transfer, deployment, or
  system-wide commands to the runtime without an explicit policy change.
- Explain security, compatibility, and migration effects in the pull request.
- Keep generated state, credentials, build directories, and workspaces out of
  commits.

CI runs tests, Python compilation, and release artifact checks. Maintainers
review release and security-sensitive changes before merging.
