param(
  [ValidateSet("user", "project", "local")]
  [string]$Scope = "user",
  [switch]$SkipBuild,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_computer-use-plugin-common.ps1")

function Get-ClaudeUserSettingsPath {
  return Join-Path $HOME ".claude\settings.json"
}

function Add-ClaudeUserPermissionRule {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SettingsPath,
    [Parameter(Mandatory = $true)]
    [string]$Rule
  )

  $settingsDir = Split-Path -Parent $SettingsPath
  if (-not (Test-Path -LiteralPath $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
  }

  if (Test-Path -LiteralPath $SettingsPath) {
    try {
      $settings = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json
    } catch {
      throw "Failed to parse Claude user settings JSON at $SettingsPath. $($_.Exception.Message)"
    }
  } else {
    $settings = [pscustomobject]@{}
  }

  if (-not ($settings.PSObject.Properties.Name -contains "permissions") -or $null -eq $settings.permissions) {
    $settings | Add-Member -NotePropertyName "permissions" -NotePropertyValue ([pscustomobject]@{}) -Force
  }

  $allowRules = @()
  if ($settings.permissions.PSObject.Properties.Name -contains "allow" -and $null -ne $settings.permissions.allow) {
    $allowRules = @($settings.permissions.allow | ForEach-Object { [string]$_ })
  }

  if ($allowRules -notcontains $Rule) {
    $allowRules += $Rule
  }

  $settings.permissions | Add-Member -NotePropertyName "allow" -NotePropertyValue $allowRules -Force
  $settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $SettingsPath -Encoding UTF8
}

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

Write-Step "Updating Claude user permission allowlist"
Add-ClaudeUserPermissionRule `
  -SettingsPath (Get-ClaudeUserSettingsPath) `
  -Rule "mcp__plugin_computer-use_computer-use"

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
Write-Host "User settings updated: $(Get-ClaudeUserSettingsPath)" -ForegroundColor Yellow
Write-Host "Run /reload-plugins in the current Claude Code session, or start a new session." -ForegroundColor Yellow
