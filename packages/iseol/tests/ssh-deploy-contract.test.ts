import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(".github/workflows/deploy-ssh.yml", "utf8");
const remoteScript = readFileSync("scripts/ssh-remote-deploy.sh", "utf8");
const ecosystem = readFileSync("ecosystem.config.cjs", "utf8");

test("SSH deployment workflow is manually gated and uses pinned host keys", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /DEPLOY_SSH_PRIVATE_KEY/);
  assert.match(workflow, /DEPLOY_KNOWN_HOSTS/);
  assert.match(workflow, /smoke:production-bootstrap/);
  assert.doesNotMatch(workflow, /docker build/);
});

test("SSH deployment preserves releases and runs a remote health check", () => {
  assert.match(remoteScript, /releases\/\$\{release_id\}/);
  assert.match(remoteScript, /npm ci --omit=optional/);
  assert.match(remoteScript, /pm2 startOrReload/);
  assert.match(remoteScript, /\/healthz/);
  assert.match(remoteScript, /current_link/);
  assert.match(remoteScript, /ln -s \"\$\{deploy_root\}\/\.env\"/);
});

test("PM2 defines the web runtime separately from the Discord bot", () => {
  assert.match(ecosystem, /name: "iseol-bot"/);
  assert.match(ecosystem, /name: "iseol-web"/);
  assert.match(ecosystem, /scripts\/iseol-runtime-host\.ts start/);
  assert.equal(existsSync("scripts/ssh-remote-deploy.sh"), true);
});
