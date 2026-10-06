import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredFiles = ["LICENSE", "README.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", ".env.example", "Dockerfile", "docker-compose.example.yml", "iseol-runtime.example.json"];
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length) throw new Error(`missing release files: ${missing.join(", ")}`);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (packageJson.private === true) throw new Error("package must not be private for an open source release");
if (packageJson.license !== "AGPL-3.0-only") throw new Error("package license must be AGPL-3.0-only");

const trackedResult = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (trackedResult.status !== 0) throw new Error("could not inspect tracked files");
const tracked = trackedResult.stdout.split("\0").filter(Boolean);
const forbiddenTracked = tracked.filter((file) => /(^|\/)\.env$|\.pem$|id_rsa|credentials\.json$/i.test(file));
if (forbiddenTracked.length) throw new Error(`forbidden tracked secret files: ${forbiddenTracked.join(", ")}`);

const secretAssignment = /(?:DISCORD_TOKEN|GITHUB_TOKEN|FIGMA_TOKEN|NOTION_TOKEN|GEMINI_API_KEY|ISEOL_\w*(?:TOKEN|SECRET|PASSWORD))\s*=\s*(?!$)(?!#)/i;
for (const file of tracked) {
  const text = await readFile(file, "utf8").catch(() => "");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{30,}/.test(text)) {
    throw new Error(`credential-shaped value found in tracked file: ${file}`);
  }
  if (file === ".env.example" && text.split(/\r?\n/).some((line) => secretAssignment.test(line))) {
    throw new Error(`non-empty credential example found: ${file}`);
  }
}

for (const root of ["src", "user-ui/src"]) {
  const implementationFiles = tracked.filter((file) => file.startsWith(`${root}/`) && /\.(ts|tsx|js|jsx)$/.test(file));
  for (const file of implementationFiles) {
    const text = await readFile(file, "utf8");
    if (/BroadcastRoom|broadcast[-_]room|broadcastRoom/i.test(text)) throw new Error(`excluded Broadcast Room implementation found: ${file}`);
  }
}

console.log(`release readiness passed: ${requiredFiles.length} required files, ${tracked.length} tracked files inspected, Broadcast Room implementation absent`);
