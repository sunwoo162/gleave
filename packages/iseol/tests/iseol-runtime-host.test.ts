import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireRuntimeLock, acquireRuntimeMaintenanceLock, acquireRuntimeRecoveryLock, createRuntimeShutdownServer, inspectRuntimeLock, loadRuntimeHostConfig, normalizeRuntimeLockRecoveryInput, parseRuntimeHostStdin, recoverStaleRuntimeLock, recoverStaleRuntimeLockAndContainRuntimeMaintenanceJobs, recoverStaleRuntimeLockOnly, requestControlledRuntimeStop, requestRuntimeStop, requestRuntimeShutdown, resolveConfiguredRuntimeDesktopAgentPort, resolveConfiguredRuntimeOperatorId, resolveRuntimeCodeVersion, runRuntimeStopLifecycle, runtimeRecoveryLockPath, runtimeShutdownEndpoint, runtimeStopSignal, saveRuntimeHostConfig } from "../scripts/iseol-runtime-host.js";
import { approveAndContainRuntimeMaintenanceJob, approveAndContainRuntimeMaintenanceJobs, containRuntimeMaintenanceJob } from "../scripts/iseol-runtime-host.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { createDesktopJob, desktopJobRevision, loadDesktopJob, loadDesktopJobContainment } from "../src/desktop-agent/job-store.js";
import { issueDesktopJobContainmentApproval } from "../src/desktop-agent/operator-reconciliation.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";

test("runtime host parses redirected stdin without treating descriptor zero as a filesystem path", () => {
  assert.deepEqual(parseRuntimeHostStdin<{ operatorId: string }>(JSON.stringify({ operatorId: "operator-1" })), { operatorId: "operator-1" });
  assert.deepEqual(parseRuntimeHostStdin<{ operatorId: string }>(`\uFEFF${JSON.stringify({ operatorId: "operator-1" })}`), { operatorId: "operator-1" });
});

test("stored protected credential identity takes precedence over a stale environment operator id", () => {
  assert.equal(resolveConfiguredRuntimeOperatorId("sunwoo", "user"), "sunwoo");
  assert.equal(resolveConfiguredRuntimeOperatorId(undefined, "user"), "user");
});

test("controlled stop requires the explicitly configured Desktop Core port", () => {
  assert.equal(resolveConfiguredRuntimeDesktopAgentPort("18891"), 18891);
  assert.equal(resolveConfiguredRuntimeDesktopAgentPort(" 8791 "), 8791);
  assert.equal(resolveConfiguredRuntimeDesktopAgentPort(""), undefined);
  assert.throws(() => resolveConfiguredRuntimeDesktopAgentPort("0"), /port/i);
  assert.throws(() => resolveConfiguredRuntimeDesktopAgentPort("not-a-port"), /port/i);
});

test("lock-only recovery maps the CLI recoveryConfirmation field to the recovery contract", () => {
  assert.deepEqual(normalizeRuntimeLockRecoveryInput({
    expectedFingerprint: "fingerprint",
    recoveryConfirmation: "I approve stale Runtime lock recovery for fingerprint",
    legacyOwnerConfirmation: "owner-confirmation",
  }), {
    expectedFingerprint: "fingerprint",
    confirmation: "I approve stale Runtime lock recovery for fingerprint",
    legacyOwnerConfirmation: "owner-confirmation",
  });
});

test("runtime host loads explicit roots and derives a durable lock path", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-"));
  const file = join(root, "runtime.json");
  await writeFile(file, JSON.stringify({ dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile") }));
  const config = loadRuntimeHostConfig(file);
  assert.equal(config.dataRoot, root);
  assert.equal(config.lockPath, join(root, "runtime", "iseol-runtime.lock"));
  assert.equal(config.version, 1);
});

test("runtime stop uses a catchable signal on Windows and SIGTERM elsewhere", () => {
  assert.equal(runtimeStopSignal("win32"), "SIGINT");
  assert.equal(runtimeStopSignal("linux"), "SIGTERM");
});

test("runtime shutdown control returns the final stopped result over its local endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-shutdown-channel-"));
  const lockPath = join(root, "runtime.lock");
  const endpoint = runtimeShutdownEndpoint(lockPath);
  let calls = 0;
  const server = await createRuntimeShutdownServer(endpoint, async (request) => {
    calls += 1;
    assert.equal(request.expectedPid, 4242);
    assert.equal(request.expectedFingerprint, "fingerprint");
    assert.equal(request.expectedOwnerIdentity, "owner");
    return { status: "stopped", pid: 4242 };
  });
  try {
    const result = await requestRuntimeShutdown(endpoint, {
      expectedPid: 4242,
      expectedFingerprint: "fingerprint",
      expectedOwnerIdentity: "owner",
      operatorId: "operator",
      requestId: "request-1",
    });
    assert.deepEqual(result, { status: "stopped", pid: 4242 });
    assert.equal(calls, 1);
  } finally {
    await server.close();
  }
});

