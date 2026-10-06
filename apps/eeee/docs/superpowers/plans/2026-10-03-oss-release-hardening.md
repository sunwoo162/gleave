# OSS Product Builder Open-Source Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local-first OSS Product Builder reproducibly installable, testable, documented, and packageable as a self-hosted open-source release.

**Architecture:** Preserve the FastAPI/SQLite application and demo-first defaults. Add a small packaging/runtime layer around the existing `app` package, a non-root Docker path, contributor/release governance files, and CI jobs that run the same commands documented for local development. Keep public publishing manual and credential-gated.

**Tech Stack:** Python 3.12, FastAPI, setuptools, pytest, GitHub Actions, Docker, Markdown.

**Spec:** `docs/superpowers/specs/2026-10-02-oss-release-hardening-design.md`

## Global Constraints

- Keep the project local-first and self-hosted; do not add SaaS accounts, billing, or hosted multi-tenancy.
- Demo mode must run without GitHub or LLM credentials.
- Preserve approval boundaries, workspace-root validation, bounded commands, and no automatic package installation, deletion, transfer, deployment, or system-wide changes.
- Docker must run the service as a non-root user with writable mounted data/workspace paths.
- Use the project version as the single release version source.
- Do not automatically publish to PyPI or create GitHub releases from pull requests.
- Keep network-dependent research tests deterministic through fakes and demo mode.

## Review Focus

- A clean checkout with no credentials can start and answer `/health`; pin this in the runtime smoke test task.
- A user-supplied workspace outside `WORKSPACE_ROOT` remains rejected after packaging/container changes; pin this in the security regression task.
- Secrets are not copied into the image, logs, example config, or release artifacts; pin this in the container/config review task.
- Pull requests cannot publish artifacts or mutate repository contents; pin this in the workflow permissions and event assertions task.
- A source distribution and wheel contain the application/static assets but not local state, `.env`, or workspaces; pin this in the packaging artifact task.

### Task 1: Make packaging and runtime entry points release-ready

**Files:**
- Modify: `pyproject.toml`
- Modify: `app/main.py`
- Create: `tests/test_runtime_entrypoint.py`
- Modify: `README.md`

**Interfaces:**
- Produces a console script named `oss-product-builder` that invokes `app.main:run`.
- Preserves `python -m app.main` and `create_app()` behavior.
- `run(host: str = "127.0.0.1", port: int = 8000) -> None` starts Uvicorn with the configured application.

- [ ] **Step 1: Write failing entry-point tests**

  Add tests that assert the package metadata exposes `oss-product-builder`, that `app.main.run` passes the supplied host/port to Uvicorn, and that `/health` remains available from `create_app(Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspace"))`.

- [ ] **Step 2: Run the focused tests and verify the new entry point fails**

  Run: `python -m pytest tests/test_runtime_entrypoint.py -q`

  Expected: FAIL because the console script and `run` function are not yet defined.

- [ ] **Step 3: Implement the package entry point**

  Add the `project.scripts` mapping in `pyproject.toml`, move the inline Uvicorn startup into `app.main.run`, and have the module guard call `run()`.

- [ ] **Step 4: Update quick-start documentation and run focused tests**

  Document editable installation and the console command while retaining the module invocation. Run `python -m pytest tests/test_runtime_entrypoint.py -q` and expect PASS.

- [ ] **Step 5: Commit the packaging change**

  `git add pyproject.toml app/main.py tests/test_runtime_entrypoint.py README.md && git commit -m "feat: add installable application entry point"`

### Task 2: Add reproducible package artifact checks

**Files:**
- Modify: `pyproject.toml`
- Modify: `.gitignore`
- Create: `tests/test_package_metadata.py`
- Create: `scripts/check_artifacts.py`

**Interfaces:**
- `scripts/check_artifacts.py` accepts a distribution directory argument and exits non-zero unless exactly one wheel and one source distribution exist and neither contains `.env`, `.oss-builder`, `workspaces`, or test cache state.

- [ ] **Step 1: Write failing artifact validation tests**

  Test metadata version `0.1.0`, wheel/source build configuration, and rejection of an artifact containing local state markers.

- [ ] **Step 2: Run the focused tests and verify the validator is absent/failing**

  Run: `python -m pytest tests/test_package_metadata.py -q`

  Expected: FAIL until the artifact contract is implemented.

- [ ] **Step 3: Implement artifact validation and build configuration**

  Add the small standard-library validator, ignore `dist/` and build metadata, and ensure package discovery includes `app` plus bundled static files.

- [ ] **Step 4: Build and inspect artifacts**

  Run: `python -m pip install build`; `python -m build`; `python scripts/check_artifacts.py dist`; `python -m pytest tests/test_package_metadata.py -q`.

  Expected: one `.whl`, one `.tar.gz`, validator success, and focused tests passing.

- [ ] **Step 5: Commit the artifact checks**

  `git add pyproject.toml .gitignore tests/test_package_metadata.py scripts/check_artifacts.py && git commit -m "build: validate release artifacts"`

### Task 3: Add a secure non-root Docker runtime

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Create: `tests/test_container_contract.py`
- Modify: `README.md`

**Interfaces:**
- The image starts `oss-product-builder --host 0.0.0.0 --port 8000` and listens on port 8000.
- Runtime user is non-root; `/app/.oss-builder` and `/app/workspaces` are writable only through declared volumes.
- Compose uses demo mode by default and does not require secrets.

