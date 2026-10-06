import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { executeDesktopTaskPack } from "../src/desktop-agent/runtime.js";

test("GIT_INSPECT returns bounded current commit identity", async () => {
  const base = await mkdtemp(join(tmpdir(), "iseol-git-inspect-"));
  const repo = join(base, "repo");
  await mkdir(repo, { recursive: true });
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Iseol Test"], { cwd: repo });
  await writeFile(join(repo, "a.txt"), "a\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: repo, stdio: "ignore" });
  const parent = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  await writeFile(join(repo, "b.txt"), "b\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "feat: second"], { cwd: repo, stdio: "ignore" });
  const pack: DesktopTaskPack = {
    version: 1,
    jobId: "job-inspect",
    runId: "run-inspect",
    stage: "COMMIT",
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: repo,
    idempotencyKey: "inspect:run-inspect",
    leaseUntil: "2026-09-08T05:00:00.000Z",
    operations: [{ id: "inspect", type: "GIT_INSPECT", cwd: "." }],
  } as DesktopTaskPack;
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [base] });
  assert.equal(result.status, "completed");
  const raw = result.operations[0]?.stdout;
  assert.ok(raw);
  const identity = JSON.parse(raw) as { head: string; parent: string; subject: string; branch: string };
  assert.equal(identity.head, execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim());
  assert.equal(identity.parent, parent);
  assert.equal(identity.subject, "feat: second");
  assert.equal(typeof identity.branch, "string");
});
