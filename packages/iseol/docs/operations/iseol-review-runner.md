# Iseol free code-review runner

Iseol's default PR review path does not require Gemini/OpenAI/Groq or any other paid LLM API. A trusted GitHub Actions runner executes free static analyzers and uploads `iseol-review-findings`; Iseol polls the completed run and posts GitHub inline review comments.

## Security boundary

A self-hosted Actions runner executes repository code. Treat every workflow job as arbitrary code execution.

- Do **not** run the review runner as the production `ubuntu` account.
- Do **not** give the runner access to `/home/ubuntu/iseol-bot/.env`, Discord tokens, GitHub bot tokens, Calendar credentials, PM2 state, Docker socket, SSH keys, or production data.
- Keep `/home/ubuntu/iseol-bot/.env` mode `600` and runtime data owned by the production account.
- Prefer a dedicated VM/container with no production mounts. If the same VM must be used, create a dedicated unprivileged Linux user and restrict file permissions/network access as much as possible.
- Never expose the runner to fork PRs. The generated workflow has a same-repository guard: `github.event.pull_request.head.repo.full_name == github.repository`.
- Limit the runner group to repositories that Iseol is expected to review.

## 1. Create a dedicated runner identity

Example on Ubuntu:

```bash
sudo useradd --create-home --shell /bin/bash iseol-runner || true
sudo chmod 600 /home/ubuntu/iseol-bot/.env
sudo chown -R ubuntu:ubuntu /home/ubuntu/iseol-bot
```

For stronger isolation, use a separate VM and skip the same-host user setup.

## 2. Register the GitHub runner

Use the GitHub UI for the Organization/repository that owns the projects:

1. Open **Settings → Actions → Runners → New self-hosted runner**.
2. Choose **Linux / x64**.
3. Copy GitHub's current download and registration commands. Registration tokens are short-lived; do not store or paste them into chat/logs.
4. Run the commands as the dedicated `iseol-runner` user.
5. During registration add the custom label `iseol-review`.

The generated project workflow requires all of these labels:

```text
self-hosted
linux
x64
iseol-review
```

A single organization-level runner can serve allowed repositories in that organization. If Iseol manages repositories in different organizations, register an isolated runner instance/runner group for each organization that needs private-repository review.

After registration, install the runner as a service using the exact service commands GitHub shows for the downloaded runner version.

## 3. Install analyzer tools

From this repository as the runner user:

```bash
bash scripts/setup-review-runner-tools.sh check
bash scripts/setup-review-runner-tools.sh install
```

The helper installs:

- Knip
- dependency-cruiser
- Semgrep
- Gitleaks
- Trivy
- OSV-Scanner
- actionlint

Project-local tools are also detected automatically:

- ESLint
- TypeScript (`tsc`)
- package scripts: `lint`, `typecheck`, `test`, `build`
- `npm audit`

The helper downloads the current official Go Linux runtime into the runner user's private tools directory before installing the Go-based security analyzers. This avoids depending on an older Ubuntu `golang-go` package when a scanner requires a newer Go release.

If Ubuntu lacks the Python venv module used by Semgrep:

```bash
sudo apt update
sudo apt install -y python3-venv
```

Ensure the runner service PATH includes the paths printed by the helper, normally:

```text
~/.local/bin
~/.local/share/iseol-review-tools/go/bin
```

Restart the runner service after changing its environment.

Missing optional analyzers do not abort a review. They are recorded as `skipped` while available analyzers continue.

## 4. GitHub token permissions

The Iseol runtime token needs access to every linked repository. For the full review workflow, use a fine-grained token with the permissions required by the enabled features, including:

```text
Metadata: Read
Contents: Read and write
Workflows: Read and write
Actions: Read
Pull requests: Read and write
Issues: Read and write
Webhooks: Read and write
```

`Workflows: write` is needed when Iseol creates `.github/workflows/iseol-code-review.yml`. `Actions: read` is used to find completed runs and download the findings artifact. `Pull requests: write` is used only by the Iseol runtime to post the review; the self-hosted review job itself receives no production bot token.

## 5. Install workflows into existing Iseol projects

From the production Iseol checkout:

```bash
npm run review:install-workflows
```

The installer creates `.github/workflows/iseol-code-review.yml` only when it does not already exist. It never overwrites a repository's existing file at that path.

The normal 1-minute Iseol polling loop also attempts this installation once per project after bot startup, so newly stored projects are automatically covered when the GitHub token can write workflow files.

## 6. Expected PR flow

```text
same-repository PR opened/reopened/synchronized
  -> Iseol Code Review GitHub Action
  -> self-hosted iseol-review runner
  -> analyzers + project-native checks
  -> iseol-review-findings artifact
  -> Iseol outbound poll (<= 1 minute)
  -> validate repository + PR + HEAD SHA
  -> changed RIGHT-side lines only
  -> dedupe/noise/confidence filters
  -> max 5 ordinary inline comments + compact summary
```

The same repository + PR + HEAD SHA is stored in `review-state.json`, so repeated polling does not create duplicate reviews. A new push changes the HEAD SHA and is eligible for a new review.

## Public repositories

GitHub's standard hosted runners are free for public repositories, so a public-only deployment can choose `ubuntu-latest` instead of maintaining a self-hosted runner. Iseol currently renders the hardened self-hosted workflow by default so private repositories can stay at zero GitHub-hosted runner usage.
