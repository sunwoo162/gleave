# Free Code Review Engine Design

## Goal
Build a zero-API-cost code review system that keeps the existing Gemini-like GitHub UX: a compact `🤖 이설 Code Review` summary plus only actionable inline comments on changed lines.

## Constraints
- No paid LLM/API is required for normal reviews.
- Production must not require an inbound public webhook port.
- Reviews are triggered from the existing 1-minute outbound GitHub polling loop.
- Private repositories must be able to run without GitHub-hosted runner minute charges by using a self-hosted runner.
- Never execute fork PR code on the trusted self-hosted runner.
- Existing HEAD SHA deduplication and changed-line validation remain authoritative.
- No style-only noise: formatter/semicolon/quote/line-length findings are excluded from inline review.
- One normal review is capped at 5 inline comments, except critical-security overflow may be kept.

## Architecture

```text
Pull Request
   |
   v
GitHub Actions workflow: Iseol Code Review
   |
   +-- project-native checks
   |    +-- install
   |    +-- lint
   |    +-- typecheck
   |    +-- test
   |    +-- build
   |
   +-- analyzers
        +-- ESLint JSON
        +-- TypeScript diagnostics
        +-- npm audit JSON
        +-- Knip
        +-- dependency-cruiser
        +-- Semgrep (when installed)
        +-- Gitleaks (when installed)
        +-- Trivy (when installed)
        +-- OSV-Scanner (when installed)
        +-- actionlint (workflow files)
        |
        v
   normalized iseol-review.json artifact
        |
        v
Iseol 1-minute outbound poller
        |
        +-- locate completed workflow for PR HEAD SHA
        +-- download `iseol-review-findings` artifact
        +-- normalize/dedupe findings
        +-- reject findings outside added RIGHT-side lines
        +-- confidence/severity/noise filters
        +-- max 5 ordinary inline comments
        |
        v
GitHub Review API
   +-- inline comments on Files changed
   +-- compact `🤖 이설 Code Review` body
```

## Workflow safety
The workflow uses `runs-on: [self-hosted, linux, x64, iseol-review]` and runs only when `github.event.pull_request.head.repo.full_name == github.repository`. Pull requests from forks are skipped so untrusted fork code cannot execute on the trusted server.

The workflow requests only the minimum permissions needed to read source and upload the findings artifact. It does not receive production secrets.

## Normalized finding contract

```ts
type CiReviewFinding = {
  tool: string;
  filePath: string;
  line: number;
  severity: "critical" | "major" | "minor";
  category: "correctness" | "security" | "performance" | "maintainability";
  confidence: number;
  explanation: string;
  suggestion?: string;
  ruleId?: string;
};

type CiReviewArtifact = {
  schemaVersion: 1;
  repository: string;
  pullNumber: number;
  headSha: string;
  generatedAt: string;
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "skipped";
    detail?: string;
  }>;
  findings: CiReviewFinding[];
};
```

## Aggregation rules
1. Only comments targeting lines added on the RIGHT side of the PR diff are eligible.
2. Exact duplicates are removed by `filePath + line + normalized explanation/rule`.
3. Multiple tools confirming the same location/category raise confidence.
4. Security findings from secret scanners are treated as high confidence.
5. Style-only findings are not posted as inline reviews.
6. Build/test/typecheck failures without a reliable changed-line mapping stay in the compact review summary/check status instead of being attached to an arbitrary line.
7. Ordinary inline findings are sorted by severity/confidence and capped at five.
8. The same repository + PR + HEAD SHA is never reviewed twice.

## Project onboarding
The 1-minute Iseol polling loop attempts to install `.github/workflows/iseol-code-review.yml` into both repositories once per stored project after bot startup. If the workflow file already exists, Iseol leaves it untouched. Installation failure is logged and does not stop PR/milestone polling.

Existing projects also have a one-shot bootstrap command: `npm run review:install-workflows`.

The generated workflow references the central review collector script in this repository at a configurable ref. While PR #39 is unmerged the default ref is the feature branch; after integration it should be pinned to the integrated branch/commit. The collector only produces the normalized artifact and never posts GitHub comments itself; comment posting remains centralized in Iseol.

## Self-hosted runner
For private repositories with zero GitHub-hosted runner-minute usage, use a dedicated GitHub Actions runner labeled `iseol-review`. Prefer a separate VM/container. If the current `gsmsv` host is used, run the Actions runner as a dedicated unprivileged user with no access to production `.env`, PM2 state, runtime data, SSH keys, Docker socket, or other secrets.

A setup helper installs optional analyzers and validates their versions. Missing optional analyzers are recorded as `skipped`, not treated as a failed review. Public repositories may use standard GitHub-hosted runners without Actions charges if desired, although the generated default workflow is self-hosted so the same template also covers private repositories.

## Failure behavior
- Analyzer crash: record the analyzer as failed/skipped and continue other analyzers.
- Artifact missing: no review is posted; a server warning is emitted and the next polling cycle may retry.
- Workflow failed after producing an artifact: the available artifact is still eligible; failed checks can appear in the compact summary.
- Workflow failed before artifact upload: no line comments are invented.
- Rate-limit/API errors: retry on the next polling cycle; HEAD SHA state is not marked reviewed until a GitHub review is successfully created.
- Fork PR: workflow skipped by design.

## Migration
- Keep the existing signed webhook code as optional fallback, disabled in production.
- Remove Gemini/Groq from the default review execution path.
- Keep the existing `ReviewFinding`, renderers, changed-line parser, and HEAD SHA state where possible.
- CI findings become the default review input source.

## Success criteria
- A same-repository PR starts an Iseol self-hosted Actions review after the workflow has been installed.
- The Actions run creates a valid `iseol-review-findings` artifact even when some optional tools are unavailable.
- Within one polling interval after completion, Iseol posts at most five useful inline comments on changed lines and one compact summary.
- Re-polling the same HEAD SHA creates no duplicate review.
- A new push to the PR creates a new run and can create a new review for the new HEAD SHA.
- Fork PR code never runs on the trusted self-hosted runner.
- Normal operation requires no paid AI API and no public inbound port.
