import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("failed to allocate a local smoke-test port")));
        return;
      }
      const port = address.port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(url, child, output) {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`runtime exited before ${url} became ready (${child.exitCode}): ${output.join("").slice(-2_000)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}: ${lastError}`);
}

const root = await mkdtemp(join(tmpdir(), "npc-production-bootstrap-"));
const port = await freePort();
const dataRoot = join(root, "data");
const configPath = join(root, "iseol-runtime.json");
await mkdir(dataRoot, { recursive: true });
await writeFile(configPath, JSON.stringify({
  version: 1,
  dataRoot,
  modelRoot: join(dataRoot, "iseol"),
  runRoot: join(dataRoot, "runs"),
  webWorkerRoot: join(dataRoot, "web-workers"),
  browserProfileRoot: join(dataRoot, "browser-profile"),
  lockPath: join(dataRoot, "runtime", "iseol-runtime.lock"),
}));

const output = [];
const child = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-runtime-host.ts", "start"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ISEOL_RUNTIME_CONFIG: configPath,
    ISEOL_WEB_HOST: "127.0.0.1",
    ISEOL_WEB_PORT: String(port),
    ISEOL_IDEA_LAB_RUNTIME_ENABLED: "false",
    ISEOL_PROJECT_RUNTIME_ENABLED: "false",
    DISCORD_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => output.push(chunk));
child.stderr.on("data", (chunk) => output.push(chunk));

try {
  const base = `http://127.0.0.1:${port}`;
  const health = await waitFor(`${base}/healthz`, child, output);
  const healthBody = await health.json();
  if (healthBody?.live !== true) throw new Error("/healthz did not report live=true");
  const ready = await waitFor(`${base}/readyz`, child, output);
  const readyBody = await ready.json();
  if (readyBody?.ready !== true) throw new Error("/readyz did not report ready=true");
  const legacy = await waitFor(`${base}/health`, child, output);
  const legacyBody = await legacy.json();
  if (legacyBody?.status !== "ok") throw new Error("/health compatibility response was not ok");
  process.stdout.write(JSON.stringify({ status: "passed", endpoints: ["/healthz", "/readyz", "/health"] }) + "\n");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGINT");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
  await rm(root, { recursive: true, force: true });
}
