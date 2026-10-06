$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = 'C:\Users\user\Documents\discord-project-automation-bot-v3'
$isoRoot = 'C:\Users\user\AppData\Local\Temp\iseol-live-preflight-03124a2'
$repositoryUrl = 'https://github.com/sunwoo162/iseol-live-smoke.git'
Set-Location -LiteralPath $projectRoot
. (Join-Path $projectRoot 'scripts\windows\agent-presence-predicate.ps1')

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-ListenerPids([int]$Port) {
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    Sort-Object -Unique)
}

function Get-RuntimeStatus {
  $raw = (& $script:npmExe run iseol:runtime -- status 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $null }
  $jsonLine = ($raw.Split([Environment]::NewLine) |
    Where-Object { $_.TrimStart().StartsWith('{') } |
    Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($jsonLine)) { return $null }
  try { return ($jsonLine | ConvertFrom-Json) } catch { return $null }
}

function Get-AgentPresence {
  $presenceScript = @'
import { getDesktopAgentPresence } from "./src/desktop-agent/agent-registry.ts";
const root = process.env.ISEOL_DESKTOP_AGENT_ROOT ?? "";
const agentId = process.env.ISEOL_DESKTOP_AGENT_ID ?? "";
if (!root || !agentId) throw new Error("agent diagnostic environment is incomplete");
const value = await getDesktopAgentPresence(root, agentId, new Date().toISOString(), 15000);
process.stdout.write(JSON.stringify(value ? {
  agentId: value.agentId,
  status: value.status,
  connectionId: value.connectionId ?? "",
  lastHeartbeatAt: value.lastHeartbeatAt ?? ""
} : null));
'@
  $raw = ($presenceScript | & node --import tsx --input-type=module 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "official Desktop Agent presence diagnostic failed" }
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Get-DesktopAgentProcess {
  # npm.cmd/tsx leaves a wrapper process beside the actual node worker.  Only
  # the worker with the tsx loader is an Agent process for presence checks.
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and
    ([IO.Path]::GetFileName([string]$_.ExecutablePath) -ieq 'node.exe') -and
    $_.CommandLine -and
    $_.CommandLine -match 'desktop-agent[\\/]main\.ts' -and
    $_.CommandLine -match [Regex]::Escape($projectRoot) -and
    $_.CommandLine -notmatch 'tsx[\\/].*cli\.(c|m)?js'
  } | Sort-Object CreationDate)
}

$cfgPath = Join-Path $isoRoot 'config\iseol-runtime.json'
$emptyEnvPath = Join-Path $isoRoot 'empty.env'
if (!(Test-Path -LiteralPath $cfgPath -PathType Leaf)) { throw "isolated Runtime config is missing" }
if (!(Test-Path -LiteralPath $emptyEnvPath -PathType Leaf)) { throw "isolated empty.env is missing" }
if ((Get-Item -LiteralPath $emptyEnvPath).Length -ne 0) { throw "isolated empty.env is not empty" }
$cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

