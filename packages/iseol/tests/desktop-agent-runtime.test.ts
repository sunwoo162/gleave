import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DesktopPolicySource, DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { assertWorkspaceAccess, verifyDesktopTaskPolicy } from "../src/desktop-agent/workspace-guard.js";
import { executeDesktopTaskPack } from "../src/desktop-agent/runtime.js";
import { processJobTempRoot } from "../src/desktop-agent/process-policy.js";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function effective(sources: DesktopPolicySource[]) {
  return sha(sources.map((source) => `${source.kind}\n${source.path}\n${source.sha256}`).join("\n---\n"));
}

async function fixture() {
  const allowed = await mkdtemp(join(tmpdir(), "iseol-desktop-runtime-"));
  const workspace = join(allowed, "repo");
  await mkdir(join(workspace, "docs"), { recursive: true });
  const harnessPath = join(workspace, "docs", "HARNESS_ENGINEERING.md");
  await writeFile(harnessPath, "# Test Harness\n", "utf8");
  return { allowed, workspace, harnessPath };
}

function policyPack(workspace: string, harnessPath: string, operations: DesktopTaskPack["operations"]): DesktopTaskPack {
  const sources: DesktopPolicySource[] = [{
    kind: "project-harness",
    path: harnessPath,
    sha256: sha("# Test Harness\n"),
    required: true,
  }];
  return {
    version: 1,
    jobId: "job-001",
    runId: "run-001",
    stage: "TEST",
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: workspace,
    policyDigest: effective(sources),
    policySources: sources,
    idempotencyKey: "test:runtime",
    leaseUntil: "2026-09-08T02:00:00.000Z",
    operations,
  };
}

test("workspace guard allows descendants and rejects parent escape", async () => {
  const { allowed, workspace } = await fixture();
  const inside = await assertWorkspaceAccess([allowed], workspace, join(workspace, "docs"));
  assert.equal(inside, await realpath(resolve(workspace, "docs")));
  await assert.rejects(
    assertWorkspaceAccess([allowed], workspace, join(workspace, "..", "outside.txt")),
    /outside Desktop workspace/i,
  );
});

test("workspace guard resolves symlinks before authorizing access", async () => {
  const { allowed, workspace } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "iseol-desktop-outside-"));
  await writeFile(join(outside, "secret.txt"), "outside", "utf8");
  const link = join(workspace, "linked-outside");
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(
    assertWorkspaceAccess([allowed], workspace, join(link, "secret.txt")),
    /outside Desktop workspace/i,
  );
});

test("policy verification re-reads local harness sources and rejects drift", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  const pack = policyPack(workspace, harnessPath, [
    { id: "op-1", type: "APPLY_PATCH", path: "README.md", patch: "patch" },
  ]);
  await assert.doesNotReject(verifyDesktopTaskPolicy(pack, [allowed]));
  await writeFile(harnessPath, "# Changed Harness\n", "utf8");
  await assert.rejects(verifyDesktopTaskPolicy(pack, [allowed]), /policy source hash mismatch/i);
});

test("missing required policy source fails closed", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  const pack = policyPack(workspace, harnessPath, [
    { id: "op-1", type: "GIT_COMMIT", cwd: workspace, message: "test: commit" },
  ]);
  await writeFile(harnessPath, "# Changed Harness\n", "utf8");
  pack.policySources![0]!.path = join(workspace, "docs", "MISSING.md");
  await assert.rejects(verifyDesktopTaskPolicy(pack, [allowed]), /required policy source/i);
});

function initGit(workspace: string) {
  execFileSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Iseol Test"], { cwd: workspace });
}

