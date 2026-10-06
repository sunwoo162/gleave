param(
    [switch]$Full,
    [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$eeee = Join-Path $root "apps\eeee"
$iseol = Join-Path $root "packages\iseol"
$adapter = Join-Path $root "integrations\claimlatch-adapter"
$python = if ($PythonPath) { $PythonPath } else { Join-Path $root ".venv\Scripts\python.exe" }
if (-not (Test-Path -LiteralPath $python)) {
    $python = (Get-Command python).Source
}
New-Item -ItemType Directory -Force -Path (Join-Path $root "var") | Out-Null

& (Join-Path $root "scripts\check-repository.ps1")

Push-Location $eeee
try {
    if ($Full) {
        & $python -m pytest -q --basetemp (Join-Path $root "var\pytest") tests
    } else {
        & $python -m pytest -q --basetemp (Join-Path $root "var\pytest-p0") `
            tests/integrations `
            tests/memory `
            tests/trust `
            tests/assistant `
            tests/project_runtime `
            tests/mobile `
            tests/e2e `
            tests/coordinator/test_memory_project_flow.py `
            tests/api/test_memory_api.py
    }
    if ($LASTEXITCODE -ne 0) { throw "EEEE verification failed." }
} finally {
    Pop-Location
}

Push-Location $iseol
try {
    npm run build --silent
    node --import tsx --test `
        tests/integrations/contracts.test.ts `
        tests/qa/independent-runner.test.ts `
        tests/qa/qa-orchestrator.test.ts `
        tests/qa/release-gate.test.ts `
        tests/agent-organization/team-composer.test.ts `
        tests/agent-organization/qa-baseline.test.ts
    if ($LASTEXITCODE -ne 0) { throw "ISEOL verification failed." }
} finally {
    Pop-Location
}

Push-Location $adapter
try {
    npm test --silent
    if ($LASTEXITCODE -ne 0) { throw "ClaimLatch adapter verification failed." }
} finally {
    Pop-Location
}

Write-Output "Unified EEEE / ISEOL / ClaimLatch verification passed."