test("runtime shutdown control serializes duplicate requests without a second dispose", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-shutdown-duplicate-"));
  const endpoint = runtimeShutdownEndpoint(join(root, "runtime.lock"));
  let handlerCalls = 0;
  let disposeCalls = 0;
  let stopPromise: Promise<{ status: "stopped"; pid: number }> | undefined;
  let resolveStop!: () => void;
  const stopping = new Promise<void>((resolve) => { resolveStop = resolve; });
  const server = await createRuntimeShutdownServer(endpoint, async () => {
    handlerCalls += 1;
    if (!stopPromise) {
      disposeCalls += 1;
      stopPromise = stopping.then(() => ({ status: "stopped" as const, pid: 4242 }));
    }
    return stopPromise;
  });
  try {
    const first = requestRuntimeShutdown(endpoint, { expectedPid: 4242, expectedFingerprint: "f", expectedOwnerIdentity: "o", operatorId: "operator", requestId: "request-1" });
    const second = requestRuntimeShutdown(endpoint, { expectedPid: 4242, expectedFingerprint: "f", expectedOwnerIdentity: "o", operatorId: "operator", requestId: "request-2" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(handlerCalls, 2);
    assert.equal(disposeCalls, 1);
    resolveStop();
    assert.deepEqual(await first, { status: "stopped", pid: 4242 });
    assert.deepEqual(await second, { status: "stopped", pid: 4242 });
  } finally {
    await server.close();
  }
});

test("runtime shutdown control reports disposal failure without claiming stopped", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-shutdown-failure-"));
  const endpoint = runtimeShutdownEndpoint(join(root, "runtime.lock"));
  const server = await createRuntimeShutdownServer(endpoint, async () => ({ status: "stop-failed", pid: 4242, reason: "dispose failed" }));
  try {
    const result = await requestRuntimeShutdown(endpoint, { expectedPid: 4242, expectedFingerprint: "f", expectedOwnerIdentity: "o", operatorId: "operator", requestId: "request-1" });
    assert.deepEqual(result, { status: "stop-failed", pid: 4242, reason: "dispose failed" });
  } finally {
    await server.close();
  }
});

test("runtime shutdown control failure does not fall back to a process signal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-shutdown-unavailable-"));
  const endpoint = runtimeShutdownEndpoint(join(root, "runtime.lock"));
  await assert.rejects(requestRuntimeShutdown(endpoint, { expectedPid: 4242, expectedFingerprint: "f", expectedOwnerIdentity: "o", operatorId: "operator", requestId: "request-1" }));
});

test("runtime stop lifecycle preserves the lock when disposal fails", async () => {
  let releases = 0;
  const result = await runRuntimeStopLifecycle({
    pid: 4242,
    dispose: async () => { throw new Error("dispose failed"); },
    release: async () => { releases += 1; },
  });
  assert.deepEqual(result, { status: "stop-failed", pid: 4242, reason: "dispose failed" });
  assert.equal(releases, 0);
});

test("runtime stop lifecycle reports lock release failure without claiming stopped", async () => {
  const result = await runRuntimeStopLifecycle({
    pid: 4242,
    dispose: async () => undefined,
    release: async () => { throw new Error("release failed"); },
  });
  assert.deepEqual(result, { status: "stop-failed", pid: 4242, reason: "release failed" });
});

test("runtime code version prefers the checked-out Git HEAD over stale configured metadata", async () => {
  const resolved = await resolveRuntimeCodeVersion({ codeVersion: "legacy-configured-version" });
  assert.equal(resolved.source, "git-head");
  assert.match(resolved.codeVersion, /^[0-9a-f]{7,64}$/i);
  assert.notEqual(resolved.codeVersion, "legacy-configured-version");
});

