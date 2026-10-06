import { Octokit } from "@octokit/rest";
import type { RepositoryRef } from "./github.js";
import type { PolledMilestone } from "./github-automation-polling-domain.js";
import {
  extractIseolReviewArtifactFromZip,
  selectIseolReviewRun,
  type IseolReviewRunState,
} from "./review/github-ci-review.js";
import type { CiReviewArtifact } from "./review/ci-review-types.js";

export type PolledPullRequest = {
  number: number;
  headSha: string;
};

export class GitHubAutomationSource {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listOpenPullRequests(repository: RepositoryRef): Promise<PolledPullRequest[]> {
    const pulls = await this.octokit.paginate(this.octokit.rest.pulls.list, {
      owner: repository.owner,
      repo: repository.repo,
      state: "open",
      per_page: 100,
    });

    return pulls.map((pull) => ({
      number: pull.number,
      headSha: pull.head.sha,
    }));
  }

  async findIseolReviewRun(repository: RepositoryRef, headSha: string): Promise<IseolReviewRunState> {
    const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
      owner: repository.owner,
      repo: repository.repo,
      event: "pull_request",
      head_sha: headSha,
      per_page: 50,
    });

    return selectIseolReviewRun(
      data.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name ?? "",
        headSha: run.head_sha,
        status: run.status ?? "unknown",
        conclusion: run.conclusion ?? null,
      })),
      headSha,
    );
  }

  async downloadIseolReviewArtifact(repository: RepositoryRef, runId: number): Promise<CiReviewArtifact | null> {
    const { data } = await this.octokit.rest.actions.listWorkflowRunArtifacts({
      owner: repository.owner,
      repo: repository.repo,
      run_id: runId,
      per_page: 100,
    });
    const artifact = data.artifacts.find((item) => item.name === "iseol-review-findings" && !item.expired);
    if (!artifact) return null;

    const response = await this.octokit.rest.actions.downloadArtifact({
      owner: repository.owner,
      repo: repository.repo,
      artifact_id: artifact.id,
      archive_format: "zip",
    });
    const raw = response.data as unknown;
    const zip = Buffer.isBuffer(raw)
      ? raw
      : typeof raw === "string"
        ? Buffer.from(raw, "binary")
        : Buffer.from(raw as ArrayBuffer);
    return extractIseolReviewArtifactFromZip(zip);
  }

  async listMilestones(repository: RepositoryRef): Promise<PolledMilestone[]> {
    const milestones = await this.octokit.paginate(this.octokit.rest.issues.listMilestones, {
      owner: repository.owner,
      repo: repository.repo,
      state: "all",
      per_page: 100,
    });

    return milestones.map((milestone) => ({
      number: milestone.number,
      title: milestone.title,
      dueOn: milestone.due_on ?? null,
      state: milestone.state === "closed" ? "closed" : "open",
      htmlUrl: milestone.html_url,
      updatedAt: milestone.updated_at ?? milestone.created_at ?? "",
    }));
  }
}