$repoRoot = (Resolve-Path (Join-Path $isoRoot 'live-workspace\repository')).Path
$sandboxRoot = (Resolve-Path (Join-Path $isoRoot 'live-workspace')).Path
if (!(Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) { throw "isolated repository is not a Git worktree" }
$baseRef = (& git -C $repoRoot symbolic-ref --quiet --short HEAD 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($baseRef)) { throw "isolated repository is detached" }
$agentId = [string]$cfg.desktopAgentId
if ([string]::IsNullOrWhiteSpace($agentId)) { throw "desktopAgentId is missing from isolated Runtime config" }
$expectedCodeVersion = (& git -C $projectRoot rev-parse HEAD 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($expectedCodeVersion)) { throw "current Runtime Git HEAD cannot be read" }

$lockPath = if ($cfg.lockPath) { [string]$cfg.lockPath } else { Join-Path ([string]$cfg.dataRoot) 'runtime\iseol-runtime.lock' }
$lockDir = Split-Path -Parent $lockPath
foreach ($path in @($lockPath, (Join-Path $lockDir 'iseol-maintenance.lock'), (Join-Path $lockDir 'iseol-recovery.lock'))) {
  if (Test-Path -LiteralPath $path) { throw "isolated Runtime ownership file already exists: $path" }
}
foreach ($port in @(18890, 18891, 18892)) {
  if (@(Get-ListenerPids $port).Count -ne 0) { throw "isolated port $port is already in use" }
}

$campaignsRoot = Join-Path ([string]$cfg.modelRoot) 'idea-lab\campaigns'
$budgetPath = Join-Path ([string]$cfg.webWorkerRoot) 'web-workers\request-budget.json'
if (!(Test-Path -LiteralPath $campaignsRoot -PathType Container)) { throw "existing Idea Lab campaign records are missing" }
$campaignRecords = @(Get-ChildItem -LiteralPath $campaignsRoot -File -Filter '*.json' | ForEach-Object {
  Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
})
if ($campaignRecords.Count -ne 10) { throw ("existing Idea Lab campaign count is not 10 (actual={0})" -f $campaignRecords.Count) }
$campaignStatuses = @($campaignRecords | ForEach-Object { [string]$_.status })
$cancelledCount = @($campaignStatuses | Where-Object { $_ -eq 'cancelled' }).Count
$blockedCount = @($campaignStatuses | Where-Object { $_ -eq 'blocked' }).Count
$generatingCount = @($campaignStatuses | Where-Object { $_ -eq 'generating' }).Count
if ($cancelledCount -ne 2 -or $blockedCount -ne 8 -or $generatingCount -ne 0) {
  throw ("existing campaign status set is not cancelled=2, blocked=8, generating=0 (cancelled={0}, blocked={1}, generating={2})" -f $cancelledCount, $blockedCount, $generatingCount)
}
if (!(Test-Path -LiteralPath $budgetPath)) { throw "shared request budget record is missing" }
$budget = Get-Content -LiteralPath $budgetPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([int]$budget.limit -ne 24 -or [int]$budget.unknown -ne 10 -or [int]$budget.consumed -ne 0 -or [int]$budget.reserved -ne 0) {
  throw "shared request budget is not limit=24, unknown=10, consumed=0, reserved=0"
}
$expectedUnknownRequestIds = @(
  'proposal-2920bbb4e979f55f47b5cd6c8b0934227f8e86a1302edd5b-1',
  'proposal-8c2891d58b95efff6c6c7d8c1b4c76b1a5a8724681894936-1',
  'proposal-0369c4a1f352c4dda2e0378a87f2366fc1b41e27f4b87e3b-1',
  'proposal-bd5761eb94a9d231428700c797a95f72d058fba94d98e8e2-1',
  'proposal-a993476da3ff513975079caf03203e19ef9147b92462e3fe-1',
  'proposal-f53ae743e278987f548c6f169b4ba465c237a1df9d48d810-1',
  'proposal-e010a17bc83e3b5f00f998d1b5c2795c34c91c6910a7ddb3-1',
  'proposal-2e78be465baa72b52afc9fa8f412b4e05a06cb926ee88c4d-1',
  'proposal-8957e4039741503f8899bacfee3ca1ff7685467339e1a231-1',
  'proposal-5f6ae4fc370c474c34c114b58a67761cc4160ede38f1729b-1'
)
if (!($budget.PSObject.Properties.Name -contains 'requests')) { throw 'shared request budget requests are missing' }
foreach ($requestId in $expectedUnknownRequestIds) {
  $requestProperty = $budget.requests.PSObject.Properties[$requestId]
  if ($null -eq $requestProperty -or [string]$requestProperty.Value.state -ne 'unknown') {
    throw ("existing UNKNOWN request is missing or changed: {0}" -f $requestId)
  }
}

$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
# Vite + React + TypeScript/npm contract approved for the generated Todo app.
# The generated package.json must still be checked before local-preview deploy.
$previewArgsJson = '["run","dev","--","--host","127.0.0.1","--port","{port}"]'
try { $previewArgs = $previewArgsJson | ConvertFrom-Json } catch { throw 'preview args must be valid JSON' }
if ($previewArgs -isnot [Array] -or @($previewArgs | Where-Object { $_ -isnot [string] }).Count -ne 0) {
  throw 'preview args must be a JSON string array'
}
$existingAgent = @(Get-DesktopAgentProcess)
if ($existingAgent.Count -ne 0) { throw 'an Agent process already exists; refusing duplicate start' }
$profileRegex = [Regex]::Escape([string]$cfg.browserProfileRoot)
$existingChrome = @(Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine -match 'chrome(\.exe)?' -and $_.CommandLine -match $profileRegex
})
if ($existingChrome.Count -ne 0) { throw 'isolated Chrome profile is already in use' }
$webToken = Read-SecretText 'Enter isolated Web token (hidden input; do not save it)'
$agentToken = Read-SecretText 'Enter isolated Desktop Agent token (hidden input)'
if ([string]::IsNullOrWhiteSpace($webToken) -or [string]::IsNullOrWhiteSpace($agentToken)) {
  throw 'isolated tokens must not be empty'
}