test("runtime host persists bounded lifecycle metadata atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-config-"));
  const file = join(root, "runtime.json");
  await saveRuntimeHostConfig(file, {
    dataRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webWorkerRoot: join(root, "workers"),
    browserProfileRoot: join(root, "profile"),
    lockPath: join(root, "runtime", "lock"),
    codeVersion: "abc123",
    projectRuntimeEnabled: true,
    desktopAgentId: "agent-project",
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "project-desktop"),
  });
  const saved = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  assert.equal(saved.version, 1);
  assert.equal(saved.codeVersion, "abc123");
  assert.equal(saved.projectRuntimeEnabled, true);
  assert.equal(saved.desktopAgentId, "agent-project");
  assert.equal(saved.projectRunRoot, join(root, "project-runs"));
  assert.equal("token" in saved, false);
  assert.equal(loadRuntimeHostConfig(file).projectRuntimeEnabled, true);
  assert.equal(loadRuntimeHostConfig(file).projectDesktopStateRoot, join(root, "project-desktop"));
});

test("runtime host rejects invalid project lifecycle metadata before startup", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-invalid-"));
  const file = join(root, "runtime.json");
  await writeFile(file, JSON.stringify({ dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), projectRuntimeEnabled: "yes" }));
  assert.throws(() => loadRuntimeHostConfig(file), /projectRuntimeEnabled/);
});

test("runtime host rejects project roots that overlap Idea Lab roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-overlap-"));
  const file = join(root, "runtime.json");
  await writeFile(file, JSON.stringify({
    dataRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webWorkerRoot: join(root, "workers"),
    browserProfileRoot: join(root, "profile"),
    projectModelRoot: join(root, "model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "project-desktop"),
  }));
  assert.throws(() => loadRuntimeHostConfig(file), /project.*overlap/i);
});

test("runtime host lock prevents concurrent ownership and releases cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-lock-"));
  const path = join(root, "runtime.lock");
  const release = await acquireRuntimeLock(path);
  await assert.rejects(acquireRuntimeLock(path), /already owns/);
  await release();
  const releaseAgain = await acquireRuntimeLock(path);
  await releaseAgain();
});

test("runtime host refuses implicit stale lock takeover and requires explicit recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-stale-"));
  const path = join(root, "runtime.lock");
  await writeFile(path, JSON.stringify({ version: 1, pid: 999999, startedAt: "2026-01-01T00:00:00.000Z" }));
  await assert.rejects(acquireRuntimeLock(path), /explicit operator recovery/i);
  assert.equal(JSON.parse(await readFile(path, "utf8")).pid, 999999);
});

test("stale lock startup diagnostics identify the exact lock and recovery fingerprint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-stale-diagnostic-"));
  const path = join(root, "runtime.lock");
  const raw = JSON.stringify({ version: 1, pid: 999999, startedAt: "2026-01-01T00:00:00.000Z" });
  await writeFile(path, raw);
  await assert.rejects(
    acquireRuntimeLock(path),
    (error: unknown) => {
      assert.match(String(error), /stale Runtime lock requires explicit operator recovery/);
      assert.match(String(error), new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(String(error), /fingerprint:/i);
      return true;
    },
  );
});

test("runtime lock inspection distinguishes verified owner, stale identity, and legacy owner uncertainty", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-inspect-"));
  const path = join(root, "runtime.lock");
  await writeFile(path, JSON.stringify({ version: 1, pid: 42, ownerIdentity: "owner-a", startedAt: "2026-01-01T00:00:00.000Z" }));
  const stale = await inspectRuntimeLock(path, async () => ({ state: "absent" as const }));
  assert.equal(stale.state, "stale");
  assert.equal(stale.identity.ownerIdentity, "owner-a");
  await writeFile(path, JSON.stringify({ version: 1, pid: 42, startedAt: "2026-01-01T00:00:00.000Z" }));
  const legacy = await inspectRuntimeLock(path, async () => ({ state: "absent" as const }));
  assert.equal(legacy.state, "owner-unconfirmed");
});

test("legacy owner identity mismatch remains unconfirmed instead of becoming owner-reused", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-owner-compat-"));
  const path = join(root, "runtime.lock");
  await writeFile(path, JSON.stringify({ version: 1, pid: 42, ownerIdentity: "legacy-owner", ownerExecutable: "node.exe", ownerCommandLine: "legacy command", startedAt: "2026-01-01T00:00:00.000Z" }));
  const inspection = await inspectRuntimeLock(path, async () => ({ state: "unavailable" as const, identity: "different-process" }));
  assert.equal(inspection.state, "owner-unconfirmed");
  assert.equal(inspection.owner.state, "unavailable");
});

