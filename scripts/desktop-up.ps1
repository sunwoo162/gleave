param(
    [string]$DataDir = ".gleave",
    [string]$WorkspaceRoot = "workspaces"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$eeee = Join-Path $root "apps\eeee"
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    $python = (Get-Command python).Source
}

$previousDataDir = $env:DATA_DIR
$previousWorkspaceRoot = $env:WORKSPACE_ROOT
$env:DATA_DIR = $DataDir
$env:WORKSPACE_ROOT = $WorkspaceRoot
try {
    Push-Location $eeee
    & $python -m app.desktop
    if ($LASTEXITCODE -ne 0) { throw "Gleave Desktop exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
    $env:DATA_DIR = $previousDataDir
    $env:WORKSPACE_ROOT = $previousWorkspaceRoot
}