$clearNames = @(
  'ISEOL_OPERATOR_TOKEN','ISEOL_RUNTIME_CONFIG','DOTENV_CONFIG_PATH','ISEOL_WEB_HOST','ISEOL_WEB_PORT','ISEOL_WEB_TOKEN',
  'ISEOL_DESKTOP_AGENT_HOST','ISEOL_DESKTOP_AGENT_PORT','ISEOL_DESKTOP_AGENT_ROOT','ISEOL_DESKTOP_AGENT_TOKEN','ISEOL_DESKTOP_AGENT_URL',
  'ISEOL_DESKTOP_AGENT_ID','ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER','ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS','ISEOL_DESKTOP_AGENT_POLICY_ROOTS','ISEOL_DESKTOP_AGENT_RESULT_ROOT',
  'ISEOL_CHATGPT_WEB_ENABLED','ISEOL_CHATGPT_WEB_ROOT','ISEOL_CHATGPT_BROWSER_ENABLED','ISEOL_CHATGPT_BROWSER_HEADLESS','ISEOL_CHATGPT_BROWSER_PROFILE_ROOT','ISEOL_CHATGPT_BROWSER_EXECUTABLE',
  'ISEOL_IDEA_LAB_RUNTIME_ENABLED','ISEOL_IDEA_LAB_REPOSITORY_ROOT','ISEOL_IDEA_LAB_REPOSITORY_URL','ISEOL_IDEA_LAB_BASE_REF','ISEOL_IDEA_LAB_SANDBOX_ROOT','ISEOL_IDEA_LAB_DEPLOYMENT_MODE','ISEOL_IDEA_LAB_AGENT_ID','ISEOL_IDEA_LAB_TEST_EXECUTABLE','ISEOL_IDEA_LAB_TEST_ARGS_JSON','ISEOL_IDEA_LAB_TEST_TIMEOUT_MS','ISEOL_IDEA_LAB_PREVIEW_EXECUTABLE','ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON','ISEOL_IDEA_LAB_PREVIEW_HOST','ISEOL_IDEA_LAB_PREVIEW_PORT','ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS','ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET'
)
foreach ($name in $clearNames) { Remove-Item -LiteralPath ("Env:{0}" -f $name) -ErrorAction SilentlyContinue }