test("stop refuses to signal an unverified or reused owner and preserves its lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-stop-guard-"));
  const path = join(root, "runtime.lock");
  await writeFile(path, JSON.stringify({ version: 1, pid: 999999, ownerIdentity: "unknown-owner", startedAt: "2026-01-01T00:00:00.000Z" }));
  await assert.rejects(requestRuntimeStop({ lockPath: path }), /verified running owner/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).pid, 999999);
});

test("controlled external stop verifies the exact PID identity and sends only the target signal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-controlled-stop-"));
  const lockPath = join(root, "runtime.lock");
  const createdAt = "2026-01-01T00:00:00.000Z";
  const commandLine = "C:\\Program Files\\nodejs\\node.exe scripts\\iseol-runtime-host.ts start";
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 4242, dataRoot: root, ownerExecutable: "C:\\Program Files\\nodejs\\node.exe", ownerCommandLine: commandLine, startedAt: createdAt }));
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "unavailable" as const }));
  const signals: Array<{ pid: number; signal: string }> = [];
  const result = await requestControlledRuntimeStop({ lockPath, dataRoot: root }, {
    expectedPid: 4242, expectedCreatedAt: createdAt, expectedExecutable: "C:\\Program Files\\nodejs\\node.exe", expectedCommandLine: commandLine,
    expectedFingerprint: inspection.fingerprint, operatorId: "sunwoo", operatorCredentialVerified: true,
    desktopAgentPort: 18891,
    confirmation: `I approve controlled external termination of Runtime pid 4242 createdAt ${createdAt} fingerprint ${inspection.fingerprint}`,
    readProcess: async () => ({ executable: "C:\\Program Files\\nodejs\\node.exe", commandLine, createdAt }),
    readPortOwner: async (port) => { assert.equal(port, 18891); return 4242; },
    terminate: (pid) => signals.push({ pid, signal: "SIGTERM" }),
  });
  assert.deepEqual(result, { status: "stop-requested", pid: 4242, signal: "SIGTERM" });
  assert.deepEqual(signals, [{ pid: 4242, signal: "SIGTERM" }]);
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).pid, 4242);
});

test("controlled external stop fails closed on PID reuse, changed identity, active lease, or stale fingerprint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-controlled-stop-guard-"));
  const lockPath = join(root, "runtime.lock");
  const createdAt = "2026-01-01T00:00:00.000Z";
  const commandLine = "node scripts/iseol-runtime-host.ts start";
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 4242, dataRoot: root, ownerExecutable: "node.exe", ownerCommandLine: commandLine, startedAt: createdAt }));
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "unavailable" as const }));
  const base = {
    expectedPid: 4242, expectedCreatedAt: createdAt, expectedExecutable: "node.exe", expectedCommandLine: commandLine,
    expectedFingerprint: inspection.fingerprint, operatorId: "sunwoo", operatorCredentialVerified: true,
    desktopAgentPort: 18891,
    confirmation: `I approve controlled external termination of Runtime pid 4242 createdAt ${createdAt} fingerprint ${inspection.fingerprint}`,
    readPortOwner: async () => 4242,
    terminate: () => { throw new Error("must not terminate"); },
  } as const;
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root }, { ...base, readProcess: async () => ({ executable: "node.exe", commandLine, createdAt: "2026-01-01T00:00:01.000Z" }) }), /identity changed/i);
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root }, { ...base, readProcess: async () => null }), /process identity unavailable/i);
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root }, { ...base, readPortOwner: async () => 9999, readProcess: async () => ({ executable: "node.exe", commandLine, createdAt }) }), /listener ownership mismatch/i);
  const desktopRoot = join(root, "desktop");
  await mkdir(join(desktopRoot, "jobs", "active"), { recursive: true });
  await writeFile(join(desktopRoot, "jobs", "active", "job.json"), JSON.stringify({ status: "leased", jobId: "active", lease: { expiresAt: "2099-01-01T00:00:00.000Z" } }));
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root, projectDesktopStateRoot: desktopRoot }, { ...base, readProcess: async () => ({ executable: "node.exe", commandLine, createdAt }) }), /active Desktop mutation or lease/i);
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 4242, dataRoot: root, ownerExecutable: "node.exe", ownerCommandLine: commandLine, startedAt: createdAt, leaseMarker: "changed" }));
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root }, { ...base, readProcess: async () => ({ executable: "node.exe", commandLine, createdAt }) }), /fingerprint mismatch/i);
});

