$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:ComputerUseScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ComputerUseRepoRoot = Split-Path -Parent $script:ComputerUseScriptRoot
$script:ComputerUsePluginRoot = Join-Path $script:ComputerUseRepoRoot "computer_use"
$script:ComputerUsePluginSelector = "computer-use@computer-use-local"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-CheckedCommand {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $script:ComputerUseRepoRoot
  )

  Push-Location $WorkingDirectory
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Executable $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Get-CheckedOutput {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $script:ComputerUseRepoRoot
  )

  Push-Location $WorkingDirectory
  try {
    $output = & $Executable @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Executable $($Arguments -join ' ')`n$output"
    }
    return ($output | Out-String)
  } finally {
    Pop-Location
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found in PATH: $Name"
  }
}

function Assert-Match {
  param(
    [string]$Content,
    [string]$Pattern,
    [string]$Message
  )

  if ($Content -notmatch $Pattern) {
    throw $Message
  }
}

function Test-ClaudePluginInstalled {
  Push-Location $script:ComputerUseRepoRoot
  try {
    $null = & claude plugin details $script:ComputerUsePluginSelector 2>&1
    return $LASTEXITCODE -eq 0
  } finally {
    Pop-Location
  }
}

function Test-CodexPluginInstalled {
  $output = Get-CheckedOutput -Executable "codex" -Arguments @("plugin", "list", "--marketplace", "computer-use-local")
  return $output -match "computer-use@computer-use-local\s+installed"
}

function Test-ComputerUseBuildArtifacts {
  $distEntrypoint = Join-Path $script:ComputerUsePluginRoot "dist\src\adapters\claude-code\mcp-entrypoint.js"
  return Test-Path $distEntrypoint
}

function Assert-ComputerUseFilesExist {
  foreach ($requiredPath in @(
    (Join-Path $script:ComputerUseRepoRoot ".claude-plugin\marketplace.json"),
    (Join-Path $script:ComputerUseRepoRoot ".agents\plugins\marketplace.json"),
    (Join-Path $script:ComputerUsePluginRoot ".claude-plugin\plugin.json"),
    (Join-Path $script:ComputerUsePluginRoot ".codex-plugin\plugin.json"),
    (Join-Path $script:ComputerUsePluginRoot ".mcp.json")
  )) {
    if (-not (Test-Path $requiredPath)) {
      throw "Required file is missing: $requiredPath"
    }
  }
}

function Invoke-ComputerUseBuild {
  Write-Step "Building runtime artifacts"
  Invoke-CheckedCommand -Executable "npm" -Arguments @("run", "build") -WorkingDirectory $script:ComputerUsePluginRoot
}

function Invoke-ComputerUseClaudeValidation {
  Write-Step "Validating Claude marketplace and plugin manifests"
  Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "validate", $script:ComputerUseRepoRoot)
  Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "validate", $script:ComputerUsePluginRoot)
}

function Invoke-ComputerUseSmoke {
  Write-Step "Running MCP smoke test"
  Invoke-CheckedCommand -Executable "node" -Arguments @((Join-Path $script:ComputerUseScriptRoot "smoke-claude-mcp.mjs"))
}
