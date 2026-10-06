import type { GitHubWebhookService } from "../github.js";
import type { StoredProject } from "../projects.js";
import {
  DEFAULT_ISEOL_COLLECTOR_REF,
  ISEOL_REVIEW_WORKFLOW_PATH,
  renderIseolReviewWorkflow,
} from "./review-workflow.js";
import { formatUserFacingError } from "../../security/user-error.js";

export type ReviewWorkflowInstallResult = {
  repository: string;
  created: boolean;
  error?: string;
};

export async function ensureProjectReviewWorkflows(
  github: Pick<GitHubWebhookService, "ensureRepositoryFile" | "getRepositoryVisibility">,
  project: StoredProject,
  collectorRef = DEFAULT_ISEOL_COLLECTOR_REF,
): Promise<ReviewWorkflowInstallResult[]> {
  const repositories = [project.frontend, project.backend];
  const results: ReviewWorkflowInstallResult[] = [];

  for (const repository of repositories) {
    const name = `${repository.owner}/${repository.repo}`;
    try {
      const visibility = await github.getRepositoryVisibility(repository);
      const workflow = renderIseolReviewWorkflow(
        collectorRef,
        visibility === "public" ? "github-hosted" : "self-hosted",
      );
      const result = await github.ensureRepositoryFile(
        repository,
        ISEOL_REVIEW_WORKFLOW_PATH,
        workflow,
        "ci: add iseol code review workflow",
      );
      results.push({ repository: name, created: result.created });
    } catch (error) {
      results.push({
        repository: name,
        created: false,
        error: formatUserFacingError(error, "알 수 없는 오류"),
      });
    }
  }

  return results;
}
