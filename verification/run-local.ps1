param(
    [Parameter(Mandatory)][string]$Focus,
    [Parameter(Mandatory)][string]$Plugin,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$EvidenceVersion,
    [switch]$Hotspots
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $projectRoot) { throw 'Run this script from the plugin project root.' }
$hermesTestRoot = Join-Path $env:LOCALAPPDATA 'hermes'
$env:HERMES_VISUAL_DESKTOP = Join-Path $hermesTestRoot 'hermes-agent/apps/desktop'
# The packaged source tree has no root Playwright import for tests-js.
# Use the existing, trusted fixture tools with the installed renderer and Electron.
$env:HERMES_VISUAL_FIXTURE_DESKTOP = Join-Path $hermesTestRoot 'source-archive/hermes-agent-main/apps/desktop'
$env:HERMES_VISUAL_ELECTRON = Join-Path $env:HERMES_VISUAL_DESKTOP 'node_modules/electron/dist/electron.exe'
$env:HERMES_VISUAL_PYTHON = Join-Path $hermesTestRoot 'installs/892056232770d721/environments/9f1805d7efab48118894ddcc34073438/venv/Scripts/python.exe'
$env:HERMES_VISUAL_MODE = 'candidate'
$env:HERMES_VISUAL_FIXTURE_PLUGIN = (Resolve-Path -LiteralPath $Plugin).Path
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
node $testRunnerPath test --config './verification/playwright.config.mjs'
exit $LASTEXITCODE