- [ ] **Step 1: Write failing container contract tests**

  Parse the Dockerfile/Compose text and assert non-root `USER`, port 8000, demo mode, no `.env` copy, no package-install command at startup, and declared data/workspace mounts.

- [ ] **Step 2: Run focused tests and verify the container contract fails**

  Run: `python -m pytest tests/test_container_contract.py -q`

  Expected: FAIL because the container files do not exist.

- [ ] **Step 3: Implement Docker and Compose files**

  Use a slim Python 3.12 base, install the package in the image, create a dedicated unprivileged user, expose 8000, set safe demo defaults, and mount persistent state/workspaces in Compose.

- [ ] **Step 4: Run container contract tests and available Docker checks**

  Run: `python -m pytest tests/test_container_contract.py -q`; if Docker is available, run `docker compose config` and `docker build -t oss-product-builder:local .`.

  Expected: tests and Compose config pass; report Docker build limitations separately if Docker is unavailable.

- [ ] **Step 5: Commit the container runtime**

  `git add Dockerfile .dockerignore docker-compose.yml .env.example tests/test_container_contract.py README.md && git commit -m "build: add non-root container runtime"`

### Task 4: Complete contributor, security, and release documentation

**Files:**
- Modify: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CHANGELOG.md`
- Create: `docs/RELEASE.md`

**Interfaces:**
- README has quick demo, configured integrations, Docker, development, and safety sections.
- Governance documents identify supported release behavior without promising hosted service guarantees.
- Release checklist names exact verification commands and manual publishing steps.

- [ ] **Step 1: Write documentation contract tests**

  Assert required files exist and contain the project name, install command, test command, security reporting guidance, license identifier, and explicit manual-release language.

- [ ] **Step 2: Run focused documentation tests and verify missing contracts**

  Run: `python -m pytest tests/test_release_docs.py -q`

  Expected: FAIL until the documents and test are added.

- [ ] **Step 3: Add the governance and release documents**

  Use an OSI-approved permissive license consistent with the repository owner’s intended distribution, document contributor setup and security contact route without inventing private contact details, and make `docs/RELEASE.md` the authoritative tag/build/checklist guide.

- [ ] **Step 4: Update README and run documentation tests**

  Include exact Windows/PowerShell and Docker commands, demo-mode behavior, environment variables, data persistence, safety boundaries, and troubleshooting. Run `python -m pytest tests/test_release_docs.py -q` and expect PASS.

- [ ] **Step 5: Commit the project governance docs**

  `git add README.md LICENSE CONTRIBUTING.md SECURITY.md CHANGELOG.md docs/RELEASE.md tests/test_release_docs.py && git commit -m "docs: prepare open-source contribution and release flow"`

### Task 5: Harden CI and add release/security regression coverage

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `tests/test_release_security.py`
- Modify: `tests/test_health.py`

**Interfaces:**
- PR/main CI installs `.[dev]`, runs the complete suite, compiles `app`, builds artifacts, and runs the artifact validator.
- Release workflow is tag-triggered, read-only for pull requests, builds artifacts, and publishes only through an explicit maintainer action.

- [ ] **Step 1: Write failing security/release regression tests**

  Assert default `Settings` uses demo mode, app startup does not require credentials, outside-root workspace requests are rejected, and workflow YAML contains `contents: read` for CI plus a tag-only release trigger.

- [ ] **Step 2: Run focused tests and verify the new workflow assertions fail**

  Run: `python -m pytest tests/test_release_security.py -q`

  Expected: FAIL until workflow and regression contracts are present.

- [ ] **Step 3: Update CI and add a manual/tagged release workflow**

  Keep Windows coverage for Qt compatibility, add a Linux package job, build wheel/sdist, run the validator, and use least-privilege permissions. The release workflow must not publish on pull requests and must require an explicit maintainer-controlled publish step.

- [ ] **Step 4: Run the full verification suite**

  Run: `$env:QT_QPA_PLATFORM='offscreen'; .\.venv\Scripts\python.exe -m pytest -q`; `python -m compileall -q app`; `python -m build`; `python scripts/check_artifacts.py dist`; `git diff --check`.

  Expected: all tests pass, artifacts validate, and diff check is clean. Run `docker compose config` if Docker is available.

- [ ] **Step 5: Commit CI and regression coverage**

  `git add .github tests/test_health.py tests/test_release_security.py && git commit -m "ci: verify open-source release contract"`

### Task 6: Final release review

**Files:**
- Modify: `docs/RELEASE.md` only if verification reveals a mismatch

- [ ] **Step 1: Execute the documented clean-checkout commands**

  Run the README quick-start, health check, full tests, build, artifact validator, and Compose validation from a fresh temporary copy or clean working tree.

- [ ] **Step 2: Review the release contents**

  Check `git status`, package contents, generated artifacts, secret files, Docker user, workflow permissions, and version consistency.

- [ ] **Step 3: Record any limitations**

  Document unavailable local tools such as Docker, PyPI credentials, or network access; do not mark those checks as passing.

- [ ] **Step 4: Prepare the handoff**

  Provide the maintainer with the release tag suggestion, exact commands, remaining manual actions, and the verification evidence.