test("structured runtime executes file, process, and bounded output operations in order", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "data.txt"), "hello", "utf8");
  await writeFile(join(workspace, "print.test.js"), "import test from 'node:test';\ntest('print', () => { console.log('abcdefghijklmnopqrstuvwxyz'); });\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [
    { id: "read", type: "READ_FILE", path: "data.txt" },
    { id: "list", type: "LIST_DIRECTORY", path: "." },
    {
      id: "process",
      type: "RUN_PROCESS",
      purpose: "test",
      cwd: ".",
      executable: "node",
      args: ["--test", "print.test.js"],
      timeoutMs: 2_000,
    },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], maxOutputBytes: 20 });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.operations.map((item) => item.operationId), ["read", "list", "process"]);
  assert.equal(result.operations[0]?.stdout, "hello");
  assert.ok((result.operations[2]?.stdout?.length ?? 0) <= 20);
});

test("runtime launches npm through npm_execpath when Node is provided by npx", async (t) => {
  if (process.platform !== "win32" || !process.env.npm_execpath) {
    t.skip("requires the Windows npm launcher");
    return;
  }
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "smoke.test.cjs"), "const { test } = require('node:test'); test('npx npm bridge', () => {});\n", "utf8");
  await writeFile(join(workspace, "package.json"), JSON.stringify({ private: true, scripts: { build: "node --check smoke.test.cjs" } }), "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "build",
    type: "RUN_PROCESS",
    purpose: "build",
    cwd: ".",
    executable: "npm.cmd",
    args: ["run", "build"],
    timeoutMs: 10_000,
  }]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "completed");
  assert.equal(result.operations[0]?.ok, true);
});

test("GIT_INIT prepares an empty workspace and GIT_INSPECT accepts an unborn HEAD", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  const pack = policyPack(workspace, harnessPath, [
    { id: "init", type: "GIT_INIT", cwd: ".", initialBranch: "main" },
    { id: "inspect", type: "GIT_INSPECT", cwd: "." },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], now: () => "2026-09-19T00:00:00.000Z" });
  assert.equal(result.status, "completed");
  assert.equal(result.operations[0]?.ok, true);
  assert.equal(result.operations[1]?.ok, true);
  assert.match(result.operations[1]?.summary ?? "", /unborn HEAD/i);
  const identity = JSON.parse(result.operations[1]?.stdout ?? "{}");
  assert.equal(identity.head, "");
  assert.equal(identity.parent, "");
  assert.equal(identity.subject, "");
  assert.equal(identity.branch, "main");
  assert.equal(identity.initial, true);
  assert.match(identity.status, /docs\//);
});

test("GIT_COMMIT creates the first commit in an initialized workspace", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  execFileSync("git", ["init", "--initial-branch", "main"], { cwd: workspace, stdio: "ignore" });
  const pack = policyPack(workspace, harnessPath, [
    { id: "commit", type: "GIT_COMMIT", cwd: ".", message: "chore: initialize workspace" },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], now: () => "2026-09-19T00:00:00.000Z" });
  assert.equal(result.status, "completed");
  assert.match(result.operations.find((item) => item.operationId === "commit")?.summary ?? "", /Created Git commit/i);
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(), "1");
});

test("GIT_INIT rejects a workspace nested in another repository", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  initGit(allowed);
  const pack = policyPack(workspace, harnessPath, [
    { id: "init", type: "GIT_INIT", cwd: ".", initialBranch: "main" },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], now: () => "2026-09-19T00:00:00.000Z" });
  assert.equal(result.status, "retryable-failure");
  assert.match(result.operations[0]?.summary ?? "", /root does not match/i);
});

test("GIT_INIT fails closed when local Git metadata is corrupt", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  await mkdir(join(workspace, ".git"), { recursive: true });
  const pack = policyPack(workspace, harnessPath, [
    { id: "init", type: "GIT_INIT", cwd: ".", initialBranch: "main" },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], now: () => "2026-09-19T00:00:00.000Z" });
  assert.equal(result.status, "retryable-failure");
  assert.match(result.operations[0]?.summary ?? "", /metadata is invalid/i);
});

