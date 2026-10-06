[CmdletBinding()]
param([switch]$VerifyOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$configPath = Join-Path $PSScriptRoot "agent.env"
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Iseol Agent config is missing: $configPath"
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $configPath) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
  $separator = $line.IndexOf("=")
  if ($separator -le 0) { throw "Invalid Iseol Agent config line" }
  $key = $line.Substring(0, $separator).Trim()
  $values[$key] = $line.Substring($separator + 1)
}

$diagnosticRoot = ($values["ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS"] -split ";")[0]
$diagnosticDir = Join-Path $diagnosticRoot ".iseol"
$diagnosticPath = Join-Path $diagnosticDir "agent-startup.log"
New-Item -ItemType Directory -Force -Path $diagnosticDir | Out-Null
Add-Content -LiteralPath $diagnosticPath -Value "START=$([DateTime]::UtcNow.ToString('o')) USER=$env:USERNAME"

try {
  $required = @(
    "ISEOL_DESKTOP_AGENT_URL", "ISEOL_DESKTOP_AGENT_TOKEN", "ISEOL_DESKTOP_AGENT_ID",
    "ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS", "ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER", "ISEOL_NODE_EXE"
  )
  foreach ($key in $required) {
    if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
      throw "Required Iseol Agent config is missing: $key"
    }
  }
  $requiredUser = $values["ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER"]
  if ($env:USERNAME -ine $requiredUser) {
    throw "Iseol Desktop Agent must run as $requiredUser, current user is $env:USERNAME"
  }

  if ($VerifyOnly) {
    Add-Content -LiteralPath $diagnosticPath -Value "VERIFY_OK=$env:USERNAME"
    Write-Output "ISEOL_RUNNER_IDENTITY_OK=$env:USERNAME"
    exit 0
  }

  foreach ($entry in $values.GetEnumerator()) {
    if ($entry.Key -eq "ISEOL_NODE_EXE") { continue }
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
  }

  $entrypoint = Join-Path $PSScriptRoot "dist\desktop-agent\main.js"
  if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
    throw "Iseol Desktop Agent entrypoint is missing: $entrypoint"
  }

  Set-Location $PSScriptRoot
  & $values["ISEOL_NODE_EXE"] $entrypoint *>> $diagnosticPath
  $nodeExit = $LASTEXITCODE
  Add-Content -LiteralPath $diagnosticPath -Value "NODE_EXIT=$nodeExit"
  exit $nodeExit
} catch {
  $safeMessage = $_.Exception.Message
  if ($values.ContainsKey("ISEOL_DESKTOP_AGENT_TOKEN")) {
    $safeMessage = $safeMessage.Replace($values["ISEOL_DESKTOP_AGENT_TOKEN"], "[REDACTED]")
  }
  Add-Content -LiteralPath $diagnosticPath -Value "STARTUP_ERROR=$safeMessage"
  throw
}
