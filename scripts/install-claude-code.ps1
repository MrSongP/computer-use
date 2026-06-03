param(
  [ValidateSet("user", "project", "local")]
  [string]$Scope = "user",
  [switch]$SkipBuild,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_computer-use-plugin-common.ps1")

Write-Step "Checking required commands"
foreach ($command in @("node", "npm", "claude")) {
  Require-Command $command
}

Write-Step "Validating required files"
Assert-ComputerUseFilesExist

if (-not $SkipBuild) {
  Invoke-ComputerUseBuild
}

Invoke-ComputerUseClaudeValidation
Invoke-ComputerUseSmoke

Write-Step "Registering Claude marketplace"
Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "marketplace", "add", $script:ComputerUseRepoRoot)

if (Test-ClaudePluginInstalled) {
  Write-Step "Refreshing existing Claude plugin install"
  Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "uninstall", $script:ComputerUsePluginSelector, "--scope", $Scope, "--keep-data")
}

Write-Step "Installing Claude plugin"
Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "install", $script:ComputerUsePluginSelector, "--scope", $Scope)

if (-not $SkipDoctor) {
  Write-Step "Running Claude install doctor"
  Invoke-CheckedCommand -Executable "powershell" -Arguments @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $PSScriptRoot "doctor-computer-use.ps1"),
    "-Target",
    "Claude",
    "-ClaudeScope",
    $Scope
  )
}

Write-Host ""
Write-Host "Claude Code install finished." -ForegroundColor Green
Write-Host "Run /reload-plugins in the current Claude Code session, or start a new session." -ForegroundColor Yellow
