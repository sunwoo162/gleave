export const ISEOL_REVIEW_WORKFLOW_PATH = ".github/workflows/iseol-code-review.yml";
export const DEFAULT_ISEOL_COLLECTOR_REF = "679ebeec63ede4d8d71dd3542ecb90e5ea1ae8a8";

export type ReviewRunnerMode = "self-hosted" | "github-hosted";

export function renderIseolReviewWorkflow(
  collectorRef = DEFAULT_ISEOL_COLLECTOR_REF,
  runnerMode: ReviewRunnerMode = "self-hosted",
): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(collectorRef)) throw new Error("올바르지 않은 Iseol collector ref입니다.");
  const runsOn = runnerMode === "github-hosted"
    ? "ubuntu-latest"
    : "[self-hosted, linux, x64, iseol-review]";

  return `name: Iseol Code Review

on:
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  contents: read

jobs:
  analyze:
    if: \${{ github.event.pull_request.head.repo.full_name == github.repository }}
    runs-on: ${runsOn}
    timeout-minutes: 40
    env:
      ISEOL_PR_NUMBER: \${{ github.event.pull_request.number }}
      ISEOL_HEAD_SHA: \${{ github.event.pull_request.head.sha }}
    steps:
      - name: Checkout pull request
        uses: actions/checkout@v5
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false

      - name: Fetch Iseol collector
        shell: bash
        run: |
          mkdir -p .iseol/bin
          curl -fsSL "https://raw.githubusercontent.com/sunwoo162/iseol-bot/${collectorRef}/scripts/iseol-review-collector.mjs" -o .iseol/bin/iseol-review-collector.mjs

      - name: Run free code review analyzers
        shell: bash
        run: node .iseol/bin/iseol-review-collector.mjs

      - name: Upload Iseol review findings
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: iseol-review-findings
          path: .iseol/review/iseol-review.json
          if-no-files-found: warn
          retention-days: 7
`;
}