test("controlled stop refuses an unconfigured Desktop Core port without signaling", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-controlled-stop-port-"));
  const lockPath = join(root, "runtime.lock");
  const createdAt = "2026-01-01T00:00:00.000Z";
  const commandLine = "node scripts/iseol-runtime-host.ts start";
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 4242, dataRoot: root, ownerExecutable: "node.exe", ownerCommandLine: commandLine, startedAt: createdAt }));
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "unavailable" as const }));
  let terminated = false;
  await assert.rejects(requestControlledRuntimeStop({ lockPath, dataRoot: root }, {
    expectedPid: 4242, expectedCreatedAt: createdAt, expectedExecutable: "node.exe", expectedCommandLine: commandLine,
    expectedFingerprint: inspection.fingerprint, operatorId: "sunwoo", operatorCredentialVerified: true,
    confirmation: `I approve controlled external termination of Runtime pid 4242 createdAt ${createdAt} fingerprint ${inspection.fingerprint}`,
    readProcess: async () => ({ executable: "node.exe", commandLine, createdAt }),
    terminate: () => { terminated = true; },
  }), /Desktop Agent port is not configured/i);
  assert.equal(terminated, false);
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).pid, 4242);
});

test("stale lock recovery requires the exact fingerprint, operator approval, and recovery ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-recovery-"));
  const lockPath = join(root, "runtime.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 42, ownerIdentity: "owner-a", startedAt: "2026-01-01T00:00:00.000Z" }));
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }));
  const config = { version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath };
  const rejected = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: "wrong", operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`, at: "2026-01-01T01:00:00.000Z",
    probe: async () => ({ state: "absent" as const }),
  });
  assert.equal(rejected.status, "rejected");
  const recovered = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: inspection.fingerprint, operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`, at: "2026-01-01T01:00:00.000Z",
    probe: async () => ({ state: "absent" as const }),
  });
  assert.equal(recovered.status, "recovered");
  assert.equal((await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }))).state, "stopped");
  await assert.rejects(acquireRuntimeLock(lockPath), /maintenance.*active/i);
  await recovered.releaseMaintenance();
});

test("stale recovery fails closed when the owner identity cannot be verified or the lock changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-recovery-guard-"));
  const lockPath = join(root, "runtime.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 42, ownerIdentity: "owner-a", startedAt: "2026-01-01T00:00:00.000Z" }));
  const config = { version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath };
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "unavailable" as const }));
  assert.equal(inspection.state, "owner-unconfirmed");
  const denied = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: inspection.fingerprint, operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`, at: "2026-01-01T01:00:00.000Z",
    probe: async () => ({ state: "unavailable" as const }),
  });
  assert.equal(denied.status, "rejected");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 43, ownerIdentity: "owner-b", startedAt: "2026-01-01T00:00:00.000Z" }));
  const changed = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: inspection.fingerprint, operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`, at: "2026-01-01T01:00:00.000Z",
    probe: async () => ({ state: "absent" as const }),
  });
  assert.equal(changed.status, "rejected");
});

