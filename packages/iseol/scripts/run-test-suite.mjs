import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const DEFAULT_BATCH_SIZE = 24;

export function buildBatches(files, batchSize = DEFAULT_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }

  const batches = [];
  for (let index = 0; index < files.length; index += batchSize) {
    batches.push(files.slice(index, index + batchSize));
  }
  return batches;
}

const TEST_FILES = [
  "tests/test-command-contract.test.ts",
  "tests/operator-credentials.test.ts",
  "tests/iseol-runtime-services.test.ts",
  "tests/ai-team-local-runtime.test.ts",
  "tests/idea-lab-runtime-service.test.ts",
  "tests/interaction-router.test.ts",
  "tests/calendar-discord.test.ts",
  "tests/calendar-state.test.ts",
  "tests/contest-audience-feed-lock.test.ts",
  "tests/contest-guild-delivery-lock.test.ts",
  "tests/ci-review-aggregate.test.ts",
  "tests/iseol-review-collector.test.ts",
  "tests/review-workflow.test.ts",
  "tests/review-workflow-install.test.ts",
  "tests/github-ci-review.test.ts",
  "tests/review-runtime.test.ts",
  "tests/config.test.ts",
  "tests/github-automation-polling.test.ts",
  "tests/github-schedule-sync.test.ts",
  "tests/github-commit-feed-lifecycle-lock.test.ts",
  "tests/github-automation-lifecycle-lock.test.ts",
  "tests/github-webhook-lifecycle-lock.test.ts",
  "tests/project-integration-polling-lifecycle-lock.test.ts",
  "tests/calendar-project-lifecycle-lock.test.ts",
  "tests/guild-reset-binding-cleanup.test.ts",
  "tests/guild-reset-project-lifecycle-lock.test.ts",
  "tests/project-join-lifecycle-lock.test.ts",
  "tests/project-command-lifecycle-lock.test.ts",
  "tests/github-webhook.test.ts",
  "tests/review-domain.test.ts",
  "tests/harness-contracts.test.ts",
  "tests/harness-policy-resolver.test.ts",
  "tests/harness-preflight.test.ts",
  "tests/harness-run-store.test.ts",
  "tests/harness-run-service.test.ts",
  "tests/harness-state-machine.test.ts",
  "tests/harness-completion-gates.test.ts",
  "tests/harness-build-evidence.test.ts",
  "tests/harness-event-store.test.ts",
  "tests/harness-side-effect-ledger.test.ts",
  "tests/harness-recovery.test.ts",
  "tests/harness-run-supervisor.test.ts",
  "tests/harness-operator-reconciliation.test.ts",
  "tests/project-create-lock.test.ts",
  "tests/project-delete-lock.test.ts",
  "tests/project-delete-daily-scrum-cleanup.test.ts",
  "tests/project-discussion-lifecycle-lock.test.ts",
  "tests/scrum-create-lifecycle-lock.test.ts",
  "tests/scrum-delete-lifecycle-lock.test.ts",
  "tests/scrum-write-lifecycle-lock.test.ts",
  "tests/daily-scrum-reminder-lifecycle-lock.test.ts",
  "tests/project-store-uniqueness.test.ts",
  "tests/project-model-contracts.test.ts",
  "tests/project-model-stores.test.ts",
  "tests/project-model-promotion.test.ts",
  "tests/project-model-tree.test.ts",
  "tests/project-model-work-context.test.ts",
  "tests/project-run-recovery.test.ts",
  "tests/web-control-plane-store-listing.test.ts",
  "tests/web-control-plane-view-model.test.ts",
  "tests/web-control-plane-router.test.ts",
  "tests/web-control-plane-server.test.ts",
  "tests/project-work-request.test.ts",
  "tests/user-project-runtime-integration.test.ts",
  "tests/identity-scope.test.ts",
  "tests/read-model-roots.test.ts",
  "tests/read-model-startup.test.ts",
  "tests/discord-project-progress-notifications.test.ts",
  "tests/discord-project-progress-adapter.test.ts",
  "tests/discord-project-progress-event-bridge.test.ts",
  "tests/web-control-plane-static.test.ts",
  "tests/discord-project-binding.test.ts",
  "tests/discord-project-context.test.ts",
  "tests/discord-project-status.test.ts",
  "tests/discord-project-command-actions.test.ts",
  "tests/discord-project-history.test.ts",
  "tests/discord-project-provider-context.test.ts",
  "tests/discord-web-shared-state.test.ts",
  "tests/idea-lab-runtime-config.test.ts",
  "tests/idea-lab-stores.test.ts",
  "tests/idea-lab-distinctness.test.ts",
  "tests/idea-lab-chatgpt-proposal-provider.test.ts",
  "tests/idea-lab-completion-profile.test.ts",
  "tests/idea-lab-sandbox.test.ts",
  "tests/idea-lab-production-service.test.ts",
  "tests/idea-lab-production-runtime-driver.test.ts",
  "tests/idea-lab-campaign-supervisor.test.ts",
  "tests/idea-lab-promotion.test.ts",
  "tests/idea-lab-web-control-plane.test.ts",
  "tests/idea-lab-e2e.test.ts",
  "tests/chatgpt-web-contracts.test.ts",
  "tests/chatgpt-web-stores.test.ts",
  "tests/chatgpt-web-prompt-compiler.test.ts",
  "tests/chatgpt-web-intent-compiler.test.ts",
  "tests/chatgpt-web-reasoning-executor.test.ts",
  "tests/chatgpt-web-recovery.test.ts",
  "tests/chatgpt-web-hybrid-executor.test.ts",
  "tests/chatgpt-web-e2e.test.ts",
  "tests/chatgpt-web-browser-service.test.ts",
  "tests/chatgpt-web-browser-smoke.test.ts",
  "tests/chatgpt-web-playwright-backend.test.ts",
  "tests/chatgpt-web-playwright-config.test.ts",
  "tests/desktop-agent-atomic-file.test.ts",
  "tests/desktop-agent-contracts.test.ts",
  "tests/desktop-agent-registry.test.ts",
  "tests/desktop-agent-job-store.test.ts",
  "tests/desktop-agent-runtime.test.ts",
  "tests/desktop-agent-process-policy.test.ts",
  "tests/desktop-agent-transport.test.ts",
  "tests/desktop-agent-recovery.test.ts",
  "tests/desktop-agent-e2e.test.ts",
  "tests/desktop-agent-bootstrap.test.ts",
  "tests/windows-runner-provisioning.test.ts",
  "tests/evaluation-contracts.test.ts",
  "tests/evaluation-stores.test.ts",
  "tests/evaluation-fault-injector.test.ts",
  "tests/evaluation-metrics.test.ts",
  "tests/evaluation-recovery.test.ts",
  "tests/evaluation-security.test.ts",
  "tests/evaluation-provider.test.ts",
  "tests/evaluation-timestamps.test.ts",
  "tests/evaluation-quick-runner.test.ts",
  "tests/evaluation-soak.test.ts",
  "tests/evaluation-concurrent-recovery.test.ts",
  "tests/evaluation-web-control-plane.test.ts",
  "tests/idea-lab-vercel-deploy-adapter.test.ts",
  "tests/idea-lab-live-smoke.test.ts",
  "tests/request-diagnostics.test.ts",
  "tests/runtime-shutdown.test.ts",
  "tests/user-notifications.test.ts",
  "tests/user-notifications-api.test.ts"
];

export function runTestBatches({ files, batchSize = DEFAULT_BATCH_SIZE, env = process.env, cwd = process.cwd() }) {
  const batches = buildBatches(files, batchSize);
  for (const [index, batch] of batches.entries()) {
    console.log(`Running test batch ${index + 1}/${batches.length} (${batch.length} files)`);
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...batch], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

async function main() {
  const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (typeof packageJson.scripts?.test !== "string") throw new Error("package.json scripts.test is required");
  process.exitCode = runTestBatches({ files: TEST_FILES, cwd: path.dirname(packagePath) });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
