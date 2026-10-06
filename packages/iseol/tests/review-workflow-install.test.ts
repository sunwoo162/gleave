import assert from "node:assert/strict";
import test from "node:test";
import { ensureProjectReviewWorkflows } from "../src/services/review/review-workflow-install.js";

const project = {
  id: "project-1",
  name: "Example",
  guildId: "guild",
  categoryId: "category",
  organization: "example",
  frontend: { owner: "example", repo: "public-web", url: "https://github.com/example/public-web" },
  backend: { owner: "example", repo: "private-api", url: "https://github.com/example/private-api" },
} as any;

test("workflow installer chooses github-hosted for public and self-hosted for private repositories", async () => {
  const written: Array<{ repository: string; content: string }> = [];
  const github = {
    async getRepositoryVisibility(repository: { owner: string; repo: string }) {
      return repository.repo === "public-web" ? "public" : "private";
    },
    async ensureRepositoryFile(repository: { owner: string; repo: string }, _path: string, content: string) {
      written.push({ repository: `${repository.owner}/${repository.repo}`, content });
      return { created: true, branch: "main" };
    },
  } as any;

  const results = await ensureProjectReviewWorkflows(github, project, "abc123");
  assert.equal(results.length, 2);
  assert.match(written[0]!.content, /runs-on: ubuntu-latest/);
  assert.match(written[1]!.content, /runs-on: \[self-hosted, linux, x64, iseol-review\]/);
});

test("workflow installer redacts credential-shaped installation failures", async () => {
  const github = {
    async getRepositoryVisibility() { return "private"; },
    async ensureRepositoryFile() { throw new Error("authorization=workflow-secret"); },
  } as any;

  const results = await ensureProjectReviewWorkflows(github, project, "abc123");

  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.created === false), true);
  assert.equal(results[0]!.error, "authorization=[redacted]");
  assert.equal(results[1]!.error, "authorization=[redacted]");
  assert.doesNotMatch(JSON.stringify(results), /workflow-secret/);
});
