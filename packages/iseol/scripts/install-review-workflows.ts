import "dotenv/config";
import { config } from "../src/config.js";
import { GitHubWebhookService } from "../src/services/github.js";
import { listProjects } from "../src/services/projects.js";
import { ensureProjectReviewWorkflows } from "../src/services/review/review-workflow-install.js";
import { DEFAULT_ISEOL_COLLECTOR_REF } from "../src/services/review/review-workflow.js";

const collectorRef = process.env.ISEOL_REVIEW_COLLECTOR_REF?.trim() || DEFAULT_ISEOL_COLLECTOR_REF;
const github = new GitHubWebhookService(config.githubToken);
const projects = await listProjects();

let created = 0;
let existing = 0;
let failed = 0;

for (const project of projects) {
  const results = await ensureProjectReviewWorkflows(github, project, collectorRef);
  for (const result of results) {
    if (result.error) {
      failed += 1;
      console.error(`❌ ${result.repository}: ${result.error}`);
    } else if (result.created) {
      created += 1;
      console.log(`✅ ${result.repository}: Iseol review workflow 생성`);
    } else {
      existing += 1;
      console.log(`ℹ️ ${result.repository}: 기존 workflow 유지`);
    }
  }
}

console.log(`Iseol review workflow 설치 완료 · 생성 ${created} · 기존 ${existing} · 실패 ${failed}`);
if (failed > 0) process.exitCode = 1;
