import { GitHubAutomationSource } from "./github-automation-source.js";
import { EeeeReviewBridge } from "./eeee-review-bridge.js";
import { listProjects, type StoredProject } from "./projects.js";
import { validateCiArtifactForPull } from "./review/github-ci-review.js";
import { GitHubReviewService } from "./review/github-review.js";

type RepositorySide = "frontend" | "backend";

export type StandaloneReviewWorkerOptions = {
  githubToken: string;
  eeeeBridgeUrl: string;
  eeeeBridgeToken?: string;
  projects?: StoredProject[];
};

/**
 * Run ISEOL's GitHub CI/code-review loop without Discord, Discord tokens, or
 * Discord client objects. The Desktop/EEEE mapping is explicit per project so
 * evidence cannot be silently attached to the wrong revision.
 */
export async function syncStandaloneGitHubReviews(
  options: StandaloneReviewWorkerOptions,
): Promise<{ scanned: number; reviewed: number; delivered: number }> {
  const source = new GitHubAutomationSource(options.githubToken);
  const reviewer = new GitHubReviewService(options.githubToken);
  const bridge = new EeeeReviewBridge(options.eeeeBridgeUrl, options.eeeeBridgeToken);
  const projects = options.projects ?? await listProjects();
  let scanned = 0;
  let reviewed = 0;
  let delivered = 0;

  for (const project of projects) {
    if (!project.eeeeProjectId || !project.eeeeProjectRevision) continue;
    for (const side of ["frontend", "backend"] as const) {
      const repository = project[side];
      const fullName = `${repository.owner}/${repository.repo}`;
      const pulls = await source.listOpenPullRequests(repository);
      for (const pull of pulls) {
        scanned += 1;
        const run = await source.findIseolReviewRun(repository, pull.headSha);
        if (run.state !== "completed") continue;
        const artifact = await source.downloadIseolReviewArtifact(repository, run.runId);
        if (!artifact) continue;
        validateCiArtifactForPull(artifact, fullName, pull.number, pull.headSha);
        const result = await reviewer.reviewCiArtifact(fullName, pull.number, pull.headSha, artifact);
        if (!result.skipped) reviewed += 1;
        await bridge.ingest({
          projectId: project.eeeeProjectId,
          projectRevision: project.eeeeProjectRevision,
          repository: fullName,
          pullNumber: pull.number,
          headSha: pull.headSha,
          reviewStatus: artifact.checks.some((check) => check.status === "failed")
            ? "failed"
            : result.findings > 0 ? "warned" : "passed",
          findingsCount: result.findings,
          checks: artifact.checks,
          source: "iseol-github-review",
          generatedAt: new Date().toISOString(),
        });
        delivered += 1;
      }
    }
  }

  return { scanned, reviewed, delivered };
}
