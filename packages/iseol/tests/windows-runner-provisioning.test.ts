import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const provisionUrl = new URL("../scripts/windows/provision-iseol-runner.ps1", import.meta.url);
const launcherUrl = new URL("../scripts/windows/start-iseol-agent.ps1", import.meta.url);

test("Windows runner provisioning keeps the user profile default-deny", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /ProtectedProfileRoot/);
  assert.match(script, /WorkspaceRoot.*protected user profile|workspace.*outside.*profile/is);
  assert.match(script, /policy.*profile.*file|file.*policy.*profile/is);
  assert.doesNotMatch(script, /\$sensitiveRoots/);
  assert.doesNotMatch(script, /\/deny\s+"?\$\{?principal/i);
});

test("Windows runner provisioning grants only bounded ACLs", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /WorkspaceRoot[\s\S]*\(OI\)\(CI\)M/);
  assert.match(script, /PathType\s+Leaf[\s\S]*principal.*:R/is);
  assert.match(script, /RunLevel\s+Limited/);
  assert.match(script, /S-1-5-32-544/);
  assert.match(script, /S-1-5-32-547/);
  assert.match(script, /S-1-5-32-551/);
});

test("Windows runner launcher verifies identity before executing Node", async () => {
  const script = await readFile(launcherUrl, "utf8");
  const identityCheck = script.indexOf("ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER");
  const mismatchCheck = script.indexOf("$env:USERNAME -ine $requiredUser");
  const nodeLaunch = script.indexOf('& $values["ISEOL_NODE_EXE"] $entrypoint');
  assert.ok(identityCheck >= 0);
  assert.ok(mismatchCheck > identityCheck);
  assert.ok(nodeLaunch > mismatchCheck);
  assert.match(script, /throw "Iseol Desktop Agent must run as/);
});

test("Windows runner cannot write outside the dedicated workspace under Iseol root", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /IseolRoot/);
  const rootBlock = script.split("if ($PSCmdlet.ShouldProcess($WorkspaceRoot")[0] ?? "";
  assert.match(rootBlock, /IseolRoot[\s\S]*inheritance:r/i);
  assert.match(rootBlock, /\*S-1-5-18:\(OI\)\(CI\)F/i);
  assert.match(rootBlock, /\*S-1-5-32-544:\(OI\)\(CI\)F/i);
  assert.match(rootBlock, /ownerPrincipal}:\(OI\)\(CI\)F/i);
  assert.match(rootBlock, /"\$\{principal\}:\(RX\)"/i);
  assert.doesNotMatch(rootBlock, /"\$\{principal\}:\(OI\)\(CI\)[MWF]/i);
  assert.match(script, /WorkspaceRoot[\s\S]*principal}:\(OI\)\(CI\)M/i);
});

test("Windows provisioning treats native npm stderr as diagnostic and trusts the exit code", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /ErrorActionPreference\s*=\s*["']Continue["']/);
  assert.match(script, /npmExitCode\s*=\s*\$LASTEXITCODE/);
  assert.match(script, /if\s*\(\$npmExitCode\s*-ne\s*0\)/);
  assert.match(script, /2>&1/);
});

test("Windows provisioning writes agent env as BOM-free UTF-8 on PowerShell 5.1", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.doesNotMatch(script, /utf8NoBOM/i);
  assert.match(script, /UTF8Encoding\]\:\:new\(\$false\)|New-Object\s+Text\.UTF8Encoding\(\$false\)/i);
  assert.match(script, /WriteAllLines\(\$configPath,\s*\$configLines/i);
});


test("Windows provisioning verifies the scheduled Agent is actually running before READY", async () => {
  const script = await readFile(provisionUrl, "utf8");
  const startIndex = script.indexOf("Start-ScheduledTask -TaskName $TaskName");
  const readyIndex = script.indexOf('Write-Output "ISEOL_RUNNER_READY=true"');
  assert.ok(startIndex >= 0 && readyIndex > startIndex);
  const tail = script.slice(startIndex, readyIndex);
  assert.match(tail, /Get-ScheduledTask\s+-TaskName\s+\$TaskName/i);
  assert.match(tail, /Get-ScheduledTaskInfo\s+-TaskName\s+\$TaskName/i);
  assert.match(tail, /LastTaskResult/i);
  assert.match(tail, /Running/i);
});


test("Windows runner scheduled task is allowed to start on battery and reports startup constraints", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /AllowStartIfOnBatteries/i);
  assert.match(script, /DontStopIfGoingOnBatteries/i);
  assert.match(script, /LogonType/i);
  assert.match(script, /DisallowStartIfOnBatteries/i);
  assert.match(script, /StopIfGoingOnBatteries/i);
});

test("Windows runner receives only the batch-logon right required by Password scheduled tasks", async () => {
  const script = await readFile(provisionUrl, "utf8");
  const rightIndex = script.indexOf("SeBatchLogonRight");
  const registerIndex = script.indexOf("Register-ScheduledTask");
  assert.ok(rightIndex >= 0 && registerIndex > rightIndex);
  assert.match(script, /LsaAddAccountRights/i);
  assert.match(script, /runnerSid/i);
  assert.doesNotMatch(script, /SeServiceLogonRight|SeBackupPrivilege|SeRestorePrivilege/i);
});


test("Windows runner verifies effective batch logon before scheduled task registration", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.match(script, /LogonUser/i);
  assert.match(script, /LOGON32_LOGON_BATCH|logonType\s*=\s*4/i);
  const verifyIndex = script.indexOf("AssertBatchLogon");
  const registerIndex = script.indexOf("Register-ScheduledTask");
  assert.ok(verifyIndex >= 0 && registerIndex > verifyIndex);
});

test("Windows runner launcher records sanitized startup diagnostics inside workspace", async () => {
  const script = await readFile(launcherUrl, "utf8");
  assert.match(script, /Join-Path \$diagnosticRoot "\.iseol"/i);
  assert.match(script, /agent-startup\.log/i);
  assert.match(script, /NODE_EXIT|STARTUP_ERROR/i);
  assert.match(script, /ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS/i);
  const diagnosticIndex = script.indexOf("agent-startup.log");
  const identityIndex = script.indexOf("$env:USERNAME -ine $requiredUser");
  assert.ok(diagnosticIndex >= 0 && identityIndex > diagnosticIndex);
  assert.doesNotMatch(script, /Write.*ISEOL_DESKTOP_AGENT_TOKEN/i);
});


test("Windows runner stops stale task instances before restart on PowerShell 5.1", async () => {
  const script = await readFile(provisionUrl, "utf8");
  assert.doesNotMatch(script, /-MultipleInstances\s+StopExisting/i);
  const stopIndex = script.indexOf("Stop-ScheduledTask -TaskName $TaskName");
  const startIndex = script.indexOf("Start-ScheduledTask -TaskName $TaskName");
  assert.ok(stopIndex >= 0 && startIndex > stopIndex);
  const restartBlock = script.slice(stopIndex, startIndex);
  assert.match(restartBlock, /Get-ScheduledTask\s+-TaskName\s+\$TaskName/i);
  assert.match(restartBlock, /State\s*-ne\s*["']Running["']/i);
});