test("runtime classifies process timeout as retryable failure", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "slow.test.js"), "import test from 'node:test';\ntest('slow', async () => { await new Promise((resolve) => setTimeout(resolve, 10000)); });\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "slow",
    type: "RUN_PROCESS",
    purpose: "test",
    cwd: ".",
    executable: "node",
    args: ["--test", "slow.test.js"],
    timeoutMs: 50,
  }]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "retryable-failure");
  assert.equal(result.operations[0]?.ok, false);
  assert.match(result.operations[0]?.summary ?? "", /timed out/i);
});

test("runtime applies guarded patch and performs explicit Git inspection and commit", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  initGit(workspace);
  await writeFile(join(workspace, "hello.txt"), "old\n", "utf8");
  execFileSync("git", ["add", "hello.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: workspace, stdio: "ignore" });
  const patch = [
    "--- a/hello.txt",
    "+++ b/hello.txt",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "",
  ].join("\n");
  const pack = policyPack(workspace, harnessPath, [
    { id: "patch", type: "APPLY_PATCH", path: "hello.txt", patch },
    { id: "status", type: "GIT_STATUS", cwd: "." },
    { id: "diff", type: "GIT_DIFF", cwd: "." },
    { id: "branch", type: "GIT_BRANCH", cwd: "." },
    { id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: update hello" },
  ]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "completed");
  assert.equal((await readFile(join(workspace, "hello.txt"), "utf8")).replace(/\r\n/g, "\n"), "new\n");
  assert.match(result.operations.find((item) => item.operationId === "status")?.stdout ?? "", /hello\.txt/);
  assert.match(result.operations.find((item) => item.operationId === "diff")?.stdout ?? "", /\+new/);
  assert.ok((result.operations.find((item) => item.operationId === "branch")?.stdout ?? "").trim().length > 0);
  const count = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  assert.equal(count, "2");
});

test("runtime checks HTTP without exposing a shell command surface", async () => {
  const { allowed, workspace } = await fixture();
  const server = createServer((_req, res) => { res.statusCode = 204; res.end(); });
  await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const pack = policyPack(workspace, join(workspace, "docs", "HARNESS_ENGINEERING.md"), [
      { id: "http", type: "CHECK_HTTP", url: `http://127.0.0.1:${address.port}/health`, timeoutMs: 2_000 },
    ]);
    const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
    assert.equal(result.status, "completed");
    assert.match(result.operations[0]?.summary ?? "", /204/);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("runtime does not follow CHECK_HTTP redirects", async () => {
  const { allowed, workspace } = await fixture();
  let targetHits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.statusCode = 302;
      res.setHeader("location", "/target");
      res.end();
      return;
    }
    if (req.url === "/target") targetHits += 1;
    res.statusCode = 200;
    res.end();
  });
  await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const pack = policyPack(workspace, join(workspace, "docs", "HARNESS_ENGINEERING.md"), [
      { id: "redirect", type: "CHECK_HTTP", url: `http://127.0.0.1:${address.port}/redirect`, timeoutMs: 2_000 },
    ]);
    const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
    assert.equal(result.status, "retryable-failure");
    assert.match(result.operations[0]?.summary ?? "", /302/);
    assert.equal(targetHits, 0);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("Git commit publish pushes the exact commit to the current origin branch", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  initGit(workspace);
  await writeFile(join(workspace, "hello.txt"), "old\n", "utf8");
  execFileSync("git", ["add", "hello.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: workspace, stdio: "ignore" });
  const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  const remote = join(allowed, "remote.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: workspace });
  execFileSync("git", ["switch", "-c", "idea/camp/prod"], { cwd: workspace, stdio: "ignore" });
  await writeFile(join(workspace, "hello.txt"), "new\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: publish prototype", expectedHead, publish: true,
  }]);
  pack.stage = "COMMIT";

  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "completed");
  const local = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  const remoteHead = execFileSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/idea/camp/prod"], { encoding: "utf8" }).trim();
  assert.equal(remoteHead, local);
  assert.equal(result.operations[0]?.reference, local);
});
test("Git commit publish retry reuses the committed HEAD after an initial push failure", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  initGit(workspace);
  await writeFile(join(workspace, "hello.txt"), "old\n", "utf8");
  execFileSync("git", ["add", "hello.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: workspace, stdio: "ignore" });
  const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  const missingRemote = join(allowed, "missing.git");
  execFileSync("git", ["remote", "add", "origin", missingRemote], { cwd: workspace });
  execFileSync("git", ["switch", "-c", "idea/camp/retry"], { cwd: workspace, stdio: "ignore" });
  await writeFile(join(workspace, "hello.txt"), "new\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: publish retry", expectedHead, publish: true,
  }]);
  pack.stage = "COMMIT";

  const first = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(first.status, "retryable-failure");
  const committed = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(), "2");
  const remote = join(allowed, "remote-retry.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  execFileSync("git", ["remote", "set-url", "origin", remote], { cwd: workspace });

  const second = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(second.status, "completed");
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(), "2");
  assert.equal(execFileSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/idea/camp/retry"], { encoding: "utf8" }).trim(), committed);
});

test("policy read roots do not expand writable workspace roots", async () => {
  const { allowed, workspace } = await fixture();
  const policyRoot = await mkdtemp(join(tmpdir(), "iseol-desktop-policy-"));
  const policyPath = join(policyRoot, "HARNESS_ENGINEERING.md");
  const policyText = "# External Policy\n";
  await writeFile(policyPath, policyText, "utf8");
  const sources: DesktopPolicySource[] = [{
    kind: "iseol-global", path: policyPath, sha256: sha(policyText), required: true,
  }];
  await writeFile(join(workspace, "noop.test.js"), "import test from 'node:test';\ntest('noop', () => {});\n", "utf8");
  const pack = policyPack(workspace, policyPath, [{
    id: "process", type: "RUN_PROCESS", purpose: "test", cwd: ".",
    executable: "node", args: ["--test", "noop.test.js"], timeoutMs: 2_000,
  }]);
  pack.policySources = sources;
  pack.policyDigest = effective(sources);

  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed], policyRoots: [policyRoot] });
  assert.equal(result.status, "completed");
  await assert.rejects(
    assertWorkspaceAccess([allowed], workspace, policyRoot),
    /outside Desktop workspace|outside Desktop Agent allowed roots/i,
  );
});


