import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const composeFile = "docker-compose.example.yml";
const projectName = `npc-release-${process.pid}`;
const compose = ["compose", "--project-name", projectName, "--file", composeFile];
const envPath = ".env";
const hadEnv = existsSync(envPath);

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker command failed with exit code ${result.status}: docker ${args.join(" ")}`);
  return result;
}

function outputDocker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker command failed with exit code ${result.status}: docker ${args.join(" ")}`);
  return result.stdout.trim();
}

async function waitForHealthy(containerId) {
  const deadline = Date.now() + 120_000;
  let status = "starting";
  while (Date.now() < deadline) {
    status = outputDocker(["inspect", "--format", "{{.State.Health.Status}}", containerId]);
    if (status === "healthy") return;
    if (status === "unhealthy") throw new Error(`NPC container became unhealthy: ${containerId}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for NPC container health (last status: ${status})`);
}

let createdEnv = false;
try {
  if (!hadEnv) {
    await writeFile(envPath, "", "utf8");
    createdEnv = true;
  }
  runDocker([...compose, "up", "--build", "--detach"]);
  const containerId = outputDocker([...compose, "ps", "--quiet", "npc"]);
  if (!containerId) throw new Error("docker compose did not return the NPC container id");
  await waitForHealthy(containerId);
  console.log(`docker release smoke passed: ${containerId} is healthy`);
} finally {
  try {
    runDocker([...compose, "down", "--volumes", "--remove-orphans"]);
  } catch (error) {
    console.error(`docker release smoke cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (createdEnv) await unlink(envPath).catch(() => undefined);
}