$env:ISEOL_RUNTIME_CONFIG = $cfgPath
$env:DOTENV_CONFIG_PATH = $emptyEnvPath
$env:ISEOL_MODEL_ROOT = [string]$cfg.modelRoot
$env:ISEOL_RUN_ROOT = [string]$cfg.runRoot
$env:ISEOL_RUNTIME_DATA_ROOT = [string]$cfg.dataRoot
$env:ISEOL_WEB_HOST = '127.0.0.1'
$env:ISEOL_WEB_PORT = '18890'
$env:ISEOL_WEB_TOKEN = $webToken
$env:ISEOL_DESKTOP_AGENT_HOST = '127.0.0.1'
$env:ISEOL_DESKTOP_AGENT_PORT = '18891'
$env:ISEOL_DESKTOP_AGENT_ROOT = Join-Path $isoRoot 'desktop-core-state'
$env:ISEOL_DESKTOP_AGENT_TOKEN = $agentToken
$env:ISEOL_DESKTOP_AGENT_URL = 'ws://127.0.0.1:18891'
$env:ISEOL_DESKTOP_AGENT_ID = $agentId
$env:ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER = $env:USERNAME
$env:ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS = Join-Path $isoRoot 'live-workspace'
$env:ISEOL_DESKTOP_AGENT_POLICY_ROOTS = Join-Path $isoRoot 'live-workspace'
$env:ISEOL_DESKTOP_AGENT_RESULT_ROOT = Join-Path $isoRoot 'agent-results'
$env:ISEOL_CHATGPT_WEB_ENABLED = 'true'
$env:ISEOL_CHATGPT_WEB_ROOT = [string]$cfg.webWorkerRoot
$env:ISEOL_CHATGPT_BROWSER_ENABLED = 'true'
$env:ISEOL_CHATGPT_BROWSER_HEADLESS = 'false'
$env:ISEOL_CHATGPT_BROWSER_PROFILE_ROOT = [string]$cfg.browserProfileRoot
$env:ISEOL_CHATGPT_BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:ISEOL_IDEA_LAB_RUNTIME_ENABLED = 'true'
$env:ISEOL_IDEA_LAB_REPOSITORY_ROOT = $repoRoot
$env:ISEOL_IDEA_LAB_REPOSITORY_URL = $repositoryUrl
$env:ISEOL_IDEA_LAB_BASE_REF = $baseRef
$env:ISEOL_IDEA_LAB_SANDBOX_ROOT = $sandboxRoot
$env:ISEOL_IDEA_LAB_DEPLOYMENT_MODE = 'local-preview'
$env:ISEOL_IDEA_LAB_AGENT_ID = $agentId
$env:ISEOL_IDEA_LAB_TEST_EXECUTABLE = $npmExe
$env:ISEOL_IDEA_LAB_TEST_ARGS_JSON = '["test"]'
$env:ISEOL_IDEA_LAB_TEST_TIMEOUT_MS = '120000'
$env:ISEOL_IDEA_LAB_PREVIEW_EXECUTABLE = $npmExe
$env:ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON = $previewArgsJson
$env:ISEOL_IDEA_LAB_PREVIEW_HOST = '127.0.0.1'
$env:ISEOL_IDEA_LAB_PREVIEW_PORT = '18892'
$env:ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS = '30000'
$env:ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET = '24'

$probe = @'
import { resolveIdeaLabRuntimeConfig } from "./src/idea-lab/runtime-config.ts";
const value = resolveIdeaLabRuntimeConfig(process.env, {
  iseolRoot: process.env.ISEOL_RUNTIME_DATA_ROOT ?? "",
  modelRoot: process.env.ISEOL_MODEL_ROOT ?? "",
  runRoot: process.env.ISEOL_RUN_ROOT ?? "",
  webRoot: process.env.ISEOL_RUNTIME_DATA_ROOT ?? "",
  webWorkerRoot: process.env.ISEOL_CHATGPT_WEB_ROOT ?? "",
  browserProfileRoot: process.env.ISEOL_CHATGPT_BROWSER_PROFILE_ROOT ?? ""
});
process.stdout.write(JSON.stringify({
  enabled: value.enabled,
  deploymentMode: value.enabled ? value.deploymentMode : "disabled",
  repositoryUrl: value.enabled ? value.repositoryUrl : "",
  baseRef: value.enabled ? value.baseRef : "",
  externalRequestBudget: value.enabled ? value.externalRequestBudget : 0
}));
'@
$probe | & node --import tsx --input-type=module
if ($LASTEXITCODE -ne 0) { throw 'Idea Lab runtime configuration probe failed' }