test("Windows runtime executes bounded npm test without opening a shell", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows-specific npm shim behavior");
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "package.json"), JSON.stringify({ scripts: { test: "node --test noop.test.js" } }), "utf8");
  await writeFile(join(workspace, "noop.test.js"), "import test from 'node:test';\ntest('noop', () => {});\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "npm-test", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "npm", args: ["test"], timeoutMs: 15_000,
  }]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "completed");
  assert.match(result.operations[0]?.stdout ?? "", /pass|ok 1/i);
});

test("Windows runtime executes bounded npm.cmd test without opening a shell", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows-specific npm shim behavior");
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "package.json"), JSON.stringify({ scripts: { test: "node --test noop.test.js" } }), "utf8");
  await writeFile(join(workspace, "noop.test.js"), "import test from 'node:test';\ntest('noop', () => {});\n", "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "npm-cmd-test", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "npm.cmd", args: ["test"], timeoutMs: 15_000,
  }]);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
  assert.equal(result.status, "completed");
  assert.match(result.operations[0]?.stdout ?? "", /pass|ok 1/i);
});

test("runtime isolates child secrets, profile paths, PATH, and owned temp lifecycle", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  await writeFile(join(workspace, "env.test.js"), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "test('isolated env', () => {",
    "  assert.equal(process.env.DISCORD_TOKEN, undefined);",
    "  assert.equal(process.env.GITHUB_TOKEN, undefined);",
    "  assert.equal(process.env.ISEOL_DESKTOP_AGENT_TOKEN, undefined);",
    "  assert.match(process.env.USERPROFILE ?? '', /\\.iseol[\\\\/]jobs[\\\\/][0-9a-f]{24}$/i);",
    "  assert.match(process.env.TEMP ?? '', /\\.iseol[\\\\/]jobs[\\\\/][0-9a-f]{24}[\\\\/]temp$/i);",
    "  assert.doesNotMatch(process.env.PATH ?? '', /C:\\\\Users\\\\user/i);",
    "});",
  ].join("\n"), "utf8");
  const pack = policyPack(workspace, harnessPath, [{
    id: "env", type: "RUN_PROCESS", purpose: "test", cwd: ".",
    executable: "node", args: ["--test", "env.test.js"], timeoutMs: 5_000,
  }]);
  const jobTemp = processJobTempRoot(workspace, pack.jobId);
  const result = await executeDesktopTaskPack(pack, {
    allowedRoots: [allowed],
    processEnv: {
      Path: "C:\\Program Files\\nodejs;C:\\Users\\user\\AppData\\Roaming\\npm;C:\\Windows\\System32",
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      SystemRoot: "C:\\Windows",
      USERPROFILE: "C:\\Users\\user",
      APPDATA: "C:\\Users\\user\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local",
      TEMP: "C:\\Users\\user\\AppData\\Local\\Temp",
      DISCORD_TOKEN: "discord-secret", GITHUB_TOKEN: "github-secret", ISEOL_DESKTOP_AGENT_TOKEN: "agent-secret",
    },
  });
  assert.equal(result.status, "completed");
  await assert.rejects(access(jobTemp), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
});

