param(
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$EvidenceVersion,
    [string]$Plugin = '.local\approval-candidate.js'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $project) { throw 'Run from the plugin project root.' }
$hermes = Join-Path $env:LOCALAPPDATA 'hermes'
$env:HERMES_VISUAL_DESKTOP = Join-Path $hermes 'hermes-agent\apps\desktop'
$env:HERMES_VISUAL_FIXTURE_DESKTOP = Join-Path $hermes 'source-archive\hermes-agent-main\apps\desktop'
$env:HERMES_VISUAL_ELECTRON = Join-Path $env:HERMES_VISUAL_DESKTOP 'node_modules\electron\dist\electron.exe'
$env:HERMES_VISUAL_PYTHON = Join-Path $hermes 'installs\892056232770d721\environments\9f1805d7efab48118894ddcc34073438\venv\Scripts\python.exe'
$env:HERMES_VISUAL_FIXTURE_PLUGIN = (Resolve-Path -LiteralPath $Plugin).Path
$env:HERMES_VISUAL_APPROVAL_CORE = (Resolve-Path -LiteralPath '.local\hermes-approval-core').Path
$env:HERMES_VISUAL_MODE = 'candidate'
$env:HERMES_VISUAL_GPU = '1'
$env:HERMES_VISUAL_EVIDENCE_VERSION = $EvidenceVersion
$env:HERMES_VISUAL_FOCUS = 'chat-approval'
$runner = Join-Path $env:HERMES_VISUAL_FIXTURE_DESKTOP '..\..\node_modules\@playwright\test\cli.js'
foreach ($inputPath in @($runner, $env:HERMES_VISUAL_ELECTRON, $env:HERMES_VISUAL_PYTHON,
    (Join-Path $env:HERMES_VISUAL_DESKTOP 'dist\electron-main.mjs'))) {
    if (!(Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Missing trusted test input: $inputPath" }
}
Get-ChildItem Env: | Where-Object { $_.Name -like 'GIT_*' } | ForEach-Object {
    Remove-Item -LiteralPath ('Env:' + $_.Name)
}
node $runner test --config '.local\approval-core.playwright.config.mjs'
exit $LASTEXITCODE
