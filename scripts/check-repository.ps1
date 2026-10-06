$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$required = @(
    "apps\eeee",
    "packages\iseol",
    "packages\claimlatch",
    "integrations",
    "docs",
    "repository-manifest.json"
)

foreach ($relative in $required) {
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required aggregate path is missing: $relative"
    }
}

$nestedGit = Get-ChildItem -LiteralPath $root -Directory -Force -Recurse -Filter ".git" |
    Where-Object { $_.FullName -ne (Join-Path $root ".git") }
if ($nestedGit) {
    throw "Nested Git directories are not allowed: $($nestedGit.FullName -join ', ')"
}

$generatedSegments = @(".git", "node_modules", "dist", "__pycache__", ".pytest_cache", ".oss-builder", "var")
$secretLike = Get-ChildItem -LiteralPath $root -File -Force -Recurse |
    Where-Object {
        $relative = $_.FullName.Substring($root.Length).TrimStart('\')
        $segments = $relative -split '\\'
        $generated = @($segments | Where-Object { $_ -in $generatedSegments }).Count -gt 0
        (-not $generated) -and (
            (($_.Name -match '^(\.env(\..*)?|.*\.(pem|key|p12|pfx))$') -and $_.Name -ne '.env.example') -or
            ($_.Name -match '(secret|credential|password|token)' -and $_.Extension -notin @(".md", ".ts", ".py"))
        )
    }
if ($secretLike) {
    throw "Secret-like files were imported: $($secretLike.FullName -join ', ')"
}

$manifest = Get-Content -LiteralPath (Join-Path $root "repository-manifest.json") -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or @($manifest.sources).Count -ne 3) {
    throw "repository-manifest.json is incomplete or has an unsupported schema version."
}

Write-Output "Repository hygiene check passed."
Write-Output "Aggregate root: $root"
Write-Output "Sources: $(@($manifest.sources).Count)"