$runtimeLauncher = Start-Process -FilePath $npmExe -ArgumentList @('run','iseol:runtime','--','start') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$runtimeStatus = $null
$runtimeDeadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $runtimeDeadline) {
  $candidate = Get-RuntimeStatus
  if ($candidate -and $candidate.state -eq 'running' -and $candidate.owner.state -eq 'verified' -and $candidate.codeVersionSource -eq 'git-head' -and $candidate.codeVersion -eq $expectedCodeVersion) {
    $webOwners = @(Get-ListenerPids 18890)
    $desktopOwners = @(Get-ListenerPids 18891)
    if ($webOwners.Count -eq 1 -and $desktopOwners.Count -eq 1 -and $webOwners[0] -eq [int]$candidate.pid -and $desktopOwners[0] -eq [int]$candidate.pid) {
      $runtimeStatus = $candidate
      break
    }
  }
  Start-Sleep -Seconds 1
}
if ($null -eq $runtimeStatus) { throw 'Runtime readiness or listener ownership was not verified within 120 seconds' }
Write-Host ("runtimePid={0} codeVersion={1}" -f $runtimeStatus.pid, $runtimeStatus.codeVersion)

$agentLauncher = Start-Process -FilePath $npmExe -ArgumentList @('run','desktop:agent') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$agentPid = $null
$agentDeadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $agentDeadline) {
  $agentProcess = @(Get-DesktopAgentProcess) | Select-Object -Last 1
  if ($agentProcess) { $agentPid = [int]$agentProcess.ProcessId; break }
  Start-Sleep -Seconds 1
}
if ($null -eq $agentPid) { throw 'new Desktop Agent process was not found' }
Write-Host ("agentPid={0}" -f $agentPid)

$presence = $null
$presenceDeadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $presenceDeadline) {
  $candidate = Get-AgentPresence
  if (Test-AgentPresenceSnapshot $candidate) {
    $presence = $candidate
    break
  }
  Start-Sleep -Seconds 1
}
if ($null -eq $presence) {
  # Polling is read-only.  Report the official registry state instead of
  # collapsing a delayed heartbeat into an authentication failure.
  $lastPresence = $null
  try { $lastPresence = Get-AgentPresence } catch { $lastPresence = $null }
  $registryStatus = if ($lastPresence) { [string]$lastPresence.status } else { 'unavailable' }
  $connectionPresent = if ($lastPresence) { -not [string]::IsNullOrWhiteSpace([string]$lastPresence.connectionId) } else { $false }
  $heartbeatPresent = if ($lastPresence) { -not [string]::IsNullOrWhiteSpace([string]$lastPresence.lastHeartbeatAt) } else { $false }
  throw ("Desktop Agent presence was not verified within 120 seconds (registryStatus={0}, connectionIdPresent={1}, heartbeatPresent={2}, processPid={3})" -f $registryStatus, $connectionPresent, $heartbeatPresent, $agentPid)
}
$firstHeartbeat = [string]$presence.lastHeartbeatAt
Start-Sleep -Seconds 6
$presence2 = Get-AgentPresence
if (!$presence2 -or $presence2.status -ne 'online' -or [string]$presence2.connectionId -ne [string]$presence.connectionId -or [string]$presence2.lastHeartbeatAt -eq $firstHeartbeat) {
  throw 'Desktop Agent heartbeat did not advance'
}
Write-Host ("agentConnectionId={0} heartbeatAdvanced=true" -f $presence2.connectionId)
Write-Host 'Runtime and authenticated Agent are ready. Open http://127.0.0.1:18890/ and enter the same Web token, then Save. Do not create or cancel a campaign.'