test("legacy lock recovery requires a separate exact owner-exit confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-legacy-recovery-"));
  const lockPath = join(root, "runtime.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 42, startedAt: "2026-01-01T00:00:00.000Z" }));
  const config = { version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath };
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }));
  const result = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: inspection.fingerprint, operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`,
    legacyOwnerConfirmation: `I confirm external owner inspection for Runtime lock ${inspection.fingerprint} pid 42`,
    at: "2026-01-01T01:00:00.000Z", probe: async () => ({ state: "absent" as const }),
  });
  assert.equal(result.status, "recovered");
  await result.releaseMaintenance();
});

test("recovery ownership blocks Runtime startup and maintenance ownership in both directions", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-recovery-race-"));
  const runtimePath = join(root, "runtime.lock");
  const recoveryPath = runtimeRecoveryLockPath(runtimePath);
  const recoveryRelease = await acquireRuntimeRecoveryLock(runtimePath, recoveryPath);
  await assert.rejects(acquireRuntimeLock(runtimePath), /recovery ownership/i);
  await assert.rejects(acquireRuntimeMaintenanceLock(runtimePath), /recovery ownership/i);
  await recoveryRelease();
  const maintenanceRelease = await acquireRuntimeMaintenanceLock(runtimePath);
  await assert.rejects(acquireRuntimeRecoveryLock(runtimePath, recoveryPath), /maintenance ownership/i);
  await maintenanceRelease();
});

test("stale recovery and maintenance handoff are one ownership transaction", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-recovery-handoff-"));
  const lockPath = join(root, "runtime.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 42, ownerIdentity: "owner-a", startedAt: "2026-01-01T00:00:00.000Z" }));
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }));
  const config = { version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath, projectRunRoot: join(root, "project-runs"), projectDesktopStateRoot: join(root, "project-desktop") };
  const result = await recoverStaleRuntimeLockAndContainRuntimeMaintenanceJobs(config, {
    expectedFingerprint: inspection.fingerprint,
    recoveryConfirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`,
    operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator", at: "2026-01-01T01:00:00.000Z",
    jobs: [], probe: async () => ({ state: "absent" as const }),
  });
  assert.equal(result.recovery, "recovered");
  assert.equal(result.maintenance?.status, "rejected");
  assert.equal((await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }))).state, "stopped");
  assert.equal((await readFile(join(root, "iseol-maintenance.lock"), "utf8").catch(() => null)), null);
});

test("lock-only recovery removes the exact stale lock without touching maintenance jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-lock-only-recovery-"));
  const lockPath = join(root, "runtime.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 42, startedAt: "2026-01-01T00:00:00.000Z" }));
  const config = { version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"), webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath };
  const inspection = await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }));
  const result = await recoverStaleRuntimeLockOnly(config, {
    expectedFingerprint: inspection.fingerprint,
    operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator",
    confirmation: `I approve stale Runtime lock recovery for ${inspection.fingerprint}`,
    legacyOwnerConfirmation: `I confirm external owner inspection for Runtime lock ${inspection.fingerprint} pid 42`,
    at: "2026-01-01T01:00:00.000Z",
    probe: async () => ({ state: "absent" as const }),
  });
  assert.deepEqual(result, { status: "recovered" });
  assert.equal((await inspectRuntimeLock(lockPath, async () => ({ state: "absent" as const }))).state, "stopped");
  assert.equal(await readFile(join(root, "iseol-maintenance.lock"), "utf8").catch(() => null), null);
  assert.equal(await readFile(join(root, "iseol-recovery.lock"), "utf8").catch(() => null), null);
});

test("maintenance ownership cannot overlap a live Runtime and blocks Runtime takeover", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-maintenance-"));
  const runtimePath = join(root, "runtime.lock");
  const maintenancePath = join(root, "iseol-maintenance.lock");
  const runtimeRelease = await acquireRuntimeLock(runtimePath);
  await assert.rejects(acquireRuntimeMaintenanceLock(runtimePath, maintenancePath), /runtime.*active/i);
  await runtimeRelease();
  const maintenanceRelease = await acquireRuntimeMaintenanceLock(runtimePath, maintenancePath);
  await assert.rejects(acquireRuntimeLock(runtimePath), /maintenance.*active/i);
  await maintenanceRelease();
  const nextRuntimeRelease = await acquireRuntimeLock(runtimePath);
  await nextRuntimeRelease();
});

test("stale maintenance ownership is preserved instead of being force-removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-maintenance-stale-"));
  const runtimePath = join(root, "runtime.lock");
  const maintenancePath = join(root, "iseol-maintenance.lock");
  await writeFile(maintenancePath, JSON.stringify({ version: 1, pid: 999999 }));
  await assert.rejects(acquireRuntimeMaintenanceLock(runtimePath, maintenancePath), /maintenance.*already exists/i);
  assert.equal(JSON.parse(await readFile(maintenancePath, "utf8")).pid, 999999);
});

