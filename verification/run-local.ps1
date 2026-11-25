param(
    [Parameter(Mandatory)][string]$Focus,
    [Parameter(Mandatory)][string]$Plugin,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$EvidenceVersion,
    [switch]$Hotspots
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $projectRoot) { throw 'Run this script from the plugin project root.' }
# Fail on typos before resolving a plugin or launching Hermes. The list comes
# from the current test branches, including names in array .includes(...).
$focusSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'sandbox.spec.mjs') -Raw
$focusNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$focusLiteral = 'HERMES_VISUAL_FOCUS\s*===\s*[''"]([a-z0-9-]+)[''"]'
foreach ($match in [regex]::Matches($focusSource, $focusLiteral)) { [void]$focusNames.Add($match.Groups[1].Value) }
$focusArray = '\[((?:\s*[''"][a-z0-9-]+[''"]\s*,?)+)\]\.includes\(process\.env\.HERMES_VISUAL_FOCUS\)'
foreach ($match in [regex]::Matches($focusSource, $focusArray)) {
    foreach ($name in [regex]::Matches($match.Groups[1].Value, '[''"]([a-z0-9-]+)[''"]')) { [void]$focusNames.Add($name.Groups[1].Value) }
}
if (!$focusNames.Contains($Focus)) { throw "Unknown Focus: $Focus" }
$hermesTestRoot = Join-Path $env:LOCALAPPDATA 'hermes'
$env:HERMES_VISUAL_DESKTOP = Join-Path $hermesTestRoot 'hermes-agent/apps/desktop'
# The packaged source tree has no root Playwright import for tests-js.
# Use the existing, trusted fixture tools with the installed renderer and Electron.
$env:HERMES_VISUAL_FIXTURE_DESKTOP = Join-Path $hermesTestRoot 'source-archive/hermes-agent-main/apps/desktop'
$env:HERMES_VISUAL_ELECTRON = Join-Path $env:HERMES_VISUAL_DESKTOP 'node_modules/electron/dist/electron.exe'
$env:HERMES_VISUAL_FIXTURE_PLUGIN = (Resolve-Path -LiteralPath $Plugin).Path
$runtimeGuard = Join-Path $projectRoot 'scripts/test_runtime_guard.py'
$guardBeforeTimer = [System.Diagnostics.Stopwatch]::StartNew()
$runtimeJson = & python -I -B $runtimeGuard --project $projectRoot
$guardBeforeTimer.Stop()
Write-Host ('HCV_RUNTIME_GUARD_BEFORE_SECONDS ' + $guardBeforeTimer.Elapsed.TotalSeconds.ToString('F3', [System.Globalization.CultureInfo]::InvariantCulture))
if ($LASTEXITCODE -ne 0 -or !$runtimeJson) { throw 'Private test runtime is unavailable or changed; see docs/development.md for preparation and review.' }
$runtimeBefore = $runtimeJson | ConvertFrom-Json
$env:HERMES_VISUAL_PYTHON = $runtimeBefore.python
$env:HERMES_VISUAL_MODE = 'candidate'
$env:HERMES_VISUAL_GPU = '1'
$env:HERMES_VISUAL_EVIDENCE_VERSION = $EvidenceVersion
$env:HERMES_VISUAL_FOCUS = $Focus
$env:HERMES_VISUAL_PERF_HOTSPOTS = if ($Hotspots) { '1' } else { '0' }
$testRunnerPath = Join-Path $env:HERMES_VISUAL_FIXTURE_DESKTOP '../../node_modules/@playwright/test/cli.js'
foreach ($trustedInput in @($env:HERMES_VISUAL_ELECTRON, $env:HERMES_VISUAL_PYTHON,
    $testRunnerPath, (Join-Path $env:HERMES_VISUAL_DESKTOP 'dist/electron-main.mjs'))) {
    if (!(Test-Path -LiteralPath $trustedInput -PathType Leaf)) { throw "Missing local input: $trustedInput" }
}
# Git creates a repository in the temporary profile before Electron starts.
Get-ChildItem Env: | Where-Object { $_.Name -like 'GIT_*' } | ForEach-Object {
    Remove-Item -LiteralPath ('Env:' + $_.Name)
}
$testError = $null
$testExit = 1
$hadRuntimeAuditMode = Test-Path -LiteralPath 'Env:HCV_TEST_RUNTIME_AUDIT_MODE'
$hadRuntimeBasePython = Test-Path -LiteralPath 'Env:HCV_TEST_RUNTIME_BASE_PYTHON'
$oldRuntimeAuditMode = if ($hadRuntimeAuditMode) { (Get-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_AUDIT_MODE').Value } else { $null }
$oldRuntimeBasePython = if ($hadRuntimeBasePython) { (Get-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_BASE_PYTHON').Value } else { $null }
$hadNoBytecode = Test-Path -LiteralPath 'Env:PYTHONDONTWRITEBYTECODE'
$oldNoBytecode = if ($hadNoBytecode) { (Get-Item -LiteralPath 'Env:PYTHONDONTWRITEBYTECODE').Value } else { $null }
try {
    # Cleanup and fixture helpers also import the pinned venv. Keep every
    # child interpreter from writing new cache files into its checked inputs.
    $env:PYTHONDONTWRITEBYTECODE = '1'
    $env:HCV_TEST_RUNTIME_AUDIT_MODE = 'pinned'
    $env:HCV_TEST_RUNTIME_BASE_PYTHON = $runtimeBefore.base_python
    node $testRunnerPath test --config './verification/playwright.config.mjs'
    $testExit = $LASTEXITCODE
} catch {
    $testError = $_
} finally {
    try {
        if ($hadRuntimeAuditMode) {
            Set-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_AUDIT_MODE' -Value $oldRuntimeAuditMode
        } else {
            Remove-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_AUDIT_MODE' -ErrorAction SilentlyContinue
        }
    } finally {
        if ($hadRuntimeBasePython) {
            Set-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_BASE_PYTHON' -Value $oldRuntimeBasePython
        } else {
            Remove-Item -LiteralPath 'Env:HCV_TEST_RUNTIME_BASE_PYTHON' -ErrorAction SilentlyContinue
        }
        if ($hadNoBytecode) {
            Set-Item -LiteralPath 'Env:PYTHONDONTWRITEBYTECODE' -Value $oldNoBytecode
        } else {
            Remove-Item -LiteralPath 'Env:PYTHONDONTWRITEBYTECODE' -ErrorAction SilentlyContinue
        }
    }
}
$guardAfterTimer = [System.Diagnostics.Stopwatch]::StartNew()
$runtimeJsonAfter = & python -I -B $runtimeGuard --project $projectRoot
$guardAfterTimer.Stop()
Write-Host ('HCV_RUNTIME_GUARD_AFTER_SECONDS ' + $guardAfterTimer.Elapsed.TotalSeconds.ToString('F3', [System.Globalization.CultureInfo]::InvariantCulture))
if ($LASTEXITCODE -ne 0 -or !$runtimeJsonAfter) { throw 'Private test runtime changed during the test; see docs/development.md for preparation and review.' }
$runtimeAfter = $runtimeJsonAfter | ConvertFrom-Json
if ($runtimeBefore.runtime_id -ne $runtimeAfter.runtime_id -or
    $runtimeBefore.manifest_sha256 -ne $runtimeAfter.manifest_sha256 -or
    $runtimeBefore.tree_sha256 -ne $runtimeAfter.tree_sha256 -or
    $runtimeBefore.python -ne $runtimeAfter.python) {
    throw 'Private test runtime changed during the test.'
}
if ($testError) { throw $testError }
if ($testExit -eq 0) {
    Write-Host ('HCV_PRIVATE_RUNTIME ' + $runtimeBefore.runtime_id + ' ' +
        $runtimeBefore.manifest_sha256 + ' ' + $runtimeBefore.tree_sha256)
}
exit $testExit