test("Git commit ignores repository hooks and does not expose Agent secrets", async () => {
  const { allowed, workspace, harnessPath } = await fixture();
  initGit(workspace);
  await writeFile(join(workspace, "hello.txt"), "old\n", "utf8");
  execFileSync("git", ["add", "hello.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: workspace, stdio: "ignore" });
  await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
  await writeFile(join(workspace, ".git", "hooks", "pre-commit"), [
    "#!/bin/sh",
    "echo $ISEOL_DESKTOP_AGENT_TOKEN > hook-secret.txt",
    "exit 91",
  ].join("\n"), "utf8");
  await writeFile(join(workspace, "hello.txt"), "new\n", "utf8");
  const previous = process.env.ISEOL_DESKTOP_AGENT_TOKEN;
  process.env.ISEOL_DESKTOP_AGENT_TOKEN = "must-not-leak";
  try {
    const pack = policyPack(workspace, harnessPath, [{
      id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: safe commit",
    }]);
    pack.stage = "COMMIT";
    const result = await executeDesktopTaskPack(pack, { allowedRoots: [allowed] });
    assert.equal(result.status, "completed");
    await assert.rejects(access(join(workspace, "hook-secret.txt")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  } finally {
    if (previous === undefined) delete process.env.ISEOL_DESKTOP_AGENT_TOKEN;
    else process.env.ISEOL_DESKTOP_AGENT_TOKEN = previous;
  }
});


test("Git safe-directory config trusts only exact bounded paths", async () => {
  const runtime = await import("../src/desktop-agent/runtime.js") as Record<string, unknown>;
  const buildArgs = runtime.gitSafeDirectoryConfig;
  assert.equal(typeof buildArgs, "function");
  const root = resolve("C:/ProgramData/Iseol/workspace");
  const repo = resolve(root, "source");
  const args = (buildArgs as (workspace: string, cwd: string) => string[])(root, repo);
  const gitRoot = root.replaceAll("\\", "/");
  const gitRepo = repo.replaceAll("\\", "/");
  assert.deepEqual(args, [
    "-c", `safe.directory=${gitRoot}`,
    "-c", `safe.directory=${gitRepo}`,
  ]);
  assert.equal(args.some((arg) => arg === "safe.directory=*"), false);
  assert.deepEqual(
    (buildArgs as (workspace: string, cwd: string) => string[])(repo, repo),
    ["-c", `safe.directory=${gitRepo}`],
  );
});