test("maintenance containment owns the stopped Runtime window and preserves the original job", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-maintenance-action-"));
  const config = {
    version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"),
    webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath: join(root, "runtime", "iseol-runtime.lock"),
    projectRunRoot: join(root, "project-runs"), projectDesktopStateRoot: join(root, "project-desktop"),
  };
  const run: HarnessRuntimeRunEnvelope = {
    version: 1, request: { version: 1, mode: "project-workspace", runId: "run-maint", projectId: "project-a", objective: "inspect", targetRoot: join(root, "workspace") },
    preflight: { version: 1, runId: "run-maint", status: "ready" },
    state: { version: 1, stage: "CONTEXT", status: "FAILED_RETRYABLE", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: "2026-09-20T02:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-20T02:00:00.000Z",
  };
  await saveHarnessRun(config.projectRunRoot, run);
  const pack: DesktopTaskPack = {
    version: 1, jobId: "job-maint", runId: "run-maint", stage: "CONTEXT", attempt: 1, agentId: "agent-live", workspaceRoot: run.request.targetRoot,
    idempotencyKey: "maint:run-maint", leaseUntil: "2026-09-20T02:10:00.000Z", operations: [{ id: "init", type: "GIT_INIT", cwd: "." }],
    policyDigest: "a".repeat(64), policySources: [{ kind: "policy", path: "policy", sha256: "b".repeat(64), required: true }],
  };
  const job = await createDesktopJob(config.projectDesktopStateRoot, pack, "2026-09-20T02:00:00.000Z");
  const revision = desktopJobRevision(job);
  const approval = await issueDesktopJobContainmentApproval({ root: config.projectDesktopStateRoot, requestId: "maint-request", jobId: job.jobId, runId: job.runId, revision, issuedAt: "2026-09-20T02:00:01.000Z", expiresAt: "2026-09-20T03:00:00.000Z", issuedBy: "operator" });
  const result = await containRuntimeMaintenanceJob(config, { projectId: "project-a", jobId: job.jobId, expectedRevision: revision, operationId: "maint-op", approvalId: approval.approvalId, at: "2026-09-20T02:00:02.000Z" });
  assert.equal(result.status, "contained");
  assert.equal((await loadDesktopJob(config.projectDesktopStateRoot, job.jobId))?.status, "pending");
  assert.equal((await loadDesktopJobContainment(config.projectDesktopStateRoot, job.jobId))?.mutationRisk, "mutation-uncertain");
});

test("maintenance approval requires authenticated explicit confirmation and contains atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-maintenance-approval-"));
  const config = {
    version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"),
    webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath: join(root, "runtime", "iseol-runtime.lock"),
    projectRunRoot: join(root, "project-runs"), projectDesktopStateRoot: join(root, "project-desktop"),
  };
  const run: HarnessRuntimeRunEnvelope = {
    version: 1, request: { version: 1, mode: "project-workspace", runId: "run-approval", projectId: "project-a", objective: "inspect", targetRoot: join(root, "workspace") },
    preflight: { version: 1, runId: "run-approval", status: "ready" },
    state: { version: 1, stage: "CONTEXT", status: "FAILED_RETRYABLE", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: "2026-09-20T02:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-20T02:00:00.000Z",
  };
  await saveHarnessRun(config.projectRunRoot, run);
  const pack: DesktopTaskPack = {
    version: 1, jobId: "job-approval", runId: "run-approval", stage: "CONTEXT", attempt: 1, agentId: "agent-live", workspaceRoot: run.request.targetRoot,
    idempotencyKey: "approval:run-approval", leaseUntil: "2026-09-20T02:10:00.000Z", operations: [{ id: "init", type: "GIT_INIT", cwd: "." }],
    policyDigest: "a".repeat(64), policySources: [{ kind: "policy", path: "policy", sha256: "b".repeat(64), required: true }],
  };
  const job = await createDesktopJob(config.projectDesktopStateRoot, pack, "2026-09-20T02:00:00.000Z");
  const revision = desktopJobRevision(job);
  const base = { projectId: "project-a", jobId: job.jobId, expectedRevision: revision, requestId: "approval-request", operationId: "approval-op", operatorId: "operator", at: "2026-09-20T02:00:02.000Z", expiresAt: "2026-09-20T03:00:00.000Z" };
  const unauthenticated = await approveAndContainRuntimeMaintenanceJob(config, { ...base, operatorToken: "wrong", configuredOperatorToken: "secret", confirmation: `I approve containment of ${job.jobId} at revision ${revision}` });
  assert.deepEqual(unauthenticated, { status: "rejected", reason: "operator-authentication-failed" });
  const unconfirmed = await approveAndContainRuntimeMaintenanceJob(config, { ...base, operatorToken: "secret", configuredOperatorToken: "secret", confirmation: "yes" });
  assert.equal(unconfirmed.status, "rejected");
  const approved = await approveAndContainRuntimeMaintenanceJob(config, { ...base, operatorToken: "secret", configuredOperatorToken: "secret", confirmation: `I approve containment of ${job.jobId} at revision ${revision}` });
  assert.equal(approved.status, "contained");
  if (approved.status === "contained") assert.ok(approved.approvalId);
  assert.equal((await loadDesktopJob(config.projectDesktopStateRoot, job.jobId))?.status, "pending");
  assert.equal((await loadDesktopJobContainment(config.projectDesktopStateRoot, job.jobId))?.mutationRisk, "mutation-uncertain");
});

