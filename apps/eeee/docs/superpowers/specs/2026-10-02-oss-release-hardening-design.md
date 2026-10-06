# OSS Product Builder Open-Source Release Hardening

## Goal

Prepare the existing local-first OSS Product Builder MVP for a reproducible
public open-source release. A new contributor should be able to clone the
repository, install it with documented commands, run the demo without private
credentials, execute the test suite, and understand the security and runtime
boundaries.

This release targets self-hosted use and open-source collaboration. It does
not turn the project into a hosted SaaS product.

## Success criteria

- A clean checkout can be installed through the documented Python path.
- A clean checkout can be started in demo mode without GitHub or LLM keys.
- The full test suite runs in CI on supported Python versions.
- A package artifact can be built and inspected without importing local files.
- Docker provides a documented, non-root, demo-mode runtime path.
- Configuration, workspace, SQLite, and optional integrations are documented.
- The repository contains a clear license, contribution policy, security policy,
  changelog, and release checklist.
- CI checks fail on test, packaging, or basic quality regressions.

## Scope

### Packaging and runtime

Keep the existing FastAPI application and local-first data model. Add a stable
console entry point where appropriate, preserve `python -m app.main`, and make
the package metadata and supported Python version explicit. Ensure the default
configuration remains deterministic and does not require network credentials.

Add a minimal Docker image and compose/example invocation for the web service.
The image must run as a non-root user, expose only the application port, and
use a writable mounted data/workspace directory. It must not install packages
or execute arbitrary project commands during image build or startup.

### Documentation and governance

Update the README around three user journeys: quick demo, configured research
and execution, and contributor development. Add:

- an OSI-approved project license file;
- `CONTRIBUTING.md` with setup, tests, style, and pull request expectations;
- `SECURITY.md` with supported versions and private vulnerability reporting;
- `CHANGELOG.md` with the current release scope;
- a release checklist covering tests, artifacts, docs, and tag/version checks.

Document that the runtime is local-first, that external transfer/deployment/
deletion remain outside the MVP, and that users are responsible for securing
their host, API keys, and mounted workspaces.

### CI and release

Add GitHub Actions workflows for pull requests and main-branch changes. CI
must install the project with development dependencies, run the complete test
suite, build a wheel and source distribution, and validate that artifacts are
created. Keep network-dependent research tests deterministic through existing
fakes and demo mode.

Use the project version as the single release version source. Document, but do
not automatically perform, publishing to PyPI or creating a GitHub release;
publishing requires maintainer credentials and an explicit release action.

### Security hardening

Audit defaults and documentation for secrets, unsafe paths, permissive CORS,
debug exposure, and container permissions. Preserve the existing workspace
root validation and command restrictions. Add regression tests for any changed
security behavior. Do not weaken the approval boundary or enable arbitrary
shell execution for convenience.

## Out of scope

- Hosted multi-tenant SaaS, accounts, billing, or public user authentication.
- Automatic PyPI/GitHub publishing from untrusted pull requests.
- Always-on monitoring, voice, scheduled jobs, or autonomous agent swarms.
- Replacing SQLite or adding a managed database requirement.
- Broad refactoring unrelated to packaging, release safety, or contributor UX.

## Verification

The implementation is complete only when the local full suite passes, package
build artifacts are produced, Docker configuration is syntactically valid, and
the CI workflow reflects the same commands documented for contributors. Any
environment-specific limitation, such as unavailable Docker or package-index
access, must be reported separately rather than treated as a passing check.
