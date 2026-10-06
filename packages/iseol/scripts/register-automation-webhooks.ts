import "dotenv/config";
import { GitHubWebhookService, buildAutomationWebhookUrl } from "../src/services/github.js";
import { listProjects, updateProject } from "../src/services/projects.js";

const token = process.env.GITHUB_TOKEN?.trim();
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();

if (!token || !publicBaseUrl || !secret) {
  throw new Error("GITHUB_TOKEN, PUBLIC_BASE_URL, GITHUB_WEBHOOK_SECRET이 필요합니다.");
}

const endpoint = buildAutomationWebhookUrl(publicBaseUrl);
const github = new GitHubWebhookService(token);
const projects = await listProjects();

for (const project of projects) {
  const updates: Record<string, number> = {};

  if (!project.frontendAutomationHookId) {
    const id = await github.createAutomationWebhook(project.frontend, endpoint, secret);
    updates.frontendAutomationHookId = id;
    console.log(`${project.name}: frontend automation webhook 등록`);
  }

  if (!project.backendAutomationHookId) {
    const id = await github.createAutomationWebhook(project.backend, endpoint, secret);
    updates.backendAutomationHookId = id;
    console.log(`${project.name}: backend automation webhook 등록`);
  }
  if (Object.keys(updates).length > 0) {
    await updateProject(project.id, updates);
  }
}

console.log(`automation webhook endpoint: ${endpoint}`);
console.log("기존 프로젝트 automation webhook 등록 완료");