test("multi-job maintenance containment keeps one ownership window while preserving independent approvals", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-host-maintenance-batch-"));
  const config = {
    version: 1 as const, dataRoot: root, modelRoot: join(root, "model"), runRoot: join(root, "runs"),
    webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), lockPath: join(root, "runtime", "iseol-runtime.lock"),
    projectRunRoot: join(root, "project-runs"), projectDesktopStateRoot: join(root, "project-desktop"),
  };
  const makeRun = async (runId: string) => {
    const run: HarnessRuntimeRunEnvelope = {
      version: 1, request: { version: 1, mode: "project-workspace", runId, projectId: "project-a", objective: "inspect", targetRoot: join(root, "workspace", runId) },
      preflight: { version: 1, runId, status: "ready" },
      state: { version: 1, stage: "CONTEXT", status: "FAILED_RETRYABLE", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: "2026-09-20T02:00:00.000Z" },
      evidence: [], updatedAt: "2026-09-20T02:00:00.000Z",
    };
    await saveHarnessRun(config.projectRunRoot, run);
  };
  await makeRun("run-batch-1");
  await makeRun("run-batch-2");
  const makeJob = async (jobId: string, runId: string, operation: DesktopTaskPack["operations"][number]["type"]) => createDesktopJob(config.projectDesktopStateRoot, {
    version: 1, jobId, runId, stage: "CONTEXT", attempt: 1, agentId: "agent-live", workspaceRoot: join(root, "workspace", runId),
    idempotencyKey: `batch:${jobId}`, leaseUntil: "2026-09-20T02:10:00.000Z", operations: [{ id: `${jobId}-op`, type: operation, cwd: "." }],
    policyDigest: "a".repeat(64), policySources: [{ kind: "policy", path: "policy", sha256: "b".repeat(64), required: true }],
  }, "2026-09-20T02:00:00.000Z");
  const job1 = await makeJob("job-batch-1", "run-batch-1", "GIT_INSPECT");
  const job2 = await makeJob("job-batch-2", "run-batch-2", "GIT_INIT");
  const revision1 = desktopJobRevision(job1);
  const revision2 = desktopJobRevision(job2);
  const result = await approveAndContainRuntimeMaintenanceJobs(config, {
    operatorToken: "secret", configuredOperatorToken: "secret", operatorId: "operator", at: "2026-09-20T02:00:02.000Z",
    jobs: [
      { projectId: "project-a", jobId: job1.jobId, expectedRevision: revision1, requestId: "batch-request-1", operationId: "batch-op-1", expiresAt: "2026-09-20T03:00:00.000Z", confirmation: `I approve containment of ${job1.jobId} at revision ${revision1}` },
      { projectId: "project-a", jobId: job2.jobId, expectedRevision: revision2, requestId: "batch-request-2", operationId: "batch-op-2", expiresAt: "2026-09-20T03:00:00.000Z", confirmation: "wrong confirmation" },
    ],
  });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.status, "contained");
  assert.equal(result.results[1]?.status, "rejected");
  assert.equal((await loadDesktopJobContainment(config.projectDesktopStateRoot, job1.jobId))?.mutationRisk, "read-only-uncertain");
  assert.equal(await loadDesktopJobContainment(config.projectDesktopStateRoot, job2.jobId), null);
  assert.equal((await loadDesktopJob(config.projectDesktopStateRoot, job1.jobId))?.status, "pending");
  assert.equal((await loadDesktopJob(config.projectDesktopStateRoot, job2.jobId))?.status, "pending");
});
