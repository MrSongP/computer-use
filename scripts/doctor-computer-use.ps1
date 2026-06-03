param(
  [ValidateSet("Both", "Claude", "Codex")]
  [string]$Target = "Both",
  [ValidateSet("user", "project", "local")]
  [string]$ClaudeScope = "user"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_computer-use-plugin-common.ps1")

Write-Step "Checking built runtime entrypoint"
if (-not (Test-ComputerUseBuildArtifacts)) {
  throw "Built MCP entrypoint is missing. Run npm run build in G:\Desktop\computer_use\computer_use first."
}

Invoke-ComputerUseSmoke

if ($Target -in @("Both", "Claude")) {
  Invoke-ComputerUseClaudeValidation

  Write-Step "Checking Claude marketplace registration"
  $claudeMarketplaces = Get-CheckedOutput -Executable "claude" -Arguments @("plugin", "marketplace", "list")
  Assert-Match -Content $claudeMarketplaces -Pattern "computer-use-local" -Message "Claude marketplace computer-use-local is not registered."

  Write-Step "Checking Claude plugin install state"
  if (-not (Test-ClaudePluginInstalled)) {
    throw "Claude plugin $script:ComputerUsePluginSelector is not installed."
  }
}

if ($Target -in @("Both", "Codex")) {
  if ($Target -eq "Both") {
    Invoke-ComputerUseClaudeValidation
  }

  Write-Step "Checking Codex marketplace registration"
  $codexMarketplaces = Get-CheckedOutput -Executable "codex" -Arguments @("plugin", "marketplace", "list")
  Assert-Match -Content $codexMarketplaces -Pattern "computer-use-local" -Message "Codex marketplace computer-use-local is not registered."

  Write-Step "Checking Codex plugin install state"
  $codexPlugins = Get-CheckedOutput -Executable "codex" -Arguments @("plugin", "list", "--marketplace", "computer-use-local")
  Assert-Match -Content $codexPlugins -Pattern "computer-use@computer-use-local\s+installed" -Message "Codex plugin $script:ComputerUsePluginSelector is not installed."
}

Write-Host ""
Write-Host "Doctor passed." -ForegroundColor Green
if ($Target -in @("Both", "Claude")) {
  Write-Host "If the current Claude Code session still cannot see MCP tools, run /reload-plugins or start a new session." -ForegroundColor Yellow
}
if ($Target -in @("Both", "Codex")) {
  Write-Host "If the current Codex thread still cannot see the plugin, start a new thread/session." -ForegroundColor Yellow
}
