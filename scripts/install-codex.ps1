param(
  [switch]$SkipBuild,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_computer-use-plugin-common.ps1")

Write-Step "Checking required commands"
foreach ($command in @("node", "npm", "codex")) {
  Require-Command $command
}

Write-Step "Validating required files"
Assert-ComputerUseFilesExist

if (-not $SkipBuild) {
  Invoke-ComputerUseBuild
}

Invoke-ComputerUseSmoke

Write-Step "Registering Codex marketplace"
Invoke-CheckedCommand -Executable "codex" -Arguments @("plugin", "marketplace", "add", $script:ComputerUseRepoRoot)

if (Test-CodexPluginInstalled) {
  Write-Step "Refreshing existing Codex plugin install"
  Invoke-CheckedCommand -Executable "codex" -Arguments @("plugin", "remove", $script:ComputerUsePluginSelector)
}

Write-Step "Installing Codex plugin"
Invoke-CheckedCommand -Executable "codex" -Arguments @("plugin", "add", $script:ComputerUsePluginSelector)

if (-not $SkipDoctor) {
  Write-Step "Running Codex install doctor"
  Invoke-CheckedCommand -Executable (Get-CurrentPowerShellExecutable) -Arguments @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $PSScriptRoot "doctor-computer-use.ps1"),
    "-Target",
    "Codex"
  )
}

Write-Host ""
Write-Host "Codex install finished." -ForegroundColor Green
Write-Host "Start a new Codex thread/session if the plugin was not already loaded." -ForegroundColor Yellow
